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
  it("mostra os dois botões de coleta, sem os links de disparo anteriores", () => {
    const html = renderToStaticMarkup(<Overview />);
    expect(html).toContain("Coletar Cliente");
    expect(html).toContain("Coletar Driver");
    expect(html).toContain("Estes botões não enviam mensagens");
    expect(html).not.toContain("Disparo Cliente</a>");
    expect(html).not.toContain("Atendimento motoristas</a>");
    expect(html).toContain("Última coleta de clientes");
    expect(html).toContain("Última coleta de motoristas");
  });

  it("somente permite os dois públicos na coleta manual e desliga disparos", () => {
    const worker = readFileSync(
      new URL("../../../extensions/pnr-connector/src/service-worker.js", import.meta.url), "utf8",
    );
    expect(worker).toContain('if (message.type === "ATENDIMENTO_COLLECT")');
    expect(worker).toContain("channel: message.payload?.channel || null, collectOnly: true");
    expect(worker).toContain('channel !== "client" && channel !== "driver"');
    expect(worker).toContain("extensionId: chrome.runtime.id");
  });
});
