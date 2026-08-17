import * as XLSX from "xlsx";

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function headerKey(value: unknown): string {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

export function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function asId(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return cleanText(value).replace(/\.0$/, "");
}

function normalizeSingleSeparatorNumber(text: string, separator: "." | ",") {
  const parts = text.split(separator);
  if (parts.length === 1) return text;

  const fractionalDigits = parts.at(-1)?.length ?? 0;
  const hasDecimalFraction = fractionalDigits > 0 && fractionalDigits <= 2;

  if (!hasDecimalFraction) return parts.join("");

  const integerPart = parts.slice(0, -1).join("");
  const fractionalPart = parts.at(-1) ?? "";
  return `${integerPart}.${fractionalPart}`;
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = cleanText(value);
  if (!text) return 0;

  let normalized = text
    .replace(/R\$|US\$/gi, "")
    .replace(/\s/g, "")
    .replace(/[^0-9,\.\-+]/g, "");

  if (!normalized || normalized === "-" || normalized === "+") return 0;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // Quando os dois separadores existem, o último é o decimal.
    // Ex.: 1,234.56 (EUA) e 1.234,56 (Brasil) -> 1234.56.
    if (lastDot > lastComma) {
      normalized = normalized.replace(/,/g, "");
    } else {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    }
  } else if (lastComma >= 0) {
    normalized = normalizeSingleSeparatorNumber(normalized, ",");
  } else if (lastDot >= 0) {
    normalized = normalizeSingleSeparatorNumber(normalized, ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function asDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = cleanText(value);
  const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function parseBase(value: unknown): { label: string; name: string; sigla: string; baseKey: string } {
  const label = cleanText(value);
  const parts = label.split(/\s+-\s+/);
  const sigla = parts.length > 1 ? cleanText(parts.at(-1)) : "";
  const name = parts.length > 1 ? parts.slice(0, -1).join(" - ") : label;
  return { label, name, sigla: normalizeText(sigla), baseKey: normalizeText(name) };
}

export function sameText(a: unknown, b: unknown): boolean {
  return normalizeText(a) === normalizeText(b);
}
