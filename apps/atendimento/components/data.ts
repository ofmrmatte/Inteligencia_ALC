"use client";
import { useEffect, useState, useCallback } from "react";

export const PRIVATE_CONTENT_CLEARED_EVENT = "alc-atendimento:private-content-cleared";
const PRIVATE_CONTENT_SIGNAL = "alc-atendimento:private-content-cleared";

export function clearPrivateContent() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRIVATE_CONTENT_SIGNAL, String(Date.now()));
    window.localStorage.clear();
  } catch {
    // Storage can be unavailable; the in-memory event still clears mounted content.
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // Storage can be unavailable; the in-memory event still clears mounted content.
  }
  window.dispatchEvent(new Event(PRIVATE_CONTENT_CLEARED_EVENT));
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (response.status === 401 || data.error === "MFA_REQUIRED") {
    clearPrivateContent();
    window.location.replace(new URL("/login", window.location.origin).href);
  } else if (
    response.status === 403 &&
    [
      "Perfil sem acesso ao Atendimento.",
      "Seu acesso ao Atendimento está desativado.",
    ].includes(data.error)
  ) {
    clearPrivateContent();
    window.location.replace(
      new URL("/acesso-indisponivel", window.location.origin).href,
    );
  }
  if (!response.ok) throw new Error(data.error || "Falha ao carregar.");
  return data;
}
/** In-app event used by the fixed header to reload the currently mounted views. */
export const HEADER_REFRESH_EVENT = "alc-atendimento:refresh";
type DataListener = { fallbackMs: number };
const listeners = new Set<DataListener>();
let stream: EventSource | null = null,
  retryTimer: ReturnType<typeof setTimeout> | null = null,
  fallbackTimer: ReturnType<typeof setInterval> | null = null,
  retryMs = 1_000,
  connected = false;

function refreshMounted() {
  window.dispatchEvent(new Event(HEADER_REFRESH_EVENT));
}
function updateFallback() {
  if (fallbackTimer) clearInterval(fallbackTimer);
  fallbackTimer = null;
  if (!connected && listeners.size) {
    const delay = Math.max(5_000, Math.min(...[...listeners].map((item) => item.fallbackMs)));
    fallbackTimer = setInterval(refreshMounted, delay);
  }
}
function connectEvents() {
  if (!listeners.size || stream || retryTimer || typeof EventSource === "undefined") return;
  stream = new EventSource("/api/events");
  stream.onopen = () => {
    connected = true;
    retryMs = 1_000;
    updateFallback();
  };
  stream.addEventListener("invalidate", refreshMounted);
  stream.addEventListener("close", () => {
    stream?.close();
    stream = null;
    connected = false;
    updateFallback();
    if (!listeners.size) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectEvents();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, 30_000);
  });
  stream.onerror = () => {
    stream?.close();
    stream = null;
    connected = false;
    updateFallback();
    if (listeners.size && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectEvents();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    }
  };
}
function subscribeData(fallbackMs: number) {
  const listener = { fallbackMs };
  listeners.add(listener);
  connectEvents();
  updateFallback();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stream?.close();
      stream = null;
      connected = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      retryTimer = fallbackTimer = null;
    } else updateFallback();
  };
}
export function useData<T>(path: string, interval = 0) {
  const [snapshot, setSnapshot] = useState<{
      path: string;
      value: T | null;
    } | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const result = await api<T>(path);
      setSnapshot({ path, value: result });
      setError("");
    } catch (e) {
      setSnapshot({ path, value: null });
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<T>(path)
        .then((result) => {
          if (active) {
            setSnapshot({ path, value: result });
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setSnapshot({ path, value: null });
            setError(e.message);
          }
        });
    void load();
    // Refreshes only the mounted screen's data; never triggers Case Center collection or WhatsApp sends.
    window.addEventListener(HEADER_REFRESH_EVENT, load);
    const unsubscribe = subscribeData(interval || 30_000);
    return () => {
      active = false;
      window.removeEventListener(HEADER_REFRESH_EVENT, load);
      unsubscribe();
    };
  }, [path, interval]);
  return {
    data: snapshot?.path === path ? snapshot.value : null,
    error: snapshot?.path === path ? error : "",
    refresh,
  };
}
export const labels: Record<string, string> = {
  aguardando_comprovante: "Aguardando comprovante",
  penalidade: "Com penalidade",
  encerrada: "Encerrada",
  aberta: "Em aberto / revisão",
  human: "Com a equipe",
  bot: "Automático",
  resolved: "Concluído",
  received: "Recebido",
  delivered: "Entregue",
  read: "Lido",
  sending: "Enviando",
  pending: "Na fila",
  sent: "Enviado",
  failed: "Falhou",
  uncertain: "Conferir envio",
  cancelled: "Cancelado",
  driver: "Motoristas",
  client: "Clientes",
};
export function when(date: string | undefined) {
  return date ? new Date(date).toLocaleString("pt-BR") : "Ainda sem coleta";
}
