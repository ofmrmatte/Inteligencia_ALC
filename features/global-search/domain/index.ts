export const GLOBAL_SEARCH_MIN_LENGTH = 2;
export const GLOBAL_SEARCH_MAX_LENGTH = 80;
export const GLOBAL_SEARCH_MODULE_LIMIT = 5;

export type SearchIntent = "identity" | "text";

export type SearchModuleKey = "pre_fatura" | "gestao_pacotes" | "desvios_pnr" | "pacotes_faltantes";

export type SearchResultItem = {
  id: string;
  module: SearchModuleKey;
  moduleLabel: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
};

export type SearchResultGroup = {
  module: SearchModuleKey;
  label: string;
  href: string;
  items: SearchResultItem[];
};

export type GlobalSearchResponse = {
  query: string;
  minLength: number;
  groups: SearchResultGroup[];
  total: number;
  errors: string[];
};

export const SEARCH_MODULES: Record<SearchModuleKey, { label: string; href: string }> = {
  pre_fatura: { label: "Pré-Fatura", href: "/pre-fatura" },
  gestao_pacotes: { label: "Gestão de Pacotes", href: "/gestao-pacotes" },
  desvios_pnr: { label: "Desvios PNR", href: "/desvios-pnr" },
  pacotes_faltantes: { label: "Pacotes Faltantes", href: "/pacotes-faltantes" },
};

export function normalizeSearchQuery(input: unknown) {
  return String(input ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[%*_(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GLOBAL_SEARCH_MAX_LENGTH);
}

export function isSearchableQuery(query: string) {
  return normalizeSearchQuery(query).length >= GLOBAL_SEARCH_MIN_LENGTH;
}

export function classifySearchQuery(query: string): SearchIntent {
  const normalized = normalizeSearchQuery(query);
  if (/^[a-z0-9][a-z0-9./-]{2,}$/i.test(normalized) && /\d/.test(normalized)) return "identity";
  return "text";
}

export function buildModuleHref(module: SearchModuleKey, query: string) {
  const params = new URLSearchParams({ q: normalizeSearchQuery(query) });
  return `${SEARCH_MODULES[module].href}?${params.toString()}`;
}

export function capModuleResults<T>(rows: T[], limit = GLOBAL_SEARCH_MODULE_LIMIT) {
  return rows.slice(0, Math.max(0, limit));
}

export function groupSearchResults(items: SearchResultItem[]): SearchResultGroup[] {
  return (Object.entries(SEARCH_MODULES) as Array<[SearchModuleKey, { label: string; href: string }]>)
    .map(([module, config]) => ({
      module,
      label: config.label,
      href: config.href,
      items: items.filter((item) => item.module === module),
    }))
    .filter((group) => group.items.length > 0);
}
