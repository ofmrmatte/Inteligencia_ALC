import { createHash } from "node:crypto";
import { normalizeText } from "@/lib/normalize";

export interface PnrCaseDetailProduct {
  id?: string;
  title: string;
  price?: number;
  currency?: string;
}

export interface PnrCaseDetailSnapshot {
  claimId?: string;
  preInvoiceNumber?: string;
  billingPeriod?: string;
  driverId?: string;
  buyerName?: string;
  complaintMessage?: string;
  assignedReceiver?: string;
  trackingId?: string;
  products?: PnrCaseDetailProduct[];
  deliveryAt?: string;
  receivedBy?: string;
  receiverName?: string;
  receiverDocument?: string;
  routeId?: string;
  carrierName?: string;
  driverName?: string;
  driverPhone?: string;
  reviewRequestedBy?: string;
  reviewRequestedAt?: string;
  reviewMessage?: string;
  reviewEvidenceNames?: string[];
  receiptStatus?: string;
  receiptActorName?: string;
  receiptMessage?: string;
  reviewOutcome?: string;
}

const SCALAR_KEYS = [
  "claimId", "preInvoiceNumber", "billingPeriod", "driverId", "buyerName", "complaintMessage",
  "assignedReceiver", "trackingId", "deliveryAt", "receivedBy", "receiverName", "receiverDocument",
  "routeId", "carrierName", "driverName", "driverPhone", "reviewRequestedBy", "reviewRequestedAt",
  "reviewMessage", "receiptStatus", "receiptActorName", "receiptMessage", "reviewOutcome",
] as const satisfies ReadonlyArray<keyof PnrCaseDetailSnapshot>;

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function productKey(product: PnrCaseDetailProduct) {
  const id = nonEmpty(product.id);
  if (id) return `id:${normalizeText(id)}`;
  return `fallback:${normalizeText(product.title)}|${product.price ?? ""}|${normalizeText(product.currency)}`;
}

function mergeProducts(previous: PnrCaseDetailProduct[] = [], incoming: PnrCaseDetailProduct[] = []) {
  const products = new Map<string, PnrCaseDetailProduct>();
  for (const product of [...previous, ...incoming]) {
    const key = productKey(product);
    const current = products.get(key);
    products.set(key, {
      ...(current ?? {}),
      ...(nonEmpty(product.id) ? { id: nonEmpty(product.id) } : {}),
      ...(nonEmpty(product.title) ? { title: nonEmpty(product.title)! } : {}),
      ...(Number.isFinite(product.price) ? { price: product.price } : {}),
      ...(nonEmpty(product.currency) ? { currency: nonEmpty(product.currency) } : {}),
    } as PnrCaseDetailProduct);
  }
  return [...products.values()].filter((product) => nonEmpty(product.title));
}

function mergeEvidence(previous: string[] = [], incoming: string[] = []) {
  const evidence = new Map<string, string>();
  for (const value of [...previous, ...incoming]) {
    const name = nonEmpty(value);
    if (name) evidence.set(normalizeText(name), name);
  }
  return [...evidence.values()];
}

export function mergePnrCaseDetail(
  previous: PnrCaseDetailSnapshot | undefined,
  incoming: PnrCaseDetailSnapshot | undefined,
): PnrCaseDetailSnapshot | undefined {
  if (!previous && !incoming) return undefined;
  const merged: PnrCaseDetailSnapshot = { ...(previous ?? {}) };
  for (const key of SCALAR_KEYS) {
    const value = nonEmpty(incoming?.[key]);
    if (value) merged[key] = value;
  }
  const products = mergeProducts(previous?.products, incoming?.products);
  if (products.length) merged.products = products;
  const evidence = mergeEvidence(previous?.reviewEvidenceNames, incoming?.reviewEvidenceNames);
  if (evidence.length) merged.reviewEvidenceNames = evidence;
  return merged;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalize(item)]));
}

export function pnrCaseDetailPayloadHash(payload: PnrCaseDetailSnapshot) {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

export function uniquePnrCaseDetailSnapshots(
  snapshots: Array<{ payload: PnrCaseDetailSnapshot; capturedAt: string }>,
) {
  return [...new Map(snapshots.map((snapshot) => [pnrCaseDetailPayloadHash(snapshot.payload), {
    ...snapshot,
    payloadHash: pnrCaseDetailPayloadHash(snapshot.payload),
  }])).values()];
}
