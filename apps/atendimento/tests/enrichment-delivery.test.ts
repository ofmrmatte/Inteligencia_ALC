import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateEnrichment, createEnrichmentEvent, ENRICHMENT_PATH,
  receiptFor, responseSignature,
} from "../../../packages/pnr-enrichment/protocol";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query }) }));
import { acknowledgeEnrichmentEvent, claimEnrichmentEvents, retryEnrichmentEvent } from "../lib/sync-enrichment";
import { deliverEnrichment, ENRICHMENT_TIMEOUT_MS, enrichmentClientConfig } from "../lib/enrichment-client";
import { processEnrichment } from "../lib/process-enrichment";

const KEY = "ab".repeat(32), NOW = Date.parse("2026-10-09T12:00:00Z");
const event = createEnrichmentEvent({ schemaVersion: 2, caseId: "case-1", shipmentId: "123456",
  competence: "202610Q1", baseKey: "BASE A", sigla: "SP", origin: "atendimento_verified_contact",
  name: "Synthetic buyer", phone: "5511999990000", verified: true,
  source: "validado_pela_equipe", capturedAt: "2026-10-08T12:00:00Z" });
const config = { key: KEY, url: `https://core.example.test${ENRICHMENT_PATH}` };
const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
let status: string, attempt: number, lease: number;

function successfulFetch(receipt = receiptFor(event, "applied")) {
  return vi.fn(async (_url: unknown, options: RequestInit) => {
    const headers = new Headers(options.headers);
    authenticateEnrichment(headers, String(options.body), KEY, NOW);
    const body = JSON.stringify(receipt);
    return new Response(body, { headers: {
      "x-alc-enrichment-response-signature": responseSignature(body, headers.get("x-alc-enrichment-nonce")!, KEY),
    } });
  });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("PNR_ENRICHMENT_HMAC_KEY", KEY); vi.stubEnv("PNR_ENRICHMENT_CORE_URL", config.url);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network"); }));
  status = "pending"; attempt = 0; lease = NOW + 120_000;
  mocks.query.mockReset().mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.includes("coalesce(last_error")) {
      if (status === "processing" && lease < Date.now() && attempt >= 8) status = "dead_letter";
    } else if (sql.startsWith("WITH candidates")) {
      if (attempt >= 8 || !(status === "pending" || (status === "processing" && lease < Date.now()))) return result();
      status = "processing"; attempt += 1; lease = Date.now() + 120_000;
      return result([{ id: "job-1", event_key: event.eventKey, case_id: event.payload.caseId, payload: event.payload, attempts: attempt }]);
    } else if (sql.includes("WHERE id=$1")) {
      expect(sql).toContain("attempts=$2");
      if (values[0] !== "job-1" || values[1] !== attempt || status !== "processing" || lease <= Date.now()) return result();
      status = sql.includes("SET status='delivered'") ? "delivered" : attempt >= 8 ? "dead_letter" : "pending";
      return result([{ id: "job-1" }]);
    }
    return result();
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("enrichment lease and delivery", () => {
  it("rejects ACK and retry from an old attempt after a lease is reclaimed", async () => {
    status = "processing"; attempt = 2;
    expect(await acknowledgeEnrichmentEvent("job-1", 1)).toBe(false);
    expect(await retryEnrichmentEvent("job-1", 1, new Error("old worker"))).toBe(false);
    expect(status).toBe("processing");
    expect(await acknowledgeEnrichmentEvent("job-1", 2)).toBe(true);
    expect(status).toBe("delivered");
  });

  it("dead-letters the eighth failed or expired claim and does not claim a ninth", async () => {
    attempt = 7;
    expect((await claimEnrichmentEvents(5))[0].attempts).toBe(8);
    await retryEnrichmentEvent("job-1", 8, new Error("delivery failed"));
    expect(status).toBe("dead_letter");
    expect(await claimEnrichmentEvents(5)).toEqual([]);
    status = "processing"; lease = NOW - 1;
    expect(await claimEnrichmentEvents(5)).toEqual([]);
    expect(status).toBe("dead_letter");
  });

  it("stays off without valid server configuration and leaves jobs unclaimed", async () => {
    vi.stubEnv("PNR_ENRICHMENT_HMAC_KEY", "");
    expect(await processEnrichment()).toMatchObject({ enabled: false, claimed: 0 });
    expect(mocks.query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("PNR_ENRICHMENT_HMAC_KEY", KEY);
    vi.stubEnv("PNR_ENRICHMENT_CORE_URL", "http://core.example.test/api/internal/pnr-enrichment");
    expect(enrichmentClientConfig()).toBeNull();
  });

  it("ACKs only the signed exact event receipt and carries its claimed attempt", async () => {
    const send = successfulFetch(); vi.stubGlobal("fetch", send);
    expect(await processEnrichment()).toEqual({ enabled: true, claimed: 1, delivered: 1, retried: 0, leaseLost: 0 });
    expect(status).toBe("delivered");
    expect(send).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls.find(([sql]) => sql.startsWith("WITH candidates"))?.[1][0]).toBe(5);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("SET status='delivered'"), ["job-1", 1]);
  });

  it.each(["eventKey", "caseId", "shipmentId", "sourceHash", "schemaVersion"])(
    "retries a signed receipt with a mismatched %s without ACK", async (field) => {
      const wrong = { ...receiptFor(event, "applied"), [field]: field === "schemaVersion" ? 1 : "wrong" };
      vi.stubGlobal("fetch", successfulFetch(wrong as ReturnType<typeof receiptFor>));
      expect(await processEnrichment()).toMatchObject({ delivered: 0, retried: 1 });
      expect(status).toBe("pending");
      expect(mocks.query.mock.calls.some(([sql]) => sql.includes("SET status='delivered'"))).toBe(false);
    },
  );

  it("rejects a tampered response and bounds response bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(receiptFor(event, "applied")), {
      headers: { "x-alc-enrichment-response-signature": "0".repeat(64) },
    })));
    await expect(deliverEnrichment(event, config)).rejects.toThrow("ENRICHMENT_CONFIRMATION_INVALID");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(8193))));
    await expect(deliverEnrichment(event, config)).rejects.toThrow("ENRICHMENT_BODY_TOO_LARGE");
  });

  it("aborts an HTTP request at the bounded timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    const check = expect(deliverEnrichment(event, config)).rejects.toThrow("ENRICHMENT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(ENRICHMENT_TIMEOUT_MS);
    await check;
  });

  it("bounds a response whose body never completes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream())));
    const check = expect(deliverEnrichment(event, config)).rejects.toThrow("ENRICHMENT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(ENRICHMENT_TIMEOUT_MS);
    await check;
  });

  it("does not ACK or retry after its own lease expires", async () => {
    status = "processing"; attempt = 1; lease = NOW;
    expect(await acknowledgeEnrichmentEvent("job-1", 1)).toBe(false);
    expect(await retryEnrichmentEvent("job-1", 1, new Error("late worker"))).toBe(false);
    expect(status).toBe("processing");
  });

  it("does not send a claimed event bound to a different PNR row", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.startsWith("WITH candidates")
      ? result([{ id: "job-1", event_key: event.eventKey, case_id: "other-case", payload: event.payload, attempts: 1 }]) : result([{ id: "job-1" }]));
    expect(await processEnrichment()).toMatchObject({ delivered: 0, retried: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
