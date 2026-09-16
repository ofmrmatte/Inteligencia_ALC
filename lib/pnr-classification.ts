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

export function pnrClassificationFamily(status: string): PnrClassificationFamily | null {
  const normalized = normalizeText(status);
  if (/ANULAD/.test(normalized)) return "ANULAÇÃO";
  if (/FATUR/.test(normalized)) return "FATURAMENTO";
  return null;
}

export function auditPnrClassification(row: PnrRecord): PnrClassificationAuditStatus {
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
  const family = pnrClassificationFamily(row.status);
  if (family === "FATURAMENTO") return normalizePnrBillingType(row.billingType) || "";
  if (family === "ANULAÇÃO") return normalizePnrCancellationType(row.cancellationType) || "";
  return "";
}
