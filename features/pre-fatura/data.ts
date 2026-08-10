import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  PRE_FATURA_SORT_KEYS,
  toNumber,
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

function buildSummary(rows: PreFaturaRecord[], totalRows: number) {
  const totalValue = rows.reduce((sum, row) => sum + toNumber(row.valor), 0);
  return {
    totalRows,
    totalValue,
    packageIds: new Set(rows.map((row) => row.id_envio).filter(Boolean)).size,
    bases: new Set(rows.map((row) => row.codigo_base || row.base).filter(Boolean)).size,
    drivers: new Set(rows.map((row) => row.driver).filter(Boolean)).size,
    routes: new Set(rows.map((row) => row.rota).filter(Boolean)).size,
    averageValue: rows.length ? totalValue / rows.length : 0,
  };
}

function uniqueSorted(values: Array<string | null>) {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
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
    let metricsQuery = supabase
      .from("pre_fatura_records")
      .select("id,valor,id_envio,codigo_base,base,driver,rota")
      .eq("module_key", "pre_fatura")
      .limit(50000);

    if (filters.competencia) {
      rowsQuery = rowsQuery.eq("competencia", filters.competencia);
      metricsQuery = metricsQuery.eq("competencia", filters.competencia);
    }
    if (filters.quinzena) {
      rowsQuery = rowsQuery.eq("quinzena", filters.quinzena);
      metricsQuery = metricsQuery.eq("quinzena", filters.quinzena);
    }
    if (filters.tipo) {
      rowsQuery = rowsQuery.eq("tipo", filters.tipo);
      metricsQuery = metricsQuery.eq("tipo", filters.tipo);
    }
    if (filters.base) {
      rowsQuery = rowsQuery.eq("codigo_base", filters.base);
      metricsQuery = metricsQuery.eq("codigo_base", filters.base);
    }
    if (filters.q) {
      const filter = searchFilter(filters.q);
      rowsQuery = rowsQuery.or(filter);
      metricsQuery = metricsQuery.or(filter);
    }

    const pagedRowsQuery = rowsQuery
      .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
      .range(from, to);

    const optionsQuery = supabase
      .from("pre_fatura_records")
      .select("competencia,quinzena,tipo,codigo_base,base")
      .eq("module_key", "pre_fatura")
      .limit(50000);

    const [rowsResult, metricsResult, optionsResult] = await Promise.all([pagedRowsQuery, metricsQuery, optionsQuery]);
    if (rowsResult.error) throw rowsResult.error;
    if (metricsResult.error) throw metricsResult.error;
    if (optionsResult.error) throw optionsResult.error;

    const rows = (rowsResult.data ?? []) as PreFaturaRecord[];
    const metricsRows = (metricsResult.data ?? []) as PreFaturaRecord[];
    const optionRows = (optionsResult.data ?? []) as PreFaturaRecord[];
    const totalRows = rowsResult.count ?? 0;

    const baseMap = new Map<string, string>();
    optionRows.forEach((row) => {
      if (row.codigo_base) baseMap.set(row.codigo_base, row.base ? `${row.codigo_base} - ${row.base}` : row.codigo_base);
    });

    return {
      rows,
      summary: buildSummary(metricsRows, totalRows),
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
      summary: buildSummary([], 0),
      totalRows: 0,
      totalPages: 1,
      filters,
      options: { competencias: [], quinzenas: [], tipos: [], bases: [] },
      error: error instanceof Error ? error.message : "Falha ao carregar Pré-Fatura.",
    };
  }
}
