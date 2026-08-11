import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { requireAuthenticated } from "@/lib/server/authz";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { apiError } from "@/lib/server/api-response";
import { validateSpreadsheetFile } from "@/lib/server/upload-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  collapsePreFaturaRecordsByShipmentId,
  normalizeIdentity,
  planPreFaturaPersistence,
} from "@/features/pre-fatura/domain";
import {
  detectPreFaturaPeriod,
  parsePreFaturaSheet,
  PreFaturaWorkbookUnreadableError,
  readPreFaturaWorkbook,
  type ParsedPreFaturaRecord,
  type PreFaturaSheetValidation,
} from "@/app/api/pre-fatura/_lib/workbook";

const WORKBOOK_UNREADABLE_MESSAGE = "Não foi possível interpretar a estrutura desta planilha. Abra o arquivo no Excel, salve novamente como .xlsx e tente outra vez.";

type ImportCounters = {
  sourceValidRows: number;
  acceptedRows: number;
  duplicateRowsCollapsed: number;
  duplicateIdsWithConflicts: string[];
  existingIdsSkipped: number;
};

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function findProcessedFileByHash(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, fileHash: string) {
  const { data, error } = await supabase
    .from("processed_dashboard_files")
    .select("id,file_name,row_count,status,processed_at")
    .eq("module_key", "pre_fatura")
    .eq("file_hash", fileHash)
    .eq("status", "processed")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findExistingShipmentIds(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, records: ParsedPreFaturaRecord[]) {
  const lookupValues = [...new Set(records
    .flatMap((record) => [record.id_envio, normalizeIdentity(record.id_envio)])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
  const existing = new Set<string>();

  for (const batch of chunks(lookupValues, 150)) {
    const { data, error } = await supabase
      .from("pre_fatura_records")
      .select("id_envio")
      .eq("module_key", "pre_fatura")
      .in("id_envio", batch);
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const shipmentId = normalizeIdentity(row.id_envio);
      if (shipmentId) existing.add(shipmentId);
    });
  }

  return existing;
}

async function cleanupFailedImport(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, fileId: string | null) {
  if (!fileId) return;
  const recordsCleanup = await supabase.from("pre_fatura_records").delete().eq("file_id", fileId);
  if (recordsCleanup.error) console.error("[pre_fatura_import_cleanup_records_failed]", { fileId, error: recordsCleanup.error });
  const fileCleanup = await supabase.from("dashboard_files").delete().eq("id", fileId);
  if (fileCleanup.error) console.error("[pre_fatura_import_cleanup_file_failed]", { fileId, error: fileCleanup.error });
}

async function persistImport({
  file,
  fileHash,
  records,
  stats,
  period,
  counters,
  userId,
  userEmail,
}: {
  file: File;
  fileHash: string;
  records: ParsedPreFaturaRecord[];
  stats: PreFaturaSheetValidation[];
  period: ReturnType<typeof detectPreFaturaPeriod>;
  counters: Omit<ImportCounters, "existingIdsSkipped">;
  userId: string;
  userEmail: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const processedFile = await findProcessedFileByHash(supabase, fileHash);
  if (processedFile) {
    return {
      fileId: null,
      fileHash,
      duplicateFile: true,
      existingIdsSkipped: 0,
      persistedRows: 0,
      processedFile,
    };
  }

  const existingShipmentIds = await findExistingShipmentIds(supabase, records);
  const plan = planPreFaturaPersistence(records, existingShipmentIds, false);
  if (!plan.newRecords.length) {
    return {
      fileId: null,
      fileHash,
      duplicateFile: false,
      existingIdsSkipped: plan.existingIdsSkipped,
      persistedRows: 0,
      processedFile: null,
    };
  }

  const storagePath = `next/pre-fatura/${fileHash.slice(0, 16)}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const metadata: Record<string, unknown> = {
    source: "next_app_router",
    file_hash: fileHash,
    competencia: period.competencia,
    quinzena: period.quinzena,
    sheets: stats,
    source_valid_rows: counters.sourceValidRows,
    accepted_rows: counters.acceptedRows,
    duplicate_rows_collapsed: counters.duplicateRowsCollapsed,
    duplicate_ids_with_conflicts: counters.duplicateIdsWithConflicts,
    existing_ids_skipped: plan.existingIdsSkipped,
    raw_storage_persisted: false,
  };
  let fileRecordId: string | null = null;

  try {
    const { data: fileRecord, error: fileError } = await supabase
      .from("dashboard_files")
      .insert({
        file_name: file.name,
        storage_path: storagePath,
        file_type: "PRE_FATURA",
        file_size: file.size,
        uploaded_by: userId,
        uploaded_by_email: userEmail,
        reference_month: period.reference_month || null,
        reference_year: period.reference_year || null,
        is_active: true,
        status: "processing",
        period_label: period.quinzena || null,
        period_type: period.period_type || null,
        metadata,
      })
      .select("id")
      .single();

    if (fileError) throw fileError;
    fileRecordId = fileRecord.id;

    const rows = plan.newRecords.map((record) => ({ ...record, file_id: fileRecord.id }));
    for (const batch of chunks(rows, 500)) {
      const { error } = await supabase.from("pre_fatura_records").insert(batch);
      if (error) throw error;
    }

    const processedMetadata = { ...metadata, persisted_rows: rows.length };
    const updateFile = await supabase
      .from("dashboard_files")
      .update({ status: "processed", metadata: processedMetadata })
      .eq("id", fileRecord.id);
    if (updateFile.error) throw updateFile.error;

    const { error: processedError } = await supabase
      .from("processed_dashboard_files")
      .upsert({
        module_key: "pre_fatura",
        file_name: file.name,
        file_hash: fileHash,
        file_size: file.size,
        competencia: period.competencia || null,
        row_count: rows.length,
        status: "processed",
        metadata: processedMetadata,
        storage_path: storagePath,
        raw_file_deleted: true,
        file_role: "quinzena",
      }, { onConflict: "module_key,file_hash" });

    if (processedError) throw processedError;

    return {
      fileId: fileRecord.id,
      fileHash,
      duplicateFile: false,
      existingIdsSkipped: plan.existingIdsSkipped,
      persistedRows: rows.length,
      processedFile: null,
    };
  } catch (error) {
    await cleanupFailedImport(supabase, fileRecordId);
    throw error;
  }
}

export function preFaturaImportFailedResponse() {
  return NextResponse.json({
    error: "Não foi possível importar a planilha.",
    code: "PRE_FATURA_IMPORT_FAILED",
  }, { status: 500 });
}

export function preFaturaMissingSheetsResponse() {
  return NextResponse.json({ error: "Nenhuma aba esperada foi encontrada: SVC PERDIDOS, XPT PERDIDOS ou PNR." }, { status: 422 });
}

export function preFaturaWorkbookUnreadableResponse() {
  return NextResponse.json({
    error: WORKBOOK_UNREADABLE_MESSAGE,
    code: "PRE_FATURA_WORKBOOK_UNREADABLE",
  }, { status: 422 });
}

export async function POST(request: NextRequest) {
  try {
    const { session, response } = await requireAuthenticated();
    if (response) return response;

    const formData = await request.formData();
    const shouldPersist = formData.get("persist") === "true";
    if (shouldPersist && !isAdminProfile(session.profile)) {
      return apiError("Apenas administradores podem persistir importações.", 403);
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiError("Envie uma planilha .xlsx ou .xlsm válida.", 400);
    }

    const validation = await validateSpreadsheetFile(file);
    if (!validation.ok) return validation.response;

    const buffer = validation.buffer;
    const fileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
    const period = detectPreFaturaPeriod(file.name);

    const workbook = await readPreFaturaWorkbook(buffer, { fileName: file.name, fileSize: file.size });
    const parsedSheets = workbook.sheets.map((sheet) => parsePreFaturaSheet(sheet, period));
    const sheets = parsedSheets.map((sheet) => sheet.stats);
    const parsedRecords = parsedSheets.flatMap((sheet) => sheet.records);

    if (!sheets.length) {
      return preFaturaMissingSheetsResponse();
    }

    const collapse = collapsePreFaturaRecordsByShipmentId(parsedRecords);
    const ignoredRows = sheets.reduce((sum, sheet) => sum + sheet.ignoredRows, 0);
    const counters = {
      sourceValidRows: collapse.sourceValidRows,
      acceptedRows: collapse.acceptedRows,
      duplicateRowsCollapsed: collapse.duplicateRowsCollapsed,
      duplicateIdsWithConflicts: collapse.duplicateIdsWithConflicts,
    };
    const persistence = shouldPersist && collapse.records.length
      ? await persistImport({
        file,
        fileHash,
        records: collapse.records,
        stats: sheets,
        period,
        counters,
        userId: session.user.id,
        userEmail: session.profile?.email || session.user.email || null,
      })
      : null;

    const existingIdsSkipped = persistence?.existingIdsSkipped ?? 0;
    const persistedRows = persistence?.persistedRows ?? 0;
    const duplicateFile = Boolean(persistence?.duplicateFile);

    return NextResponse.json({
      fileName: file.name,
      fileHash,
      sourceValidRows: collapse.sourceValidRows,
      acceptedRows: collapse.acceptedRows,
      duplicateRowsCollapsed: collapse.duplicateRowsCollapsed,
      duplicateIdsWithConflicts: collapse.duplicateIdsWithConflicts,
      existingIdsSkipped,
      ignoredRows,
      sheets,
      persisted: Boolean(persistence && !duplicateFile),
      duplicateFile,
      persistence,
      message: duplicateFile
        ? "Este arquivo já foi processado anteriormente. Nenhum registro foi duplicado."
        : collapse.acceptedRows
          ? persistence
            ? `${persistedRows.toLocaleString("pt-BR")} registros novos foram importados.`
            : "Planilha validada com regras de identidade e exclusão de totais."
          : "Planilha lida, mas nenhum registro válido foi encontrado.",
    });
  } catch (error) {
    if (error instanceof PreFaturaWorkbookUnreadableError) {
      return preFaturaWorkbookUnreadableResponse();
    }
    console.error("[pre_fatura_import_failed]", { error });
    return preFaturaImportFailedResponse();
  }
}
