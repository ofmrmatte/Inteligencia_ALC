export type PnrBackgroundSyncPhase = "idle" | "active" | "paused" | "error";

export interface PnrBackgroundSyncStatus {
  phase: PnrBackgroundSyncPhase;
  message: string;
  pending: number;
  processed: number;
  errors: number;
  lastSuccessAt: string | null;
}

export const PNR_BACKGROUND_SYNC_NOW_EVENT = "alc-pnr-background-sync-now";

const initialStatus: PnrBackgroundSyncStatus = {
  phase: "idle",
  message: "Aguardando sincronização automática",
  pending: 0,
  processed: 0,
  errors: 0,
  lastSuccessAt: null,
};

let currentStatus = initialStatus;
const listeners = new Set<() => void>();

export function getPnrBackgroundSyncStatus() {
  return currentStatus;
}

export function getServerPnrBackgroundSyncStatus() {
  return initialStatus;
}

export function subscribePnrBackgroundSync(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishPnrBackgroundSyncStatus(patch: Partial<PnrBackgroundSyncStatus>) {
  currentStatus = { ...currentStatus, ...patch };
  listeners.forEach((listener) => listener());
}

export function requestPnrBackgroundSyncNow() {
  window.dispatchEvent(new Event(PNR_BACKGROUND_SYNC_NOW_EVENT));
}
