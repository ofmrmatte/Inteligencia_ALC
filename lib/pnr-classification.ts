import { cleanText, normalizeText } from "@/lib/normalize";
import type { PnrRecord } from "@/lib/types";

export const PNR_BILLING_TYPES = [
  "REVISADA MELI",
  "AUTOMÁTICA MELI",
  "MLP ALC - LOSS/DISPATCHER",
] as const;

export const PNR_CANCELLATION_TYPES = [
  "REVISADA MELI",
  "TONY",
] as const;

export type PnrBillingType = (typeof PNR_BILLING_TYPES)[number];
export type PnrCancellationType = (typeof PNR_CANCELLATION_TYPES)[number];
export type PnrClassificationFamily = "FATURAMENTO" | "ANULAÇÃO";
export type PnrClassificationAuditStatus = "CLASSIFICADO" | "PENDENTE" | "INCONSISTENTE" | "NAO_APLICAVEL";

export interface PnrCaseCenterClassificationEvent {
  eventType: string;
  dateCreated: string;
  actorName?: string;
  actorUserId?: string;
}

export interface PnrFinancialClassification {
  audit: PnrClassificationAuditStatus;
  family: PnrClassificationFamily | null;
  label: PnrBillingType | PnrCancellationType | "";
  source: "CASE_CENTER_DERIVED";
}

const LOSS_DISPATCHER_EVENT_TYPES = new Set(["NOT_ATTACHED_RECEIPT"]);
const REVIEW_EVENT_TYPES = new Set(["UPDATE_STATUS_TO_ON_REVIEW", "UPDATE_STATUS_TO_IN_PROGRESS_ON_REVIEW"]);
const BILLED_CLOSURE_EVENT_TYPES = new Set(["UPDATE_STATUS_TO_CLOSED_BILLED", "UPDATE_CASE_BILLED"]);

function canonicalBillingType(value: unknown): PnrBillingType | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes("REVISADA MELI") || normalized.includes("REVISADO MELI")) return "REVISADA MELI";
  if (normalized.includes("AUTOMATICA MELI")) return "AUTOMÁTICA MELI";
  if (normalized.includes("MLP ALC") && (normalized.includes("LOSS") || normalized.includes("DISPATCHER"))) {
    return "MLP ALC - LOSS/DISPATCHER";
  }
  return null;
}

function canonicalCancellationType(value: unknown): PnrCancellationType | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes("REVISADA MELI") || normalized.includes("REVISADO MELI")) return "REVISADA MELI";
  if (normalized.includes("TONY")) return "TONY";
  return null;
}

export function normalizePnrBillingType(value: unknown) {
  return canonicalBillingType(value) ?? cleanText(value);
}

export function normalizePnrCancellationType(value: unknown) {
  return canonicalCancellationType(value) ?? cleanText(value);
}

export function isValidPnrBillingType(value: string) {
  return canonicalBillingType(value) !== null;
}

export function isValidPnrCancellationType(value: string) {
  return canonicalCancellationType(value) !== null;
}

function pendingCaseCenterClassification(): PnrFinancialClassification {
  return { audit: "PENDENTE", family: null, label: "", source: "CASE_CENTER_DERIVED" };
}

function classifiedCaseCenterClassification(family: PnrClassificationFamily, label: PnrBillingType | PnrCancellationType): PnrFinancialClassification {
  return { audit: "CLASSIFICADO", family, label, source: "CASE_CENTER_DERIVED" };
}

function hasReviewEvent(events: PnrCaseCenterClassificationEvent[]) {
  return events.some((event) => REVIEW_EVENT_TYPES.has(event.eventType));
}

export function isLossDispatcherBilling(row: Pick<PnrRecord, "subStatus">, events: PnrCaseCenterClassificationEvent[]) {
  if (cleanText(row.subStatus).toUpperCase() !== "BILLED") return false;
  const manualEvent = events.find((event) => LOSS_DISPATCHER_EVENT_TYPES.has(event.eventType)
    && Boolean(cleanText(event.actorUserId) || cleanText(event.actorName)));
  if (!manualEvent) return false;
  const manualAt = new Date(manualEvent.dateCreated).getTime();
  return events.some((event) => BILLED_CLOSURE_EVENT_TYPES.has(event.eventType)
    && Number.isFinite(manualAt)
    && new Date(event.dateCreated).getTime() >= manualAt);
}

export function derivePnrFinancialClassification(
  row: Pick<PnrRecord, "subStatus" | "reviewedStatus" | "detailSyncStatus">,
  events: PnrCaseCenterClassificationEvent[],
): PnrFinancialClassification {
  const subStatus = cleanText(row.subStatus).toUpperCase();
  const reviewedStatus = cleanText(row.reviewedStatus).toLowerCase();
  if (!(["BILLED", "NOT_BILLED"] as string[]).includes(subStatus) || row.detailSyncStatus !== "COMPLETE" || events.length === 0) {
    return pendingCaseCenterClassification();
  }
  if (subStatus === "BILLED") {
    if (isLossDispatcherBilling(row, events)) return classifiedCaseCenterClassification("FATURAMENTO", "MLP ALC - LOSS/DISPATCHER");
    if (reviewedStatus === "reviewed" || hasReviewEvent(events)) return classifiedCaseCenterClassification("FATURAMENTO", "REVISADA MELI");
    if (reviewedStatus === "not_reviewed" || reviewedStatus === "") return classifiedCaseCenterClassification("FATURAMENTO", "AUTOMÁTICA MELI");
    return pendingCaseCenterClassification();
  }
  if (reviewedStatus === "reviewed" || hasReviewEvent(events)) return classifiedCaseCenterClassification("ANULAÇÃO", "REVISADA MELI");
  if (reviewedStatus === "not_reviewed" || reviewedStatus === "") return classifiedCaseCenterClassification("ANULAÇÃO", "TONY");
  return pendingCaseCenterClassification();
}

function caseCenterClassification(row: PnrRecord) {
  const subStatus = cleanText(row.subStatus).toUpperCase();
  const billing = canonicalBillingType(row.billingType);
  const cancellation = canonicalCancellationType(row.cancellationType);
  if (subStatus === "BILLED" && billing) return classifiedCaseCenterClassification("FATURAMENTO", billing);
  if (subStatus === "NOT_BILLED" && cancellation) return classifiedCaseCenterClassification("ANULAÇÃO", cancellation);
  return derivePnrFinancialClassification(row, []);
}

export function pnrClassificationFamily(value: string | PnrRecord): PnrClassificationFamily | null {
  if (typeof value !== "string" && value.sourceSystem === "case_center") return caseCenterClassification(value).family;
  const normalized = normalizeText(typeof value === "string" ? value : value.status);
  if (/ANULAD/.test(normalized)) return "ANULAÇÃO";
  if (/FATUR/.test(normalized)) return "FATURAMENTO";
  return null;
}

export function auditPnrClassification(row: PnrRecord): PnrClassificationAuditStatus {
  if (row.sourceSystem === "case_center") return caseCenterClassification(row).audit;
  if (!row.classificationColumnsPresent) return "NAO_APLICAVEL";

  const billing = cleanText(row.billingType);
  const cancellation = cleanText(row.cancellationType);
  const family = pnrClassificationFamily(row.status);

  if (billing && cancellation) return "INCONSISTENTE";

  if (family === "FATURAMENTO") {
    if (!billing && !cancellation) return "PENDENTE";
    if (cancellation || !isValidPnrBillingType(billing)) return "INCONSISTENTE";
    return "CLASSIFICADO";
  }

  if (family === "ANULAÇÃO") {
    if (!billing && !cancellation) return "PENDENTE";
    if (billing || !isValidPnrCancellationType(cancellation)) return "INCONSISTENTE";
    return "CLASSIFICADO";
  }

  if (billing || cancellation) return "INCONSISTENTE";
  return "NAO_APLICAVEL";
}

export function pnrClassificationLabel(row: PnrRecord) {
  if (row.sourceSystem === "case_center") return caseCenterClassification(row).label;
  const family = pnrClassificationFamily(row);
  if (family === "FATURAMENTO") return normalizePnrBillingType(row.billingType) || "";
  if (family === "ANULAÇÃO") return normalizePnrCancellationType(row.cancellationType) || "";
  return "";
}
