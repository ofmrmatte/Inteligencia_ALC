import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/data", () => ({
  useData: () => ({
    data: {
      open: 10, proof: 5, penalty: 2, human: 0, pending: 0, unread: 0,
      competence: "202610Q1", source: { lastSync: "" },
      collector: { enabled: false, lastSync: null, completed: false, channelSync: {} },
      queue: [],
    },
    error: "",
    refresh: vi.fn(),
  }),
  when: (value: string | undefined) => value || "Ainda sem coleta",
}));
vi.mock("../components/collector", () => ({ request: vi.fn() }));
import { Overview } from "../components/overview";

describe("coletas na Visão Geral", () => {
  it("mostra coleta geral única e elimina painéis sem utilidade", () => {
    const html = renderToStaticMarkup(<Overview />);
    expect(html).toContain("Coletar geral");
    expect(html).not.toContain("Coletar Cliente");
    expect(html).not.toContain("Coletar Driver");
    expect(html).toContain("sem envio ou enfileiramento de mensagens");
    expect(html).not.toContain("Fila da equipe");
    expect(html).not.toContain("PNRs recentemente atualizadas");
    expect(html).not.toContain("Conversas por atendente");
    expect(html).not.toContain("Disparo Cliente</a>");
    expect(html).not.toContain("Atendimento motoristas</a>");
    expect(html).toContain("Clientes:");
    expect(html).toContain("Motoristas:");
  });

  it("coleta geral usa o canal nulo e continua impedindo disparos", () => {
    const worker = readFileSync(
      new URL("../../../extensions/pnr-connector/src/service-worker.js", import.meta.url), "utf8",
    );
    expect(worker).toContain('if (message.type === "ATENDIMENTO_COLLECT")');
    expect(worker).toContain("channel: message.payload?.channel || null, collectOnly: true");
    expect(readFileSync(new URL("../components/overview.tsx", import.meta.url), "utf8"))
      .toContain('request<{ message: string }>("ATENDIMENTO_COLLECT")');
    expect(worker).toContain('channel !== "client" && channel !== "driver"');
    expect(worker).toContain("extensionId: chrome.runtime.id");
  });
});
