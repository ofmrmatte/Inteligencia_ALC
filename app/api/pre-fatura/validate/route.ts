import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { requireAuthenticated } from "@/lib/server/authz";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { apiError } from "@/lib/server/api-response";
import { validateSpreadsheetFile } from "@/lib/server/upload-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildPreFaturaDedupeKey,
  collapsePreFaturaRecordsByShipmentId,
  hasPreFaturaPackageIdentity,
  isPreFaturaTotalLikeRow,
  normalizeIdentity,
  planPreFaturaPersistence,
  toNumber,
} from "@/features/pre-fatura/domain";

const TARGET_SHEETS = ["SVC PERDIDOS", "XPT PERDIDOS", "PNR"];

type SheetValidation = {
  name: string;
  acceptedRows: number;
  ignoredRows: number;
};

type ImportCounters = {
  sourceValidRows: number;
  acceptedRows: number;
  duplicateRowsCollapsed: number;
  duplicateIdsWithConflicts: string[];
  existingIdsSkipped: number;
};

type ParsedRecord = {
  competencia: string;
  quinzena: string;
  tipo: string;
  base: string;
  codigo_base: string;
  driver: string;
  driver_normalizado: string;
  placa: string;
  data: string | null;
  id_envio: string;
  rota: string;
  valor: number;
  aba_origem: string;
  raw_data: Record<string, string>;
  module_key: "pre_fatura";
  dedupe_key: string;
};

const MONTHS: Record<string, string> = {
  JANEIRO: "Jan",
  FEVEREIRO: "Fev",
  MARCO: "Mar",
  MARÇO: "Mar",
  ABRIL: "Abr",
  MAIO: "Mai",
  JUNHO: "Jun",
  JULHO: "Jul",
  AGOSTO: "Ago",
  SETEMBRO: "Set",
  OUTUBRO: "Out",
  NOVEMBRO: "Nov",
  DEZEMBRO: "Dez",
};

function cellValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value).trim();
}

function rowValues(row: ExcelJS.Row) {
  const values: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    values[colNumber - 1] = cellValue(cell);
  });
  return values;
}

function detectPeriod(fileName: string) {
  const normalized = normalizeIdentity(fileName);
  const month = Object.entries(MONTHS).find(([name]) => normalized.includes(normalizeIdentity(name)))?.[1] || "";
  const year = normalized.match(/\b(20\d{2}|\d{2})\b/)?.[1] || "";
  const fullYear = year.length === 2 ? `20${year}` : year;
  const quinzena = /\b1\s*Q\b|\b1Q\b|\b1A QUINZENA\b/.test(normalized)
    ? "1ª quinzena"
    : /\b2\s*Q\b|\b2Q\b|\b2A QUINZENA\b/.test(normalized)
      ? "2ª quinzena"
      : "";

  return {
    competencia: month && fullYear ? `${month}/${fullYear.slice(-2)}` : "",
    reference_month: month,
    reference_year: fullYear,
    quinzena,
    period_type: quinzena.startsWith("1") ? "q1" : quinzena.startsWith("2") ? "q2" : "",
  };
}

function baseCode(value: string) {
  const match = normalizeIdentity(value).match(/\b[A-Z]{2,4}\d{1,3}\b/);
  return match?.[0] || "";
}

function parseDate(value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, day, month, year] = br;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeIdentity);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeIdentity(header)));
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  const limit = Math.min(20, worksheet.rowCount);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const headers = rowValues(worksheet.getRow(rowNumber));
    const hasPackage = findHeaderIndex(headers, ["ID DO PACOTE", "ID PACOTE", "ID DE ENVIO", "ID ENVIO", "PACOTE", "ENVIO"]) >= 0;
    const hasRoute = findHeaderIndex(headers, ["N ROTA", "Nº ROTA", "NUMERO ROTA", "ROTA", "ID ROTA"]) >= 0;
    const hasValue = findHeaderIndex(headers, ["DESCONTO", "VALOR", "VALOR DESCONTO", "VALOR DO DESCONTO"]) >= 0;
    if (hasPackage && hasRoute && hasValue) return { rowNumber, headers };
  }
  return null;
}

function parseWorksheet(worksheet: ExcelJS.Worksheet, period: ReturnType<typeof detectPeriod>) {
  const header = findHeaderRow(worksheet);
  if (!header) {
    return {
      stats: { name: worksheet.name, acceptedRows: 0, ignoredRows: worksheet.actualRowCount },
      records: [] as ParsedRecord[],
    };
  }

  const indexes = {
    base: findHeaderIndex(header.headers, ["BASE", "SVC", "ESTACAO", "ESTAÇÃO", "UNIDADE"]),
    driver: findHeaderIndex(header.headers, ["MOTORISTA", "DRIVER", "NOME MOTORISTA"]),
    placa: findHeaderIndex(header.headers, ["PLACA", "VEICULO", "VEÍCULO"]),
    tipo: findHeaderIndex(header.headers, ["TIPO", "DESCRICAO", "DESCRIÇÃO"]),
    data: findHeaderIndex(header.headers, ["DATA", "DATA ENTREGA", "DT ENTREGA"]),
    pacote: findHeaderIndex(header.headers, ["ID DO PACOTE", "ID PACOTE", "ID DE ENVIO", "ID ENVIO", "PACOTE", "ENVIO"]),
    rota: findHeaderIndex(header.headers, ["N ROTA", "Nº ROTA", "NUMERO ROTA", "ROTA", "ID ROTA"]),
    valor: findHeaderIndex(header.headers, ["DESCONTO", "VALOR", "VALOR DESCONTO", "VALOR DO DESCONTO"]),
  };

  let acceptedRows = 0;
  let ignoredRows = 0;
  const records: ParsedRecord[] = [];
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = rowValues(worksheet.getRow(rowNumber));
    const raw_data = Object.fromEntries(header.headers.map((key, index) => [key || `COL_${index + 1}`, values[index] || ""]));
    const row = {
      base: indexes.base >= 0 ? values[indexes.base] : "",
      driver: indexes.driver >= 0 ? values[indexes.driver] : "",
      placa: indexes.placa >= 0 ? values[indexes.placa] : "",
      tipo: indexes.tipo >= 0 ? values[indexes.tipo] : "",
      id_envio: indexes.pacote >= 0 ? values[indexes.pacote] : "",
      rota: indexes.rota >= 0 ? values[indexes.rota] : "",
      valor: indexes.valor >= 0 ? values[indexes.valor] : "",
      aba_origem: worksheet.name,
    };

    const empty = Object.values(row).every((value) => !String(value || "").trim());
    const hasIdentity = hasPreFaturaPackageIdentity(row);
    const totalLike = isPreFaturaTotalLikeRow(row);
    const value = toNumber(row.valor);
    if (empty || totalLike || !hasIdentity || !value) {
      ignoredRows += 1;
      continue;
    }
    const parsed: ParsedRecord = {
      competencia: period.competencia,
      quinzena: period.quinzena,
      tipo: row.tipo || "PNR",
      base: row.base,
      codigo_base: baseCode(row.base),
      driver: row.driver,
      driver_normalizado: normalizeIdentity(row.driver),
      placa: row.placa,
      data: parseDate(indexes.data >= 0 ? values[indexes.data] : ""),
      id_envio: normalizeIdentity(row.id_envio),
      rota: row.rota,
      valor: value,
      aba_origem: worksheet.name,
      raw_data,
      module_key: "pre_fatura",
      dedupe_key: "",
    };
    parsed.dedupe_key = buildPreFaturaDedupeKey(parsed);
    records.push(parsed);
    acceptedRows += 1;
  }

  return { stats: { name: worksheet.name, acceptedRows, ignoredRows }, records };
}

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

async function findExistingShipmentIds(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, records: ParsedRecord[]) {
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
  records: ParsedRecord[];
  stats: SheetValidation[];
  period: ReturnType<typeof detectPeriod>;
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

    const workbook = new ExcelJS.Workbook();
    const buffer = validation.buffer;
    const fileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
    const period = detectPeriod(file.name);

    await workbook.xlsx.load(buffer);
    const parsedSheets = workbook.worksheets
      .filter((worksheet) => TARGET_SHEETS.includes(normalizeIdentity(worksheet.name)))
      .map((worksheet) => parseWorksheet(worksheet, period));
    const sheets = parsedSheets.map((sheet) => sheet.stats);
    const parsedRecords = parsedSheets.flatMap((sheet) => sheet.records);

    if (!sheets.length) {
      return NextResponse.json({ error: "Nenhuma aba esperada foi encontrada: SVC PERDIDOS, XPT PERDIDOS ou PNR." }, { status: 422 });
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
    console.error("[pre_fatura_import_failed]", { error });
    if (error instanceof Error && /workbook|xlsx|zip|invalid/i.test(error.message)) {
      return apiError("Não foi possível ler a planilha. Verifique se o arquivo está íntegro e tente novamente.", 422);
    }
    return preFaturaImportFailedResponse();
  }
}
