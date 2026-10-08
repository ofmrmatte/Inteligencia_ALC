import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { canAccessSection } from "@/lib/access-control";
import { hasFullAccess } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { parseCompetence } from "@/lib/competence";
import { asDate, asId, asNumber, cleanText, headerKey, normalizeText, parseBase } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "alc-imports";
const MAX_BYTES = 20 * 1024 * 1024;
const ID_HEADERS = ["ID DO PACOTE", "ID DE ENVIO", "ID CASO", "ID DO CASO", "ID"];

type RowMap = Record<string, unknown>;
type Direction = "em_analise" | "desconto_driver" | "desconto_dispatcher" | "absorvido_alc" | "abono" | "outro";

type ParsedRow = {
  shipmentId: string;
  direction: Direction;
  note: string | null;
  amount: number | null;
  routeId: string | null;
  eventDate: string | null;
  driverId: string | null;
  driverName: string | null;
  baseKey: string | null;
  baseName: string | null;
  sigla: string | null;
  sourceSheet: string;
  sourceRow: number;
  sourcePayload: RowMap;
  priority: number;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function firstValue(values: RowMap, names: string[]) {
  for (const name of names) {
    const key = headerKey(name);
    const value = values[key];
    if (value !== undefined && value !== null && cleanText(value) !== "") return value;
  }
  return null;
}

function firstId(values: RowMap, names: string[]) {
  for (const name of names) {
    const id = asId(values[headerKey(name)]);
    if (id) return id;
  }
  return "";
}

function rowsFromSheet(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const headerIndex = matrix.findIndex((row) => {
    const headers = new Set((row ?? []).map(headerKey));
    return ID_HEADERS.some((header) => headers.has(headerKey(header)));
  });
  if (headerIndex < 0) return [] as Array<{ values: RowMap; rowNumber: number }>;
  const headers = (matrix[headerIndex] ?? []).map(headerKey);
  return matrix.slice(headerIndex + 1).map((row, index) => {
    const values: RowMap = {};
    headers.forEach((header, column) => { if (header) values[header] = row?.[column]; });
    return { values, rowNumber: headerIndex + index + 2 };
  }).filter(({ values }) => Object.values(values).some((value) => cleanText(value) !== ""));
}

function directionFrom(sheetName: string, values: RowMap): Direction {
  const sheet = normalizeText(sheetName);
  if (sheet.includes("ABSORVIDOS ALC") || sheet.includes("ABSORVIDO ALC")) return "absorvido_alc";

  const decision = normalizeText(cleanText(firstValue(values, [
    "RETORNO ADM",
    "RETORNO ADMINISTRATIVO",
    "DIRECIONAMENTO",
    "DECISAO",
    "DECISÃO",
    "TRATATIVA",
    "RETORNO",
  ])));
  if (!decision) return "em_analise";
  if (decision.includes("DISPATCH")) return "desconto_dispatcher";
  if (decision.includes("ABSORV")) return "absorvido_alc";
  if (decision.includes("ABONO")) return "abono";
  if ((decision.includes("MANTER") && decision.includes("DRIVER")) || decision.includes("DESCONTO DRIVER") || decision.includes("DRIVER")) return "desconto_driver";
  return "em_analise";
}

function parseWorkbook(bytes: Uint8Array, fileName: string) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const competence = parseCompetence({ sourceFile: fileName, batchName: fileName, allowDateFallback: false });
  if (!competence) throw new Error("Não foi possível identificar a quinzena no nome do arquivo. Use nomes como '1Q JULHO 2026' ou '2Q JULHO 2026'.");

  const rows: ParsedRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const normalizedSheet = normalizeText(sheetName);
    const isAlignment = normalizedSheet.includes("ALINHAMENTO");
    const isAbsorbed = normalizedSheet.includes("ABSORVIDOS ALC") || normalizedSheet.includes("ABSORVIDO ALC");
    if (!isAlignment && !isAbsorbed) continue;

    for (const row of rowsFromSheet(workbook.Sheets[sheetName])) {
      const shipmentId = firstId(row.values, ID_HEADERS);
      if (!shipmentId) continue;
      const base = parseBase(firstValue(row.values, ["BASE", "ESTACAO", "ESTAÇÃO"]));
      const amountRaw = firstValue(row.values, ["VALOR2", "VALOR", "VALOR DA COMPRA"]);
      const amount = amountRaw == null ? null : asNumber(amountRaw);
      const note = cleanText(firstValue(row.values, ["RETORNO ADM", "RETORNO ADMINISTRATIVO", "DIRECIONAMENTO", "DECISAO", "DECISÃO", "TRATATIVA", "OBSERVACAO", "OBSERVAÇÃO"])) || null;
      rows.push({
        shipmentId,
        direction: directionFrom(sheetName, row.values),
        note,
        amount,
        routeId: firstId(row.values, ["ROTA", "N ROTA", "Nº ROTA", "ID DA ROTA", "ID ROTA"]) || null,
        eventDate: asDate(firstValue(row.values, ["DATA", "DATA DO ID", "DATA DA ROTA", "DATA DO CASO"])),
        driverId: firstId(row.values, ["ID DO MOTORISTA", "ID MOTORISTA", "DRIVER ID"]) || null,
        driverName: cleanText(firstValue(row.values, ["MOTORISTA", "MOTORISTA ORIGEM", "DRIVER"])) || null,
        baseKey: base.baseKey || null,
        baseName: base.name || base.label || null,
        sigla: base.sigla || null,
        sourceSheet: sheetName,
        sourceRow: row.rowNumber,
        sourcePayload: row.values,
        priority: isAbsorbed ? 1 : 0,
      });
    }
  }

  if (!rows.length) throw new Error("Nenhuma linha de Gestão de Descontos foi reconhecida. A planilha deve conter as abas ALINHAMENTO e/ou ABSORVIDOS ALC e uma coluna de ID.");
  rows.sort((a, b) => a.priority - b.priority || a.sourceRow - b.sourceRow);
  return { rows, competence };
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return jsonError("Sessão expirada. Entre novamente.", 401);
  if (!canAccessSection(profile, "gestao-descontos") || !hasFullAccess(profile)) return jsonError("Importação da Gestão de Descontos restrita a perfis autorizados.", 403);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Selecione uma planilha.");
  if (file.size <= 0 || file.size > MAX_BYTES) return jsonError("A planilha deve ter até 20 MB.");
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) return jsonError("Formato não suportado. Envie XLSX, XLSM ou XLS.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = parseWorkbook(bytes, file.name);
  const batchId = randomUUID();
  const hash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `discount-management/${batchId}/${safeName}`;
  const admin = createAdminClient();

  const upload = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
  if (upload.error) return jsonError(`Falha ao armazenar a planilha: ${upload.error.message}`, 500);

  try {
    const batchInsert = await admin.from("import_batches").insert({
      id: batchId,
      imported_by: profile.id,
      name: file.name,
      module: "gestao-descontos",
      competence: parsed.competence.month,
      fortnight: parsed.competence.fortnight,
      month: parsed.competence.month,
      fortnights: [parsed.competence.fortnight],
      months: [parsed.competence.month],
      status: "concluído",
      file_hash: hash,
      row_count: parsed.rows.length,
      valid_count: parsed.rows.length,
      persisted_count: parsed.rows.length,
      ignored_count: 0,
      error_count: 0,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      metadata: { entry: { name: file.name, kinds: ["gestao-descontos"], fortnight: parsed.competence.fortnight, month: parsed.competence.month, rowCount: parsed.rows.length } },
    });
    if (batchInsert.error) throw new Error(batchInsert.error.message);

    const fileInsert = await admin.from("imported_files").insert({
      batch_id: batchId,
      original_name: file.name,
      storage_path: storagePath,
      file_size: file.size,
      file_hash: hash,
      workbook_count: 1,
    });
    if (fileInsert.error) throw new Error(fileInsert.error.message);

    let inserted = 0;
    let updated = 0;
    for (const row of parsed.rows) {
      const existingResult = await admin.from("discount_cases")
        .select("id,direction,discount_month,source_period")
        .eq("shipment_id", row.shipmentId)
        .eq("allocation_no", 1)
        .maybeSingle();
      if (existingResult.error) throw new Error(existingResult.error.message);

      const common = {
        direction: row.direction,
        note: row.note,
        manual_amount: row.amount,
        manual_route_id: row.routeId,
        manual_date: row.eventDate,
        manual_driver_id: row.driverId,
        manual_driver_name: row.driverName,
        manual_base_key: row.baseKey,
        manual_base_name: row.baseName,
        manual_sigla: row.sigla,
        source_kind: "spreadsheet",
        source_period: parsed.competence.fortnight,
        discount_month: parsed.competence.month,
        source_batch_id: batchId,
        source_file: file.name,
        source_sheet: row.sourceSheet,
        source_row: row.sourceRow,
        source_payload: row.sourcePayload,
        deleted_at: null,
        deleted_by: null,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      };

      let caseId = "";
      let fromDirection: string | null = null;
      if (existingResult.data) {
        caseId = String(existingResult.data.id);
        fromDirection = String(existingResult.data.direction || "") || null;
        const update = await admin.from("discount_cases").update(common).eq("id", caseId);
        if (update.error) throw new Error(update.error.message);
        updated += 1;
      } else {
        const insert = await admin.from("discount_cases").insert({ ...common, shipment_id: row.shipmentId, allocation_no: 1, created_by: profile.id }).select("id").single();
        if (insert.error) throw new Error(insert.error.message);
        caseId = String(insert.data.id);
        inserted += 1;
      }

      const event = await admin.from("discount_case_events").insert({
        case_id: caseId,
        event_type: fromDirection && fromDirection !== row.direction ? "direction_changed_by_spreadsheet" : "spreadsheet_imported",
        from_direction: fromDirection,
        to_direction: row.direction,
        note: row.note,
        actor_id: profile.id,
        source_period: parsed.competence.fortnight,
        source_file: file.name,
        source_sheet: row.sourceSheet,
        source_row: row.sourceRow,
        snapshot: {
          financial_competence: { month: parsed.competence.month, fortnight: parsed.competence.fortnight },
          operational_date_from_sheet: row.eventDate,
          payload: row.sourcePayload,
        },
      });
      if (event.error) throw new Error(event.error.message);
    }

    return NextResponse.json({
      batchId,
      file: file.name,
      month: parsed.competence.month,
      fortnight: parsed.competence.fortnight,
      processed: parsed.rows.length,
      inserted,
      updated,
    });
  } catch (error) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    await admin.from("import_batches").delete().eq("id", batchId);
    return jsonError(error instanceof Error ? error.message : "Falha ao importar Gestão de Descontos.", 500);
  }
}
