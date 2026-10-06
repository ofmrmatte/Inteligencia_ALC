/* global chrome */

const allowedOrigins = new Set([
  "https://inteligenciaalc.vercel.app",
  "https://dashboardfatura.vercel.app",
  "https://inteligenciaalc-production.up.railway.app",
  "http://localhost",
  "http://127.0.0.1",
]);
const previewHost = /^alcpaineldeinteligencia-[a-z0-9]+(?:-[a-z0-9]+)*-mrmattes-projects\.vercel\.app$/;

function allowed(origin) {
  const url = new URL(origin);
  return allowedOrigins.has(url.origin)
    || (url.protocol === "https:" && previewHost.test(url.hostname))
    || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
}

if (allowed(window.location.origin) && !globalThis.__alcPnrBridgeInstalled) {
  globalThis.__alcPnrBridgeInstalled = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (message?.source !== "alc-pnr-panel" || typeof message.requestId !== "string") return;

    const postUnavailable = () => window.postMessage({
      source: "alc-pnr-extension",
      requestId: message.requestId,
      ok: false,
      error: { code: "EXTENSION_NOT_FOUND", message: "Extensão ALC indisponível. Recarregue esta página após atualizar o conector." },
    }, window.location.origin);

    try {
      if (!chrome.runtime?.id) {
        postUnavailable();
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        try {
          if (chrome.runtime.lastError || !response) {
            postUnavailable();
            return;
          }
          window.postMessage({ source: "alc-pnr-extension", requestId: message.requestId, ...response }, window.location.origin);
        } catch {
          postUnavailable();
        }
      });
    } catch {
      // A content script injected before an extension reload can keep running
      // with an invalidated extension context. Treat it as unavailable instead
      // of surfacing an uncaught Chrome runtime error.
      postUnavailable();
    }
  });
}
