import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import {
  PRE_FATURA_SORT_KEYS,
  calculatePreFaturaSummary,
  type PreFaturaFilters,
  type PreFaturaPageData,
  type PreFaturaRecord,
  type PreFaturaSortKey,
} from "@/features/pre-fatura/domain";

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

export function parsePreFaturaFilters(searchParams: SearchParamsInput = {}): PreFaturaFilters {
  const sortParam = clean(searchParams.sort) as PreFaturaSortKey;
  const dirParam = clean(searchParams.dir);
  return {
    page: asPositiveInt(searchParams.page, 1),
    pageSize: asPositiveInt(searchParams.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    q: clean(searchParams.q),
    competencia: clean(searchParams.competencia),
    quinzena: clean(searchParams.quinzena),
    tipo: clean(searchParams.tipo),
    base: clean(searchParams.base),
    sort: PRE_FATURA_SORT_KEYS.includes(sortParam) ? sortParam : "valor",
    dir: dirParam === "asc" ? "asc" : "desc",
  };
}

function searchFilter(q: string) {
  const safe = q.replace(/[%*,]/g, " ");
  return `driver.ilike.%${safe}%,base.ilike.%${safe}%,codigo_base.ilike.%${safe}%,id_envio.ilike.%${safe}%,rota.ilike.%${safe}%,placa.ilike.%${safe}%`;
}

function uniqueSorted(values: Array<string | null>) {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

type PagedFilterQuery = {
  eq: (column: string, value: string) => PagedFilterQuery;
  or: (filters: string) => PagedFilterQuery;
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

function asPagedFilterQuery(query: unknown) {
  return query as PagedFilterQuery;
}

function applyPagedFilters(query: PagedFilterQuery, filters: PreFaturaFilters) {
  let next = query;
  if (filters.competencia) next = next.eq("competencia", filters.competencia);
  if (filters.quinzena) next = next.eq("quinzena", filters.quinzena);
  if (filters.tipo) next = next.eq("tipo", filters.tipo);
  if (filters.base) next = next.eq("codigo_base", filters.base);
  if (filters.q) next = next.or(searchFilter(filters.q));
  return next;
}

export async function getPreFaturaPage(searchParams: SearchParamsInput): Promise<PreFaturaPageData> {
  const filters = parsePreFaturaFilters(searchParams);

  try {
    const supabase = await createServerSupabaseClient();
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let rowsQuery = supabase
      .from("pre_fatura_records")
      .select("id,competencia,quinzena,tipo,base,codigo_base,driver,placa,data,id_envio,rota,valor,aba_origem,file_id,created_at", { count: "exact" })
      .eq("module_key", "pre_fatura");

    if (filters.competencia) rowsQuery = rowsQuery.eq("competencia", filters.competencia);
    if (filters.quinzena) rowsQuery = rowsQuery.eq("quinzena", filters.quinzena);
    if (filters.tipo) rowsQuery = rowsQuery.eq("tipo", filters.tipo);
    if (filters.base) rowsQuery = rowsQuery.eq("codigo_base", filters.base);
    if (filters.q) rowsQuery = rowsQuery.or(searchFilter(filters.q));

    const pagedRowsQuery = rowsQuery
      .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
      .range(from, to);

    const metricsRowsPromise = fetchAllSupabaseRows<PreFaturaRecord>((pageFrom, pageTo) => applyPagedFilters(
      asPagedFilterQuery(supabase
        .from("pre_fatura_records")
        .select("id,valor,id_envio,codigo_base,base,driver,rota")
        .eq("module_key", "pre_fatura")),
      filters,
    ).range(pageFrom, pageTo));

    const optionRowsPromise = fetchAllSupabaseRows<PreFaturaRecord>((pageFrom, pageTo) => supabase
      .from("pre_fatura_records")
      .select("competencia,quinzena,tipo,codigo_base,base")
      .eq("module_key", "pre_fatura")
      .range(pageFrom, pageTo));

    const [rowsResult, metricsRows, optionRows] = await Promise.all([pagedRowsQuery, metricsRowsPromise, optionRowsPromise]);
    if (rowsResult.error) throw rowsResult.error;

    const rows = (rowsResult.data ?? []) as PreFaturaRecord[];
    const totalRows = rowsResult.count ?? 0;

    const baseMap = new Map<string, string>();
    optionRows.forEach((row) => {
      if (row.codigo_base) baseMap.set(row.codigo_base, row.base ? `${row.codigo_base} - ${row.base}` : row.codigo_base);
    });

    return {
      rows,
      summary: calculatePreFaturaSummary(metricsRows, totalRows),
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / filters.pageSize)),
      filters,
      options: {
        competencias: uniqueSorted(optionRows.map((row) => row.competencia)),
        quinzenas: uniqueSorted(optionRows.map((row) => row.quinzena)),
        tipos: uniqueSorted(optionRows.map((row) => row.tipo)),
        bases: [...baseMap.entries()]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.value.localeCompare(b.value, "pt-BR")),
      },
      error: null,
    };
  } catch (error) {
    return {
      rows: [],
      summary: calculatePreFaturaSummary([], 0),
      totalRows: 0,
      totalPages: 1,
      filters,
      options: { competencias: [], quinzenas: [], tipos: [], bases: [] },
      error: error instanceof Error ? error.message : "Falha ao carregar Pré-Fatura.",
    };
  }
}
