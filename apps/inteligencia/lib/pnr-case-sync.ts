import { CASE_CENTER_TIMELINE_PARSER_VERSION } from "@/lib/pnr-case-center";

export const PNR_DETAIL_SYNC_LOCK = "alc-pnr-case-detail-sync";
export const PNR_DETAIL_SYNC_BATCH_SIZE = 50;
export const PNR_DETAIL_CONNECTOR_BATCH_SIZE = 5;
export const PNR_DETAIL_QUEUE_CANDIDATE_LIMIT = 500;
export const PNR_DETAIL_SYNC_CONCURRENCY = 2;
export const PNR_DETAIL_PERSIST_BATCH_SIZE = 10;
// Only Atendimento uses a fixed 30-minute collector alarm.
// Sync PNR drains its pending detail queue continuously while this view is active.
// Backoff is used for idle queues, rate limits and connection recovery, not for pending batches.
export const PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS = 2_000;
export const PNR_DETAIL_SYNC_EMPTY_BACKOFF_MS = [60_000, 120_000, 300_000] as const;
export const PNR_DETAIL_SYNC_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
export const PNR_DETAIL_SYNC_CONNECTION_RETRY_MS = 60_000;
export const PNR_DETAIL_SYNC_LEADER_LEASE_MS = 15_000;

export function pnrDetailBatchIssue(results: Array<{ ok: boolean; error?: { code?: string; message?: string } }>) {
  const failures = results.filter((item) => !item.ok && item.error?.code !== "BATCH_PAUSED");
  const fatal = failures.find((item) => ["MERCADO_LIVRE_SESSION_REQUIRED", "MERCADO_LIVRE_ACCESS_DENIED", "INVALID_RESPONSE", "RATE_LIMITED"].includes(item.error?.code || ""));
  const interrupted = results.some((item) => !item.ok && item.error?.code === "BATCH_PAUSED");
  const timeoutOnly = failures.length > 0 && failures.every((item) => item.error?.code === "REQUEST_TIMEOUT");
  const resumable = timeoutOnly || (failures.length === 0 && results.some((item) => item.ok));
  const failure = fatal || (!resumable && results.length && (interrupted || results.every((item) => !item.ok)) ? failures[0] : null);
  if (results.length && !failure && (!interrupted || resumable)) return null;
  return {
    code: failure?.error?.code || "INVALID_RESPONSE",
    message: failure?.error?.message || "O conector não retornou nenhum detalhe. Atualize a extensão antes de retomar.",
    failedCount: failures.length,
  };
}

export function pnrPersistBatchConfirmation(
  caseIds: string[],
  results: Array<{ caseId?: unknown; ok?: unknown; status?: unknown; error?: unknown }>,
) {
  const expected = new Set(caseIds);
  const returned = new Map<string, Array<{ ok?: unknown; status?: unknown; error?: unknown }>>();
  let unexpected = false;
  for (const result of results) {
    const caseId = typeof result?.caseId === "string" ? result.caseId : "";
    if (!expected.has(caseId)) {
      unexpected = true;
      continue;
    }
    returned.set(caseId, [...(returned.get(caseId) ?? []), result]);
  }

  const confirmedCaseIds = [...expected].filter((caseId) => {
    const matches = returned.get(caseId);
    const status = matches?.[0]?.status;
    return matches?.length === 1
      && matches[0].ok === true
      && typeof status === "number"
      && Number.isInteger(status)
      && status >= 200
      && status < 300;
  });
  const exact = expected.size === caseIds.length
    && results.length === caseIds.length
    && !unexpected
    && confirmedCaseIds.length === caseIds.length;
  if (exact) return { confirmedCaseIds, issue: null };

  const error = results.find((result) => result?.ok !== true && typeof result?.error === "string")?.error;
  return {
    confirmedCaseIds,
    issue: {
      failedCount: Math.max(caseIds.length - confirmedCaseIds.length, unexpected ? 1 : 0, 1),
      message: typeof error === "string" ? error : "O servidor não confirmou a persistência de cada caso enviado. Confira antes de retomar.",
    },
  };
}

export function pnrDetailEmptySyncDelayMs(consecutiveEmptyPolls: number) {
  const index = Math.min(
    Math.max(consecutiveEmptyPolls - 1, 0),
    PNR_DETAIL_SYNC_EMPTY_BACKOFF_MS.length - 1,
  );
  return PNR_DETAIL_SYNC_EMPTY_BACKOFF_MS[index];
}

export interface PnrDetailQueueRecord {
  detail_sync_status: string;
  detail_parser_version: number;
  detail_last_success_at: string | null;
  main_status: string | null;
  source_last_seen_at: string;
}

export function pnrDetailQueuePriority(record: PnrDetailQueueRecord, now = Date.now()) {
  const lastSuccess = record.detail_last_success_at ? Date.parse(record.detail_last_success_at) : Number.NaN;
  if (record.detail_sync_status !== "COMPLETE"
    || record.detail_parser_version < CASE_CENTER_TIMELINE_PARSER_VERSION
    || !Number.isFinite(lastSuccess)) return 1;
  if ((record.main_status || "").toUpperCase() !== "CLOSED") return 2;
  const lastSeen = Date.parse(record.source_last_seen_at);
  return Number.isFinite(lastSeen) && now - lastSeen <= 30 * 24 * 60 * 60 * 1000 ? 3 : null;
}

export function pnrDetailNextSyncDelayMs(mainStatus: string | null | undefined) {
  // Refresh the same stored case only when due. This is not the queue batch cadence.
  return (mainStatus || "").toUpperCase() === "CLOSED" ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000;
}

export function pnrDetailRetryDelayMs(attempts: number) {
  return Math.min(6 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(Math.max(attempts, 1), 8)));
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { ifAvailable: true; mode: "exclusive" },
    callback: (lock: unknown | null) => Promise<T>,
  ): Promise<T>;
}

export async function runWithPnrSyncLock(
  locks: LockManagerLike | undefined,
  operation: () => Promise<void>,
) {
  if (!locks) {
    await operation();
    return true;
  }
  return locks.request(PNR_DETAIL_SYNC_LOCK, { ifAvailable: true, mode: "exclusive" }, async (lock) => {
    if (!lock) return false;
    await operation();
    return true;
  });
}

interface BlockingLockManagerLike {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: (lock: unknown) => Promise<T>,
  ): Promise<T>;
}

export async function runWithPnrImportLock<T>(
  locks: BlockingLockManagerLike | undefined,
  operation: () => Promise<T>,
) {
  if (!locks) return operation();
  return locks.request(PNR_DETAIL_SYNC_LOCK, { mode: "exclusive" }, async () => operation());
}

const PNR_PERSIST_RETRY_DELAYS_MS = [750, 1_500, 3_000] as const;

export function isTransientPnrPersistenceError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return [
    "statement timeout",
    "canceling statement due to statement timeout",
    "lock timeout",
    "deadlock detected",
    "could not serialize access",
    "failed to fetch",
    "fetch failed",
    "networkerror",
  ].some((fragment) => message.includes(fragment));
}

export async function retryPnrPersistence<T>(
  operation: () => Promise<T>,
  onRetry?: (attempt: number, delayMs: number) => void,
  options: {
    delaysMs?: readonly number[];
    wait?: (delayMs: number) => Promise<void>;
  } = {},
) {
  const delaysMs = options.delaysMs ?? PNR_PERSIST_RETRY_DELAYS_MS;
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientPnrPersistenceError(error) || attempt >= delaysMs.length) throw error;
      const delayMs = delaysMs[attempt];
      onRetry?.(attempt + 1, delayMs);
      await wait(delayMs);
    }
  }
}
