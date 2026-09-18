"use client";

import { useEffect } from "react";
import type { PnrCaseDetailSnapshot } from "@/lib/pnr-case-detail";
import type { PnrCaseTimelineEvent } from "@/lib/pnr-case-center";
import {
  PNR_DETAIL_SYNC_BATCH_SIZE,
  PNR_DETAIL_SYNC_CASE_DELAY_MS,
  PNR_DETAIL_SYNC_INTERVAL_MS,
  runWithPnrSyncLock,
} from "@/lib/pnr-case-sync";
import {
  getPnrBackgroundSyncStatus,
  PNR_BACKGROUND_SYNC_NOW_EVENT,
  publishPnrBackgroundSyncStatus,
} from "@/lib/pnr-background-sync-store";
import {
  connectorStateFromHandshake,
  PnrConnectorError,
  requestPnrConnector,
  type PnrConnectorHandshake,
} from "@/lib/pnr-connector-client";

interface QueueResponse {
  pending: number;
  case: { caseId: string; priority: number } | null;
}

interface TimelineConnectorResult {
  caseId: string;
  sourceEventCount: number;
  events: PnrCaseTimelineEvent[];
  detail?: PnrCaseDetailSnapshot;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

async function readQueue() {
  const response = await fetch("/api/pnr-case-center/queue", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Falha ao consultar fila PNR."));
  return response.json() as Promise<QueueResponse>;
}

async function updateTimeline(
  caseId: string,
  status: "ATTEMPT" | "COMPLETE" | "ERROR",
  result?: TimelineConnectorResult,
  errorMessage?: string,
) {
  const response = await fetch("/api/pnr-case-center/timeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId,
      status,
      ...(errorMessage ? { errorMessage: errorMessage.slice(0, 500) } : {}),
      ...(result ? {
        detail: result.detail,
        sourceEventCount: result.sourceEventCount,
        events: result.events.map(({ eventId, eventType, dateCreated, actorName, actorUserId }) => ({
          eventId,
          eventType,
          dateCreated,
          ...(actorName ? { actorName } : {}),
          ...(actorUserId ? { actorUserId } : {}),
        })),
      } : {}),
    }),
  });
  if (!response.ok) throw new Error(await readError(response, "Falha ao atualizar a fila PNR."));
}

function pausedMessage(error: unknown) {
  if (!(error instanceof PnrConnectorError)) return null;
  if (error.code === "EXTENSION_NOT_FOUND") return "Pausada — Conector PNR não encontrado";
  if (error.code === "MERCADO_LIVRE_NOT_DETECTED") return "Pausada — abra a Bandeja Mercado Livre";
  if (error.code === "MERCADO_LIVRE_SESSION_REQUIRED") return "Pausada — sessão Mercado Livre necessária";
  return null;
}

export function PnrCaseCenterBackgroundSync() {
  useEffect(() => {
    let disposed = false;
    let running = false;
    let timer: number | undefined;

    const schedule = () => {
      if (disposed) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void run(); }, PNR_DETAIL_SYNC_INTERVAL_MS);
    };

    const run = async (manual = false) => {
      if (disposed || running || (!manual && document.visibilityState === "hidden")) {
        schedule();
        return;
      }
      running = true;
      try {
        const acquired = await runWithPnrSyncLock(navigator.locks, async () => {
          let queue = await readQueue();
          publishPnrBackgroundSyncStatus({ pending: queue.pending });
          if (!queue.case) {
            publishPnrBackgroundSyncStatus({ phase: "idle", message: "Fila de detalhes atualizada" });
            return;
          }

          const handshake = await requestPnrConnector<PnrConnectorHandshake>("PING", {}, 10_000);
          const connectorState = connectorStateFromHandshake(handshake);
          if (connectorState === "unsupported") {
            publishPnrBackgroundSyncStatus({ phase: "paused", message: "Pausada — atualize o Conector PNR" });
            return;
          }
          if (connectorState === "ml-missing") {
            throw new PnrConnectorError("MERCADO_LIVRE_NOT_DETECTED", "Abra a Bandeja Mercado Livre.");
          }
          if (connectorState === "expired") {
            throw new PnrConnectorError(
              "MERCADO_LIVRE_SESSION_REQUIRED",
              handshake.sessionMessage || "Sessão Mercado Livre indisponível.",
            );
          }
          if (connectorState !== "connected" && connectorState !== "outdated") {
            throw new Error(handshake.sessionMessage || "Falha na conexão com o Mercado Livre.");
          }

          for (let index = 0; index < PNR_DETAIL_SYNC_BATCH_SIZE && queue.case && !disposed; index += 1) {
            const caseId = queue.case.caseId;
            publishPnrBackgroundSyncStatus({ phase: "active", message: `Sincronizando caso ${caseId}` });
            await updateTimeline(caseId, "ATTEMPT");
            try {
              const result = await requestPnrConnector<TimelineConnectorResult>("FETCH_TIMELINE", { caseId });
              await updateTimeline(caseId, "COMPLETE", result);
              const status = getPnrBackgroundSyncStatus();
              publishPnrBackgroundSyncStatus({
                processed: status.processed + 1,
                lastSuccessAt: new Date().toISOString(),
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Falha temporária ao sincronizar detalhes.";
              await updateTimeline(caseId, "ERROR", undefined, message).catch(() => undefined);
              const status = getPnrBackgroundSyncStatus();
              publishPnrBackgroundSyncStatus({ errors: status.errors + 1 });
              const paused = pausedMessage(error);
              if (paused) {
                publishPnrBackgroundSyncStatus({ phase: "paused", message: paused });
                return;
              }
            }
            await wait(PNR_DETAIL_SYNC_CASE_DELAY_MS);
            queue = await readQueue();
            publishPnrBackgroundSyncStatus({ pending: queue.pending });
          }

          publishPnrBackgroundSyncStatus({ phase: "idle", message: "Sincronização automática aguardando próximo lote" });
        });
        if (!acquired) {
          publishPnrBackgroundSyncStatus({ phase: "paused", message: "Sincronização ativa em outra aba" });
        }
      } catch (error) {
        const paused = pausedMessage(error);
        publishPnrBackgroundSyncStatus({
          phase: paused ? "paused" : "error",
          message: paused || (error instanceof Error ? error.message : "Falha na sincronização automática"),
        });
      } finally {
        running = false;
        schedule();
      }
    };

    const onManual = () => { void run(true); };
    const onFocus = () => { void run(); };
    const initialTimer = window.setTimeout(() => { void run(); }, 2_000);
    window.addEventListener(PNR_BACKGROUND_SYNC_NOW_EVENT, onManual);
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearTimeout(timer);
      window.removeEventListener(PNR_BACKGROUND_SYNC_NOW_EVENT, onManual);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
