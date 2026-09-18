/* global chrome */

import {
  CASE_CENTER_PAGE_SIZE,
  extractCaseCenterDetail,
  normalizeCaseCenterPage,
  normalizeCaseTimelineEvents,
  periodDetails,
} from "./case-center.js";

const panelOrigins = new Set([
  "https://inteligenciaalc.vercel.app",
  "https://dashboardfatura.vercel.app",
  "http://localhost",
  "http://127.0.0.1",
]);
const previewHost = /^alcpaineldeinteligencia-[a-z0-9]+(?:-[a-z0-9]+)*-mrmattes-projects\.vercel\.app$/;
const caseCenterListUrl = "https://envios.adminml.com/logistics/case-center/cases";
const caseCenterListPath = "/logistics/case-center/cases";

function allowedPanel(url) {
  try {
    const parsed = new URL(url);
    return panelOrigins.has(parsed.origin)
      || (parsed.protocol === "https:" && previewHost.test(parsed.hostname))
      || (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

function connectorError(code, message) {
  return { ok: false, error: { code, message } };
}

function isCaseCenterListTab(tab) {
  try {
    return Boolean(tab?.id) && new URL(tab.url).pathname === caseCenterListPath;
  } catch {
    return false;
  }
}

async function caseCenterTabs() {
  const tabs = await chrome.tabs.query({ url: "https://envios.adminml.com/logistics/case-center/cases*" });
  return tabs.filter((tab) => tab.id);
}

async function execute(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return result?.result;
}

async function waitForTabReady(tabId, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" && isCaseCenterListTab(tab)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Object.assign(new Error("A Bandeja Mercado Livre não terminou de carregar."), { code: "MERCADO_LIVRE_NOT_DETECTED" });
}

export async function applyCaseCenterPeriodInTab({ period, year, month, half }) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  if (location.pathname !== "/logistics/case-center/cases") {
    return { ok: false, code: "CASE_CENTER_LIST_REQUIRED", message: "Abra a listagem do Case Center para aplicar o período." };
  }
  const visible = (element) => Boolean(element && (!element.getClientRects || element.getClientRects().length));
  const deadline = Date.now() + 15_000;
  const waitFor = async (find) => {
    while (Date.now() < deadline) {
      const value = find();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("O filtro de período do Case Center não ficou disponível.");
  };
  const buttons = (label) => [...document.querySelectorAll("button")]
    .filter((element) => visible(element) && normalize(element.textContent) === label);
  const periodButton = () => [...document.querySelectorAll("button")]
    .find((element) => visible(element) && /^20\d{4}Q[12]$/.test(normalize(element.textContent)));
  const pageHasPeriod = () => location.pathname === "/logistics/case-center/cases"
    && normalize(document.body?.innerText).includes(`Período ${period}`);

  if (pageHasPeriod()) return { ok: true, period };

  if (!periodButton()) {
    const filterButton = await waitFor(() => buttons("Filtrar")[0]);
    filterButton.click();
  }
  const currentPeriodButton = await waitFor(periodButton);
  if (normalize(currentPeriodButton.textContent) !== period) currentPeriodButton.click();

  const setDropdown = async (index, label) => {
    const dropdown = await waitFor(() => {
      const items = [...document.querySelectorAll('[role="combobox"][aria-label="dropdown-period-selector"]')]
        .filter(visible);
      return items.length >= 3 ? items[index] : null;
    });
    if (normalize(dropdown.textContent).includes(label)) return;
    dropdown.click();
    const option = await waitFor(() => [...document.querySelectorAll('[role="option"], [role="listbox"] > *')]
      .filter(visible)
      .find((element) => normalize(element.textContent) === label));
    option.click();
    await waitFor(() => {
      const items = [...document.querySelectorAll('[role="combobox"][aria-label="dropdown-period-selector"]')]
        .filter(visible);
      return items[index] && normalize(items[index].textContent).includes(label);
    });
  };

  if (normalize(currentPeriodButton.textContent) !== period) {
    await setDropdown(0, year);
    await setDropdown(1, month);
    await setDropdown(2, half);
    const selectorApply = await waitFor(() => buttons("Aplicar").at(-1));
    selectorApply.click();
    await waitFor(() => normalize(periodButton()?.textContent) === period);
  }

  const filterApply = await waitFor(() => buttons("Aplicar")[0]);
  filterApply.click();
  await waitFor(pageHasPeriod);
  return { ok: true, period };
}

async function fetchCaseCenterPageInTab({ period, dateFrom, dateTo, page, size }) {
  let store = globalThis._n?.ctx?.r?.appProps?.pageProps?.preloadedStore;
  if (!store) {
    const renderingContext = document.getElementById("__NORDIC_RENDERING_CTX__")?.textContent || "";
    const marker = "_n.ctx.r=";
    const assetsMarker = ";_n.ctx.r.assets";
    const start = renderingContext.indexOf(marker);
    const end = renderingContext.indexOf(assetsMarker, start + marker.length);
    if (start >= 0 && end > start) {
      try {
        store = JSON.parse(renderingContext.slice(start + marker.length, end))?.appProps?.pageProps?.preloadedStore;
      } catch {
        store = null;
      }
    }
  }
  const carrier = store?.RootReducer?.operator?.carrierData?.id
    ?? store?.operator?.carrierData?.id
    ?? new URL(location.href).searchParams.get("carrier");
  if (!carrier) return { ok: false, code: "CARRIER_NOT_FOUND", message: "Transportadora da sessão não identificada." };

  const headers = { "Content-Type": "application/json" };
  const csrf = globalThis._n?.ctx?.c?.csrfToken ?? document.querySelector('meta[name="csrf-token"]')?.content;
  if (typeof csrf === "string" && csrf) headers["x-csrf-token"] = csrf;
  const searchParams = {
    date_from: dateFrom,
    date_to: dateTo,
    order: "asc",
    sort: "date_created",
    carrier: String(carrier),
    period,
    billingPeriod: {},
    size,
    page,
    searchFieldOption: "SHIPMENT_ID",
  };
  const response = await fetch("/logistics/case-center/api/feed/search-feed-cases-dec", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({
      searchParams: JSON.stringify(searchParams),
      userType: "3PL",
      application: "LOGISTICS_PNR",
    }),
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED", message: "Sessão Mercado Livre expirada." };
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const cause = Array.isArray(errorData?.cause)
      ? errorData.cause.map((item) => typeof item === "string" ? item : item?.message).filter(Boolean).join("; ")
      : errorData?.cause;
    const detail = [cause, errorData?.error, errorData?.message]
      .find((value) => typeof value === "string")
      ?.replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    return {
      ok: false,
      code: "HTTP_ERROR",
      message: `Case Center respondeu HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
    };
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED", message: "Abra ou entre novamente na Bandeja de suporte do Mercado Livre." };
  }
  const data = await response.json();
  if (!Array.isArray(data?.casesList) || !data?.paging) {
    return { ok: false, code: "INVALID_RESPONSE", message: "Resposta inesperada do Case Center." };
  }
  return { ok: true, data };
}

async function fetchCaseDetailStateInTab(caseId) {
  const response = await fetch(`/logistics/case-center/cases/${encodeURIComponent(caseId)}`, { credentials: "include" });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED", message: "Sessão Mercado Livre expirada." };
  }
  if (!response.ok) return { ok: false, code: "HTTP_ERROR", message: `Case Center respondeu HTTP ${response.status}.` };
  if (response.redirected && !new URL(response.url).pathname.startsWith("/logistics/case-center/cases/")) {
    return { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED", message: "Abra ou entre novamente na Bandeja de suporte do Mercado Livre." };
  }

  const html = await response.text();
  const marker = "_n.ctx.r=";
  const start = html.indexOf(marker);
  const jsonStart = start + marker.length;
  const end = html.indexOf(";_n.ctx.r.assets", jsonStart);
  if (start < 0 || end < 0) return { ok: false, code: "INVALID_RESPONSE", message: "Timeline não encontrada no detalhe do caso." };
  const state = JSON.parse(html.slice(jsonStart, end));
  const caseState = state?.appProps?.pageProps?.preloadedStore?.CaseDetail;
  if (!caseState || typeof caseState !== "object" || Array.isArray(caseState)) {
    return { ok: false, code: "INVALID_RESPONSE", message: "Detalhes do caso não encontrados no estado SSR." };
  }
  return { ok: true, data: { caseState } };
}

async function handle(message) {
  const tabs = await caseCenterTabs();
  const authenticatedTab = tabs[0] ?? null;
  if (message.type === "PING") {
    const version = chrome.runtime.getManifest().version;
    return { ok: true, data: {
      installed: true,
      version,
      mlTabAvailable: Boolean(authenticatedTab?.id),
      sessionAvailable: Boolean(authenticatedTab?.id),
    } };
  }

  if (message.type === "OPEN_CASE_CENTER") {
    const details = periodDetails(String(message.payload?.competence || ""));
    const match = /^(20\d{2})(0[1-9]|1[0-2])Q([12])$/.exec(details.period);
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const listTab = tabs.find(isCaseCenterListTab);
    const target = listTab?.id
      ? await chrome.tabs.update(listTab.id, { active: true })
      : authenticatedTab?.id
        ? await chrome.tabs.update(authenticatedTab.id, { url: caseCenterListUrl, active: true })
        : await chrome.tabs.create({ url: caseCenterListUrl, active: true });
    if (!target?.id || !match) return connectorError("INVALID_RESPONSE", "Não foi possível abrir a competência selecionada.");
    await waitForTabReady(target.id);
    const result = await execute(target.id, applyCaseCenterPeriodInTab, [{
      period: details.period,
      year: match[1],
      month: months[Number(match[2]) - 1],
      half: `Q${match[3]}`,
    }]);
    if (!result?.ok) return connectorError("INVALID_RESPONSE", "Não foi possível aplicar o período no Case Center.");
    return { ok: true, data: result };
  }

  if (!authenticatedTab?.id) return connectorError("MERCADO_LIVRE_NOT_DETECTED", "Abra a Bandeja de suporte do Mercado Livre.");

  if (message.type === "FETCH_PAGE") {
    const page = Number(message.payload?.page);
    if (!Number.isInteger(page) || page < 1 || page > 500) return connectorError("INVALID_RESPONSE", "Página inválida.");
    const details = periodDetails(String(message.payload?.competence || ""));
    const result = await execute(authenticatedTab.id, fetchCaseCenterPageInTab, [{ ...details, page, size: CASE_CENTER_PAGE_SIZE }]);
    if (!result?.ok) return connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Falha ao consultar Case Center.");
    return { ok: true, data: normalizeCaseCenterPage(result.data, page) };
  }

  if (message.type === "FETCH_TIMELINE") {
    const caseId = String(message.payload?.caseId || "");
    if (!/^\d{1,30}$/.test(caseId)) return connectorError("INVALID_RESPONSE", "Caso PNR inválido.");
    const result = await execute(authenticatedTab.id, fetchCaseDetailStateInTab, [caseId]);
    if (!result?.ok) return connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Falha ao consultar timeline.");
    const caseState = result.data?.caseState;
    const events = Array.isArray(caseState?.events) ? caseState.events : [];
    return {
      ok: true,
      data: {
        caseId,
        sourceEventCount: events.length,
        events: normalizeCaseTimelineEvents(events),
        detail: extractCaseCenterDetail(caseState),
      },
    };
  }

  return connectorError("INVALID_RESPONSE", "Operação não reconhecida.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!allowedPanel(sender.url || "") || message?.source !== "alc-pnr-panel") {
    sendResponse(connectorError("INVALID_RESPONSE", "Origem não autorizada."));
    return false;
  }
  handle(message)
    .then(sendResponse)
    .catch((error) => sendResponse(connectorError(error?.code || "INVALID_RESPONSE", error?.message || "Falha na extensão ALC.")));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: [
    "https://inteligenciaalc.vercel.app/*",
    "https://dashboardfatura.vercel.app/*",
    "https://*.vercel.app/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
  ] }).then((tabs) => Promise.all(tabs.filter((tab) => tab.id && allowedPanel(tab.url || "")).map((tab) => (
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["panel-bridge.js"] }).catch(() => undefined)
  )))).catch(() => undefined);
});
