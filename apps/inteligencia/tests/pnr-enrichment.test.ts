import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalJson, confirmedReceipt, createEnrichmentEvent, ENRICHMENT_PATH,
  enrichmentHeaders, sha256, type EnrichmentEnvelope,
} from "../../../packages/pnr-enrichment/protocol";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn() }));
vi.mock("@/lib/db/railway-data-client", () => ({ corePool: () => ({ connect: mocks.connect }) }));
import { POST } from "@/app/api/internal/pnr-enrichment/route";

const KEY = "ab".repeat(32), NOW = Date.parse("2026-10-09T12:00:00Z");
const NONCE = "11111111-1111-4111-8111-111111111111";
const makeEvent = (overrides = {}) => createEnrichmentEvent({ schemaVersion: 2, caseId: "case-1", shipmentId: "123456",
  competence: "202610Q1", baseKey: "BASE A", sigla: "SP", origin: "atendimento_verified_contact",
  name: "Synthetic buyer", phone: "5511999990000", verified: true,
  source: "https://envios.adminml.com/logistics/package-management/package/123456",
  capturedAt: "2026-10-08T12:00:00Z", ...overrides });
const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
let row: Record<string, unknown>, nonces: Set<string>, receipts: Map<string, { payload_hash: string }>;
let rollback: { row: Record<string, unknown>; nonces: Set<string>; receipts: typeof receipts };

function signedRequest(event: unknown, nonce = NONCE, now = NOW) {
  const body = JSON.stringify(event);
  return new Request(`https://core.example.test${ENRICHMENT_PATH}`, {
    method: "POST", body, headers: enrichmentHeaders(body, KEY, nonce, now),
  });
}
async function accepted(event: EnrichmentEnvelope, nonce = NONCE) {
  const response = await POST(signedRequest(event, nonce));
  const body = await response.text();
  expect(response.status).toBe(200);
  return confirmedReceipt(body, response.headers.get("x-alc-enrichment-response-signature"), nonce, KEY, event);
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks();
  vi.stubEnv("PNR_ENRICHMENT_HMAC_KEY", KEY);
  vi.stubEnv("PNR_ENRICHMENT_ALLOWED_SCOPES", '[{"baseKey":"BASE A","sigla":"SP"}]');
  vi.stubEnv("DATABASE_URL", "postgres://synthetic.invalid/core");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network"); }));
  row = { case_id: "case-1", shipment_id: "123456", competence: "202610Q1", base_key: "BASE A", sigla: "SP",
    main_status: "NEW", sub_status: "WAITING_RECEIPT", driver_id: "driver-1", purchase_value: "123.45",
    source_system: "case_center", raw_snapshot_jsonb: { detailSnapshot: { buyerName: "Official buyer", products: [{ title: "Official item" }] } },
    atendimento_verified_contact: null };
  nonces = new Set(); receipts = new Map();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
    if (sql === "BEGIN") rollback = { row: structuredClone(row), nonces: new Set(nonces), receipts: new Map(receipts) };
    if (sql === "ROLLBACK") { row = rollback.row; nonces = rollback.nonces; receipts = rollback.receipts; }
    if (sql.startsWith("INSERT INTO app_private.pnr_enrichment_nonces")) {
      if (nonces.has(String(values[0]))) return result();
      nonces.add(String(values[0])); return result([{ nonce: values[0] }]);
    }
    if (sql.startsWith("SELECT case_id")) return result(row.case_id === values[0] ? [row] : []);
    if (sql.startsWith("SELECT payload_hash")) return result(receipts.has(String(values[0])) ? [receipts.get(String(values[0]))] : []);
    if (sql.startsWith("UPDATE public.pnr_case_center_cases")) { row.atendimento_verified_contact = values[1]; return result([row]); }
    if (sql.startsWith("INSERT INTO app_private.pnr_enrichment_receipts")) {
      receipts.set(String(values[0]), { payload_hash: String(values[5]) });
      return result([{ event_key: values[0] }]);
    }
    return result();
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Core verified contact receiver", () => {
  it("is disabled without server key or explicit scope configuration", async () => {
    vi.stubEnv("PNR_ENRICHMENT_HMAC_KEY", "");
    expect((await POST(signedRequest(makeEvent()))).status).toBe(503);
    vi.stubEnv("PNR_ENRICHMENT_HMAC_KEY", KEY); vi.stubEnv("PNR_ENRICHMENT_ALLOWED_SCOPES", "[]");
    expect((await POST(signedRequest(makeEvent()))).status).toBe(503);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized configured scope before connecting to Core", async () => {
    vi.stubEnv("PNR_ENRICHMENT_ALLOWED_SCOPES", '[{"baseKey":"BASE B","sigla":"SP"}]');
    expect((await POST(signedRequest(makeEvent()))).status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("applies only the complementary contact and signs an exact durable receipt", async () => {
    const event = makeEvent(), official = structuredClone(row);
    expect(await accepted(event)).toMatchObject({ eventKey: event.eventKey, caseId: "case-1", shipmentId: "123456", schemaVersion: 2, outcome: "applied" });
    expect(row).toEqual({ ...official, atendimento_verified_contact: event.payload });
    expect(receipts.get(event.eventKey)?.payload_hash).toBe(sha256(canonicalJson(event)));
    const update = mocks.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE public.pnr_case_center_cases"));
    expect(update?.[0]).toMatch(/^UPDATE public\.pnr_case_center_cases SET atendimento_verified_contact=\$2,updated_at=now\(\)\s+WHERE case_id=\$1 RETURNING case_id$/);
    expect(mocks.query.mock.calls.some(([sql]) => /CREATE|ALTER/i.test(sql))).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects nonce replay and accepts the same event idempotently under a fresh nonce", async () => {
    const event = makeEvent(); await accepted(event);
    expect((await POST(signedRequest(event))).status).toBe(409);
    expect(await accepted(event, "22222222-2222-4222-8222-222222222222")).toMatchObject({ outcome: "duplicate" });
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith("UPDATE public.pnr_case_center_cases"))).toHaveLength(1);
  });

  it("rejects tampered, expired, future and wrong-version authentication before Core access", async () => {
    const event = makeEvent(), body = JSON.stringify(event), headers = enrichmentHeaders(body, KEY, NONCE, NOW);
    const tampered = new Request(`https://core.example.test${ENRICHMENT_PATH}`, { method: "POST", headers, body: body.replace("Synthetic buyer", "Other buyer") });
    expect((await POST(tampered)).status).toBe(401);
    expect((await POST(signedRequest(event, NONCE, NOW - 301_000))).status).toBe(401);
    expect((await POST(signedRequest(event, NONCE, NOW + 31_000))).status).toBe(401);
    expect((await POST(new Request(`https://core.example.test${ENRICHMENT_PATH}`, { method: "POST", body,
      headers: { ...headers, "x-alc-enrichment-version": "1" } }))).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each(["extra", "hash", "source", "unverified"])("rejects signed invalid %s schema before Core access", async (kind) => {
    const event = makeEvent();
    const payload = { ...event.payload,
      ...(kind === "extra" ? { mainStatus: "CLOSED" } : {}),
      ...(kind === "hash" ? { sourceHash: "0".repeat(64) } : {}),
      ...(kind === "source" ? { source: "https://attacker.example/package" } : {}),
      ...(kind === "unverified" ? { verified: false } : {}),
    };
    expect((await POST(signedRequest({ ...event, payload }))).status).toBe(422);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each(["shipment", "competence", "scope", "missing scope"])("fails closed for mismatched %s binding", async (kind) => {
    if (kind === "shipment") row.shipment_id = "different-shipment";
    if (kind === "competence") row.competence = "202609Q2";
    if (kind === "scope") row.base_key = "BASE B";
    if (kind === "missing scope") row.sigla = "";
    expect((await POST(signedRequest(makeEvent()))).status).toBe(kind.includes("scope") ? 403 : 409);
    expect(row.atendimento_verified_contact).toBeNull(); expect(receipts.size).toBe(0);
    expect(nonces.size).toBe(0); expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("preserves newer verified contact and refuses conflicting data at an equal capture time", async () => {
    const newer = makeEvent({ name: "Newer contact", capturedAt: "2026-10-08T13:00:00Z" });
    row.atendimento_verified_contact = newer.payload;
    expect(await accepted(makeEvent())).toMatchObject({ outcome: "superseded" });
    expect(row.atendimento_verified_contact).toEqual(newer.payload);
    const conflict = makeEvent({ name: "Conflicting name", capturedAt: newer.payload.capturedAt });
    expect((await POST(signedRequest(conflict, "22222222-2222-4222-8222-222222222222"))).status).toBe(409);
    expect(row.atendimento_verified_contact).toEqual(newer.payload);
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE public.pnr_case_center_cases"))).toBe(false);
  });

  it("bounds body bytes and fails when the explicitly migrated Core schema is absent", async () => {
    expect((await POST(signedRequest({ oversized: "x".repeat(8193) }))).status).toBe(413);
    expect(mocks.connect).not.toHaveBeenCalled();
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO app_private.pnr_enrichment_nonces")) throw new Error("relation does not exist");
      return query(sql, values);
    });
    expect((await POST(signedRequest(makeEvent()))).status).toBe(503);
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.query.mock.calls.some(([sql]) => /CREATE|ALTER/i.test(sql))).toBe(false);
  });

  it("never confirms an event before its transaction commits", async () => {
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql === "COMMIT") throw new Error("Commit failed");
      return query(sql, values);
    });
    const response = await POST(signedRequest(makeEvent()));
    expect(response.status).toBe(503);
    expect(response.headers.get("x-alc-enrichment-response-signature")).toBeNull();
    expect(row.atendimento_verified_contact).toBeNull();
    expect(receipts.size).toBe(0); expect(nonces.size).toBe(0);
  });

  it.each(["contact", "receipt"])("does not confirm a suppressed %s write", async (kind) => {
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (kind === "contact" && sql.startsWith("UPDATE public.pnr_case_center_cases")) return result();
      if (kind === "receipt" && sql.startsWith("INSERT INTO app_private.pnr_enrichment_receipts")) return result();
      return query(sql, values);
    });
    const response = await POST(signedRequest(makeEvent()));
    expect(response.status).toBe(503);
    expect(response.headers.get("x-alc-enrichment-response-signature")).toBeNull();
    expect(row.atendimento_verified_contact).toBeNull();
    expect(receipts.size).toBe(0); expect(nonces.size).toBe(0);
  });
});
