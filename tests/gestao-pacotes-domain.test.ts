import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPackageDedupeKey,
  calculatePackageMetrics,
  comparePackageEvents,
  hasPackageIdentity,
  isPackageTotalLikeRow,
} from "@/features/gestao-pacotes/domain";

test("linhas de total da gestao nao entram como evento", () => {
  assert.equal(isPackageTotalLikeRow(["TOTAL DESCONTOS", "R$ 1.000,00"]), true);
  assert.equal(isPackageTotalLikeRow({ descricao: "Subtotal dispatcher", valor: "100,00" }), true);
});

test("pacotes diferentes na mesma rota nao colidem", () => {
  const base = {
    competencia: "Jun/26",
    quinzena: "2ª quinzena",
    codigo_base: "SGO3",
    base: "SGO3",
    driver: "Motorista Teste",
    driver_normalizado: "MOTORISTA TESTE",
    rota: "395154208",
    tipo: "SVC",
    desconto: "DRIVER",
    decisao_adm: "MANTER DESCONTO DRIVER",
    data: "2026-06-17",
    valor: 77,
  };
  const first = buildPackageDedupeKey({ ...base, id_envio: "47284280539" });
  const second = buildPackageDedupeKey({ ...base, id_envio: "47284280540" });
  assert.notEqual(first, second);
});

test("identidade de pacote aceita id ou rota como ancora operacional", () => {
  assert.equal(hasPackageIdentity({ id_envio: "47284280539", rota: "" }), true);
  assert.equal(hasPackageIdentity({ id_envio: "", rota: "395154208" }), true);
  assert.equal(hasPackageIdentity({ id_envio: "", rota: "" }), false);
});

test("metricas de gestao preservam decisoes e valores", () => {
  const summary = calculatePackageMetrics([
    { id: "1", file_id: "f", competencia: "Jun/26", quinzena: "1Q", tipo: "SVC", desconto: "DRIVER", base: "SGO3", codigo_base: "SGO3", driver: "A", data: "2026-06-01", id_envio: "1", rota: "10", valor: 10, decisao_adm: "", observacao: "", aba_origem: "ALINHAMENTO", created_at: null },
    { id: "2", file_id: "f", competencia: "Jun/26", quinzena: "1Q", tipo: "SVC", desconto: "DISPATCHER", base: "SGO3", codigo_base: "SGO3", driver: "B", data: "2026-06-02", id_envio: "2", rota: "11", valor: 20, decisao_adm: "", observacao: "", aba_origem: "ALINHAMENTO", created_at: null },
  ]);
  assert.equal(summary.totalRows, 2);
  assert.equal(summary.totalValue, 30);
  assert.equal(summary.driverValue, 10);
  assert.equal(summary.dispatcherValue, 20);
});

test("comparacao de eventos usa data mais recente", () => {
  const older = { data: "2026-06-01", created_at: null };
  const newer = { data: "2026-06-02", created_at: null };
  assert.ok(comparePackageEvents(newer, older) > 0);
});
