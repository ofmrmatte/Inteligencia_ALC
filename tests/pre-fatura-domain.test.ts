import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreFaturaDedupeKey,
  calculatePreFaturaSummary,
  collapsePreFaturaRecordsByShipmentId,
  hasPreFaturaPackageIdentity,
  isPreFaturaTotalLikeRow,
  planPreFaturaPersistence,
  toNumber,
} from "@/features/pre-fatura/domain";
import { preFaturaImportFailedResponse } from "@/app/api/pre-fatura/validate/route";
import { parsePreFaturaImportResponse } from "@/features/pre-fatura/components/import-pre-fatura-button";

function shipment(id_envio: string, overrides = {}) {
  return {
    id_envio,
    competencia: "Jul/26",
    quinzena: "2ª quinzena",
    codigo_base: "SMG3",
    base: "POUSO ALEGRE - SMG3",
    driver: "Motorista Teste",
    placa: "ABC1D23",
    data: "2026-07-20",
    rota: "411858672",
    tipo: "PNR",
    aba_origem: "PNR",
    valor: 55.95,
    ...overrides,
  };
}

test("1500 registros entram nas metricas, nao apenas os primeiros 1000", () => {
  const rows = Array.from({ length: 1500 }, (_, index) => shipment(String(100000 + index), {
    valor: 1,
    codigo_base: index < 1000 ? "BASE1" : "BASE2",
  }));
  const summary = calculatePreFaturaSummary(rows, rows.length);
  assert.equal(summary.totalRows, 1500);
  assert.equal(summary.packageIds, 1500);
  assert.equal(summary.totalValue, 1500);
  assert.equal(summary.bases, 2);
  assert.equal(summary.averageValue, 1);
});

test("ignora linhas de total mesmo quando possuem valor", () => {
  assert.equal(isPreFaturaTotalLikeRow({ base: "TOTAL", valor: "49.879,96" }), true);
  assert.equal(isPreFaturaTotalLikeRow({ descricao: "Soma geral", valor: "100,00" }), true);
});

test("exige identidade de pacote e rota", () => {
  assert.equal(hasPreFaturaPackageIdentity({ id_envio: "47561652903", rota: "411858672" }), true);
  assert.equal(hasPreFaturaPackageIdentity({ id_envio: "", rota: "411858672" }), false);
  assert.equal(hasPreFaturaPackageIdentity({ id_envio: "47561652903", rota: "" }), false);
});

test("ids diferentes com mesma rota e valor nao colidem", () => {
  const base = {
    competencia: "Jul/26",
    quinzena: "2ª quinzena",
    codigo_base: "SMG3",
    base: "POUSO ALEGRE - SMG3",
    driver: "Motorista Teste",
    rota: "411858672",
    placa: "ABC1D23",
    data: "2026-07-20",
    tipo: "PNR",
    aba_origem: "PNR",
    valor: 39,
  };
  const first = buildPreFaturaDedupeKey({ ...base, id_envio: "47561652903" });
  const second = buildPreFaturaDedupeKey({ ...base, id_envio: "47561652904" });
  assert.notEqual(first, second);

  const collapse = collapsePreFaturaRecordsByShipmentId([
    shipment("47561652903", { rota: "411858672", valor: 39 }),
    shipment("47561652904", { rota: "411858672", valor: 39 }),
  ]);
  assert.equal(collapse.acceptedRows, 2);
  assert.equal(collapse.duplicateRowsCollapsed, 0);
});

test("mesmo id repetido exatamente vira uma unica identidade", () => {
  const collapse = collapsePreFaturaRecordsByShipmentId([
    shipment("47561652903"),
    shipment("47561652903"),
  ]);
  assert.equal(collapse.sourceValidRows, 2);
  assert.equal(collapse.acceptedRows, 1);
  assert.equal(collapse.duplicateRowsCollapsed, 1);
  assert.deepEqual(collapse.duplicateIdsWithConflicts, []);
});

test("mesmo id repetido com metadata diferente gera warning e preserva primeira ocorrencia", () => {
  const first = shipment("47561652903", { driver: "Motorista A" });
  const second = shipment("47561652903", { driver: "Motorista B" });
  const collapse = collapsePreFaturaRecordsByShipmentId([first, second]);
  assert.equal(collapse.acceptedRows, 1);
  assert.equal(collapse.records[0], first);
  assert.deepEqual(collapse.duplicateIdsWithConflicts, ["47561652903"]);
});

test("interpreta decimal Mercado Livre com ponto sem inflar o valor", () => {
  assert.equal(toNumber("55.95"), 55.95);
  assert.equal(toNumber("112.30"), 112.3);
  assert.equal(toNumber(55.95), 55.95);
});

test("interpreta valores brasileiros com virgula", () => {
  assert.equal(toNumber("55,95"), 55.95);
  assert.equal(toNumber("1.234,56"), 1234.56);
  assert.equal(toNumber("R$ 1.234,56"), 1234.56);
});

test("interpreta valores americanos com separador de milhar e decimal", () => {
  assert.equal(toNumber("1,234.56"), 1234.56);
  assert.equal(toNumber("12,345.67"), 12345.67);
});

test("mantem agrupamentos inteiros inequívocos", () => {
  assert.equal(toNumber("1.234.567"), 1234567);
  assert.equal(toNumber("1,234,567"), 1234567);
});

test("arquivo repetido pelo mesmo hash nao propõe novas insercoes", () => {
  const plan = planPreFaturaPersistence([shipment("1"), shipment("2")], [], true);
  assert.equal(plan.duplicateFile, true);
  assert.equal(plan.newRecords.length, 0);
  assert.equal(plan.existingIdsSkipped, 0);
});

test("id ja existente no banco nao e sobrescrito nem movido", () => {
  const plan = planPreFaturaPersistence([shipment("1"), shipment("2")], ["1"], false);
  assert.equal(plan.duplicateFile, false);
  assert.deepEqual(plan.newRecords.map((record) => record.id_envio), ["2"]);
  assert.deepEqual(plan.existingRecords.map((record) => record.id_envio), ["1"]);
  assert.equal(plan.existingIdsSkipped, 1);
});

test("API de erro da pre-fatura sempre retorna JSON", async () => {
  const response = preFaturaImportFailedResponse();
  assert.equal(response.status, 500);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.deepEqual(await response.json(), {
    error: "Não foi possível importar a planilha.",
    code: "PRE_FATURA_IMPORT_FAILED",
  });
});

test("frontend nao depende de response.json em resposta vazia", async () => {
  await assert.rejects(
    () => parsePreFaturaImportResponse(new Response("", { status: 500 })),
    /Não foi possível processar a planilha/,
  );
});
