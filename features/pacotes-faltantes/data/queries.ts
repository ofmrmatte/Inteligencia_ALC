import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  calculateMissingPackageMetrics,
  MISSING_PACKAGE_SORT_KEYS,
  type MissingPackageFilters,
  type MissingPackagePageData,
  type MissingPackageRecord,
  type MissingPackageSortKey,
} from "@/features/pacotes-faltantes/domain";

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
    `tipo_base.ilike.%${safe}%`,
    `driver_nome.ilike.%${safe}%`,
    `id_envio.ilike.%${safe}%`,
    `caso.ilike.%${safe}%`,
    `motivo_original.ilike.%${safe}%`,
    `file_name.ilike.%${safe}%`,
  ].join(",");
}

export function parseMissingPackageFilters(searchParams: SearchParamsInput = {}): MissingPackageFilters {
  const sortParam = clean(searchParams.sort) as MissingPackageSortKey;
  const dirParam = clean(searchParams.dir);
  return {
    page: asPositiveInt(searchParams.page, 1),
    pageSize: asPositiveInt(searchParams.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    q: clean(searchParams.q),
    base: clean(searchParams.base),
    statusCaso: clean(searchParams.statusCaso),
    statusContato: clean(searchParams.statusContato),
    prazo: clean(searchParams.prazo),
    sort: MISSING_PACKAGE_SORT_KEYS.includes(sortParam) ? sortParam : "prazo_tratativa",
    dir: dirParam === "asc" ? "asc" : "desc",
  };
}

function applyFilters<T extends { eq: (column: string, value: string) => T; or: (query: string) => T }>(
  query: T,
  filters: MissingPackageFilters,
) {
  let next = query;
  if (filters.base) next = next.eq("base", filters.base);
  if (filters.statusCaso) next = next.eq("status_caso", filters.statusCaso);
  if (filters.statusContato) next = next.eq("status_contato_meli", filters.statusContato);
  if (filters.prazo) next = next.eq("situacao_prazo", filters.prazo);
  if (filters.q) next = next.or(searchFilter(filters.q));
  return next;
}

function emptyPage(filters: MissingPackageFilters, error: string | null): MissingPackagePageData {
  return {
    rows: [],
    summary: calculateMissingPackageMetrics([], 0),
    totalRows: 0,
    totalPages: 1,
    filters,
    options: { bases: [], statusCasos: [], statusContatos: [], prazos: [] },
    error,
  };
}

const selectColumns = "id,data_fechamento,base,tipo_base,driver_nome,id_envio,caso,motivo_original,status_caso,status_contato_meli,prazo_tratativa,situacao_prazo,imported_at,imported_by,source_file_id,file_name,raw_data,module_key";

export async function getMissingPackagesPage(searchParams: SearchParamsInput): Promise<MissingPackagePageData> {
  const filters = parseMissingPackageFilters(searchParams);

  try {
    const supabase = await createServerSupabaseClient();
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let rowsQuery = supabase
      .from("gestao_desvios_pacotes_faltantes")
      .select(selectColumns, { count: "exact" });
    let metricsQuery = supabase
      .from("gestao_desvios_pacotes_faltantes")
      .select("id,base,driver_nome,status_caso,status_contato_meli,prazo_tratativa,situacao_prazo")
      .limit(50000);

    rowsQuery = applyFilters(rowsQuery, filters);
    metricsQuery = applyFilters(metricsQuery, filters);

    const optionsQuery = supabase
      .from("gestao_desvios_pacotes_faltantes")
      .select("base,status_caso,status_contato_meli,situacao_prazo")
      .limit(50000);

    const [rowsResult, metricsResult, optionsResult] = await Promise.all([
      rowsQuery.order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false }).range(from, to),
      metricsQuery,
      optionsQuery,
    ]);

    if (rowsResult.error) throw rowsResult.error;
    if (metricsResult.error) throw metricsResult.error;
    if (optionsResult.error) throw optionsResult.error;

    const rows = (rowsResult.data ?? []) as MissingPackageRecord[];
    const metricsRows = (metricsResult.data ?? []) as MissingPackageRecord[];
    const optionRows = (optionsResult.data ?? []) as MissingPackageRecord[];
    const totalRows = rowsResult.count ?? 0;

    return {
      rows,
      summary: calculateMissingPackageMetrics(metricsRows, totalRows),
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / filters.pageSize)),
      filters,
      options: {
        bases: uniqueSorted(optionRows.map((row) => row.base)),
        statusCasos: uniqueSorted(optionRows.map((row) => row.status_caso)),
        statusContatos: uniqueSorted(optionRows.map((row) => row.status_contato_meli)),
        prazos: uniqueSorted(optionRows.map((row) => row.situacao_prazo)),
      },
      error: null,
    };
  } catch (error) {
    return emptyPage(filters, error instanceof Error ? error.message : "Falha ao carregar Pacotes Faltantes.");
  }
}
