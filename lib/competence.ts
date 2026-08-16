import { normalizeText } from "@/lib/normalize";

export interface Competence {
  fortnight: string;
  month: string;
  year: string;
  half: 1 | 2;
}

const MONTHS: Record<string, string> = {
  JANEIRO: "01",
  JAN: "01",
  FEVEREIRO: "02",
  FEV: "02",
  MARCO: "03",
  MAR: "03",
  ABRIL: "04",
  ABR: "04",
  MAIO: "05",
  MAI: "05",
  JUNHO: "06",
  JUN: "06",
  JULHO: "07",
  JUL: "07",
  AGOSTO: "08",
  AGO: "08",
  SETEMBRO: "09",
  SET: "09",
  OUTUBRO: "10",
  OUT: "10",
  NOVEMBRO: "11",
  NOV: "11",
  DEZEMBRO: "12",
  DEZ: "12",
};

const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

function compactText(value: string | null | undefined) {
  return normalizeText(value ?? "").replace(/[ªº]/g, "").replace(/[_-]+/g, " ");
}

function fullYear(value: string) {
  const year = Number(value);
  if (!Number.isFinite(year)) return "";
  return String(value.length === 2 ? 2000 + year : year);
}

function buildCompetence(half: number, month: string, year: string): Competence | null {
  const normalizedHalf = half === 1 || half === 2 ? half : 0;
  const normalizedMonth = month.padStart(2, "0");
  const normalizedYear = fullYear(year);
  if (!normalizedHalf || !/^(0[1-9]|1[0-2])$/.test(normalizedMonth) || !/^20\d{2}$/.test(normalizedYear)) return null;
  return {
    fortnight: `0${normalizedHalf}Q${normalizedMonth}${normalizedYear}`,
    month: `${normalizedYear}-${normalizedMonth}`,
    year: normalizedYear,
    half: normalizedHalf,
  };
}

function halfFromText(text: string): 1 | 2 | null {
  const normalized = compactText(text);
  if (/(^|\D)(?:0?1\s*Q|Q\s*0?1|1A\s+QUINZENA|1\s+QUINZENA|PRIMEIRA\s+QUINZENA)(\D|$)/.test(normalized)) return 1;
  if (/(^|\D)(?:0?2\s*Q|Q\s*0?2|2A\s+QUINZENA|2\s+QUINZENA|SEGUNDA\s+QUINZENA)(\D|$)/.test(normalized)) return 2;
  return null;
}

function monthYearFromText(text: string): { month: string; year: string } | null {
  const normalized = compactText(text);
  const numeric = /(^|\D)(0?[1-9]|1[0-2])\s*[/-]\s*(\d{4}|\d{2})(\D|$)/.exec(normalized);
  if (numeric) return { month: numeric[2].padStart(2, "0"), year: numeric[3] };

  const monthAfter = new RegExp(`(^|\\D)(${MONTH_PATTERN})\\s+(\\d{4}|\\d{2})(\\D|$)`).exec(normalized);
  if (monthAfter) return { month: MONTHS[monthAfter[2]], year: monthAfter[3] };

  const monthBefore = new RegExp(`(^|\\D)(\\d{4}|\\d{2})\\s+(${MONTH_PATTERN})(\\D|$)`).exec(normalized);
  if (monthBefore) return { month: MONTHS[monthBefore[3]], year: monthBefore[2] };

  return null;
}

export function normalizeFortnight(value: string | null | undefined) {
  const normalized = compactText(value).replace(/\s+/g, "");
  if (!normalized) return "";

  const yearFirstMatch = /(\d{4})(\d{2})Q?([12])/.exec(normalized);
  if (yearFirstMatch) return buildCompetence(Number(yearFirstMatch[3]), yearFirstMatch[2], yearFirstMatch[1])?.fortnight ?? "";

  const compactMatch = /(?:0?([12])Q|Q0?([12]))(\d{2})(\d{4}|\d{2})/.exec(normalized);
  if (compactMatch) return buildCompetence(Number(compactMatch[1] || compactMatch[2]), compactMatch[3], compactMatch[4])?.fortnight ?? "";

  const spaced = compactText(value);
  const half = halfFromText(spaced);
  const monthYear = monthYearFromText(spaced);
  if (half && monthYear) return buildCompetence(half, monthYear.month, monthYear.year)?.fortnight ?? "";

  return "";
}

export function monthFromFortnight(value: string) {
  const match = /^(0[12])Q(\d{2})(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}` : "";
}

export function yearFromFortnight(value: string) {
  const match = /^(0[12])Q(\d{2})(\d{4})$/.exec(value);
  return match ? match[3] : "";
}

export function halfFromFortnight(value: string): 1 | 2 | null {
  const match = /^(0[12])Q\d{6}$/.exec(value);
  return match ? (value.startsWith("01Q") ? 1 : 2) : null;
}

export function fortnightFromDate(date: string | null) {
  if (!date) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return "";
  const [, year, month, day] = match;
  return buildCompetence(Number(day) <= 15 ? 1 : 2, month, year)?.fortnight ?? "";
}

export function parseCompetence({
  value,
  sourceFile,
  sourceSheet,
  batchName,
  confirmed,
  routeDate,
  allowDateFallback = true,
}: {
  value?: unknown;
  sourceFile?: string;
  sourceSheet?: string;
  batchName?: string;
  confirmed?: string;
  routeDate?: string | null;
  allowDateFallback?: boolean;
}): Competence | null {
  const cell = String(value ?? "");
  const directCell = normalizeFortnight(cell);
  if (directCell) return buildCompetence(directCell.startsWith("01Q") ? 1 : 2, directCell.slice(3, 5), directCell.slice(5));

  const half = halfFromText(cell);
  if (half) {
    for (const source of [cell, sourceFile, batchName, sourceSheet, confirmed]) {
      const monthYear = monthYearFromText(String(source ?? ""));
      const competence = monthYear ? buildCompetence(half, monthYear.month, monthYear.year) : null;
      if (competence) return competence;
    }
  }

  for (const source of [sourceFile, sourceSheet, batchName, confirmed]) {
    const fortnight = normalizeFortnight(source);
    if (fortnight) return buildCompetence(fortnight.startsWith("01Q") ? 1 : 2, fortnight.slice(3, 5), fortnight.slice(5));
  }

  if (allowDateFallback) {
    const fallback = fortnightFromDate(routeDate ?? null);
    if (fallback) return buildCompetence(fallback.startsWith("01Q") ? 1 : 2, fallback.slice(3, 5), fallback.slice(5));
  }

  return null;
}

export function formatPeriodSummary(fortnights: string[]) {
  const unique = [...new Set(fortnights)].sort();
  if (unique.length === 0) return "Competência não identificada";
  const byMonth = new Map<string, Set<string>>();
  for (const fortnight of unique) {
    const month = monthFromFortnight(fortnight);
    if (!month) continue;
    byMonth.set(month, new Set([...(byMonth.get(month) ?? []), fortnight.startsWith("01Q") ? "1ª" : "2ª"]));
  }
  return [...byMonth.entries()].map(([month, halves]) => `${[...halves].join(" e ")} quinzenas de ${month}`).join(", ");
}
