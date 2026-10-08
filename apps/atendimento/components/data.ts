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
  if (!response.ok) throw new Error(data.error || "Falha ao carregar.");
  return data;
}
export function useData<T>(path: string, interval = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const result = await api<T>(path);
      setData(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<T>(path)
        .then((result) => {
          if (active) {
            setData(result);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    const timer = interval ? setInterval(load, interval) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [path, interval]);
  return { data, error, refresh };
}
export const labels: Record<string, string> = {
  aguardando_comprovante: "Aguardando comprovante",
  penalidade: "Com penalidade",
  encerrada: "Encerrada",
  aberta: "Em aberto / revisão",
  human: "Com a equipe",
  bot: "Automático",
  resolved: "Concluído",
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
