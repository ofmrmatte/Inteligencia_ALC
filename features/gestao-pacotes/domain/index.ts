export type GestaoPacotesRecord = {
  id: string;
  competencia: string | null;
  quinzena: string | null;
  tipo: string | null;
  desconto: string | null;
  base: string | null;
  codigo_base: string | null;
  driver: string | null;
  driver_normalizado?: string | null;
  data: string | null;
  id_envio: string | null;
  rota: string | null;
  valor: number | string | null;
  decisao_adm: string | null;
  observacao: string | null;
  aba_origem: string | null;
  file_id: string;
  dedupe_key?: string | null;
  raw_data?: Record<string, unknown> | null;
  created_at: string | null;
};

export type GestaoPacotesSortKey =
  | "valor"
  | "data"
  | "base"
  | "driver"
  | "rota"
  | "id_envio"
  | "desconto"
  | "created_at";

export type GestaoPacotesFilters = {
  page: number;
  pageSize: number;
  q: string;
  competencia: string;
  quinzena: string;
  tipo: string;
  desconto: string;
  base: string;
  sort: GestaoPacotesSortKey;
  dir: "asc" | "desc";
};

export type GestaoPacotesSummary = {
  totalRows: number;
  totalValue: number;
  packageIds: number;
  bases: number;
  drivers: number;
  routes: number;
  dispatcherValue: number;
  driverValue: number;
  alcValue: number;
  averageValue: number;
  topBases: Array<{ label: string; count: number; value: number }>;
  decisionRows: Array<{ label: string; count: number; value: number; share: number }>;
};

export type GestaoPacotesPageData = {
  rows: GestaoPacotesRecord[];
  summary: GestaoPacotesSummary;
  totalRows: number;
  totalPages: number;
  filters: GestaoPacotesFilters;
  options: {
    competencias: string[];
    quinzenas: string[];
    tipos: string[];
    descontos: string[];
    bases: Array<{ value: string; label: string }>;
  };
  error: string | null;
};

export const GESTAO_PACOTES_SORT_KEYS: GestaoPacotesSortKey[] = [
  "valor",
  "data",
  "base",
  "driver",
  "rota",
  "id_envio",
  "desconto",
  "created_at",
];

export function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeIdentity(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeDedupePart(value: unknown) {
  return normalizeIdentity(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

export function normalizeDedupeMoney(value: unknown) {
  const amount = toNumber(typeof value === "string" ? value.replace(/[^\d,.-]+/g, "") : value as string | number | null | undefined);
  return amount.toFixed(2);
}

export function buildPackageDedupeKey(
  row: Pick<
    GestaoPacotesRecord,
    "competencia" | "quinzena" | "codigo_base" | "base" | "driver" | "driver_normalizado" | "rota" | "id_envio" | "tipo" | "desconto" | "decisao_adm" | "data" | "valor"
  >,
) {
  return [
    "gestao_pacotes",
    row.competencia,
    row.quinzena,
    row.codigo_base || row.base,
    row.driver_normalizado || row.driver,
    row.rota,
    row.id_envio,
    row.tipo,
    row.desconto,
    row.decisao_adm,
    row.data,
    normalizeDedupeMoney(row.valor),
  ].map(normalizeDedupePart).join("|");
}

export function hasPackageIdentity(row: Pick<GestaoPacotesRecord, "id_envio" | "rota">) {
  return Boolean(normalizeIdentity(row.id_envio) || normalizeIdentity(row.rota));
}

export function isPackageTotalLikeRow(input: Record<string, unknown> | unknown[]) {
  const values = (Array.isArray(input) ? input : Object.values(input))
    .map((value) => normalizeIdentity(value))
    .filter(Boolean);
  if (!values.length) return true;
  const joined = values.join(" ");
  return /\bTOTAL(?:\s+GERAL)?\b/.test(joined)
    || /\bTOTAIS\b/.test(joined)
    || /\bRESUMO\b/.test(joined)
    || /\bSUBTOTAL\b/.test(joined)
    || /\bSOMA(?:TORIA)?\b/.test(joined)
    || /\bVALOR TOTAL\b/.test(joined)
    || /\bTOTAL DESCONTOS?\b/.test(joined)
    || /\bTOTAL ABSORVIDO\b/.test(joined)
    || /\bTOTAL DRIVER\b/.test(joined)
    || /\bTOTAL DISPATCHER\b/.test(joined)
    || values.every((value) => ["TOTAL", "R$", "BRL"].includes(value) || /^[\d.,-]+$/.test(value));
}

export function comparePackageEvents(
  a: Pick<GestaoPacotesRecord, "data" | "created_at">,
  b: Pick<GestaoPacotesRecord, "data" | "created_at">,
) {
  const aTime = Date.parse(a.data || a.created_at || "");
  const bTime = Date.parse(b.data || b.created_at || "");
  return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
}

export function calculatePackageMetrics(rows: GestaoPacotesRecord[], totalRows = rows.length): GestaoPacotesSummary {
  const totalValue = rows.reduce((sum, row) => sum + toNumber(row.valor), 0);
  const decisionMap = new Map<string, { count: number; value: number }>();
  const baseMap = new Map<string, { count: number; value: number }>();

  rows.forEach((row) => {
    const value = toNumber(row.valor);
    const decision = row.desconto || "Indefinido";
    const base = row.codigo_base || row.base || "Sem base";
    const currentDecision = decisionMap.get(decision) || { count: 0, value: 0 };
    currentDecision.count += 1;
    currentDecision.value += value;
    decisionMap.set(decision, currentDecision);

    const currentBase = baseMap.get(base) || { count: 0, value: 0 };
    currentBase.count += 1;
    currentBase.value += value;
    baseMap.set(base, currentBase);
  });

  const decisionRows = [...decisionMap.entries()]
    .map(([label, item]) => ({
      label,
      count: item.count,
      value: item.value,
      share: totalRows ? (item.count / totalRows) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    totalRows,
    totalValue,
    packageIds: new Set(rows.map((row) => row.id_envio).filter(Boolean)).size,
    bases: new Set(rows.map((row) => row.codigo_base || row.base).filter(Boolean)).size,
    drivers: new Set(rows.map((row) => row.driver).filter(Boolean)).size,
    routes: new Set(rows.map((row) => row.rota).filter(Boolean)).size,
    dispatcherValue: decisionRows.find((row) => row.label === "DISPATCHER")?.value || 0,
    driverValue: decisionRows.find((row) => row.label === "DRIVER")?.value || 0,
    alcValue: decisionRows.find((row) => row.label === "ALC")?.value || 0,
    averageValue: rows.length ? totalValue / rows.length : 0,
    topBases: [...baseMap.entries()]
      .map(([label, item]) => ({ label, count: item.count, value: item.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    decisionRows,
  };
}
