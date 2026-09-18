import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let onMessage;
let onInstalled;
let tabs = [];
let probeResult = { ok: true };
let probeArgs;
let updatedTab;
let createdTab;
let injectedTabs = [];
let serviceWorker;
const previewUrl = "https://alcpaineldeinteligencia-5pv5ezaem-mrmattes-projects.vercel.app/bandeja-pnr";
const listUrl = "https://envios.adminml.com/logistics/case-center/cases";
const detailUrl = `${listUrl}/198912360`;

beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ version: "1.1.12" }),
      onMessage: { addListener: (listener) => { onMessage = listener; } },
      onInstalled: { addListener: (listener) => { onInstalled = listener; } },
    },
    tabs: {
      query: async ({ url } = {}) => typeof url === "string" && url.includes("envios.adminml.com")
        ? tabs.filter((tab) => tab.url?.startsWith(listUrl))
        : tabs,
      get: async (id) => tabs.find((tab) => tab.id === id),
      update: async (id, options) => {
        updatedTab = { id, options };
        const current = tabs.find((tab) => tab.id === id) ?? { id };
        const updated = { ...current, ...options, status: "complete" };
        tabs = [...tabs.filter((tab) => tab.id !== id), updated];
        return updated;
      },
      create: async (options) => {
        createdTab = options;
        const created = { id: 8, status: "complete", url: options.url };
        tabs = [...tabs, created];
        return created;
      },
    },
    scripting: { executeScript: async ({ args, files, target }) => {
      if (files) {
        injectedTabs.push(target.tabId);
        return [];
      }
      [probeArgs] = args;
      return [{ result: probeResult }];
    } },
  });
  serviceWorker = await import("../extension-pnr/src/service-worker.js");
});

beforeEach(() => {
  tabs = [];
  probeResult = { ok: true };
  probeArgs = undefined;
  updatedTab = undefined;
  createdTab = undefined;
  injectedTabs = [];
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
      installed: true, version: "1.1.12", mlTabAvailable: false, sessionAvailable: false,
    } });
  });

  it("responde somente flags seguras para sessão válida ou ausente", async () => {
    tabs = [{ id: 7, status: "complete", url: detailUrl }];
    probeResult = { ok: true, data: { cookie: "não deve retornar" } };
    expect(await ping()).toEqual({ ok: true, data: {
      installed: true, version: "1.1.12", mlTabAvailable: true, sessionAvailable: true,
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
      installed: true, version: "1.1.12", mlTabAvailable: true, sessionAvailable: false,
      sessionError: "MERCADO_LIVRE_SESSION_REQUIRED",
      sessionMessage: "Sessão Mercado Livre expirada.",
    } });
  });

  it("navega um detalhe para a listagem antes de aplicar a competência", async () => {
    tabs = [{ id: 7, status: "complete", url: detailUrl }];
    probeResult = { ok: true, period: "202608Q2" };
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "OPEN_CASE_CENTER", payload: { competence: "202608Q2" } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));
    expect(response).toEqual({ ok: true, data: { ok: true, period: "202608Q2" } });
    expect(updatedTab).toEqual({ id: 7, options: { url: listUrl, active: true } });
    expect(probeArgs).toEqual({ period: "202608Q2", year: "2026", month: "Agosto", half: "Q2" });
  });

  it("prefere a listagem quando listagem e detalhe estão abertos", async () => {
    tabs = [
      { id: 7, status: "complete", url: detailUrl },
      { id: 9, status: "complete", url: listUrl },
    ];
    probeResult = { ok: true, period: "202608Q2" };
    await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "OPEN_CASE_CENTER", payload: { competence: "202608Q2" } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));
    expect(updatedTab).toEqual({ id: 9, options: { active: true } });
  });

  it("abre a listagem quando nenhuma aba do Case Center existe", async () => {
    probeResult = { ok: true, period: "202608Q2" };
    await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "OPEN_CASE_CENTER", payload: { competence: "202608Q2" } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));
    expect(createdTab).toEqual({ url: "https://envios.adminml.com/logistics/case-center/cases", active: true });
  });

  it("mantém PING e FETCH_TIMELINE em uma aba de detalhe sem navegação", async () => {
    tabs = [{ id: 7, status: "complete", url: detailUrl }];
    probeResult = { ok: true, data: { caseState: { events: [], caseDetail: {} } } };
    expect(await ping()).toMatchObject({ ok: true, data: { mlTabAvailable: true, sessionAvailable: true } });
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "FETCH_TIMELINE", payload: { caseId: "198912360" } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));
    expect(response).toMatchObject({ ok: true, data: { caseId: "198912360", sourceEventCount: 0 } });
    expect(updatedTab).toBeUndefined();
  });

  it("não aceita o texto de competência de uma página de detalhe como filtro aplicado", async () => {
    const previousLocation = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { pathname: "/logistics/case-center/cases/198912360" },
    });
    try {
      await expect(serviceWorker.applyCaseCenterPeriodInTab({
        period: "202609Q2",
        year: "2026",
        month: "Setembro",
        half: "Q2",
      })).resolves.toMatchObject({ ok: false, code: "CASE_CENTER_LIST_REQUIRED" });
    } finally {
      if (previousLocation === undefined) delete globalThis.location;
      else Object.defineProperty(globalThis, "location", { configurable: true, value: previousLocation });
    }
  });

  it("aceita o preview deste projeto e rejeita previews de terceiros", async () => {
    tabs = [];
    const sendFrom = (url) => new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "PING", payload: { competence: "202608Q2" } },
      { url },
      resolve,
    ));
    expect((await sendFrom(previewUrl)).data).toMatchObject({ installed: true, version: "1.1.12" });
    expect(await sendFrom("https://alcpaineldeinteligencia-test-other-team.vercel.app/bandeja-pnr"))
      .toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
  });

  it("injeta a ponte somente nas abas existentes do painel", async () => {
    injectedTabs = [];
    tabs = [
      { id: 7, url: previewUrl },
      { id: 8, url: "https://unrelated.vercel.app/" },
    ];
    onInstalled();
    await vi.waitFor(() => expect(injectedTabs).toEqual([7]));
  });

  it("registra a ponte no preview, mas não em outro domínio Vercel", async () => {
    const source = await readFile(new URL("../extension-pnr/src/panel-bridge.js", import.meta.url), "utf8");
    const listensAt = (origin) => {
      let registered = false;
      const window = { location: { origin }, addEventListener: () => { registered = true; } };
      runInNewContext(source, { URL, window });
      return registered;
    };
    expect(listensAt(new URL(previewUrl).origin)).toBe(true);
    expect(listensAt("https://alcpaineldeinteligencia-test-other-team.vercel.app")).toBe(false);
    expect(listensAt("https://unrelated.vercel.app")).toBe(false);
  });
});
