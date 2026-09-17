"use client";

export type PnrConnectorRequestType = "PING" | "FETCH_PAGE" | "FETCH_TIMELINE";
export type PnrConnectorErrorCode =
  | "EXTENSION_NOT_FOUND"
  | "MERCADO_LIVRE_NOT_DETECTED"
  | "MERCADO_LIVRE_SESSION_REQUIRED"
  | "CARRIER_NOT_FOUND"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

interface ConnectorResponse<T> {
  source: "alc-pnr-extension";
  requestId: string;
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export class PnrConnectorError extends Error {
  constructor(public readonly code: PnrConnectorErrorCode, message: string) {
    super(message);
    this.name = "PnrConnectorError";
  }
}

export function connectorStatusFromCode(code?: string) {
  if (code === "MERCADO_LIVRE_NOT_DETECTED") return "Mercado Livre não detectado";
  if (code === "MERCADO_LIVRE_SESSION_REQUIRED") return "Sessão Mercado Livre expirada";
  if (code === "EXTENSION_NOT_FOUND") return "Extensão ALC não encontrada";
  return "Falha na conexão com o Mercado Livre";
}

export function requestPnrConnector<T>(type: PnrConnectorRequestType, payload: Record<string, unknown> = {}, timeoutMs = 30_000) {
  if (typeof window === "undefined") {
    return Promise.reject(new PnrConnectorError("EXTENSION_NOT_FOUND", "Extensão ALC não encontrada."));
  }

  return new Promise<T>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new PnrConnectorError("EXTENSION_NOT_FOUND", "Extensão ALC não encontrada."));
    }, timeoutMs);

    function onMessage(event: MessageEvent<ConnectorResponse<T>>) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.source !== "alc-pnr-extension" || message.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (message.ok && message.data !== undefined) {
        resolve(message.data);
        return;
      }
      const code = (message.error?.code || "INVALID_RESPONSE") as PnrConnectorErrorCode;
      reject(new PnrConnectorError(code, message.error?.message || connectorStatusFromCode(code)));
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ source: "alc-pnr-panel", requestId, type, payload }, window.location.origin);
  });
}
