import { createHash } from "node:crypto";
import { phone, type CaseRecord } from "./domain";
import { createEnrichmentEvent, ENRICHMENT_VERSION } from "../../../packages/pnr-enrichment/protocol";

export const CASE_COMPARISON_VERSION = 2;

export function emptySyncCounts() {
  return { processed: 0, found: 0, new: 0, updated: 0, unchanged: 0,
    classificationChanged: 0, verifiedPhoneAdded: 0, verifiedContactConflicts: 0,
    scopeChanged: 0, stale: 0, errors: 0 };
}
export type SyncCounts = ReturnType<typeof emptySyncCounts>;
export type SyncStats = SyncCounts & { byUnit: (SyncCounts & { base_key: string; sigla: string })[] };
export function combineSyncStats(previous: Partial<SyncStats> | undefined, current: SyncStats): SyncStats {
  const counts = emptySyncCounts();
  for (const key of Object.keys(counts) as (keyof SyncCounts)[])
    counts[key] = (previous?.[key] || 0) + current[key];
  const units = new Map<string, SyncStats["byUnit"][number]>();
  for (const unit of [...(previous?.byUnit || []), ...current.byUnit]) {
    const key = JSON.stringify([unit.base_key, unit.sigla]);
    const total = units.get(key) || { ...emptySyncCounts(), base_key: unit.base_key, sigla: unit.sigla };
    for (const field of Object.keys(counts) as (keyof SyncCounts)[]) total[field] += unit[field];
    units.set(key, total);
  }
  return { ...counts, byUnit: [...units.values()] };
}

const comparedFields = [
  "caseId",
  "shipmentId",
  "competence",
  "caseDate",
  "baseKey",
  "sigla",
  "driverId",
  "driverName",
  "driverPhone",
  "mainStatus",
  "subStatus",
  "classification",
  "customerName",
  "customerPhone",
  "customerVerified",
  "customerDocument",
  "customerAddress",
  "customerSource",
  "customerCapturedAt",
  "customerAddressFields",
  "products",
  "deliveryAt",
  "purchaseValue",
] as const satisfies readonly (keyof CaseRecord)[];

function normalized(value: unknown): unknown {
  if (typeof value === "string")
    return value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, normalized(item)]),
    );
  return value;
}

export function caseFingerprint(record: CaseRecord) {
  const projection = Object.fromEntries(
    comparedFields.map((field) => [field, normalized(record[field])]),
  );
  return createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}

export function verifiedContactEnrichment(record: CaseRecord) {
  if (!record.customerVerified) return null;
  try {
    return createEnrichmentEvent({
      schemaVersion: ENRICHMENT_VERSION,
      caseId: record.caseId,
      shipmentId: record.shipmentId,
      competence: record.competence,
      baseKey: record.baseKey,
      sigla: record.sigla,
      origin: "atendimento_verified_contact",
      name: record.customerName,
      phone: phone(record.customerPhone),
      verified: true,
      source: record.customerSource || "",
      capturedAt: new Date(record.customerCapturedAt || "").toISOString(),
    });
  } catch {
    return null;
  }
}

export const ENRICHMENT_MAX_ATTEMPTS = 8;
export function enrichmentRetryDelayMs(attempt: number) {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60 * 1000);
}
