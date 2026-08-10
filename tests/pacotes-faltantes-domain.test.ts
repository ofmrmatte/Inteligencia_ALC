import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMissingPackageMetrics,
  deadlineStatus,
  type MissingPackageRecord,
} from "@/features/pacotes-faltantes/domain";

function row(overrides: Partial<MissingPackageRecord> = {}): MissingPackageRecord {
  return {
    id: "1",
    data_fechamento: "2026-07-01",
    base: "SMG1",
    tipo_base: "XPT",
    driver_nome: "Driver Teste",
    id_envio: "123",
    caso: "Pacote faltante",
    motivo_original: "Faltante",
    status_caso: "Pendente",
    status_contato_meli: "E-mail Enviado",
    prazo_tratativa: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    situacao_prazo: null,
    imported_at: null,
    imported_by: null,
    source_file_id: null,
    file_name: null,
    raw_data: null,
    module_key: "pacotes_faltantes",
    ...overrides,
  };
}

test("prazo concluido prevalece sobre data de vencimento", () => {
  assert.equal(deadlineStatus(row({ status_caso: "Concluído", prazo_tratativa: "2026-01-01T00:00:00.000Z" })), "Concluído");
});

test("metricas de pacotes faltantes contam pendencias, concluidos e bases", () => {
  const summary = calculateMissingPackageMetrics([
    row({ id: "1", base: "SMG1", driver_nome: "A" }),
    row({ id: "2", base: "SMG1", driver_nome: "B", status_caso: "Concluído" }),
    row({ id: "3", base: "SRJ13", driver_nome: "B", prazo_tratativa: "2026-01-01T00:00:00.000Z" }),
  ]);
  assert.equal(summary.totalRows, 3);
  assert.equal(summary.pending, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.bases, 2);
  assert.equal(summary.drivers, 2);
});
