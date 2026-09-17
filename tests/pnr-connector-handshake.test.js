import { beforeAll, describe, expect, it, vi } from "vitest";

let onMessage;
let tabs = [];
let probeResult = { ok: true };
let probeArgs;
let updatedTab;
let createdTab;

beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ version: "1.1.9" }),
      onMessage: { addListener: (listener) => { onMessage = listener; } },
      onInstalled: { addListener: () => undefined },
    },
    tabs: {
      query: async () => tabs,
      get: async (id) => ({ id, status: "complete", url: "https://envios.adminml.com/logistics/case-center/cases" }),
      update: async (id, options) => {
        updatedTab = { id, options };
        return { id, status: "complete", url: "https://envios.adminml.com/logistics/case-center/cases" };
      },
      create: async (options) => {
        createdTab = options;
        return { id: 8, status: "loading", url: options.url };
      },
    },
    scripting: { executeScript: async ({ args }) => {
      [probeArgs] = args;
      return [{ result: probeResult }];
    } },
  });
  await import("../extension-pnr/src/service-worker.js");
});

function ping(competence = "202608Q2") {
  return new Promise((resolve) => onMessage(
    { source: "alc-pnr-panel", type: "PING", payload: { competence } },
    { url: "https://inteligenciaalc.vercel.app/pnr-bandeja" },
    resolve,
  ));
}

describe("handshake do Conector PNR", () => {
  it("identifica a extensão mesmo sem aba Mercado Livre", async () => {
    tabs = [];
    expect(await ping()).toEqual({ ok: true, data: {
      installed: true, version: "1.1.9", mlTabAvailable: false, sessionAvailable: false,
    } });
  });

  it("responde somente flags seguras para sessão válida ou ausente", async () => {
    tabs = [{ id: 7 }];
    probeResult = { ok: true, data: { cookie: "não deve retornar" } };
    expect(await ping()).toEqual({ ok: true, data: {
      installed: true, version: "1.1.9", mlTabAvailable: true, sessionAvailable: true,
    } });
    expect(probeArgs).toMatchObject({
      period: "202608Q2",
      dateFrom: "2026-08-16T00:00:00.000Z",
      dateTo: "2026-08-31T23:59:59.999Z",
      page: 1,
      size: 30,
    });
    probeResult = { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED", message: "Sessão Mercado Livre expirada." };
    expect(await ping()).toEqual({ ok: true, data: {
      installed: true, version: "1.1.9", mlTabAvailable: true, sessionAvailable: false,
      sessionError: "MERCADO_LIVRE_SESSION_REQUIRED",
      sessionMessage: "Sessão Mercado Livre expirada.",
    } });
  });

  it("abre ou foca o Case Center e envia a competência para o filtro visível", async () => {
    tabs = [{ id: 7 }];
    probeResult = { ok: true, period: "202608Q2" };
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "OPEN_CASE_CENTER", payload: { competence: "202608Q2" } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));
    expect(response).toEqual({ ok: true, data: { ok: true, period: "202608Q2" } });
    expect(updatedTab).toEqual({ id: 7, options: { active: true } });
    expect(probeArgs).toEqual({ period: "202608Q2", year: "2026", month: "Agosto", half: "Q2" });

    tabs = [];
    await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "OPEN_CASE_CENTER", payload: { competence: "202608Q2" } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));
    expect(createdTab).toEqual({ url: "https://envios.adminml.com/logistics/case-center/cases", active: true });
  });
});
