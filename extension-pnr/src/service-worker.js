/* global chrome */

import {
  CASE_CENTER_PAGE_SIZE,
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

function allowedPanel(url) {
  try {
    const parsed = new URL(url);
    return panelOrigins.has(parsed.origin) || (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

function connectorError(code, message) {
  return { ok: false, error: { code, message } };
}

async function caseCenterTab() {
  const tabs = await chrome.tabs.query({ url: "https://envios.adminml.com/logistics/case-center/cases*" });
  return tabs.find((tab) => tab.id) ?? null;
}

async function execute(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return result?.result;
}

function probeCaseCenter() {
  return {
    authenticated: location.hostname === "envios.adminml.com"
      && location.pathname.startsWith("/logistics/case-center/cases")
      && !location.pathname.includes("login"),
  };
}

async function fetchCaseCenterPageInTab({ period, dateFrom, dateTo, page, size }) {
  const store = globalThis._n?.ctx?.r?.appProps?.pageProps?.preloadedStore;
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
    carrier,
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
      data: {
        searchParams: JSON.stringify(searchParams),
        userType: "3PL",
        application: "LOGISTICS_PNR",
      },
    }),
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED", message: "Sessão Mercado Livre expirada." };
  }
  if (!response.ok) return { ok: false, code: "HTTP_ERROR", message: `Case Center respondeu HTTP ${response.status}.` };
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { ok: false, code: "MERCADO_LIVRE_SESSION_REQUIRED", message: "Abra ou entre novamente na Bandeja de suporte do Mercado Livre." };
  }
  return { ok: true, data: await response.json() };
}

async function fetchCaseTimelineInTab(caseId) {
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
  const events = caseState?.events;
  const detail = caseState?.caseDetail;
  const safeText = (value) => typeof value === "string" || typeof value === "number" ? String(value) : "";
  const references = Array.isArray(detail?.references) ? detail.references : [];
  const reference = (type) => references.find((item) => safeText(item?.type ?? item?.key).toUpperCase() === type);
  const driverReference = reference("DRIVER_ID");
  return {
    ok: true,
    data: {
      events: Array.isArray(events) ? events.map((event) => ({
        id: event?.id,
        event_type: event?.event_type,
        date_created: event?.date_created,
        created_by: event?.created_by?.name ? { name: event.created_by.name } : undefined,
      })) : [],
      detail: {
        claimId: safeText(detail?.claimId ?? detail?.claim_id ?? caseState?.pnrClaim?.claimId),
        preInvoiceNumber: safeText(detail?.preInvoiceNumber ?? detail?.pre_invoice_number),
        billingPeriod: safeText(detail?.billingPeriod?.id ?? detail?.billingPeriod?.value ?? detail?.billingPeriod ?? detail?.billing_period),
        driverId: safeText(driverReference?.value ?? driverReference?.id ?? driverReference?.reference),
      },
    },
  };
}

async function handle(message) {
  const tab = await caseCenterTab();
  if (!tab?.id) return connectorError("MERCADO_LIVRE_NOT_DETECTED", "Abra a Bandeja de suporte do Mercado Livre.");

  if (message.type === "PING") {
    const probe = await execute(tab.id, probeCaseCenter);
    return probe?.authenticated
      ? { ok: true, data: { connected: true } }
      : connectorError("MERCADO_LIVRE_SESSION_REQUIRED", "Abra ou entre novamente na Bandeja de suporte do Mercado Livre.");
  }

  if (message.type === "FETCH_PAGE") {
    const page = Number(message.payload?.page);
    if (!Number.isInteger(page) || page < 1 || page > 500) return connectorError("INVALID_RESPONSE", "Página inválida.");
    const details = periodDetails(String(message.payload?.competence || ""));
    const result = await execute(tab.id, fetchCaseCenterPageInTab, [{ ...details, page, size: CASE_CENTER_PAGE_SIZE }]);
    if (!result?.ok) return connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Falha ao consultar Case Center.");
    return { ok: true, data: normalizeCaseCenterPage(result.data, page) };
  }

  if (message.type === "FETCH_TIMELINE") {
    const caseId = String(message.payload?.caseId || "");
    if (!/^\d{1,30}$/.test(caseId)) return connectorError("INVALID_RESPONSE", "Caso PNR inválido.");
    const result = await execute(tab.id, fetchCaseTimelineInTab, [caseId]);
    if (!result?.ok) return connectorError(result?.code || "INVALID_RESPONSE", result?.message || "Falha ao consultar timeline.");
    return { ok: true, data: { caseId, events: normalizeCaseTimelineEvents(result.data.events), detail: result.data.detail } };
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
