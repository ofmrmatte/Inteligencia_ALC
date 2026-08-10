import assert from "node:assert/strict";
import test from "node:test";
import { emptyPnrSummary, normalizePnrRpcPayload, toNumber } from "@/features/desvios-pnr/domain";
import { parsePnrFilters } from "@/features/desvios-pnr/data/queries";

test("normaliza payload parcial das RPCs PNR", () => {
  const payload = normalizePnrRpcPayload({
    total: 10,
    summary: { count: 10, totalValue: 200 },
    statusRows: [{ label: "Anulado", count: 8 }],
  });
  assert.equal(payload.total, 10);
  assert.equal(payload.summary.count, 10);
  assert.equal(payload.summary.totalValue, 200);
  assert.equal(payload.summary.faturamento, 0);
  assert.deepEqual(payload.filterOptions.rotas, []);
  assert.equal(payload.statusRows.length, 1);
});

test("sumario vazio preserva todas as colecoes esperadas", () => {
  const summary = emptyPnrSummary();
  assert.equal(summary.summary.count, 0);
  assert.deepEqual(summary.filterOptions.statusMotoristas, []);
  assert.deepEqual(summary.evolutionRows, []);
});

test("parse de filtros PNR limita paginacao e sort", () => {
  const filters = parsePnrFilters({
    page: "2",
    pageSize: "500",
    mes: "2026-07",
    quinzena: "q1",
    status: "Anulado",
    statusMotorista: "Driver possivelmente desligado",
    sort: "valorCompraNumerico",
    dir: "asc",
  });
  assert.equal(filters.page, 2);
  assert.equal(filters.pageSize, 100);
  assert.equal(filters.mes, "2026-07");
  assert.equal(filters.status, "Anulado");
  assert.equal(filters.statusMotorista, "Driver possivelmente desligado");
  assert.equal(filters.sort, "valorCompraNumerico");
  assert.equal(filters.dir, "asc");
});

test("valores PNR aceitam formato brasileiro", () => {
  assert.equal(toNumber("1.234,56"), 1234.56);
});
