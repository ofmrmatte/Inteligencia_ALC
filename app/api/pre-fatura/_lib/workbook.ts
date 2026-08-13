import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  buildPreFaturaDedupeKey,
  hasPreFaturaPackageIdentity,
  isPreFaturaTotalLikeRow,
  normalizeIdentity,
  toNumber,
} from "@/features/pre-fatura/domain";

export const PRE_FATURA_TARGET_SHEETS = ["SVC PERDIDOS", "XPT PERDIDOS", "PNR"];

export type ParsedSpreadsheetSheet = {
  name: string;
  rows: unknown[][];
};

export type PreFaturaPeriod = ReturnType<typeof detectPreFaturaPeriod>;

export type ParsedPreFaturaRecord = {
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

export type PreFaturaSheetValidation = {
  name: string;
  acceptedRows: number;
  ignoredRows: number;
};

export type ParsedPreFaturaSheet = {
  stats: PreFaturaSheetValidation;
  records: ParsedPreFaturaRecord[];
};

type WorkbookReaders = {
  excelJs: (buffer: ArrayBuffer) => Promise<ParsedSpreadsheetSheet[]>;
  sheetJs: (buffer: ArrayBuffer) => ParsedSpreadsheetSheet[];
};

export class PreFaturaWorkbookUnreadableError extends Error {
  readonly code = "PRE_FATURA_WORKBOOK_UNREADABLE";

  constructor(message = "Não foi possível interpretar a estrutura desta planilha.") {
    super(message);
    this.name = "PreFaturaWorkbookUnreadableError";
  }
}

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

function numberToPlainString(value: number) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) {
    return value.toLocaleString("en-US", {
      useGrouping: false,
      maximumFractionDigits: 0,
    });
  }
  return String(value);
}

export function normalizeSpreadsheetCell(value: unknown): string | number {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? numberToPlainString(value) : value;
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") {
    if ("result" in value) return normalizeSpreadsheetCell((value as { result?: unknown }).result);
    if ("text" in value) return normalizeSpreadsheetCell((value as { text?: unknown }).text);
    if ("richText" in value && Array.isArray((value as { richText?: Array<{ text?: string }> }).richText)) {
      return ((value as { richText: Array<{ text?: string }> }).richText).map((item) => item.text || "").join("").trim();
    }
    if ("error" in value) return "";
    return "";
  }
  return String(value).trim();
}

function normalizedText(value: unknown) {
  const normalized = normalizeSpreadsheetCell(value);
  return typeof normalized === "number" ? String(normalized) : normalized;
}

export function detectPreFaturaPeriod(fileName: string) {
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

function parseDate(value: unknown) {
  const trimmed = normalizedText(value);
  if (!trimmed) return null;
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, day, month, year] = br;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function findHeaderIndex(headers: unknown[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeIdentity);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeIdentity(normalizedText(header))));
}

export function findPreFaturaHeaderRow(rows: unknown[][]) {
  const limit = Math.min(20, rows.length);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const headers = rows[rowIndex] ?? [];
    const hasPackage = findHeaderIndex(headers, ["ID DO PACOTE", "ID PACOTE", "ID DE ENVIO", "ID ENVIO", "PACOTE", "ENVIO"]) >= 0;
    const hasRoute = findHeaderIndex(headers, ["N ROTA", "Nº ROTA", "NUMERO ROTA", "ROTA", "ID ROTA"]) >= 0;
    const hasValue = findHeaderIndex(headers, ["DESCONTO", "VALOR", "VALOR DESCONTO", "VALOR DO DESCONTO"]) >= 0;
    if (hasPackage && hasRoute && hasValue) return { rowIndex, headers };
  }
  return null;
}

function cellAt(values: unknown[], index: number) {
  return index >= 0 ? values[index] : "";
}

export function detectPreFaturaOperationalType(sheetName: string) {
  const normalized = normalizeIdentity(sheetName);
  if (normalized.includes("SVC")) return "SVC";
  if (normalized.includes("XPT")) return "XPT";
  if (normalized.includes("PNR")) return "PNR";
  return "";
}

function detectPreFaturaDiscountType(headers: unknown[], sheetName: string) {
  const normalizedHeaders = headers.map((header) => normalizeIdentity(normalizedText(header)));
  if (normalizedHeaders.includes("DESCONTO PACOTE PERDIDO")) return "DESCONTO PACOTE PERDIDO";
  if (normalizedHeaders.includes("DESCONTO PNR")) return "DESCONTO PNR";
  return detectPreFaturaOperationalType(sheetName) || "PNR";
}

export function parsePreFaturaSheet(sheet: ParsedSpreadsheetSheet, period: PreFaturaPeriod): ParsedPreFaturaSheet {
  const header = findPreFaturaHeaderRow(sheet.rows);
  if (!header) {
    return {
      stats: { name: sheet.name, acceptedRows: 0, ignoredRows: sheet.rows.length },
      records: [],
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

  const operationalType = detectPreFaturaDiscountType(header.headers, sheet.name);
  let acceptedRows = 0;
  let ignoredRows = 0;
  const records: ParsedPreFaturaRecord[] = [];
  for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const values = sheet.rows[rowIndex] ?? [];
    const raw_data = Object.fromEntries(header.headers.map((key, index) => [normalizedText(key) || `COL_${index + 1}`, normalizedText(values[index])]));
    const row = {
      base: normalizedText(cellAt(values, indexes.base)),
      driver: normalizedText(cellAt(values, indexes.driver)),
      placa: normalizedText(cellAt(values, indexes.placa)),
      tipo: normalizedText(cellAt(values, indexes.tipo)),
      id_envio: normalizedText(cellAt(values, indexes.pacote)),
      rota: normalizedText(cellAt(values, indexes.rota)),
      valor: normalizeSpreadsheetCell(cellAt(values, indexes.valor)),
      aba_origem: sheet.name,
    };

    const empty = Object.values(row).every((value) => !String(value || "").trim());
    const hasIdentity = hasPreFaturaPackageIdentity(row);
    const totalLike = isPreFaturaTotalLikeRow(row);
    const value = toNumber(row.valor);
    if (empty || totalLike || !hasIdentity || !value) {
      ignoredRows += 1;
      continue;
    }
    const parsed: ParsedPreFaturaRecord = {
      competencia: period.competencia,
      quinzena: period.quinzena,
      tipo: operationalType,
      base: row.base,
      codigo_base: baseCode(row.base),
      driver: row.driver,
      driver_normalizado: normalizeIdentity(row.driver),
      placa: row.placa,
      data: parseDate(cellAt(values, indexes.data)),
      id_envio: normalizeIdentity(row.id_envio),
      rota: row.rota,
      valor: value,
      aba_origem: sheet.name,
      raw_data,
      module_key: "pre_fatura",
      dedupe_key: "",
    };
    parsed.dedupe_key = buildPreFaturaDedupeKey(parsed);
    records.push(parsed);
    acceptedRows += 1;
  }

  return { stats: { name: sheet.name, acceptedRows, ignoredRows }, records };
}

function excelJsCellValue(cell: ExcelJS.Cell) {
  return normalizeSpreadsheetCell(cell.value);
}

function excelJsSheetRows(worksheet: ExcelJS.Worksheet) {
  const rows: unknown[][] = [];
  const columnCount = Math.max(worksheet.columnCount, 1);
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: unknown[] = [];
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      values[columnNumber - 1] = excelJsCellValue(row.getCell(columnNumber));
    }
    rows.push(values);
  }
  return rows;
}

export async function readPreFaturaWorkbookWithExcelJs(buffer: ArrayBuffer): Promise<ParsedSpreadsheetSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets
    .filter((worksheet) => PRE_FATURA_TARGET_SHEETS.includes(normalizeIdentity(worksheet.name)))
    .map((worksheet) => ({ name: worksheet.name, rows: excelJsSheetRows(worksheet) }));
}

export function readPreFaturaWorkbookWithSheetJs(buffer: ArrayBuffer): ParsedSpreadsheetSheet[] {
  const workbook = XLSX.read(Buffer.from(buffer), {
    type: "buffer",
    cellDates: true,
    raw: true,
  });
  return workbook.SheetNames
    .filter((sheetName) => PRE_FATURA_TARGET_SHEETS.includes(normalizeIdentity(sheetName)))
    .map((sheetName) => ({
      name: sheetName,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: true,
        defval: "",
        blankrows: true,
      }) as unknown[][],
    }));
}

function errorInfo(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}

export async function readPreFaturaWorkbook(
  buffer: ArrayBuffer,
  context: { fileName: string; fileSize: number },
  readers: WorkbookReaders = {
    excelJs: readPreFaturaWorkbookWithExcelJs,
    sheetJs: readPreFaturaWorkbookWithSheetJs,
  },
) {
  try {
    return {
      reader: "exceljs" as const,
      sheets: await readers.excelJs(buffer),
      excelJsError: null,
    };
  } catch (excelJsError) {
    console.warn("[pre_fatura_exceljs_fallback]", {
      fileName: context.fileName,
      fileSize: context.fileSize,
      ...errorInfo(excelJsError),
    });
    try {
      return {
        reader: "sheetjs" as const,
        sheets: readers.sheetJs(buffer),
        excelJsError,
      };
    } catch (sheetJsError) {
      console.error("[pre_fatura_workbook_unreadable]", {
        fileName: context.fileName,
        excelJsError: errorInfo(excelJsError),
        sheetJsError: errorInfo(sheetJsError),
      });
      throw new PreFaturaWorkbookUnreadableError();
    }
  }
}
