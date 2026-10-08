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
let onAlarm;
let removedTab;
let store = {};
const panelUrl = "https://inteligenciaalc-production.up.railway.app/bandeja-pnr";
const listUrl = "https://envios.adminml.com/logistics/case-center/cases";
const detailUrl = `${listUrl}/198912360`;

beforeAll(async () => {
  const manifest = JSON.parse(await readFile("../../extensions/pnr-connector/src/manifest.json", "utf8"));
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ ...manifest, version: "1.1.17" }),
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
        const created = { id: 8, status: "complete", url: options.url, active: options.active };
        tabs = [...tabs, created];
        return created;
      },
      remove: async (id) => { removedTab = id; tabs = tabs.filter(tab => tab.id !== id); },
    },
    storage: { local: {
      get: async (name) => ({ [name]: store[name] }),
      set: async (entries) => { store = { ...store, ...entries }; },
      remove: async (name) => { delete store[name]; },
    } },
    alarms: { create: async () => undefined, onAlarm: { addListener: (fn) => { onAlarm = fn; } } },
    scripting: { executeScript: async ({ args, files, target }) => {
      if (files) {
        injectedTabs.push(target.tabId);
        return [];
      }
      [probeArgs] = args;
      return [{ result: probeResult }];
    } },
  });
  serviceWorker = await import("../../../extensions/pnr-connector/src/service-worker.js");
});

beforeEach(() => {
  tabs = [];
  probeResult = { ok: true };
  probeArgs = undefined;
  updatedTab = undefined;
  createdTab = undefined;
  injectedTabs = [];
  removedTab = undefined;
  store = {};
});

function ping(competence = "202608Q2") {
  return new Promise((resolve) => onMessage(
    { source: "alc-pnr-panel", type: "PING", payload: { competence } },
    { url: panelUrl },
    resolve,
  ));
}

describe("handshake do Conector PNR", () => {
  it("prepara automaticamente uma aba inativa quando o Case Center não está aberto", async () => {
    tabs = [];
    expect(await ping()).toMatchObject({ ok: true, data: {
      installed: true, version: "1.1.17", mlTabAvailable: true, sessionAvailable: true,
      backgroundTabManaged: true,
    } });
    expect(createdTab).toEqual({ url: listUrl, active: false });
    expect(tabs).toHaveLength(1);
  });

  it("não altera a aba de detalhes do usuário, usando a listagem auxiliar inativa", async () => {
    tabs = [{ id: 7, status: "complete", url: detailUrl }];
    expect(await ping()).toMatchObject({ ok: true, data: {
      installed: true, version: "1.1.17", mlTabAvailable: true, sessionAvailable: true,
    } });
    expect(updatedTab).toBeUndefined();
    expect(createdTab).toEqual({ url: listUrl, active: false });
    expect(probeArgs).toBeUndefined();
  });

  it("lê competência sem requerer listagem aberta pelo usuário", async () => {
    tabs = [];
    probeResult = { ok: true, period: "202610Q1" };
    const response = await new Promise(resolve => onMessage(
      { source: "alc-pnr-panel", type: "READ_CASE_CENTER_PERIOD", payload: {} },
      { url: panelUrl }, resolve,
    ));
    expect(response).toMatchObject({ ok: true, data: { competence: "202610Q1" } });
    expect(createdTab).toEqual({ url: listUrl, active: false });
  });

  it("reutiliza o mesmo ambiente em consultas repetidas e só remove a aba própria após inatividade", async () => {
    tabs = [];
    await ping();
    const first = createdTab;
    await ping();
    expect(createdTab).toBe(first);
    store.alcPnrManagedCaseCenter = { id: 8, lastUsed: Date.now() - 6 * 60_000 };
    await onAlarm({ name: "alc-pnr-managed-case-center-cleanup" });
    expect(removedTab).toBe(8);
    expect(store.alcPnrManagedCaseCenter).toBeUndefined();
  });

  it("nunca fecha uma aba auxiliar que o usuário ativou", async () => {
    tabs = [];
    await ping();
    tabs = tabs.map(tab => ({ ...tab, active: true }));
    store.alcPnrManagedCaseCenter.lastUsed = Date.now() - 6 * 60_000;
    await onAlarm({ name: "alc-pnr-managed-case-center-cleanup" });
    expect(removedTab).toBeUndefined();
  });

  it("lê a competência atualmente selecionada sem alterar filtros", async () => {
    tabs = [{ id: 9, status: "complete", url: listUrl, active: true }];
    probeResult = { ok: true, period: "202609Q2" };
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "READ_CASE_CENTER_PERIOD", payload: {} },
      { url: "https://inteligenciaalc-production.up.railway.app/bandeja-pnr" },
      resolve,
    ));
    expect(response).toEqual({ ok: true, data: { competence: "202609Q2" } });
    expect(updatedTab).toBeUndefined();
  });

  it("navega um detalhe para a listagem antes de aplicar a competência", async () => {
    tabs = [{ id: 7, status: "complete", url: detailUrl }];
    probeResult = { ok: true, period: "202608Q2" };
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "OPEN_CASE_CENTER", payload: { competence: "202608Q2" } },
      { url: panelUrl },
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
      { url: panelUrl },
      resolve,
    ));
    expect(updatedTab).toEqual({ id: 9, options: { active: true } });
  });

  it("abre a listagem quando nenhuma aba do Case Center existe", async () => {
    probeResult = { ok: true, period: "202608Q2" };
    await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "OPEN_CASE_CENTER", payload: { competence: "202608Q2" } },
      { url: panelUrl },
      resolve,
    ));
    expect(createdTab).toEqual({ url: "https://envios.adminml.com/logistics/case-center/cases", active: true });
  });

  it("mantém PING e FETCH_TIMELINE em uma aba de detalhe sem navegação", async () => {
    tabs = [{ id: 7, status: "complete", url: detailUrl }];
    probeResult = [{ ok: true, data: { caseState: { events: [{ id: 1, event_type: "CREATE_CASE_BY_CONSUMER", date_created: "2026-10-01T12:00:00Z" }], caseDetail: {} } } }];
    expect(await ping()).toMatchObject({ ok: true, data: { mlTabAvailable: true, sessionAvailable: true } });
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "FETCH_TIMELINE", payload: { caseId: "198912360" } },
      { url: panelUrl },
      resolve,
    ));
    expect(response).toMatchObject({ ok: true, data: { caseId: "198912360", sourceEventCount: 1 } });
    expect(updatedTab).toBeUndefined();
  });

  it("busca timelines em lote sem navegar a aba e preserva erros por caso", async () => {
    tabs = [{ id: 7, status: "complete", url: detailUrl }];
    probeResult = [
      { caseId: "198912360", ok: true, data: { caseState: { events: [{ id: 1, event_type: "CREATE_CASE_BY_CONSUMER", date_created: "2026-10-01T12:00:00Z" }], caseDetail: {} } } },
      { caseId: "198912361", ok: false, code: "HTTP_ERROR", message: "Case Center respondeu HTTP 429." },
    ];
    const response = await new Promise((resolve) => onMessage(
      {
        source: "alc-pnr-panel",
        type: "FETCH_TIMELINES",
        payload: { caseIds: ["198912360", "198912361"], concurrency: 6 },
      },
      { url: panelUrl },
      resolve,
    ));
    expect(response).toMatchObject({
      ok: true,
      data: {
        results: [
          { caseId: "198912360", ok: true, data: { sourceEventCount: 1 } },
          { caseId: "198912361", ok: false, error: { code: "HTTP_ERROR" } },
        ],
      },
    });
    expect(probeArgs).toEqual({ caseIds: ["198912360", "198912361"], concurrency: 2 });
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

  it("aceita o domínio de produção no Railway", async () => {
    tabs = [];
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "PING", payload: { competence: "202608Q2" } },
      { url: "https://inteligenciaalc-production.up.railway.app/bandeja-pnr" },
      resolve,
    ));
    expect(response).toMatchObject({ ok: true, data: { installed: true, version: "1.1.17" } });
  });

  it("rejeita Vercel, localhost e outras origens", async () => {
    tabs = [];
    const sendFrom = (url) => new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "PING", payload: { competence: "202608Q2" } },
      { url },
      resolve,
    ));
    expect(await sendFrom("https://inteligenciaalc.vercel.app/bandeja-pnr"))
      .toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
    expect(await sendFrom("http://localhost:3000/bandeja-pnr"))
      .toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
    expect(await sendFrom("https://unrelated.example.com/bandeja-pnr"))
      .toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
  });

  it("injeta a ponte somente nas abas existentes do painel", async () => {
    injectedTabs = [];
    tabs = [
      { id: 7, url: panelUrl },
      { id: 8, url: "https://unrelated.vercel.app/" },
    ];
    onInstalled();
    await vi.waitFor(() => expect(injectedTabs).toEqual([7]));
  });

  it("registra a ponte somente na produção Railway", async () => {
    const source = await readFile(new URL("../../../extensions/pnr-connector/src/panel-bridge.js", import.meta.url), "utf8");
    const listensAt = (origin) => {
      let registered = false;
      const window = { location: { origin }, addEventListener: () => { registered = true; } };
      runInNewContext(source, { URL, window });
      return registered;
    };
    expect(listensAt(new URL(panelUrl).origin)).toBe(true);
    expect(listensAt("https://inteligenciaalc.vercel.app")).toBe(false);
    expect(listensAt("http://localhost:3000")).toBe(false);
  });
});
