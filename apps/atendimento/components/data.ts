"use client";
import { useEffect, useState, useCallback } from "react";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (response.status === 401 || data.error === "MFA_REQUIRED")
    window.location.replace(new URL("/login", window.location.origin).href);
  else if (
    response.status === 403 &&
    [
      "Perfil sem acesso ao Atendimento.",
      "Seu acesso ao Atendimento está desativado.",
    ].includes(data.error)
  )
    window.location.replace(
      new URL("/acesso-indisponivel", window.location.origin).href,
    );
  if (!response.ok) throw new Error(data.error || "Falha ao carregar.");
  return data;
}
/** In-app event used by the fixed header to reload the currently mounted views. */
export const HEADER_REFRESH_EVENT = "alc-atendimento:refresh";
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
    const timer = interval ? setInterval(load, interval) : null;
    return () => {
      active = false;
      window.removeEventListener(HEADER_REFRESH_EVENT, load);
      if (timer) clearInterval(timer);
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
