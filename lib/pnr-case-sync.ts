import { CASE_CENTER_TIMELINE_PARSER_VERSION } from "@/lib/pnr-case-center";

export const PNR_DETAIL_SYNC_LOCK = "alc-pnr-case-detail-sync";
export const PNR_DETAIL_SYNC_BATCH_SIZE = 20;
export const PNR_DETAIL_QUEUE_CANDIDATE_LIMIT = 500;
export const PNR_DETAIL_SYNC_INTERVAL_MS = 5_000;
export const PNR_DETAIL_SYNC_CASE_DELAY_MS = 400;

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
  return (mainStatus || "").toUpperCase() === "CLOSED" ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000;
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
