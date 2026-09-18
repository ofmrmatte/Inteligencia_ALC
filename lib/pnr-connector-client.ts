"use client";

import connectorPackage from "@/extension-pnr/package.json";

export const MINIMUM_SUPPORTED_CONNECTOR_VERSION = "1.1.11";
export const LATEST_CONNECTOR_VERSION = connectorPackage.version;
export const CONNECTOR_DOWNLOAD_URL = `/downloads/alc-pnr-connector-v${LATEST_CONNECTOR_VERSION}.zip`;

export interface PnrConnectorHandshake {
  installed: true;
  version: string;
  mlTabAvailable: boolean;
  sessionAvailable: boolean;
  sessionError?: string;
  sessionMessage?: string;
}

export type PnrConnectorState = "checking" | "connected" | "outdated" | "unsupported" | "ml-missing" | "expired" | "extension-missing" | "error";

export function compareConnectorVersions(left: string, right: string) {
  if (!/^\d+\.\d+\.\d+$/.test(left) || !/^\d+\.\d+\.\d+$/.test(right)) {
    throw new Error("Versão do Conector PNR inválida.");
  }
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  if (![...a, ...b].every(Number.isSafeInteger)) throw new Error("Versão do Conector PNR inválida.");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function connectorStateFromHandshake(
  handshake: PnrConnectorHandshake | null,
  versions = { minimumSupportedVersion: MINIMUM_SUPPORTED_CONNECTOR_VERSION, latestVersion: LATEST_CONNECTOR_VERSION },
): PnrConnectorState {
  if (!handshake?.installed) return "extension-missing";
  if (typeof handshake.version !== "string" || !/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(handshake.version)
    || compareConnectorVersions(handshake.version, versions.minimumSupportedVersion) < 0) return "unsupported";
  if (!handshake.mlTabAvailable) return "ml-missing";
  if (!handshake.sessionAvailable) {
    return handshake.sessionError === "HTTP_ERROR" || handshake.sessionError === "INVALID_RESPONSE" ? "error" : "expired";
  }
  return compareConnectorVersions(handshake.version, versions.latestVersion) < 0 ? "outdated" : "connected";
}

export type PnrConnectorRequestType = "PING" | "OPEN_CASE_CENTER" | "FETCH_PAGE" | "FETCH_TIMELINE";
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
