/* global chrome */

const allowedOrigins = new Set([
  "https://inteligenciaalc.vercel.app",
  "https://dashboardfatura.vercel.app",
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

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({
          source: "alc-pnr-extension",
          requestId: message.requestId,
          ok: false,
          error: { code: "EXTENSION_NOT_FOUND", message: "Extensão ALC indisponível." },
        }, window.location.origin);
        return;
      }
      window.postMessage({ source: "alc-pnr-extension", requestId: message.requestId, ...response }, window.location.origin);
    });
  });
}
