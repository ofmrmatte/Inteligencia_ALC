import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { getCurrentSession } from "@/lib/auth/session";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildPreFaturaDedupeKey,
  hasPreFaturaPackageIdentity,
  isPreFaturaTotalLikeRow,
  normalizeIdentity,
  toNumber,
} from "@/features/pre-fatura/domain";

const TARGET_SHEETS = ["SVC PERDIDOS", "XPT PERDIDOS", "PNR"];

type SheetValidation = {
  name: string;
  acceptedRows: number;
  ignoredRows: number;
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
      id_envio: row.id_envio,
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
  const storagePath = `next/pre-fatura/${fileHash.slice(0, 16)}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const metadata = {
    source: "next_app_router",
    file_hash: fileHash,
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
      file_type: "PRE_FATURA",
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
    const batch = rows.slice(index, index + 500);
    const { error } = await supabase.from("pre_fatura_records").upsert(batch, { onConflict: "module_key,dedupe_key" });
    if (error) throw error;
  }

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
      metadata,
      storage_path: storagePath,
      raw_file_deleted: true,
      file_role: "quinzena",
    }, { onConflict: "module_key,file_hash" });

  if (processedError) throw processedError;

  return { fileId: fileRecord.id, fileHash, persistedRows: rows.length };
}

export async function POST(request: NextRequest) {
  const { user, profile } = await getCurrentSession();
  if (!user) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  const formData = await request.formData();
  const shouldPersist = formData.get("persist") === "true";
  if (shouldPersist && !isAdminProfile(profile)) {
    return NextResponse.json({ error: "Apenas administradores podem persistir importacoes." }, { status: 403 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo .xlsx valido." }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  const period = detectPeriod(file.name);
  await workbook.xlsx.load(buffer);
  const parsedSheets = workbook.worksheets
    .filter((worksheet) => TARGET_SHEETS.includes(normalizeIdentity(worksheet.name)))
    .map((worksheet) => parseWorksheet(worksheet, period));
  const sheets = parsedSheets.map((sheet) => sheet.stats);
  const records = parsedSheets.flatMap((sheet) => sheet.records);

  if (!sheets.length) {
    return NextResponse.json({ error: "Nenhuma aba esperada foi encontrada: SVC PERDIDOS, XPT PERDIDOS ou PNR." }, { status: 422 });
  }

  const acceptedRows = sheets.reduce((sum, sheet) => sum + sheet.acceptedRows, 0);
  const ignoredRows = sheets.reduce((sum, sheet) => sum + sheet.ignoredRows, 0);
  const persistence = shouldPersist && records.length
    ? await persistImport({
      file,
      buffer,
      records,
      stats: sheets,
      period,
      userId: user.id,
      userEmail: profile?.email || user.email || null,
    })
    : null;

  return NextResponse.json({
    fileName: file.name,
    acceptedRows,
    ignoredRows,
    sheets,
    persisted: Boolean(persistence),
    persistence,
    message: acceptedRows
      ? persistence
        ? "Planilha importada com regras de identidade e exclusao de totais."
        : "Planilha validada com regras de identidade e exclusao de totais."
      : "Planilha lida, mas nenhum registro valido foi encontrado.",
  });
}
