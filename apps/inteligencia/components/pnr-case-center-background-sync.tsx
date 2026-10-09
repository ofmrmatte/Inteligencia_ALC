"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { PnrCaseDetailSnapshot } from "@/lib/pnr-case-detail";
import type { PnrCaseTimelineEvent } from "@/lib/pnr-case-center";
import {
  PNR_DETAIL_PERSIST_BATCH_SIZE,
  PNR_DETAIL_CONNECTOR_BATCH_SIZE,
  PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS,
  PNR_DETAIL_SYNC_CONNECTION_RETRY_MS,
  PNR_DETAIL_SYNC_BATCH_SIZE,
  PNR_DETAIL_SYNC_CONCURRENCY,
  PNR_DETAIL_SYNC_LEADER_LEASE_MS,
  PNR_DETAIL_SYNC_RATE_LIMIT_BACKOFF_MS,
  pnrDetailEmptySyncDelayMs,
  pnrDetailBatchIssue,
  pnrPersistBatchConfirmation,
  runWithPnrSyncLock,
} from "@/lib/pnr-case-sync";
import {
  getPnrBackgroundSyncStatus,
  hydratePnrBackgroundSyncPauseState,
  PNR_BACKGROUND_SYNC_NOW_EVENT,
  PNR_BACKGROUND_SYNC_PAUSE_EVENT,
  publishPnrBackgroundSyncStatus,
} from "@/lib/pnr-background-sync-store";
import {
  connectorStateFromHandshake,
  PnrConnectorError,
  requestPnrConnector,
  type PnrConnectorErrorCode,
  type PnrConnectorHandshake,
} from "@/lib/pnr-connector-client";

interface QueueResponse {
  pending: number;
  cases?: Array<{ caseId: string; priority: number }>;
  case: { caseId: string; priority: number } | null;
  pausedForBulkImport?: boolean;
}

interface TimelineConnectorResult {
  caseId: string;
  sourceEventCount: number;
  events: PnrCaseTimelineEvent[];
  detail?: PnrCaseDetailSnapshot;
}

interface TimelineConnectorBatchResult {
  results: Array<
    | { caseId: string; ok: true; data: TimelineConnectorResult }
    | { caseId: string; ok: false; error: { code?: string; message?: string } }
  >;
}

interface TimelinePersistPayload {
  caseId: string;
  status: "COMPLETE" | "ERROR";
  errorMessage?: string;
  detail?: PnrCaseDetailSnapshot;
  sourceEventCount?: number;
  events?: Array<{
    eventId: string;
    eventType: string;
    dateCreated: string;
    actorName?: string;
    actorUserId?: string;
  }>;
}

interface BulkPersistResponse {
  results?: Array<{
    caseId: string;
    ok: boolean;
    status: number;
    error?: string;
  }>;
}

const LEADER_KEY = "alc-pnr-background-sync-leader";

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (body.error === "MFA_REQUIRED" && body.message) return body.message;
  return body.error || body.message || fallback;
}

class PnrBackgroundAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "PnrBackgroundAuthError";
  }
}

async function readQueue() {
  const response = await fetch("/api/pnr-case-center/queue", { cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    throw new PnrBackgroundAuthError(response.status, await readError(response, "Sessão administrativa indisponível."));
  }
  if (!response.ok) throw new Error(await readError(response, "Falha ao consultar fila PNR."));
  return response.json() as Promise<QueueResponse>;
}

async function persistTimelineBatch(items: TimelinePersistPayload[]) {
  const response = await fetch("/api/pnr-case-center/timeline/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new PnrBackgroundAuthError(response.status, await readError(response, "Sessão administrativa indisponível."));
  }
  if (!response.ok) throw new Error(await readError(response, "Falha ao persistir lote de timelines PNR."));
  const body = await response.json() as BulkPersistResponse;
  return body;
}

function pausedMessage(error: unknown) {
  if (!(error instanceof PnrConnectorError)) return null;
  if (error.code === "EXTENSION_NOT_FOUND") return "Pausada — Conector PNR não encontrado";
  if (error.code === "MERCADO_LIVRE_NOT_DETECTED") return "Pausada — não foi possível preparar a sessão Mercado Livre";
  if (error.code === "MERCADO_LIVRE_SESSION_REQUIRED") return "Pausada — sessão Mercado Livre necessária";
  return null;
}

function toPersistPayload(item: TimelineConnectorBatchResult["results"][number]): TimelinePersistPayload {
  if (!item.ok) {
    return {
      caseId: item.caseId,
      status: "ERROR",
      errorMessage: (item.error.message || "Falha temporária ao sincronizar detalhes.").slice(0, 500),
    };
  }
  return {
    caseId: item.caseId,
    status: "COMPLETE",
    detail: item.data.detail,
    sourceEventCount: item.data.sourceEventCount,
    events: item.data.events.map(({ eventId, eventType, dateCreated, actorName, actorUserId }) => ({
      eventId,
      eventType,
      dateCreated,
      ...(actorName ? { actorName } : {}),
      ...(actorUserId ? { actorUserId } : {}),
    })),
  };
}

export function PnrCaseCenterBackgroundSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/bandeja-pnr") return;

    hydratePnrBackgroundSyncPauseState();
    let disposed = false;
    let running = false;
    let authBlocked = false;
    let failureBlocked = false;
    let timer: number | undefined;
    let emptyPolls = 0;
    let lastRunAt = 0;
    let connectorConcurrency = PNR_DETAIL_SYNC_CONCURRENCY;
    const tabId = crypto.randomUUID();

    const releaseLeader = () => {
      try {
        const current = JSON.parse(window.localStorage.getItem(LEADER_KEY) || "null") as { tabId?: string } | null;
        if (current?.tabId === tabId) window.localStorage.removeItem(LEADER_KEY);
      } catch {
        window.localStorage.removeItem(LEADER_KEY);
      }
    };

    const claimLeader = () => {
      const now = Date.now();
      try {
        const current = JSON.parse(window.localStorage.getItem(LEADER_KEY) || "null") as {
          tabId?: string;
          expiresAt?: number;
        } | null;
        if (current?.tabId && current.tabId !== tabId && Number(current.expiresAt || 0) > now) return false;
        window.localStorage.setItem(LEADER_KEY, JSON.stringify({
          tabId,
          expiresAt: now + PNR_DETAIL_SYNC_LEADER_LEASE_MS,
        }));
        const verified = JSON.parse(window.localStorage.getItem(LEADER_KEY) || "null") as { tabId?: string } | null;
        return verified?.tabId === tabId;
      } catch {
        return true;
      }
    };

    const schedule = (delayMs = PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS) => {
      if (
        disposed
        || authBlocked
        || failureBlocked
        || getPnrBackgroundSyncStatus().manuallyPaused
        || document.visibilityState !== "visible"
      ) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void run(); }, delayMs);
    };

    const run = async () => {
      if (disposed || running || failureBlocked) return;
      if (document.visibilityState !== "visible") return;
      if (getPnrBackgroundSyncStatus().manuallyPaused) {
        publishPnrBackgroundSyncStatus({ phase: "paused", message: "Pausada manualmente" });
        return;
      }
      if (lastRunAt && Date.now() - lastRunAt < PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS) {
        schedule(PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS - (Date.now() - lastRunAt));
        return;
      }
      if (!claimLeader()) {
        publishPnrBackgroundSyncStatus({ phase: "idle", message: "Sincronização ativa em outra aba" });
        schedule(PNR_DETAIL_SYNC_LEADER_LEASE_MS);
        return;
      }

      let nextDelayMs = PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS;
      running = true;
      lastRunAt = Date.now();
      try {
        const acquired = await runWithPnrSyncLock(navigator.locks, async () => {
          const queue = await readQueue();
          if (queue.pausedForBulkImport) {
            emptyPolls = 0;
            nextDelayMs = 20_000;
            publishPnrBackgroundSyncStatus({
              phase: "paused",
              pending: queue.pending,
              message: "Sincronização de detalhes pausada durante importação PNR",
            });
            return;
          }

          const queuedCases = (queue.cases?.length ? queue.cases : queue.case ? [queue.case] : [])
            .slice(0, PNR_DETAIL_SYNC_BATCH_SIZE);
          publishPnrBackgroundSyncStatus({ pending: queue.pending });

          if (!queuedCases.length) {
            emptyPolls += 1;
            nextDelayMs = pnrDetailEmptySyncDelayMs(emptyPolls);
            publishPnrBackgroundSyncStatus({
              phase: "idle",
              message: `Fila atualizada · nova verificação em ${Math.round(nextDelayMs / 1000)}s`,
            });
            return;
          }

          emptyPolls = 0;
          const handshake = await requestPnrConnector<PnrConnectorHandshake>("PING", {}, 25_000);
          const connectorState = connectorStateFromHandshake(handshake);
          if (connectorState === "unsupported" || connectorState === "outdated") {
            nextDelayMs = PNR_DETAIL_SYNC_CONNECTION_RETRY_MS;
            publishPnrBackgroundSyncStatus({ phase: "paused", message: "Pausada — atualize o Conector PNR" });
            return;
          }
          if (connectorState === "ml-missing") {
            throw new PnrConnectorError("MERCADO_LIVRE_NOT_DETECTED", "Não foi possível preparar o Case Center neste navegador.");
          }
          if (connectorState === "expired") {
            throw new PnrConnectorError(
              "MERCADO_LIVRE_SESSION_REQUIRED",
              handshake.sessionMessage || "Sessão Mercado Livre indisponível.",
            );
          }
          if (connectorState !== "connected") {
            throw new Error(handshake.sessionMessage || "Falha na conexão com o Mercado Livre.");
          }

          const caseIds = queuedCases.map((item) => item.caseId);
          publishPnrBackgroundSyncStatus({
            phase: "active",
            message: `Sincronizando lote de ${caseIds.length} casos · concorrência ${connectorConcurrency}`,
          });

          let persistedTotal = 0;
          let allSuccessful = true;
          for (let index = 0; index < caseIds.length; index += PNR_DETAIL_CONNECTOR_BATCH_SIZE) {
            if (disposed || getPnrBackgroundSyncStatus().manuallyPaused) break;
            const batch = await requestPnrConnector<TimelineConnectorBatchResult>(
              "FETCH_TIMELINES",
              { caseIds: caseIds.slice(index, index + PNR_DETAIL_CONNECTOR_BATCH_SIZE), concurrency: connectorConcurrency },
              120_000,
            );
            if (disposed || getPnrBackgroundSyncStatus().manuallyPaused) break;
            const issue = pnrDetailBatchIssue(batch.results);
            if (issue) {
              const status = getPnrBackgroundSyncStatus();
              publishPnrBackgroundSyncStatus({ errors: status.errors + issue.failedCount });
              throw new PnrConnectorError(issue.code as PnrConnectorErrorCode, issue.message);
            }

            const sourceSuccess = new Map(batch.results.map((item) => [item.caseId, item.ok]));
            const payloads = batch.results.filter((item) => item.ok || item.error.code !== "BATCH_PAUSED").map(toPersistPayload);
            let completedCount = 0;
            let errorCount = 0;

            for (let persistIndex = 0; persistIndex < payloads.length; persistIndex += PNR_DETAIL_PERSIST_BATCH_SIZE) {
              if (disposed || getPnrBackgroundSyncStatus().manuallyPaused) break;
              const chunk = payloads.slice(persistIndex, persistIndex + PNR_DETAIL_PERSIST_BATCH_SIZE);
              const persisted = await persistTimelineBatch(chunk);
              const resultRows = Array.isArray(persisted.results) ? persisted.results : [];
              const confirmation = pnrPersistBatchConfirmation(chunk.map((item) => item.caseId), resultRows);
              for (const caseId of confirmation.confirmedCaseIds) {
                if (sourceSuccess.get(caseId)) { completedCount += 1; persistedTotal += 1; }
                else errorCount += 1;
              }
              if (confirmation.issue) errorCount += confirmation.issue.failedCount;
              const status = getPnrBackgroundSyncStatus();
              publishPnrBackgroundSyncStatus({
                pending: Math.max(0, queue.pending - persistedTotal),
                processed: status.processed + completedCount,
                errors: status.errors + errorCount,
                ...(completedCount ? { lastSuccessAt: new Date().toISOString() } : {}),
              });
              completedCount = 0;
              errorCount = 0;
              if (disposed || getPnrBackgroundSyncStatus().manuallyPaused) break;
              const authFailure = resultRows.find((item) => item?.status === 401 || item?.status === 403);
              if (authFailure) {
                throw new PnrBackgroundAuthError(authFailure.status, authFailure.error || "Sessão administrativa indisponível.");
              }
              if (confirmation.issue) {
                throw new PnrConnectorError("PERSISTENCE_ERROR", confirmation.issue.message);
              }
            }

            if (disposed || getPnrBackgroundSyncStatus().manuallyPaused) break;
            allSuccessful &&= batch.results.every((item) => item.ok);
            const rateLimited = batch.results.some((item) => !item.ok && /\b429\b/.test(item.error.message || ""));
            if (rateLimited) {
              connectorConcurrency = Math.max(1, Math.floor(connectorConcurrency / 2));
              nextDelayMs = PNR_DETAIL_SYNC_RATE_LIMIT_BACKOFF_MS;
              publishPnrBackgroundSyncStatus({
                phase: "paused",
                message: `Mercado Livre limitou o lote · retomando em ${Math.round(nextDelayMs / 1000)}s com concorrência ${connectorConcurrency}`,
              });
              return;
            }
          }

          if (disposed || getPnrBackgroundSyncStatus().manuallyPaused) return;
          if (allSuccessful && connectorConcurrency < PNR_DETAIL_SYNC_CONCURRENCY) {
            connectorConcurrency += 1;
          }
          publishPnrBackgroundSyncStatus({
            phase: "idle",
            message: "Lote concluído · continuando a fila de detalhes",
          });
        });

        if (!acquired) {
          publishPnrBackgroundSyncStatus({ phase: "idle", message: "Sincronização ativa em outra aba" });
          nextDelayMs = PNR_DETAIL_SYNC_LEADER_LEASE_MS;
        }
      } catch (error) {
        if (error instanceof PnrBackgroundAuthError) {
          authBlocked = true;
          publishPnrBackgroundSyncStatus({
            phase: "paused",
            message: error.status === 401
              ? "Sincronização de detalhes aguardando login"
              : `Sincronização pausada — ${error.message || "acesso não autorizado"}`,
          });
          return;
        }
        const paused = pausedMessage(error);
        failureBlocked = !paused && !(error instanceof PnrConnectorError && error.code === "RATE_LIMITED");
        publishPnrBackgroundSyncStatus({
          phase: "paused",
          message: paused || `Sincronização interrompida — ${error instanceof Error ? error.message : "Falha na sincronização automática"}${failureBlocked ? " Use Sincronizar agora após corrigir a causa." : " Aguardando liberação da origem."}`,
        });
        nextDelayMs = paused
          ? PNR_DETAIL_SYNC_CONNECTION_RETRY_MS
          : Math.max(nextDelayMs, PNR_DETAIL_SYNC_CONNECTION_RETRY_MS);
      } finally {
        running = false;
        if (!disposed && !authBlocked && !getPnrBackgroundSyncStatus().manuallyPaused) {
          schedule(nextDelayMs);
        }
      }
    };

    const onManual = () => {
      failureBlocked = false;
      lastRunAt = 0;
      emptyPolls = 0;
      window.clearTimeout(timer);
      void run();
    };
    const onPauseChange = (event: Event) => {
      const manuallyPaused = Boolean((event as CustomEvent<{ manuallyPaused?: boolean }>).detail?.manuallyPaused);
      if (manuallyPaused) {
        window.clearTimeout(timer);
        publishPnrBackgroundSyncStatus({ phase: "paused", message: "Pausada manualmente" });
        releaseLeader();
        return;
      }
      emptyPolls = 0;
      failureBlocked = false;
      lastRunAt = 0;
      publishPnrBackgroundSyncStatus({ phase: "idle", message: "Retomando processamento contínuo da fila" });
      void run();
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        emptyPolls = 0;
        void run();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        window.clearTimeout(timer);
        releaseLeader();
        publishPnrBackgroundSyncStatus({ phase: "idle", message: "Aguardando a aba Sync PNR ficar ativa" });
        return;
      }
      emptyPolls = 0;
      void run();
    };
    const onPageHide = () => releaseLeader();

    const initialTimer = window.setTimeout(() => { void run(); }, 1_000);
    window.addEventListener(PNR_BACKGROUND_SYNC_NOW_EVENT, onManual);
    window.addEventListener(PNR_BACKGROUND_SYNC_PAUSE_EVENT, onPauseChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearTimeout(timer);
      releaseLeader();
      window.removeEventListener(PNR_BACKGROUND_SYNC_NOW_EVENT, onManual);
      window.removeEventListener(PNR_BACKGROUND_SYNC_PAUSE_EVENT, onPauseChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname]);

  return null;
}
