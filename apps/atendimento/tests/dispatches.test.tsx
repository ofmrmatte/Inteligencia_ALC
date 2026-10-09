import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { CaseRecord } from "../lib/domain";

const mocks = vi.hoisted(() => ({
  paths: [] as string[],
  admin: true,
  block: null as string | null,
}));
vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} />
  ),
}));
vi.mock("../components/data", async (original) => ({
  ...(await original()),
  useData: (path: string) => {
    mocks.paths.push(path);
    return {
      data:
        path === "sync-summary"
          ? { lastSync: null, lastCompletedSync: null, syncStats: { found: 8, new: 2, updated: 1, unchanged: 5, errors: 0 } }
          : path === "profile"
          ? { admin: mocks.admin }
          : path.startsWith("dispatch-preview")
            ? {
                records: [{ ...candidate, initial_status: mocks.block }],
                competence: "202610Q1",
                limit: 10000,
              }
            : { records: [], limit: 1000 },
      error: "",
      refresh: vi.fn(),
    };
  },
}));
import {
  Dispatches,
  previewBlock,
  type DispatchCandidate,
} from "../components/dispatches";

const record: CaseRecord = {
  caseId: "test-case",
  shipmentId: "test-shipment",
  competence: "202610Q1",
  caseDate: "2026-10-08",
  baseKey: "TEST BASE",
  sigla: "TST",
  driverId: "test-driver",
  driverName: "Test driver",
  driverPhone: "5511999990000",
  mainStatus: "NEW",
  subStatus: "WAITING_RECEIPT",
  classification: "aguardando_comprovante",
  customerName: "Test buyer",
  customerPhone: "5511988880000",
  customerVerified: true,
  products: [{ title: "Test product" }],
  deliveryAt: "2026-10-07T12:00:00Z",
  purchaseValue: 10,
};
const candidate: DispatchCandidate = {
  case_id: record.caseId,
  competence: record.competence,
  classification: record.classification,
  record,
  initial_status: null,
};
beforeEach(() => {
  mocks.paths = [];
  mocks.admin = true;
  mocks.block = null;
});

it.each(["driver", "client"] as const)(
  "separa prévia e histórico do canal %s",
  (channel) => {
    const html = renderToStaticMarkup(<Dispatches channel={channel} />);
    expect(mocks.paths).toContain(`dispatch-preview?channel=${channel}`);
    expect(mocks.paths).toContain(`outbox?channel=${channel}`);
    expect(html).toContain(channel === "driver" ? "Test driver" : "Test buyer");
    expect(html).not.toContain(
      channel === "driver" ? "Test buyer" : "Test driver",
    );
    expect(html).toContain("Prévia de envio");
    expect(html).toContain("Competência");
    expect(html).not.toContain("Atualizar disparos"); // A atualização geral agora fica no cabeçalho.
  },
);
it.each([
  "pending",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "uncertain",
  "cancelled",
])("não oferece novo envio inicial com histórico %s", (initial_status) => {
  expect(
    previewBlock("driver", { ...candidate, initial_status }, "202610Q1"),
  ).not.toBe("");
});
it("bloqueia competência antiga e PNR encerrada sem excluir a consulta", () => {
  expect(previewBlock("driver", candidate, "202610Q2")).toBe(
    "Competência anterior",
  );
  expect(
    previewBlock(
      "driver",
      { ...candidate, classification: "encerrada" },
      "202610Q1",
    ),
  ).toBe("PNR encerrada");
});
it("usa somente o telefone do público selecionado", () => {
  const row = {
    ...candidate,
    record: { ...record, driverPhone: "", customerPhone: record.customerPhone },
  };
  expect(previewBlock("driver", row, "202610Q1")).toBe("Sem telefone válido");
  expect(previewBlock("client", row, "202610Q1")).toBe("");
});
it("reutiliza validação dos parâmetros e não libera cliente sem confirmação", () => {
  expect(
    previewBlock(
      "client",
      { ...candidate, record: { ...record, customerVerified: false } },
      "202610Q1",
    ),
  ).toContain("incompletos");
  expect(
    previewBlock(
      "client",
      { ...candidate, classification: "aberta" },
      "202610Q1",
    ),
  ).toBe("Fora da tratativa de clientes");
});
it("permite conferência individual e bloqueia envios incertos", () => {
  mocks.admin = false;
  expect(renderToStaticMarkup(<Dispatches channel="driver" />)).toMatch(
    /button title="Conferir destinatário"/,
  );
  mocks.admin = true;
  mocks.block = "uncertain";
  expect(renderToStaticMarkup(<Dispatches channel="driver" />)).toMatch(
    /button disabled="" title="Conferir envio"/,
  );
});
