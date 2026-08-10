import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  emptyPnrSummary,
  normalizePnrRpcPayload,
  PNR_SORT_KEYS,
  type PnrFilters,
  type PnrPageData,
  type PnrRecord,
  type PnrSortKey,
} from "@/features/desvios-pnr/domain";

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

function one(value: string) {
  return value ? [value] : [];
}

export function parsePnrFilters(searchParams: SearchParamsInput = {}): PnrFilters {
  const sortParam = clean(searchParams.sort) as PnrSortKey;
  const dirParam = clean(searchParams.dir);
  return {
    page: asPositiveInt(searchParams.page, 1),
    pageSize: asPositiveInt(searchParams.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    q: clean(searchParams.q),
    mes: clean(searchParams.mes),
    quinzena: clean(searchParams.quinzena),
    status: clean(searchParams.status),
    tipo: clean(searchParams.tipo),
    estacao: clean(searchParams.estacao),
    statusMotorista: clean(searchParams.statusMotorista),
    fonte: clean(searchParams.fonte),
    motorista: clean(searchParams.motorista),
    rota: clean(searchParams.rota),
    sort: PNR_SORT_KEYS.includes(sortParam) ? sortParam : "",
    dir: dirParam === "asc" ? "asc" : "desc",
  };
}

function rpcArgs(filters: PnrFilters) {
  return {
    p_file_ids: [],
    p_month_keys: one(filters.mes),
    p_quinzenas: one(filters.quinzena),
    p_statuses: one(filters.status),
    p_tipos: one(filters.tipo),
    p_estacoes: one(filters.estacao),
    p_status_motoristas: one(filters.statusMotorista),
    p_fontes: one(filters.fonte),
    p_motoristas: one(filters.motorista),
    p_rotas: one(filters.rota),
    p_search: filters.q,
  };
}

export async function getPnrPage(searchParams: SearchParamsInput): Promise<PnrPageData> {
  const filters = parsePnrFilters(searchParams);

  try {
    const supabase = await createServerSupabaseClient();
    const args = rpcArgs(filters);
    const [summaryResult, tableResult] = await Promise.all([
      supabase.rpc("desvios_pnr_summary", args),
      supabase.rpc("desvios_pnr_table", {
        ...args,
        p_page: filters.page,
        p_page_size: filters.pageSize,
        p_sort_key: filters.sort,
        p_sort_dir: filters.dir,
      }),
    ]);

    if (summaryResult.error) throw summaryResult.error;
    if (tableResult.error) throw tableResult.error;

    const summary = normalizePnrRpcPayload(summaryResult.data);
    const tablePayload = (tableResult.data && typeof tableResult.data === "object" ? tableResult.data : {}) as {
      rows?: PnrRecord[];
      total?: number;
    };
    const totalRows = Number(tablePayload.total ?? summary.total ?? 0);

    return {
      summary,
      rows: Array.isArray(tablePayload.rows) ? tablePayload.rows : [],
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / filters.pageSize)),
      filters,
      error: null,
    };
  } catch (error) {
    return {
      summary: emptyPnrSummary(),
      rows: [],
      totalRows: 0,
      totalPages: 1,
      filters,
      error: error instanceof Error ? error.message : "Falha ao carregar Desvios PNR.",
    };
  }
}
