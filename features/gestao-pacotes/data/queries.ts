import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  calculatePackageMetrics,
  GESTAO_PACOTES_SORT_KEYS,
  type GestaoPacotesFilters,
  type GestaoPacotesPageData,
  type GestaoPacotesRecord,
  type GestaoPacotesSortKey,
} from "@/features/gestao-pacotes/domain";

type SearchParamsInput = Record<string, string | string[] | undefined>;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: string | string[] | undefined) {
  return (first(value) || "").trim();
}

function asPositiveInt(value: string | string[] | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(first(value));
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function searchFilter(q: string) {
  const safe = q.replace(/[%*,]/g, " ");
  return [
    `base.ilike.%${safe}%`,
    `codigo_base.ilike.%${safe}%`,
    `driver.ilike.%${safe}%`,
    `id_envio.ilike.%${safe}%`,
    `rota.ilike.%${safe}%`,
    `decisao_adm.ilike.%${safe}%`,
    `observacao.ilike.%${safe}%`,
  ].join(",");
}

export function parseGestaoPacotesFilters(searchParams: SearchParamsInput = {}): GestaoPacotesFilters {
  const sortParam = clean(searchParams.sort) as GestaoPacotesSortKey;
  const dirParam = clean(searchParams.dir);
  return {
    page: asPositiveInt(searchParams.page, 1),
    pageSize: asPositiveInt(searchParams.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    q: clean(searchParams.q),
    competencia: clean(searchParams.competencia),
    quinzena: clean(searchParams.quinzena),
    tipo: clean(searchParams.tipo),
    desconto: clean(searchParams.desconto),
    base: clean(searchParams.base),
    sort: GESTAO_PACOTES_SORT_KEYS.includes(sortParam) ? sortParam : "data",
    dir: dirParam === "asc" ? "asc" : "desc",
  };
}

function applyFilters<T extends { eq: (column: string, value: string) => T; or: (query: string) => T }>(
  query: T,
  filters: GestaoPacotesFilters,
) {
  let next = query;
  if (filters.competencia) next = next.eq("competencia", filters.competencia);
  if (filters.quinzena) next = next.eq("quinzena", filters.quinzena);
  if (filters.tipo) next = next.eq("tipo", filters.tipo);
  if (filters.desconto) next = next.eq("desconto", filters.desconto);
  if (filters.base) next = next.eq("codigo_base", filters.base);
  if (filters.q) next = next.or(searchFilter(filters.q));
  return next;
}

function emptyPage(filters: GestaoPacotesFilters, error: string | null): GestaoPacotesPageData {
  return {
    rows: [],
    summary: calculatePackageMetrics([], 0),
    totalRows: 0,
    totalPages: 1,
    filters,
    options: { competencias: [], quinzenas: [], tipos: [], descontos: [], bases: [] },
    error,
  };
}

export async function getGestaoPacotesPage(searchParams: SearchParamsInput): Promise<GestaoPacotesPageData> {
  const filters = parseGestaoPacotesFilters(searchParams);

  try {
    const supabase = await createServerSupabaseClient();
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    const baseSelect = "id,competencia,quinzena,tipo,desconto,base,codigo_base,driver,driver_normalizado,data,id_envio,rota,valor,decisao_adm,observacao,aba_origem,file_id,dedupe_key,raw_data,created_at";
    let rowsQuery = supabase
      .from("gestao_pacotes_records")
      .select(baseSelect, { count: "exact" })
      .eq("module_key", "gestao_pacotes");
    let metricsQuery = supabase
      .from("gestao_pacotes_records")
      .select("id,competencia,quinzena,tipo,desconto,base,codigo_base,driver,data,id_envio,rota,valor,file_id,created_at")
      .eq("module_key", "gestao_pacotes")
      .limit(50000);

    rowsQuery = applyFilters(rowsQuery, filters);
    metricsQuery = applyFilters(metricsQuery, filters);

    const optionsQuery = supabase
      .from("gestao_pacotes_records")
      .select("competencia,quinzena,tipo,desconto,codigo_base,base")
      .eq("module_key", "gestao_pacotes")
      .limit(50000);

    const pagedRowsQuery = rowsQuery
      .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
      .range(from, to);

    const [rowsResult, metricsResult, optionsResult] = await Promise.all([pagedRowsQuery, metricsQuery, optionsQuery]);
    if (rowsResult.error) throw rowsResult.error;
    if (metricsResult.error) throw metricsResult.error;
    if (optionsResult.error) throw optionsResult.error;

    const rows = (rowsResult.data ?? []) as GestaoPacotesRecord[];
    const metricsRows = (metricsResult.data ?? []) as GestaoPacotesRecord[];
    const optionRows = (optionsResult.data ?? []) as GestaoPacotesRecord[];
    const totalRows = rowsResult.count ?? 0;
    const baseMap = new Map<string, string>();
    optionRows.forEach((row) => {
      if (row.codigo_base) baseMap.set(row.codigo_base, row.base ? `${row.codigo_base} - ${row.base}` : row.codigo_base);
    });

    return {
      rows,
      summary: calculatePackageMetrics(metricsRows, totalRows),
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / filters.pageSize)),
      filters,
      options: {
        competencias: uniqueSorted(optionRows.map((row) => row.competencia)),
        quinzenas: uniqueSorted(optionRows.map((row) => row.quinzena)),
        tipos: uniqueSorted(optionRows.map((row) => row.tipo)),
        descontos: uniqueSorted(optionRows.map((row) => row.desconto)),
        bases: [...baseMap.entries()]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.value.localeCompare(b.value, "pt-BR")),
      },
      error: null,
    };
  } catch (error) {
    return emptyPage(filters, error instanceof Error ? error.message : "Falha ao carregar Gestão de Pacotes.");
  }
}
