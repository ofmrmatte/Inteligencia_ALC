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
  hydratePnrBackgroundSyncPauseState,
  PNR_BACKGROUND_SYNC_COMMITTED_EVENT,
  PNR_BACKGROUND_SYNC_NOW_EVENT,
  PNR_BACKGROUND_SYNC_PAUSE_EVENT,
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
  cases?: Array<{ caseId: string; priority: number }>;
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
    hydratePnrBackgroundSyncPauseState();
    let disposed = false;
    let running = false;
    let timer: number | undefined;

    const schedule = () => {
      if (disposed) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void run(); }, PNR_DETAIL_SYNC_INTERVAL_MS);
    };

    const run = async (manual = false) => {
      if (disposed || running) {
        schedule();
        return;
      }
      if (getPnrBackgroundSyncStatus().manuallyPaused) {
        publishPnrBackgroundSyncStatus({ phase: "paused", message: "Pausada manualmente" });
        schedule();
        return;
      }
      running = true;
      try {
        const acquired = await runWithPnrSyncLock(navigator.locks, async () => {
          const queue = await readQueue();
          const queuedCases = queue.cases?.length ? queue.cases : queue.case ? [queue.case] : [];
          publishPnrBackgroundSyncStatus({ pending: queue.pending });
          if (!queuedCases.length) {
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

          let handled = 0;
          let successful = 0;
          for (const queuedCase of queuedCases.slice(0, PNR_DETAIL_SYNC_BATCH_SIZE)) {
            if (disposed || getPnrBackgroundSyncStatus().manuallyPaused) {
              publishPnrBackgroundSyncStatus({ phase: "paused", message: "Pausada manualmente" });
              break;
            }
            const caseId = queuedCase.caseId;
            publishPnrBackgroundSyncStatus({ phase: "active", message: `Sincronizando caso ${caseId}` });
            await updateTimeline(caseId, "ATTEMPT");
            try {
              const result = await requestPnrConnector<TimelineConnectorResult>("FETCH_TIMELINE", { caseId });
              await updateTimeline(caseId, "COMPLETE", result);
              successful += 1;
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
            handled += 1;
            publishPnrBackgroundSyncStatus({ pending: Math.max(0, queue.pending - handled) });
            if (!disposed && handled < queuedCases.length) await wait(PNR_DETAIL_SYNC_CASE_DELAY_MS);
          }

          if (successful > 0) window.dispatchEvent(new Event(PNR_BACKGROUND_SYNC_COMMITTED_EVENT));
          if (!getPnrBackgroundSyncStatus().manuallyPaused) {
            publishPnrBackgroundSyncStatus({ phase: "idle", message: "Lote de detalhes concluído; preparando o próximo" });
          }
        });
        if (!acquired) {
          publishPnrBackgroundSyncStatus({ phase: "paused", message: "Sincronização de detalhes pausada durante outra operação PNR" });
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
    const onPauseChange = (event: Event) => {
      const manuallyPaused = Boolean((event as CustomEvent<{ manuallyPaused?: boolean }>).detail?.manuallyPaused);
      if (manuallyPaused) {
        publishPnrBackgroundSyncStatus({ phase: "paused", message: "Pausada manualmente" });
        return;
      }
      publishPnrBackgroundSyncStatus({ phase: "idle", message: "Retomando sincronização automática" });
      void run(true);
    };
    const onFocus = () => { void run(); };
    const initialTimer = window.setTimeout(() => { void run(); }, 2_000);
    window.addEventListener(PNR_BACKGROUND_SYNC_NOW_EVENT, onManual);
    window.addEventListener(PNR_BACKGROUND_SYNC_PAUSE_EVENT, onPauseChange);
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearTimeout(timer);
      window.removeEventListener(PNR_BACKGROUND_SYNC_NOW_EVENT, onManual);
      window.removeEventListener(PNR_BACKGROUND_SYNC_PAUSE_EVENT, onPauseChange);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
