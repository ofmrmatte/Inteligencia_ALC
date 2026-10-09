import { describe, expect, it } from "vitest";
import type { CaseRecord } from "../lib/domain";
import {
  caseFingerprint,
  ENRICHMENT_MAX_ATTEMPTS,
  enrichmentRetryDelayMs,
  verifiedContactEnrichment,
} from "../lib/sync-delta";

const record = (overrides: Partial<CaseRecord> = {}): CaseRecord => ({
  caseId: "case-1",
  shipmentId: "123456",
  competence: "202610Q1",
  caseDate: "2026-10-08",
  baseKey: "BASE A",
  sigla: "SP",
  driverId: "driver-1",
  driverName: "Driver One",
  driverPhone: "5511999990000",
  mainStatus: "NEW",
  subStatus: "WAITING_RECEIPT",
  classification: "aguardando_comprovante",
  customerName: "Buyer One",
  customerPhone: "5511988880000",
  customerVerified: true,
  customerSource: "https://envios.adminml.com/logistics/package-management/package/123456",
  customerCapturedAt: "2026-10-08T12:00:00-03:00",
  products: [{ title: "Product One" }],
  deliveryAt: "2026-10-07T12:00:00Z",
  purchaseValue: 10,
  ...overrides,
});

describe("sync deltas and enrichment events", () => {
  it("creates a stable normalized fingerprint independent of object key order and whitespace", () => {
    const first = record({ customerAddressFields: { street: " Main  St ", city: "São Paulo" } });
    const second = record({ customerAddressFields: { city: "São Paulo", street: "Main St" } });
    expect(caseFingerprint(first)).toBe(caseFingerprint(second));
    expect(caseFingerprint(first)).not.toBe(caseFingerprint(record({ classification: "encerrada" })));
  });

  it("emits only minimal verified contact fields with a versioned idempotency key", () => {
    const event = verifiedContactEnrichment(record());
    expect(event?.payload).toMatchObject({
      schemaVersion: 2,
      caseId: "case-1",
      shipmentId: "123456",
      competence: "202610Q1",
      baseKey: "BASE A",
      sigla: "SP",
      origin: "atendimento_verified_contact",
      name: "Buyer One",
      phone: "5511988880000",
      verified: true,
      source: "https://envios.adminml.com/logistics/package-management/package/123456",
      capturedAt: "2026-10-08T15:00:00.000Z",
    });
    expect(event?.eventKey).toMatch(/^verified-contact:v2:case-1:[a-f0-9]{64}$/);
    expect(event?.payload.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(/conversation|message|document|address|status/i);
  });

  it("fails closed for unverified or incomplete contact and bounds exponential retries", () => {
    expect(verifiedContactEnrichment(record({ customerVerified: false }))).toBeNull();
    expect(verifiedContactEnrichment(record({ customerSource: "" }))).toBeNull();
    expect(verifiedContactEnrichment(record({ customerSource: "https://example.com" }))).toBeNull();
    expect(verifiedContactEnrichment(record({ shipmentId: "different-shipment" }))).toBeNull();
    expect(verifiedContactEnrichment(record({ baseKey: "" }))).toBeNull();
    expect(verifiedContactEnrichment(record({ customerCapturedAt: "invalid" }))).toBeNull();
    expect(enrichmentRetryDelayMs(1)).toBe(30_000);
    expect(enrichmentRetryDelayMs(ENRICHMENT_MAX_ATTEMPTS)).toBe(3_840_000);
    expect(enrichmentRetryDelayMs(99)).toBe(6 * 60 * 60 * 1000);
  });
});
