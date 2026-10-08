/* global chrome */

import {
  CASE_CENTER_PAGE_SIZE,
  extractCaseCenterDetail,
  normalizeCaseCenterPage,
  normalizeCaseTimelineEvents,
  periodDetails,
} from "./case-center.js";
import { readPackageBuyersInTab } from "./package-management.js";

const panelOrigins = new Set([
  "https://inteligenciaalc-production.up.railway.app",
  "https://alc-atendimento-production.up.railway.app",
]);

const caseCenterListUrl = "https://envios.adminml.com/logistics/case-center/cases";
const caseCenterListPath = "/logistics/case-center/cases";

const atendimentoOrigin = "https://alc-atendimento-production.up.railway.app";
let atendimentoCollecting = false;
async function atendimentoTab() {
  const tabs = await chrome.tabs.query({ url: `${atendimentoOrigin}/*` });
  return tabs.find((tab) => tab.id && new URL(tab.url).pathname !== "/login");
}
async function persistInAtendimento(tabId, path, payload) {
  const result = await execute(tabId, async (args) => {
    const response = await fetch(`/api/${args.path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args.payload) });
    const data = await response.json();
    return { ok: response.ok, data };
  }, [{ path, payload }]);
  if (!result?.ok) throw new Error(result?.data?.error || "Não foi possível salvar a coleta no Atendimento.");
  return result.data;
}
async function persistCollectorState(enabled) {
  const tab = await atendimentoTab();
  if (tab?.id) await persistInAtendimento(tab.id, "collector-state", { enabled });
}
export function currentAtendimentoCompetence(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}${parts.month}Q${Number(parts.day) <= 15 ? 1 : 2}`;
}
async function collectAtendimento({ channel = null, collectOnly = false } = {}) {
  if (atendimentoCollecting) return connectorError("INVALID_RESPONSE", "Já existe uma coleta em andamento.");
  atendimentoCollecting = true;
  try {
    if (channel !== null && channel !== "client" && channel !== "driver")
      throw new Error("Tipo de coleta inválido.");
    const tab = await atendimentoTab();
    if (!tab?.id) throw new Error("Mantenha uma aba autenticada do ALC Atendimento aberta.");
    const competence = currentAtendimentoCompetence();
    const syncId = crypto.randomUUID();
    let page = 1, processed = 0, totalPages = 1, customerRead = 0, customerPending = 0;
    do {
      const result = await handle({ type: "FETCH_PAGE", payload: { competence, page, order: "desc" } });
      if (!result.ok) throw new Error(result.error.message);
      const records = result.data.records;
      totalPages = result.data.totalPages;
      if (totalPages > 500) throw new Error("Coleta excede 500 páginas; revisão necessária.");
      if (result.data.invalidCount) throw new Error("A fonte retornou registros inválidos. Coleta interrompida sem concluir a carga inicial.");
      if (records.length) {
        const details = await handle({ type: "FETCH_TIMELINES", payload: { caseIds: records.map((r) => r.caseId), concurrency: 2 } });
        if (!details.ok) throw new Error(details.error.message);
        const detailFailures = details.data.results.filter((item) => !item.ok && item.error.code !== "BATCH_PAUSED");
        if (details.data.results.every((item) => !item.ok) || detailFailures.some((item) => ["MERCADO_LIVRE_SESSION_REQUIRED", "MERCADO_LIVRE_ACCESS_DENIED", "RATE_LIMITED", "INVALID_RESPONSE", "REQUEST_TIMEOUT"].includes(item.error.code))) throw new Error(detailFailures[0]?.error.message || "Coleta de detalhes interrompida; os casos permanecem pendentes.");
        if (details.ok) for (const item of details.data.results) {
          const record = records.find((r) => r.caseId === item.caseId);
          if (record && item.ok) {
            const detail = item.data.detail || {};
            if (channel !== "client") Object.assign(record, {
              driverId: detail.driverId || "", driverPhone: detail.driverPhone || "",
            });
            if (channel !== "driver") Object.assign(record, {
              customerName: detail.buyerName || "", products: detail.products || [],
              deliveryAt: detail.deliveryAt || "",
            });
          }
        }
        if (channel !== "driver") {
          const buyers = await handle({ type: "FETCH_PACKAGE_CUSTOMERS", payload: { shipmentIds: records.map((r) => r.shipmentId) } });
          if (!buyers.ok) throw new Error(buyers.error.message);
          const fatal = buyers.data.results.find((item) => !item.ok && ["MERCADO_LIVRE_SESSION_REQUIRED", "MERCADO_LIVRE_ACCESS_DENIED", "RATE_LIMITED", "INVALID_RESPONSE", "REQUEST_TIMEOUT"].includes(item.code));
          if (fatal) throw new Error(fatal.message);
          customerRead += buyers.data.results.filter((item) => item.ok).length;
          customerPending += buyers.data.results.filter((item) => !item.ok).length;
          for (const item of buyers.data.results) {
            if (item.ok) for (const record of records.filter((r) => r.shipmentId === item.shipmentId)) record.packageBuyer = item.data;
          }
        }
      }
      await persistInAtendimento(tab.id, "import", {
        syncId, competence, channel, collectOnly,
        completed: page >= Math.max(totalPages, 1), records,
      });
      processed += records.length;
      page += 1;
    } while (page <= totalPages);
    await chrome.storage.local.set({ atendimentoLastSync: new Date().toISOString(), atendimentoError: customerPending ? `${customerPending} envios sem contato completo do comprador.` : "" });
    return { ok: true, data: { message: `${processed} PNRs da competência ${competence} atualizadas${channel === "client" ? " (dados de clientes)" : channel === "driver" ? " (dados de motoristas)" : ""}. ${channel !== "driver" ? `${customerRead} compradores lidos; ${customerPending} contatos pendentes. ` : ""}${collectOnly ? "Nenhuma mensagem foi enviada ou enfileirada por esta coleta." : "Próxima coleta automática em 30 minutos, se ativada."}` } };
  } catch (error) {
    await chrome.storage.local.set({ atendimentoError: error.message });
    return connectorError("INVALID_RESPONSE", error.message);
  } finally { atendimentoCollecting = false; }
}
chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "alc-atendimento-collect") return;
  const state = await chrome.storage.local.get("atendimentoEnabled");
  if (state.atendimentoEnabled) await collectAtendimento();
});
chrome.runtime.onStartup?.addListener(async () => {
  const state = await chrome.storage.local.get("atendimentoEnabled");
  if (state.atendimentoEnabled) await chrome.alarms.create("alc-atendimento-collect", { periodInMinutes: 30, delayInMinutes: 30 });
});

function allowedPanel(url) {
  try {
    const parsed = new URL(url);
    return panelOrigins.has(parsed.origin);
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

export function readCaseCenterPeriodInTab() {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  if (location.pathname !== "/logistics/case-center/cases") {
    return { ok: false, code: "CASE_CENTER_LIST_REQUIRED", message: "Abra a listagem do Case Center." };
  }
  const visible = (element) => Boolean(element && (!element.getClientRects || element.getClientRects().length));
  const direct = [...document.querySelectorAll("button")]
    .filter(visible)
    .map((element) => normalize(element.textContent))
    .find((value) => /^20\d{4}Q[12]$/.test(value));
  if (direct) return { ok: true, period: direct };

  const body = normalize(document.body?.innerText);
  const match = body.match(/(?:^|\s)(20\d{4}Q[12])(?:\s|$)/);
  if (match?.[1]) return { ok: true, period: match[1] };

  return {
    ok: false,
    code: "CASE_CENTER_PERIOD_NOT_FOUND",
    message: "Não foi possível identificar a competência selecionada no Case Center.",
  };
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

async function fetchCaseCenterPageInTab({ period, dateFrom, dateTo, page, size, order }) {
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
    order: order === "desc" ? "desc" : "asc",
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

// Self-contained: executeScript serializes this function into the ML origin.
export async function fetchCaseDetailStatesInTab({ caseIds, concurrency }) {
  const ids = [...new Set(caseIds.map(String))];
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, 2, ids.length || 1));
  const results = new Array(ids.length);
  const deadline = Date.now() + 90_000;
  let cursor = 1;
  let stopped = false;
  const failure = (code, message) => ({ ok: false, code, message });
  const readState = (html) => {
    const marker = /_n\.ctx\.r\s*=\s*/g;
    let match;
    while ((match = marker.exec(html))) {
      const start = marker.lastIndex;
      if (html[start] !== "{") continue;
      let depth = 0, quoted = false, escaped = false;
      for (let index = start; index < html.length; index += 1) {
        const char = html[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === "{") depth += 1;
        else if (char === "}" && --depth === 0) {
          try {
            const state = JSON.parse(html.slice(start, index + 1));
            const store = state?.appProps?.pageProps?.preloadedStore;
            const detail = store?.CaseDetail ?? store?.RootReducer?.CaseDetail;
            if (detail && typeof detail === "object" && !Array.isArray(detail) && Array.isArray(detail.events)) return detail;
          } catch { /* Only JSON is accepted; page JavaScript is never executed. */ }
          break;
        }
      }
    }
    return null;
  };
  const fetchOne = async (caseId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const path = `/logistics/case-center/cases/${encodeURIComponent(caseId)}`;
      const response = await fetch(path, { credentials: "include", signal: controller.signal });
      if (response.status === 401 || (response.url && (new URL(response.url).origin !== location.origin || new URL(response.url).pathname !== path))) return failure("MERCADO_LIVRE_SESSION_REQUIRED", "Entre novamente na Bandeja de suporte do Mercado Livre.");
      if (response.status === 403) return failure("MERCADO_LIVRE_ACCESS_DENIED", "A sessão não possui permissão para consultar o detalhe do caso (HTTP 403).");
      if (response.status === 429) return failure("RATE_LIMITED", "Mercado Livre limitou a consulta de detalhes (HTTP 429).");
      if (!response.ok) return failure("HTTP_ERROR", `Case Center respondeu HTTP ${response.status}.`);
      const html = await response.text();
      const caseState = readState(html);
      if (!caseState) return failure("INVALID_RESPONSE", "Estado de detalhes não encontrado no Case Center. Atualize o conector ou confira o acesso ao caso.");
      if (!caseState.events.length) return failure("INCOMPLETE_TIMELINE", "A fonte não retornou a atividade do caso. O detalhe permanece pendente.");
      return { ok: true, data: { caseState } };
    } catch (error) {
      return failure(error?.name === "AbortError" ? "REQUEST_TIMEOUT" : "HTTP_ERROR", error?.name === "AbortError" ? "Tempo de consulta do detalhe excedido." : "Falha de rede ao consultar o detalhe do caso.");
    } finally { clearTimeout(timer); }
  };
  const systemic = (result) => !result.ok && (["MERCADO_LIVRE_SESSION_REQUIRED", "MERCADO_LIVRE_ACCESS_DENIED", "RATE_LIMITED", "INVALID_RESPONSE", "REQUEST_TIMEOUT"].includes(result.code) || (result.code === "HTTP_ERROR" && !/HTTP (404|410)\b/.test(result.message)));
  // Probe one case before starting a batch: a broken session/parser must not
  // turn fifty untouched cases into fifty artificial failures.
  results[0] = { caseId: ids[0], ...(await fetchOne(ids[0])) };
  stopped = systemic(results[0]);
  const worker = async () => {
    while (cursor < ids.length && !stopped && Date.now() < deadline) {
      const index = cursor++;
      results[index] = { caseId: ids[index], ...(await fetchOne(ids[index])) };
      if (systemic(results[index])) stopped = true;
    }
  };
  if (!stopped) await Promise.all(Array.from({ length: workerCount }, () => worker()));
  for (let index = 0; index < ids.length; index += 1) {
    results[index] ??= { caseId: ids[index], ...failure("BATCH_PAUSED", "Lote interrompido pela falha anterior; caso permanece pendente.") };
  }
  return results;
}

async function handle(message) {
  if (message.type === "READ_PACKAGE_CUSTOMER") {
    const tabs = await chrome.tabs.query({ url: "https://envios.adminml.com/*" });
    const target = tabs.filter((tab) => tab.id && /^\/logistics\/package-management\/package\/\d{1,30}\/?$/.test(new URL(tab.url).pathname) && (!message.payload?.shipmentId || new URL(tab.url).pathname.split("/").filter(Boolean).at(-1) === String(message.payload.shipmentId)));
    if (target.length !== 1) return connectorError("INVALID_RESPONSE", "Mantenha exatamente uma aba de detalhes do envio aberta em package-management.");
    const result = await execute(target[0].id, readPackageBuyersInTab, [{ currentPageOnly: true, shipmentIds: message.payload?.shipmentId ? [String(message.payload.shipmentId)] : [] }]);
    return result?.ok ? result : connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Dados do comprador não identificados.");
  }
  if (message.type === "ATENDIMENTO_ENABLE") {
    await chrome.storage.local.set({ atendimentoEnabled: true });
    await chrome.alarms.create("alc-atendimento-collect", { periodInMinutes: 30, delayInMinutes: 30 });
    await persistCollectorState(true);
    return { ok: true, data: { message: "Coleta ativada a cada 30 minutos neste computador." } };
  }
  if (message.type === "ATENDIMENTO_DISABLE") {
    await chrome.storage.local.set({ atendimentoEnabled: false });
    await chrome.alarms.clear("alc-atendimento-collect");
    await persistCollectorState(false);
    return { ok: true, data: { message: "Coleta automática pausada." } };
  }
  if (message.type === "ATENDIMENTO_COLLECT")
    return collectAtendimento({ channel: message.payload?.channel || null, collectOnly: true });

  const tabs = await caseCenterTabs();
  const authenticatedTab = tabs[0] ?? null;
  if (message.type === "PING") {
    const version = chrome.runtime.getManifest().version;
    return { ok: true, data: {
      installed: true,
      version,
      extensionId: chrome.runtime.id,
      mlTabAvailable: Boolean(authenticatedTab?.id),
      sessionAvailable: Boolean(authenticatedTab?.id),
    } };
  }

  if (message.type === "READ_CASE_CENTER_PERIOD") {
    const listTab = tabs.find((tab) => tab.active && isCaseCenterListTab(tab))
      ?? tabs.find(isCaseCenterListTab)
      ?? null;
    if (!listTab?.id) {
      return connectorError("MERCADO_LIVRE_NOT_DETECTED", "Abra a listagem do Case Center.");
    }
    await waitForTabReady(listTab.id);
    const result = await execute(listTab.id, readCaseCenterPeriodInTab);
    if (!result?.ok || !/^20\d{4}Q[12]$/.test(String(result.period || ""))) {
      return connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Competência do Case Center não identificada.");
    }
    return { ok: true, data: { competence: result.period } };
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
    const result = await execute(authenticatedTab.id, fetchCaseCenterPageInTab, [{ ...details, page, size: CASE_CENTER_PAGE_SIZE, order: message.payload?.order }]);
    if (!result?.ok) return connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Falha ao consultar Case Center.");
    return { ok: true, data: normalizeCaseCenterPage(result.data, page) };
  }

  if (message.type === "FETCH_PACKAGE_CUSTOMERS") {
    const shipmentIds = [...new Set((Array.isArray(message.payload?.shipmentIds) ? message.payload.shipmentIds : []).map(String))];
    if (!shipmentIds.length || shipmentIds.length > 50 || shipmentIds.some((id) => !/^\d{1,30}$/.test(id))) return connectorError("INVALID_RESPONSE", "Lote de envios inválido.");
    const result = await execute(authenticatedTab.id, readPackageBuyersInTab, [{ shipmentIds }]);
    return result?.ok ? result : connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Falha na consulta do comprador.");
  }

  if (message.type === "FETCH_TIMELINES") {
    const rawCaseIds = Array.isArray(message.payload?.caseIds) ? message.payload.caseIds : [];
    const caseIds = [...new Set(rawCaseIds.map((value) => String(value)))];
    if (!caseIds.length || caseIds.length > 50 || caseIds.some((caseId) => !/^\d{1,30}$/.test(caseId))) {
      return connectorError("INVALID_RESPONSE", "Lote de casos PNR inválido.");
    }
    const concurrency = Math.max(1, Math.min(Number(message.payload?.concurrency) || 1, 2));
    const batch = await execute(authenticatedTab.id, fetchCaseDetailStatesInTab, [{ caseIds, concurrency }]);
    if (!Array.isArray(batch)) return connectorError("INVALID_RESPONSE", "Resposta em lote do Case Center inválida.");

    const results = batch.map((item) => {
      const caseId = String(item?.caseId || "");
      if (!item?.ok) {
        return {
          caseId,
          ok: false,
          error: {
            code: item?.code || "INVALID_RESPONSE",
            message: item?.message || "Falha ao consultar timeline.",
          },
        };
      }
      const caseState = item.data?.caseState;
      const events = Array.isArray(caseState?.events) ? caseState.events : [];
      const normalizedEvents = normalizeCaseTimelineEvents(events);
      if (!events.length || normalizedEvents.length !== events.length) return { caseId, ok: false, error: { code: "INCOMPLETE_TIMELINE", message: "A fonte retornou eventos incompletos; o caso permanece pendente." } };
      return {
        caseId,
        ok: true,
        data: {
          caseId,
          sourceEventCount: events.length,
          events: normalizeCaseTimelineEvents(events),
          detail: extractCaseCenterDetail(caseState),
        },
      };
    });
    return { ok: true, data: { results } };
  }

  if (message.type === "FETCH_TIMELINE") {
    const caseId = String(message.payload?.caseId || "");
    if (!/^\d{1,30}$/.test(caseId)) return connectorError("INVALID_RESPONSE", "Caso PNR inválido.");
    const [result] = await execute(authenticatedTab.id, fetchCaseDetailStatesInTab, [{ caseIds: [caseId], concurrency: 1 }]);
    if (!result?.ok) return connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Falha ao consultar timeline.");
    const caseState = result.data?.caseState;
    const events = Array.isArray(caseState?.events) ? caseState.events : [];
    if (!events.length || normalizeCaseTimelineEvents(events).length !== events.length) return connectorError("INCOMPLETE_TIMELINE", "A fonte retornou eventos incompletos; o caso permanece pendente.");
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
  chrome.tabs.query({ url: chrome.runtime.getManifest().content_scripts.flatMap((entry) => entry.matches) }).then((tabs) => Promise.all(tabs.filter((tab) => tab.id && allowedPanel(tab.url || "")).map((tab) => (
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["panel-bridge.js"] }).catch(() => undefined)
  )))).catch(() => undefined);
});
