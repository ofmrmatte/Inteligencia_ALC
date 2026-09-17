import { beforeAll, describe, expect, it, vi } from "vitest";

let onMessage;
let tabs = [];
let probeResult = { ok: true };

beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ version: "1.1.0" }),
      onMessage: { addListener: (listener) => { onMessage = listener; } },
      onInstalled: { addListener: () => undefined },
    },
    tabs: { query: async () => tabs },
    scripting: { executeScript: async () => [{ result: probeResult }] },
  });
  await import("../extension-pnr/src/service-worker.js");
});

function ping() {
  return new Promise((resolve) => onMessage(
    { source: "alc-pnr-panel", type: "PING" },
    { url: "https://inteligenciaalc.vercel.app/pnr-bandeja" },
    resolve,
  ));
}

describe("handshake do Conector PNR", () => {
  it("identifica a extensão mesmo sem aba Mercado Livre", async () => {
    tabs = [];
    expect(await ping()).toEqual({ ok: true, data: {
      installed: true, version: "1.1.0", mlTabAvailable: false, sessionAvailable: false,
    } });
  });

  it("responde somente flags seguras para sessão válida ou ausente", async () => {
    tabs = [{ id: 7 }];
    probeResult = { ok: true, data: { cookie: "não deve retornar" } };
    expect(await ping()).toEqual({ ok: true, data: {
      installed: true, version: "1.1.0", mlTabAvailable: true, sessionAvailable: true,
    } });
    probeResult = { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED" };
    expect(await ping()).toEqual({ ok: true, data: {
      installed: true, version: "1.1.0", mlTabAvailable: true, sessionAvailable: false,
      sessionError: "MERCADO_LIVRE_SESSION_REQUIRED",
    } });
  });
});
