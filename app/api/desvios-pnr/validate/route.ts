import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { recordAuditLog } from "@/lib/server/audit";
import { requireAuthenticated } from "@/lib/server/authz";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ParsedPnrRecord = {
  module_key: "desvios_pnr";
  dedupe_key: string;
  competencia: string;
  quinzena: string;
  tipo: string;
  status_original: string;
  status_normalizado: string;
  periodo_faturamento: string;
  periodo_faturamento_original: string;
  mes: string;
  ano: string;
  quinzena_ref: string;
  periodo_label: string;
  source_file_name: string;
  source_file_type: string;
  source_period: string;
  source_quinzena: string;
  id_envio: string;
  produtos: string;
  valor_compra: number;
  estacao_origem: string;
  tipo_ocorrencia: string;
  tipo_base: string;
  tipo_operacional: string;
  id_rota: string;
  id_motorista: string;
  nome_motorista: string;
  motorista_display: string;
  status_motorista: string;
  fonte_cruzamento: string;
  data_caso: string | null;
  data_entrega: string | null;
  id_reclamacao: string;
  raw_data: Record<string, unknown>;
};

const MONTHS: Record<string, { label: string; number: string }> = {
  JANEIRO: { label: "Jan", number: "01" },
  FEVEREIRO: { label: "Fev", number: "02" },
  MARCO: { label: "Mar", number: "03" },
  MARÇO: { label: "Mar", number: "03" },
  ABRIL: { label: "Abr", number: "04" },
  MAIO: { label: "Mai", number: "05" },
  JUNHO: { label: "Jun", number: "06" },
  JULHO: { label: "Jul", number: "07" },
  AGOSTO: { label: "Ago", number: "08" },
  SETEMBRO: { label: "Set", number: "09" },
  OUTUBRO: { label: "Out", number: "10" },
  NOVEMBRO: { label: "Nov", number: "11" },
  DEZEMBRO: { label: "Dez", number: "12" },
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

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
  const normalized = normalize(fileName);
  const found = Object.entries(MONTHS).find(([month]) => normalized.includes(normalize(month)));
  const year = normalized.match(/\b20\d{2}\b/)?.[0] || "";
  const quinzenaKey = /\b1\s*Q\b|\b1Q\b/.test(normalized) ? "q1" : /\b2\s*Q\b|\b2Q\b/.test(normalized) ? "q2" : "";
  const month = found?.[1];
  return {
    competencia: month && year ? `${month.label}/${year.slice(-2)}` : "",
    mes: month?.number || "",
    ano: year,
    quinzena: quinzenaKey === "q1" ? "1ª quinzena" : quinzenaKey === "q2" ? "2ª quinzena" : "",
    quinzenaKey,
    monthKey: month && year ? `${year}-${month.number}` : "",
  };
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalize);
  return headers.findIndex((header) => {
    const normalized = normalize(header);
    return normalizedAliases.some((alias) => normalized === alias || normalized.includes(alias));
  });
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(30, worksheet.rowCount); rowNumber += 1) {
    const headers = rowValues(worksheet.getRow(rowNumber));
    const hasId = findHeaderIndex(headers, ["ID ENVIO", "ID DO PACOTE", "ID PACOTE", "SHIPMENT", "ENVIO"]) >= 0;
    const hasStatus = findHeaderIndex(headers, ["STATUS", "STATUS NORMALIZADO", "STATUS ORIGINAL"]) >= 0;
    const hasValue = findHeaderIndex(headers, ["VALOR COMPRA", "VALOR", "TOTAL"]) >= 0;
    if (hasId && (hasStatus || hasValue)) return { rowNumber, headers };
  }
  return null;
}

function parseDate(value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  const serial = Number(trimmed);
  if (Number.isFinite(serial) && serial > 30000 && serial < 70000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return date.toISOString().slice(0, 10);
  }
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, day, month, year] = br;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function toNumber(value: string) {
  const normalized = String(value || "").replace(/[^\d,.-]+/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTotalLikeRow(values: string[]) {
  const normalized = values.map(normalize).filter(Boolean);
  if (!normalized.length) return true;
  const joined = normalized.join(" ");
  return /\bTOTAL(?:\s+GERAL)?\b/.test(joined)
    || /\bSUBTOTAL\b/.test(joined)
    || /\bSOMA\b/.test(joined)
    || normalized.every((value) => ["TOTAL", "R$", "BRL"].includes(value) || /^[\d.,-]+$/.test(value));
}

function cleanId(value: string) {
  return String(value || "").replace(/\.0+$/, "").trim();
}

function buildDedupe(record: Pick<ParsedPnrRecord, "id_envio" | "id_reclamacao" | "id_rota" | "data_caso" | "valor_compra" | "status_normalizado" | "periodo_faturamento">) {
  return [
    "desvios_pnr",
    record.periodo_faturamento,
    record.id_envio,
    record.id_reclamacao,
    record.id_rota,
    record.data_caso,
    record.status_normalizado,
    Number(record.valor_compra || 0).toFixed(2),
  ].map(normalize).join("|");
}

function parseWorksheet(worksheet: ExcelJS.Worksheet, fileName: string, period: ReturnType<typeof detectPeriod>) {
  const header = findHeaderRow(worksheet);
  if (!header) return { stats: { name: worksheet.name, acceptedRows: 0, ignoredRows: worksheet.actualRowCount, reason: "Cabecalho PNR nao encontrado" }, records: [] as ParsedPnrRecord[] };

  const indexes = {
    status: findHeaderIndex(header.headers, ["STATUS NORMALIZADO", "STATUS"]),
    statusOriginal: findHeaderIndex(header.headers, ["STATUS ORIGINAL", "STATUS"]),
    periodo: findHeaderIndex(header.headers, ["PERIODO FATURAMENTO", "PERIODO", "COMPETENCIA"]),
    idEnvio: findHeaderIndex(header.headers, ["ID ENVIO", "ID DO PACOTE", "ID PACOTE", "SHIPMENT", "ENVIO"]),
    produto: findHeaderIndex(header.headers, ["PRODUTO", "PRODUTOS", "SKU"]),
    valor: findHeaderIndex(header.headers, ["VALOR COMPRA", "VALOR", "PRECO", "PREÇO"]),
    estacao: findHeaderIndex(header.headers, ["ESTACAO", "ESTAÇÃO", "SVC", "XPT", "BASE"]),
    tipoBase: findHeaderIndex(header.headers, ["TIPO BASE", "TIPO OPERACIONAL", "TIPO"]),
    rota: findHeaderIndex(header.headers, ["ID ROTA", "N ROTA", "Nº ROTA", "ROTA"]),
    idMotorista: findHeaderIndex(header.headers, ["ID MOTORISTA", "DRIVER ID"]),
    motorista: findHeaderIndex(header.headers, ["NOME MOTORISTA", "MOTORISTA", "DRIVER"]),
    statusMotorista: findHeaderIndex(header.headers, ["STATUS MOTORISTA"]),
    fonte: findHeaderIndex(header.headers, ["FONTE", "FONTE CRUZAMENTO"]),
    dataCaso: findHeaderIndex(header.headers, ["DATA CASO", "DATA DO CASO", "DATA"]),
    dataEntrega: findHeaderIndex(header.headers, ["DATA ENTREGA", "DATA DE ENTREGA"]),
    reclamacao: findHeaderIndex(header.headers, ["ID RECLAMACAO", "ID RECLAMAÇÃO", "RECLAMACAO"]),
  };

  const records: ParsedPnrRecord[] = [];
  let ignoredRows = 0;
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = rowValues(worksheet.getRow(rowNumber));
    if (!values.some((value) => value.trim())) continue;
    if (isTotalLikeRow(values)) {
      ignoredRows += 1;
      continue;
    }

    const idEnvio = indexes.idEnvio >= 0 ? cleanId(values[indexes.idEnvio]) : "";
    const reclamacao = indexes.reclamacao >= 0 ? cleanId(values[indexes.reclamacao]) : "";
    if (!idEnvio && !reclamacao) {
      ignoredRows += 1;
      continue;
    }

    const status = indexes.status >= 0 ? values[indexes.status] || "" : "";
    const statusOriginal = indexes.statusOriginal >= 0 ? values[indexes.statusOriginal] || status : status;
    const periodo = indexes.periodo >= 0 ? values[indexes.periodo] || "" : period.competencia;
    const raw_data = Object.fromEntries(header.headers.map((key, index) => [key || `COL_${index + 1}`, values[index] || ""]));
    const record: ParsedPnrRecord = {
      module_key: "desvios_pnr",
      dedupe_key: "",
      competencia: period.competencia,
      quinzena: period.quinzena,
      tipo: "PNR",
      status_original: statusOriginal,
      status_normalizado: status || statusOriginal || "Em aberto/análise",
      periodo_faturamento: periodo || period.competencia,
      periodo_faturamento_original: periodo,
      mes: period.mes,
      ano: period.ano,
      quinzena_ref: period.quinzenaKey,
      periodo_label: period.quinzena || period.competencia,
      source_file_name: fileName,
      source_file_type: "PNR",
      source_period: period.monthKey,
      source_quinzena: period.quinzenaKey,
      id_envio: idEnvio,
      produtos: indexes.produto >= 0 ? values[indexes.produto] || "" : "",
      valor_compra: indexes.valor >= 0 ? toNumber(values[indexes.valor]) : 0,
      estacao_origem: indexes.estacao >= 0 ? values[indexes.estacao] || "" : "",
      tipo_ocorrencia: "PNR",
      tipo_base: indexes.tipoBase >= 0 ? values[indexes.tipoBase] || "" : "",
      tipo_operacional: indexes.tipoBase >= 0 ? values[indexes.tipoBase] || "" : "",
      id_rota: indexes.rota >= 0 ? cleanId(values[indexes.rota]) : "",
      id_motorista: indexes.idMotorista >= 0 ? cleanId(values[indexes.idMotorista]) : "",
      nome_motorista: indexes.motorista >= 0 ? values[indexes.motorista] || "" : "",
      motorista_display: indexes.motorista >= 0 ? values[indexes.motorista] || "" : "",
      status_motorista: indexes.statusMotorista >= 0 ? values[indexes.statusMotorista] || "" : "",
      fonte_cruzamento: indexes.fonte >= 0 ? values[indexes.fonte] || "" : "Importacao PNR",
      data_caso: indexes.dataCaso >= 0 ? parseDate(values[indexes.dataCaso]) : null,
      data_entrega: indexes.dataEntrega >= 0 ? parseDate(values[indexes.dataEntrega]) : null,
      id_reclamacao: reclamacao,
      raw_data: {
        ...raw_data,
        file_category: "DESVIOS_PNR",
        arquivo_origem: fileName,
        aba_origem: worksheet.name,
      },
    };
    record.dedupe_key = buildDedupe(record);
    records.push(record);
  }

  return { stats: { name: worksheet.name, acceptedRows: records.length, ignoredRows }, records };
}

async function persistImport({
  file,
  buffer,
  records,
  stats,
  period,
  userId,
  userEmail,
}: {
  file: File;
  buffer: ArrayBuffer;
  records: ParsedPnrRecord[];
  stats: Array<{ name: string; acceptedRows: number; ignoredRows: number; reason?: string }>;
  period: ReturnType<typeof detectPeriod>;
  userId: string;
  userEmail: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const fileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  const storagePath = `next/desvios-pnr/${fileHash.slice(0, 16)}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const metadata = {
    source: "next_app_router",
    file_hash: fileHash,
    module_key: "desvios_pnr",
    competencia: period.competencia,
    quinzena: period.quinzena,
    sheets: stats,
    raw_storage_persisted: false,
  };

  const { data: fileRecord, error: fileError } = await supabase
    .from("dashboard_files")
    .insert({
      file_name: file.name,
      storage_path: storagePath,
      file_type: "DESVIOS_PNR",
      file_size: file.size,
      uploaded_by: userId,
      uploaded_by_email: userEmail,
      reference_month: period.mes || null,
      reference_year: period.ano || null,
      is_active: true,
      status: "processed",
      period_label: period.quinzena || null,
      period_type: period.quinzenaKey || null,
      metadata,
    })
    .select("id")
    .single();

  if (fileError) throw fileError;

  const rows = records.map((record) => ({ ...record, file_id: fileRecord.id }));
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase
      .from("desvios_pnr_records")
      .upsert(rows.slice(index, index + 500), { onConflict: "module_key,dedupe_key" });
    if (error) throw error;
  }

  const { error: processedError } = await supabase
    .from("processed_dashboard_files")
    .upsert({
      module_key: "desvios_pnr",
      file_name: file.name,
      file_hash: fileHash,
      file_size: file.size,
      competencia: period.competencia || null,
      row_count: rows.length,
      status: "processed",
      metadata,
      storage_path: storagePath,
      raw_file_deleted: true,
      file_role: "pnr",
    }, { onConflict: "module_key,file_hash" });

  if (processedError) throw processedError;

  await supabase.rpc("refresh_desvios_pnr_metrics_summary", { p_file_ids: [fileRecord.id] });
  return { fileId: fileRecord.id, fileHash, persistedRows: rows.length };
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAuthenticated();
  if (response) return response;

  const formData = await request.formData();
  const shouldPersist = formData.get("persist") === "true";
  if (shouldPersist && !isAdminProfile(session.profile)) {
    return NextResponse.json({ error: "Apenas administradores podem persistir importacoes PNR." }, { status: 403 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo .xlsx valido." }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  const period = detectPeriod(file.name);
  await workbook.xlsx.load(buffer);
  const parsedSheets = workbook.worksheets.map((worksheet) => parseWorksheet(worksheet, file.name, period));
  const sheets = parsedSheets.map((sheet) => sheet.stats);
  const records = parsedSheets.flatMap((sheet) => sheet.records);
  const uniqueKeys = new Set(records.map((record) => record.dedupe_key));

  if (!records.length) {
    return NextResponse.json({ error: "Nenhum registro PNR valido foi encontrado." }, { status: 422 });
  }

  const persistence = shouldPersist
    ? await persistImport({
      file,
      buffer,
      records,
      stats: sheets,
      period,
      userId: session.user.id,
      userEmail: session.profile?.email || session.user.email || null,
    })
    : null;

  if (persistence) {
    await recordAuditLog({
      userId: session.user.id,
      profile: session.profile,
      action: "import_desvios_pnr",
      entityType: "desvios_pnr_records",
      entityId: persistence.fileId,
      details: { fileName: file.name, rows: records.length, uniqueRows: uniqueKeys.size },
    });
  }

  return NextResponse.json({
    fileName: file.name,
    acceptedRows: records.length,
    ignoredRows: sheets.reduce((sum, sheet) => sum + sheet.ignoredRows, 0),
    uniqueRows: uniqueKeys.size,
    duplicated: Math.max(records.length - uniqueKeys.size, 0),
    sheets,
    persisted: Boolean(persistence),
    persistence,
    message: persistence ? "PNR importado e metricas atualizadas." : "PNR validado sem persistencia.",
  });
}
