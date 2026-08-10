import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  GLOBAL_SEARCH_MODULE_LIMIT,
  GLOBAL_SEARCH_MIN_LENGTH,
  SEARCH_MODULES,
  buildModuleHref,
  capModuleResults,
  classifySearchQuery,
  groupSearchResults,
  isSearchableQuery,
  normalizeSearchQuery,
  type GlobalSearchResponse,
  type SearchIntent,
  type SearchModuleKey,
  type SearchResultItem,
} from "@/features/global-search/domain";

type SupabaseQuery = {
  or: (filters: string) => SupabaseQuery;
};

function text(value: unknown, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function money(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(numberValue)) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numberValue);
}

function safePostgrestValue(value: string) {
  return value.replace(/[\\"]/g, "").trim();
}

function searchFilter(identityColumns: string[], textColumns: string[], query: string, intent: SearchIntent) {
  const safe = safePostgrestValue(query);
  if (!safe) return "";
  const exactAndPrefix = identityColumns.flatMap((column) => [`${column}.eq.${safe}`, `${column}.ilike.${safe}%`]);
  const textPrefix = textColumns.map((column) => `${column}.ilike.${safe}%`);
  return (intent === "identity" ? [...exactAndPrefix, ...textPrefix] : textPrefix).join(",");
}

function applySearchFilter<T extends SupabaseQuery>(
  query: T,
  identityColumns: string[],
  textColumns: string[],
  search: string,
  intent: SearchIntent,
) {
  const filter = searchFilter(identityColumns, textColumns, search, intent);
  return filter ? query.or(filter) as T : query;
}

function moduleItem(
  module: SearchModuleKey,
  row: { id: string },
  query: string,
  title: string,
  subtitle: string,
  meta: string,
): SearchResultItem {
  return {
    id: row.id,
    module,
    moduleLabel: SEARCH_MODULES[module].label,
    title,
    subtitle,
    meta,
    href: buildModuleHref(module, query),
  };
}

async function runModuleSearch<T>(
  module: SearchModuleKey,
  task: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  map: (row: T) => SearchResultItem,
) {
  const result = await task();
  if (result.error) {
    return { items: [], error: `${SEARCH_MODULES[module].label}: ${result.error.message}` };
  }
  return { items: capModuleResults(result.data ?? [], GLOBAL_SEARCH_MODULE_LIMIT).map(map), error: null };
}

export async function searchOperationalData(input: string): Promise<GlobalSearchResponse> {
  const query = normalizeSearchQuery(input);
  if (!isSearchableQuery(query)) {
    return { query, minLength: GLOBAL_SEARCH_MIN_LENGTH, groups: [], total: 0, errors: [] };
  }

  const supabase = await createServerSupabaseClient();
  const intent = classifySearchQuery(query);

  const [preFatura, gestaoPacotes, desviosPnr, pacotesFaltantes] = await Promise.all([
    runModuleSearch(
      "pre_fatura",
      () => applySearchFilter(
        supabase
          .from("pre_fatura_records")
          .select("id,id_envio,rota,base,codigo_base,driver,valor,data,tipo")
          .eq("module_key", "pre_fatura"),
        ["id_envio", "rota"],
        ["driver", "base", "codigo_base", "placa"],
        query,
        intent,
      )
        .order("created_at", { ascending: false })
        .limit(GLOBAL_SEARCH_MODULE_LIMIT),
      (row: {
        id: string;
        id_envio: string | null;
        rota: string | null;
        base: string | null;
        codigo_base: string | null;
        driver: string | null;
        valor: number | string | null;
        data: string | null;
        tipo: string | null;
      }) => moduleItem(
        "pre_fatura",
        row,
        query,
        `ID ${text(row.id_envio)}`,
        `Rota ${text(row.rota)} · ${text(row.driver, "Motorista não identificado")}`,
        `${text(row.codigo_base || row.base, "Sem base")} · ${money(row.valor)} · ${text(row.tipo, "Sem tipo")}`,
      ),
    ),
    runModuleSearch(
      "gestao_pacotes",
      () => applySearchFilter(
        supabase
          .from("gestao_pacotes_records")
          .select("id,id_envio,rota,base,codigo_base,driver,valor,desconto,decisao_adm")
          .eq("module_key", "gestao_pacotes"),
        ["id_envio", "rota"],
        ["driver", "base", "codigo_base", "desconto", "decisao_adm"],
        query,
        intent,
      )
        .order("created_at", { ascending: false })
        .limit(GLOBAL_SEARCH_MODULE_LIMIT),
      (row: {
        id: string;
        id_envio: string | null;
        rota: string | null;
        base: string | null;
        codigo_base: string | null;
        driver: string | null;
        valor: number | string | null;
        desconto: string | null;
        decisao_adm: string | null;
      }) => moduleItem(
        "gestao_pacotes",
        row,
        query,
        `Pacote ${text(row.id_envio)}`,
        `Rota ${text(row.rota)} · ${text(row.driver, "Motorista não identificado")}`,
        `${text(row.codigo_base || row.base, "Sem base")} · ${text(row.desconto || row.decisao_adm, "Sem decisão")} · ${money(row.valor)}`,
      ),
    ),
    runModuleSearch(
      "desvios_pnr",
      () => applySearchFilter(
        supabase
          .from("desvios_pnr_records")
          .select("id,id_envio,id_rota,id_reclamacao,motorista_display,nome_motorista,estacao_origem,status_normalizado,valor_compra,source_file_name")
          .eq("module_key", "desvios_pnr"),
        ["id_envio", "id_rota", "id_reclamacao"],
        ["motorista_display", "nome_motorista", "estacao_origem", "status_normalizado", "source_file_name"],
        query,
        intent,
      )
        .order("first_seen_at", { ascending: false, nullsFirst: false })
        .limit(GLOBAL_SEARCH_MODULE_LIMIT),
      (row: {
        id: string;
        id_envio: string | null;
        id_rota: string | null;
        id_reclamacao: string | null;
        motorista_display: string | null;
        nome_motorista: string | null;
        estacao_origem: string | null;
        status_normalizado: string | null;
        valor_compra: number | string | null;
      }) => moduleItem(
        "desvios_pnr",
        row,
        query,
        `Envio ${text(row.id_envio)}`,
        `Rota ${text(row.id_rota)} · ${text(row.motorista_display || row.nome_motorista, "Motorista não identificado")}`,
        `${text(row.estacao_origem, "Sem estação")} · ${text(row.status_normalizado, "Sem status")} · ${money(row.valor_compra)}`,
      ),
    ),
    runModuleSearch(
      "pacotes_faltantes",
      () => applySearchFilter(
        supabase
          .from("gestao_desvios_pacotes_faltantes")
          .select("id,id_envio,caso,base,driver_nome,status_caso,status_contato_meli,prazo_tratativa,file_name"),
        ["id_envio", "caso"],
        ["base", "driver_nome", "status_caso", "status_contato_meli", "file_name"],
        query,
        intent,
      )
        .order("imported_at", { ascending: false, nullsFirst: false })
        .limit(GLOBAL_SEARCH_MODULE_LIMIT),
      (row: {
        id: string;
        id_envio: string | null;
        caso: string | null;
        base: string | null;
        driver_nome: string | null;
        status_caso: string | null;
        status_contato_meli: string | null;
      }) => moduleItem(
        "pacotes_faltantes",
        row,
        query,
        `Envio ${text(row.id_envio)}`,
        `${text(row.caso, "Caso não informado")} · ${text(row.driver_nome, "Driver não identificado")}`,
        `${text(row.base, "Sem base")} · ${text(row.status_caso, "Sem status")} · ${text(row.status_contato_meli, "Sem status MELI")}`,
      ),
    ),
  ]);

  const collected = [preFatura, gestaoPacotes, desviosPnr, pacotesFaltantes];
  const items = collected.flatMap((result) => result.items);
  const groups = groupSearchResults(items);

  return {
    query,
    minLength: GLOBAL_SEARCH_MIN_LENGTH,
    groups,
    total: items.length,
    errors: collected.map((result) => result.error).filter(Boolean) as string[],
  };
}
