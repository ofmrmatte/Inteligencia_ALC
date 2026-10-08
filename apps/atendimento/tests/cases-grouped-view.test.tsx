import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { CaseRecord } from "../lib/domain";

const mocks = vi.hoisted(() => ({
  records: [] as { case_id: string; competence: string; classification: string; source_at: string; record: CaseRecord }[],
}));

vi.mock("../components/data", () => ({
  useData: (path: string) => ({
    data: path === "profile" ? { admin: false } : { records: mocks.records, competence: "202610Q1" },
    error: "",
    refresh: vi.fn(),
  }),
  labels: {
    aberta: "Em aberto / revisão",
    aguardando_comprovante: "Aguardando comprovante",
    penalidade: "Com penalidade",
    encerrada: "Encerrada",
  },
  when: (value?: string) => value || "Ainda sem coleta",
  api: vi.fn(),
}));
vi.mock("../components/collector", () => ({ request: vi.fn() }));
import { Cases } from "../components/cases";

function record(index: number, driverId: string) {
  const caseId = String(index);
  return {
    case_id: caseId,
    competence: "202610Q1",
    classification: "aguardando_comprovante",
    source_at: "",
    record: {
      caseId,
      shipmentId: `shipment-${caseId}`,
      competence: "202610Q1",
      caseDate: "2026-10-08",
      baseKey: "Base A",
      sigla: "A",
      driverId,
      driverName: `Motorista ${driverId}`,
      driverPhone: "",
      mainStatus: "",
      subStatus: "",
      classification: "aguardando_comprovante",
      customerName: "",
      customerPhone: "",
      customerVerified: false,
      products: [],
      deliveryAt: "",
      purchaseValue: 0,
    } satisfies CaseRecord,
  };
}

it("mostra uma linha expansível por motorista com total e status, sem listar todas as PNRs inicialmente", () => {
  mocks.records = [record(1, "1"), record(2, "1"), record(3, "2")];
  const html = renderToStaticMarkup(<Cases />);
  expect(html.match(/class="driver-group-header"/g)).toHaveLength(2);
  expect(html).toContain("Motorista 1");
  expect(html).toContain("Motorista 2");
  expect(html).toContain("2</strong><small>PNRs");
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("shipment-1");
  expect(html).toContain("2 motoristas");
  expect(html).toContain("3 PNRs");
});

it("pagina por motorista, não por PNR, e mantém contagem do conjunto completo", () => {
  mocks.records = Array.from({ length: 22 }, (_, index) => record(index + 1, String(index + 1)));
  const html = renderToStaticMarkup(<Cases />);
  expect(html.match(/class="driver-group-header"/g)).toHaveLength(20);
  expect(html).toContain("22 motoristas");
  expect(html).toContain("22 PNRs");
  expect(html).toContain("Motoristas 1–20 de 22");
  expect(html).toContain("Página 1 de 2");
  expect(html).toContain("Próxima");
});
