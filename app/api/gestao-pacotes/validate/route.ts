import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { requireAuthenticated } from "@/lib/server/authz";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { apiError } from "@/lib/server/api-response";
import { validateSpreadsheetFile } from "@/lib/server/upload-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildPackageDedupeKey,
  isPackageTotalLikeRow,
  normalizeIdentity,
  toNumber,
} from "@/features/gestao-pacotes/domain";

type SheetType = "ALINHAMENTO" | "ALC" | "MERCADO_LIVRE";

type ParsedRecord = {
  competencia: string;
  quinzena: string;
  tipo: string;
  desconto: string;
  base: string;
  codigo_base: string;
  driver: string;
  driver_normalizado: string;
  data: string | null;
  id_envio: string;
  rota: string;
  valor: number;
  decisao_adm: string;
  observacao: string;
  aba_origem: string;
  raw_data: Record<string, unknown>;
  module_key: "gestao_pacotes";
  dedupe_key: string;
};

type SheetValidation = {
  name: string;
  acceptedRows: number;
  ignoredRows: number;
  sheetType: string;
  reason?: string;
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

const CATEGORY_LABELS: Record<string, string> = {
  DRIVER: "Driver",
  DISPATCHER: "Dispatcher",
  ALC: "ALC",
  MERCADO_LIVRE: "Mercado Livre",
  INDEFINIDO: "Indefinido",
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
  const year = normalized.match(/\b20\d{2}\b/)?.[0] || "";
  const quinzena = /\b1\s*Q\b|\b1Q\b/.test(normalized)
    ? "1ª quinzena"
    : /\b2\s*Q\b|\b2Q\b/.test(normalized)
      ? "2ª quinzena"
      : "";

  return {
    competencia: month && year ? `${month}/${year.slice(-2)}` : "",
    reference_month: month,
    reference_year: year,
    quinzena,
    period_type: quinzena.startsWith("1") ? "q1" : quinzena.startsWith("2") ? "q2" : "",
  };
}

function detectSheetType(value: string): SheetType | null {
  const normalized = normalizeIdentity(value);
  if (normalized.includes("ALINHAMENTO")) return "ALINHAMENTO";
  if (normalized.includes("ABSORVID") || /\bALC\b/.test(normalized)) return "ALC";
  if (normalized.includes("MERCADO LIVRE") || normalized.includes("MELI") || /\bML\b/.test(normalized)) return "MERCADO_LIVRE";
  return null;
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeIdentity);
  return headers.findIndex((header) => {
    const normalized = normalizeIdentity(header);
    return normalizedAliases.some((alias) => normalized === alias || normalized.includes(alias));
  });
}

function isDecisionColumn(header: string) {
  const normalized = normalizeIdentity(header);
  return normalized.includes("DECISAO") || normalized.includes("ADM") || normalized.includes("RETORNO") || normalized.includes("ACAO");
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  const limit = Math.min(20, worksheet.rowCount);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const headers = rowValues(worksheet.getRow(rowNumber));
    const hasValue = findHeaderIndex(headers, ["VALOR", "VALOR DESCONTO", "DESCONTO"]) >= 0;
    const hasPerson = findHeaderIndex(headers, ["MOTORISTA", "DRIVER", "NOME MOTORISTA"]) >= 0;
    const hasDecision = headers.some(isDecisionColumn);
    if (hasValue && (hasPerson || hasDecision)) return { rowNumber, headers };
  }
  return null;
}

function classifyDecision(value: string, sheetType: SheetType) {
  if (sheetType === "ALC") return "ALC";
  if (sheetType === "MERCADO_LIVRE") return "MERCADO_LIVRE";
  const decision = normalizeIdentity(value);
  if (!decision) return "INDEFINIDO";
  const hasDispatcher = decision.includes("DISPATCHER") || decision.includes("DISPATHCER") || decision.includes("DISPACHER");
  const hasDriver = decision.includes("DRIVER") || decision.includes("MOTORISTA");
  const unsignedTerm = decision.includes("ASSIN") && decision.includes("TERMO");
  if (unsignedTerm && hasDispatcher) return "DISPATCHER";
  if (hasDispatcher && (decision.includes("RETIRAR") || decision.includes("DESCONTO") || unsignedTerm || !hasDriver)) return "DISPATCHER";
  if (hasDriver && !hasDispatcher && (decision.includes("MANTER") || decision.includes("MANTIDO") || decision.includes("MANTEM") || decision.includes("DIRECIONADO") || decision.includes("DESCONTO"))) return "DRIVER";
  return "INDEFINIDO";
}

function findDecision(headers: string[], values: string[], sheetType: SheetType) {
  if (sheetType === "ALC" || sheetType === "MERCADO_LIVRE") return { value: "", category: classifyDecision("", sheetType) };
  const indexes = headers.map((header, index) => (isDecisionColumn(header) ? index : -1)).filter((index) => index >= 0).reverse();
  let fallback = "";
  for (const index of indexes) {
    const value = values[index] || "";
    if (!value) continue;
    if (!fallback) fallback = value;
    const category = classifyDecision(value, sheetType);
    if (category !== "INDEFINIDO") return { value, category };
  }
  return { value: fallback, category: "INDEFINIDO" };
}

function parseDate(value: string) {
  if (!value) return null;
  const trimmed = String(value).trim();
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

function parseCurrency(value: string) {
  return toNumber(String(value || "").replace(/[^\d,.-]+/g, ""));
}

function baseCode(value: string) {
  const match = normalizeIdentity(value).match(/\b[A-Z]{2,4}\d{1,3}\b/);
  return match?.[0] || normalizeIdentity(value);
}

function parseWorksheet(worksheet: ExcelJS.Worksheet, period: ReturnType<typeof detectPeriod>, fileName: string) {
  const sheetType = detectSheetType(worksheet.name) || detectSheetType(fileName);
  if (!sheetType) {
    return {
      stats: { name: worksheet.name, acceptedRows: 0, ignoredRows: worksheet.actualRowCount, sheetType: "", reason: "Aba não reconhecida" },
      records: [] as ParsedRecord[],
    };
  }

  const header = findHeaderRow(worksheet);
  if (!header) {
    return {
      stats: { name: worksheet.name, acceptedRows: 0, ignoredRows: worksheet.actualRowCount, sheetType, reason: "Cabeçalho não encontrado" },
      records: [] as ParsedRecord[],
    };
  }

  const indexes = {
    base: findHeaderIndex(header.headers, ["BASE", "SVC", "ESTACAO", "ESTAÇÃO", "UNIDADE"]),
    driver: findHeaderIndex(header.headers, ["MOTORISTA", "DRIVER", "NOME MOTORISTA", "NOME DO MOTORISTA"]),
    valor: findHeaderIndex(header.headers, ["VALOR", "VALOR DESCONTO", "DESCONTO"]),
    data: findHeaderIndex(header.headers, ["DATA", "DATA DA ROTA"]),
    rota: findHeaderIndex(header.headers, ["ROTA", "N ROTA", "Nº ROTA", "NRO ROTA", "NUMERO ROTA", "NÚMERO ROTA"]),
    id: findHeaderIndex(header.headers, ["ID CASO", "ID", "ID DO PACOTE", "ID PACOTE", "CASO"]),
    evidencia1: findHeaderIndex(header.headers, ["EVIDENCIA 1", "EVIDÊNCIA 1", "EVIDENCIA", "EVIDÊNCIA"]),
    evidencia2: findHeaderIndex(header.headers, ["EVIDENCIA 2", "EVIDÊNCIA 2"]),
  };

  const records: ParsedRecord[] = [];
  let ignoredRows = 0;
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = rowValues(worksheet.getRow(rowNumber));
    if (!values.some((value) => String(value || "").trim())) continue;
    if (isPackageTotalLikeRow(values)) {
      ignoredRows += 1;
      continue;
    }

    const decision = findDecision(header.headers, values, sheetType);
    const valor = indexes.valor >= 0 ? parseCurrency(values[indexes.valor]) : 0;
    const base = indexes.base >= 0 ? values[indexes.base] || "" : "";
    const driver = indexes.driver >= 0 ? values[indexes.driver] || "" : "";
    const data = indexes.data >= 0 ? parseDate(values[indexes.data] || "") : null;
    const rota = indexes.rota >= 0 ? values[indexes.rota] || "" : "";
    const idEnvio = indexes.id >= 0 ? values[indexes.id] || "" : "";
    if (!valor || ![base, driver, data, rota, idEnvio, decision.value].some((value) => String(value || "").trim())) {
      ignoredRows += 1;
      continue;
    }

    const raw_data = Object.fromEntries(header.headers.map((key, index) => [key || `COL_${index + 1}`, values[index] || ""]));
    const category = decision.category;
    const parsed: ParsedRecord = {
      competencia: period.competencia,
      quinzena: period.quinzena,
      tipo: sheetType === "ALC" ? "Indefinido" : "SVC",
      desconto: category,
      base,
      codigo_base: baseCode(base),
      driver,
      driver_normalizado: normalizeIdentity(driver),
      data,
      id_envio: idEnvio.replace(/\.0+$/, "").trim(),
      rota: rota.replace(/\.0+$/, "").trim(),
      valor,
      decisao_adm: decision.value,
      observacao: [indexes.evidencia1, indexes.evidencia2].map((index) => index >= 0 ? values[index] : "").filter(Boolean).join(" | "),
      aba_origem: sheetType,
      raw_data: {
        ...raw_data,
        file_category: "GESTAO_PACOTES",
        arquivo_origem: fileName,
        categoria_label: CATEGORY_LABELS[category] || "Indefinido",
        aba_gestao: sheetType,
        aba_gestao_label: worksheet.name,
        id_pacote: idEnvio,
        id_caso: idEnvio,
        ocorrencias: 1,
      },
      module_key: "gestao_pacotes",
      dedupe_key: "",
    };
    parsed.dedupe_key = buildPackageDedupeKey(parsed);
    records.push(parsed);
  }

  return {
    stats: { name: worksheet.name, acceptedRows: records.length, ignoredRows, sheetType },
    records,
  };
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
  records: ParsedRecord[];
  stats: SheetValidation[];
  period: ReturnType<typeof detectPeriod>;
  userId: string;
  userEmail: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const fileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  const storagePath = `next/gestao-pacotes/${fileHash.slice(0, 16)}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const metadata = {
    source: "next_app_router",
    file_hash: fileHash,
    module_key: "gestao_pacotes",
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
      file_type: "GESTAO_PACOTES",
      file_size: file.size,
      uploaded_by: userId,
      uploaded_by_email: userEmail,
      reference_month: period.reference_month || null,
      reference_year: period.reference_year || null,
      is_active: true,
      status: "processed",
      period_label: period.quinzena || null,
      period_type: period.period_type || null,
      metadata,
    })
    .select("id")
    .single();

  if (fileError) throw fileError;

  const rows = records.map((record) => ({ ...record, file_id: fileRecord.id }));
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase
      .from("gestao_pacotes_records")
      .upsert(rows.slice(index, index + 500), { onConflict: "module_key,dedupe_key" });
    if (error) throw error;
  }

  const { error: processedError } = await supabase
    .from("processed_dashboard_files")
    .upsert({
      module_key: "gestao_pacotes",
      file_name: file.name,
      file_hash: fileHash,
      file_size: file.size,
      competencia: period.competencia || null,
      row_count: rows.length,
      status: "processed",
      metadata,
      storage_path: storagePath,
      raw_file_deleted: true,
      file_role: "quinzena",
    }, { onConflict: "module_key,file_hash" });

  if (processedError) throw processedError;

  return { fileId: fileRecord.id, fileHash, persistedRows: rows.length };
}

export async function POST(request: NextRequest) {
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
  const period = detectPeriod(file.name);
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return apiError("Não foi possível ler a planilha. Verifique se o arquivo está íntegro e tente novamente.", 422);
  }
  const parsedSheets = workbook.worksheets.map((worksheet) => parseWorksheet(worksheet, period, file.name));
  const sheets = parsedSheets.map((sheet) => sheet.stats);
  const records = parsedSheets.flatMap((sheet) => sheet.records);
  const acceptedRows = sheets.reduce((sum, sheet) => sum + sheet.acceptedRows, 0);
  const ignoredRows = sheets.reduce((sum, sheet) => sum + sheet.ignoredRows, 0);

  if (!sheets.some((sheet) => sheet.sheetType)) {
    return apiError("Nenhuma aba de Gestão de Pacotes foi reconhecida.", 422);
  }

  const persistence = shouldPersist && records.length
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

  return NextResponse.json({
    fileName: file.name,
    acceptedRows,
    ignoredRows,
    sheets,
    uniquePackages: new Set(records.map((record) => record.id_envio).filter(Boolean)).size,
    events: records.length,
    duplicated: Math.max(records.length - new Set(records.map((record) => record.dedupe_key)).size, 0),
    persisted: Boolean(persistence),
    persistence,
    message: acceptedRows
      ? persistence
        ? "Planilha importada com identidade de pacote e exclusão de totais."
        : "Planilha validada com identidade de pacote e exclusão de totais."
      : "Planilha lida, mas nenhum evento válido foi encontrado.",
  });
}
