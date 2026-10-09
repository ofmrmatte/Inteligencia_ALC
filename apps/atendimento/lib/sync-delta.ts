import { createHash } from "node:crypto";
import { phone, type CaseRecord } from "./domain";

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
        .sort(([left], [right]) => left.localeCompare(right))
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
  const verifiedPhone = phone(record.customerPhone);
  let validSource = record.customerSource === "validado_pela_equipe";
  if (!validSource && record.customerSource) {
    try {
      const source = new URL(record.customerSource);
      validSource =
        source.protocol === "https:" &&
        source.hostname === "envios.adminml.com" &&
        !source.port &&
        !source.username &&
        !source.password &&
        !source.search &&
        !source.hash &&
        source.pathname ===
          `/logistics/package-management/package/${record.shipmentId}`;
    } catch {
      validSource = false;
    }
  }
  if (
    !record.customerVerified ||
    !verifiedPhone ||
    !validSource ||
    !record.customerCapturedAt ||
    !Number.isFinite(Date.parse(record.customerCapturedAt))
  )
    return null;

  const data = {
    name: record.customerName,
    phone: verifiedPhone,
    verified: true,
    source: record.customerSource,
    capturedAt: new Date(record.customerCapturedAt).toISOString(),
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
  return {
    eventKey: `verified-contact:${record.caseId}:${fingerprint}`,
    payload: {
      schemaVersion: 1,
      caseId: record.caseId,
      shipmentId: record.shipmentId,
      competence: record.competence,
      origin: "atendimento_verified_contact",
      ...data,
    },
  };
}

export const ENRICHMENT_MAX_ATTEMPTS = 8;
export function enrichmentRetryDelayMs(attempt: number) {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60 * 1000);
}
