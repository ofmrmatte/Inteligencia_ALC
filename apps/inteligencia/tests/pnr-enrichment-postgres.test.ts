import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrichmentEvent, ENRICHMENT_VERSION } from "../../../packages/pnr-enrichment/protocol";

const fixture = vi.hoisted(() => ({ pool: null as pg.Pool | null }));
vi.mock("../lib/db/railway-data-client", () => ({ corePool: () => fixture.pool }));
import { applyPnrEnrichment } from "../lib/pnr-enrichment";
const url = process.env.ATENDIMENTO_TEST_CORE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/alc_core_test")
    throw new Error("Only the isolated local Core test database is permitted");
}
describe.skipIf(!url)("Core enrichment PostgreSQL (isolated)", () => {
  const scope = [{ baseKey: "SYNTHETIC BASE", sigla: "SYN" }];
  const event = (capturedAt = "2026-10-08T10:00:00Z", name = "Synthetic buyer") => createEnrichmentEvent({
    schemaVersion: ENRICHMENT_VERSION, caseId: "synthetic-case", shipmentId: "synthetic-shipment",
    competence: "202610Q1", baseKey: "SYNTHETIC BASE", sigla: "SYN", origin: "atendimento_verified_contact",
    name, phone: "5511988880000", verified: true, source: "validado_pela_equipe", capturedAt,
  });
  const request = () => ({ nonce: randomUUID(), timestamp: new Date().toISOString(), bodyHash: "a".repeat(64) });
  beforeAll(async () => {
    fixture.pool = new pg.Pool({ connectionString: url, max: 3 });
    await fixture.pool.query(`CREATE SCHEMA IF NOT EXISTS app_private;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS public.pnr_case_center_cases(case_id text PRIMARY KEY,shipment_id text,
        competence text,base_key text,sigla text,main_status text,raw_snapshot_jsonb jsonb,updated_at timestamptz DEFAULT now());`);
    const migration = await readFile(new URL("../supabase/migrations/20261009090422_pnr_verified_contact_enrichment.sql", import.meta.url), "utf8");
    await fixture.pool.query(migration);
    await fixture.pool.query(migration);
  }, 30000);
  beforeEach(async () => {
    await fixture.pool!.query("TRUNCATE app_private.pnr_enrichment_receipts,app_private.pnr_enrichment_nonces,public.pnr_case_center_cases");
    await fixture.pool!.query("INSERT INTO public.pnr_case_center_cases(case_id,shipment_id,competence,base_key,sigla,main_status,raw_snapshot_jsonb) VALUES('synthetic-case','synthetic-shipment','202610Q1','SYNTHETIC BASE','SYN','OFFICIAL','{\"official\":true}')");
  });
  afterAll(async () => { await fixture.pool?.end(); fixture.pool = null; });
  it("persists one complementary contact and immutable receipt without changing official data", async () => {
    const input = event();
    expect(await applyPnrEnrichment(input, request(), scope)).toMatchObject({ outcome: "applied" });
    expect(await applyPnrEnrichment(input, request(), scope)).toMatchObject({ outcome: "duplicate" });
    expect((await fixture.pool!.query("SELECT main_status,raw_snapshot_jsonb,atendimento_verified_contact FROM public.pnr_case_center_cases")).rows[0])
      .toMatchObject({ main_status: "OFFICIAL", raw_snapshot_jsonb: { official: true }, atendimento_verified_contact: input.payload });
    expect((await fixture.pool!.query("SELECT * FROM app_private.pnr_enrichment_receipts")).rowCount).toBe(1);
  });
  it("supersedes stale contacts and rejects equal-time conflicts and foreign scope", async () => {
    const newer = event("2026-10-08T12:00:00Z");
    await applyPnrEnrichment(newer, request(), scope);
    expect(await applyPnrEnrichment(event(), request(), scope)).toMatchObject({ outcome: "superseded" });
    await expect(applyPnrEnrichment(event("2026-10-08T12:00:00Z", "Conflicting buyer"), request(), scope)).rejects.toThrow("ENRICHMENT_CAPTURE_CONFLICT");
    await expect(applyPnrEnrichment(event(), request(), [])).rejects.toThrow("ENRICHMENT_SCOPE_MISMATCH");
    expect((await fixture.pool!.query("SELECT atendimento_verified_contact FROM public.pnr_case_center_cases")).rows[0].atendimento_verified_contact).toEqual(newer.payload);
  });
  it("serializes concurrent nonce replay without duplicate effects", async () => {
    const nonce = request(), input = event();
    const results = await Promise.allSettled([applyPnrEnrichment(input, nonce, scope), applyPnrEnrichment(input, nonce, scope)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await fixture.pool!.query("SELECT * FROM app_private.pnr_enrichment_receipts")).rowCount).toBe(1);
  });
  it("denies ordinary authenticated role access to private delivery records", async () => {
    const client = await fixture.pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await expect(client.query("SELECT * FROM app_private.pnr_enrichment_receipts")).rejects.toMatchObject({ code: "42501" });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
});
