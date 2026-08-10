import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreFaturaDedupeKey,
  hasPreFaturaPackageIdentity,
  isPreFaturaTotalLikeRow,
  toNumber,
} from "@/features/pre-fatura/domain";

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
