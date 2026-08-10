import test from "node:test";
import assert from "node:assert/strict";
import {
  GLOBAL_SEARCH_MODULE_LIMIT,
  buildModuleHref,
  capModuleResults,
  classifySearchQuery,
  groupSearchResults,
  isSearchableQuery,
  normalizeSearchQuery,
  type SearchResultItem,
} from "@/features/global-search/domain";

test("normaliza busca com trim, limite e caracteres inseguros", () => {
  const query = `  123%*, rota  ${"x".repeat(120)}  `;
  const normalized = normalizeSearchQuery(query);
  assert.equal(normalized.includes("%"), false);
  assert.equal(normalized.includes("*"), false);
  assert.ok(normalized.length <= 80);
  assert.equal(normalized.startsWith("123 rota"), true);
});

test("exige minimo de caracteres para pesquisa real", () => {
  assert.equal(isSearchableQuery("1"), false);
  assert.equal(isSearchableQuery("ab"), true);
});

test("classifica entradas operacionais com digitos como identidade", () => {
  assert.equal(classifySearchQuery("47369646118"), "identity");
  assert.equal(classifySearchQuery("SMG12"), "identity");
  assert.equal(classifySearchQuery("motorista"), "text");
});

test("limita resultados por modulo", () => {
  const rows = Array.from({ length: GLOBAL_SEARCH_MODULE_LIMIT + 3 }, (_, index) => index);
  assert.equal(capModuleResults(rows).length, GLOBAL_SEARCH_MODULE_LIMIT);
});

test("agrupa resultados por modulo conhecido", () => {
  const items: SearchResultItem[] = [
    { id: "1", module: "pre_fatura", moduleLabel: "Pré-Fatura", title: "A", subtitle: "B", meta: "C", href: "/pre-fatura?q=1" },
    { id: "2", module: "desvios_pnr", moduleLabel: "Desvios PNR", title: "D", subtitle: "E", meta: "F", href: "/desvios-pnr?q=1" },
  ];
  const groups = groupSearchResults(items);
  assert.deepEqual(groups.map((group) => group.module), ["pre_fatura", "desvios_pnr"]);
});

test("deep link usa parametro q real do modulo", () => {
  assert.equal(buildModuleHref("gestao_pacotes", " 123 "), "/gestao-pacotes?q=123");
});
