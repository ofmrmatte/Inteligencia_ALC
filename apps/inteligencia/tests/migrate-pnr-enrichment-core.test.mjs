import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runCoreMigration } from "../scripts/migrate-pnr-enrichment-core.mjs";

const coreUrl = process.env.ATENDIMENTO_TEST_CORE_URL;
const migration = "20261009090422_pnr_verified_contact_enrichment.sql";
const ledger = "app_private.pnr_enrichment_schema_migrations";
const valid = {
  DATABASE_URL: coreUrl || "postgresql://postgres@127.0.0.1:55484/alc_core_test",
  PNR_DATABASE_URL: coreUrl
    ? new URL("/postgres", coreUrl).toString()
    : "postgresql://postgres@127.0.0.1:55484/postgres",
};
afterEach(() => vi.restoreAllMocks());

it("does not connect or require configuration without --apply", async () => {
  const connect = vi.spyOn(pg.Client.prototype, "connect");
  expect(await runCoreMigration([], { DATABASE_URL: "invalid", PNR_DATABASE_URL: "invalid" }))
    .toMatchObject({ status: "not-applied", migration });
  expect(connect).not.toHaveBeenCalled();
});

it("rejects unrecognized flags without connecting", async () => {
  const connect = vi.spyOn(pg.Client.prototype, "connect");
  await expect(runCoreMigration(["--apply", "--all"], valid)).rejects.toThrow("CORE_MIGRATION_EXPLICIT_APPLY_REQUIRED");
  expect(connect).not.toHaveBeenCalled();
});

it.each([
  { DATABASE_URL: undefined },
  { PNR_DATABASE_URL: undefined },
  { DATABASE_URL: "https://postgres:secret@example.test/core" },
  { PNR_DATABASE_URL: "postgresql://postgres@localhost/" },
  { PNR_DATABASE_URL: "postgresql://postgres@localhost/aux?host=remote.test" },
  { DATABASE_URL: "postgresql://postgres@localhost:0/core" },
])("rejects invalid or missing explicit database targets before connection: %j", async (override) => {
  const connect = vi.spyOn(pg.Client.prototype, "connect");
  await expect(runCoreMigration(["--apply"], { ...valid, ...override }))
    .rejects.toThrow("CORE_MIGRATION_DATABASE_CONFIG_INVALID");
  expect(connect).not.toHaveBeenCalled();
});

it("ignores credentials and non-routing options when detecting identical targets", async () => {
  const connect = vi.spyOn(pg.Client.prototype, "connect");
  await expect(runCoreMigration(["--apply"], {
    DATABASE_URL: "postgresql://owner:secret@localhost/core",
    PNR_DATABASE_URL: "postgres://reader:other@localhost:5432/core?application_name=aux",
  })).rejects.toThrow("CORE_MIGRATION_TARGETS_NOT_DISTINCT");
  expect(connect).not.toHaveBeenCalled();
});

it("never exposes connection errors or URLs", async () => {
  vi.spyOn(pg.Client.prototype, "connect").mockRejectedValue(new Error(`password=secret ${valid.DATABASE_URL}`));
  await expect(runCoreMigration(["--apply"], valid)).rejects.toThrow(/^CORE_MIGRATION_FAILED$/);
});

it("rejects aliases of the same real database before any DDL", async () => {
  vi.spyOn(pg.Client.prototype, "connect").mockResolvedValue();
  vi.spyOn(pg.Client.prototype, "end").mockResolvedValue();
  const query = vi.spyOn(pg.Client.prototype, "query").mockResolvedValue({
    rows: [{ cluster: "synthetic-cluster", database: "same-database" }],
  });
  await expect(runCoreMigration(["--apply"], valid)).rejects.toThrow("CORE_MIGRATION_TARGETS_NOT_DISTINCT");
  expect(query.mock.calls.map(([sql]) => sql)).toEqual([
    "SELECT system_identifier::text AS cluster, current_database() AS database FROM pg_control_system()",
    "SELECT system_identifier::text AS cluster, current_database() AS database FROM pg_control_system()",
  ]);
});

if (coreUrl) {
  const target = new URL(coreUrl);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || !["5432", "55484"].includes(target.port) ||
      target.pathname !== "/alc_core_test" || target.search || target.hash)
    throw new Error("Only the isolated alc_core_test fixture on local or CI PostgreSQL is permitted.");
}

describe.skipIf(!coreUrl)("specific Core migration (isolated PostgreSQL, serial)", () => {
  let fixture;
  const env = { ...valid, DATABASE_URL: coreUrl };
  let hash;
  let rowsBefore;
  let ownsLedger = false;

  beforeAll(async () => {
    fixture = new pg.Client({ connectionString: coreUrl, connectionTimeoutMillis: 3000 });
    await fixture.connect();
    const active = await fixture.query(`SELECT application_name FROM pg_stat_activity
      WHERE pid<>pg_backend_pid() AND datname=current_database() AND state<>'idle'`);
    if (active.rowCount) throw new Error("Another PostgreSQL test is active; run this file serially.");
    expect((await fixture.query("SELECT to_regclass($1) AS existing", [ledger])).rows[0].existing).toBeNull();
    ownsLedger = true;
    await fixture.query(`CREATE SCHEMA IF NOT EXISTS app_private;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS public.pnr_case_center_cases(case_id text PRIMARY KEY,shipment_id text,
        competence text,base_key text,sigla text,main_status text,raw_snapshot_jsonb jsonb,updated_at timestamptz DEFAULT now());`);
    const sql = await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8");
    hash = createHash("sha256").update(sql).digest("hex");
    const existing = (await fixture.query("SELECT to_regclass('app_private.pnr_enrichment_receipts') AS receipts")).rows[0].receipts;
    const casesBefore = (await fixture.query("SELECT count(*)::integer AS cases FROM public.pnr_case_center_cases")).rows[0].cases;
    const first = await runCoreMigration(["--apply"], env);
    expect(first).toMatchObject({ status: "applied", migration, sha256: hash });
    if (!existing) {
      expect((await fixture.query("SELECT count(*)::integer AS cases FROM public.pnr_case_center_cases")).rows[0].cases).toBe(casesBefore);
      expect((await fixture.query("SELECT count(*)::integer AS receipts FROM app_private.pnr_enrichment_receipts")).rows[0].receipts).toBe(0);
    }
    rowsBefore = (await fixture.query(`SELECT
      (SELECT count(*)::integer FROM public.pnr_case_center_cases) AS cases,
      (SELECT count(*)::integer FROM app_private.pnr_enrichment_nonces) AS nonces,
      (SELECT count(*)::integer FROM app_private.pnr_enrichment_receipts) AS receipts`)).rows[0];
  });

  beforeEach(async () => {
    await runCoreMigration(["--apply"], env);
  });

  afterAll(async () => {
    if (!fixture) return;
    try {
      if (ownsLedger) await fixture.query(`DROP TABLE IF EXISTS ${ledger}`);
      if (rowsBefore) expect((await fixture.query(`SELECT
        (SELECT count(*)::integer FROM public.pnr_case_center_cases) AS cases,
        (SELECT count(*)::integer FROM app_private.pnr_enrichment_nonces) AS nonces,
        (SELECT count(*)::integer FROM app_private.pnr_enrichment_receipts) AS receipts`)).rows[0]).toEqual(rowsBefore);
    } finally {
      await fixture.end();
    }
  });

  it("adopts existing compatible objects, records the file hash, and is idempotent", async () => {
    expect(await runCoreMigration(["--apply"], env)).toEqual({ status: "already-applied", migration, sha256: hash });
    expect((await fixture.query(`SELECT name,sha256 FROM ${ledger}`)).rows).toEqual([{ name: migration, sha256: hash }]);
  });

  it("uses the distinct PNR connection only to verify database identity", async () => {
    const query = pg.Client.prototype.query;
    const auxQueries = [];
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (sql, ...args) {
      if (this.database === "postgres") auxQueries.push(sql);
      return query.call(this, sql, ...args);
    });
    await runCoreMigration(["--apply"], env);
    expect(auxQueries).toEqual([
      "SELECT system_identifier::text AS cluster, current_database() AS database FROM pg_control_system()",
    ]);
  });

  it("keeps the checksum ledger inaccessible to ordinary authenticated users", async () => {
    expect((await fixture.query("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass", [ledger])).rows[0].relrowsecurity).toBe(true);
    await fixture.query("BEGIN");
    try {
      await fixture.query("SET LOCAL ROLE authenticated");
      await expect(fixture.query(`SELECT * FROM ${ledger}`)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await fixture.query("ROLLBACK");
    }
  });

  it("rejects a checksum mismatch without replacing the record", async () => {
    await fixture.query(`UPDATE ${ledger} SET sha256=$1`, ["0".repeat(64)]);
    try {
      await expect(runCoreMigration(["--apply"], env)).rejects.toThrow("CORE_MIGRATION_CHECKSUM_MISMATCH");
      expect((await fixture.query(`SELECT sha256 FROM ${ledger}`)).rows[0].sha256).toBe("0".repeat(64));
    } finally {
      await fixture.query(`UPDATE ${ledger} SET sha256=$1`, [hash]);
    }
  });

  it("rejects drift in adopted column constraints without silently repairing it", async () => {
    await fixture.query("ALTER TABLE app_private.pnr_enrichment_nonces ALTER COLUMN request_hash DROP NOT NULL");
    try {
      await expect(runCoreMigration(["--apply"], env)).rejects.toThrow("CORE_MIGRATION_EXISTING_OBJECT_INCOMPATIBLE");
      expect((await fixture.query(`SELECT attnotnull FROM pg_attribute
        WHERE attrelid='app_private.pnr_enrichment_nonces'::regclass AND attname='request_hash'`)).rows[0].attnotnull).toBe(false);
    } finally {
      await fixture.query("ALTER TABLE app_private.pnr_enrichment_nonces ALTER COLUMN request_hash SET NOT NULL");
    }
  });

  it("rejects disabled RLS and preserves that state on failure", async () => {
    await fixture.query("ALTER TABLE app_private.pnr_enrichment_nonces DISABLE ROW LEVEL SECURITY");
    try {
      await expect(runCoreMigration(["--apply"], env)).rejects.toThrow("CORE_MIGRATION_EXISTING_OBJECT_INCOMPATIBLE");
      expect((await fixture.query(`SELECT relrowsecurity FROM pg_class
        WHERE oid='app_private.pnr_enrichment_nonces'::regclass`)).rows[0].relrowsecurity).toBe(false);
    } finally {
      await fixture.query("ALTER TABLE app_private.pnr_enrichment_nonces ENABLE ROW LEVEL SECURITY");
    }
  });

  it("rejects anonymous column grants even when table grants are private", async () => {
    await fixture.query("GRANT SELECT(request_hash) ON app_private.pnr_enrichment_nonces TO anon");
    try {
      await expect(runCoreMigration(["--apply"], env)).rejects.toThrow("CORE_MIGRATION_EXISTING_OBJECT_INCOMPATIBLE");
    } finally {
      await fixture.query("REVOKE SELECT(request_hash) ON app_private.pnr_enrichment_nonces FROM anon");
    }
  });

  it.each(["schema", "cases", "contact"])("refuses a failed prerequisite: %s", async (field) => {
    const query = pg.Client.prototype.query;
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (sql, ...args) {
      if (typeof sql === "string" && sql.includes("SELECT to_regnamespace('app_private')"))
        return Promise.resolve({ rows: [{ schema: true, roles: true, cases: true, contact: true, [field]: false }] });
      return query.call(this, sql, ...args);
    });
    await expect(runCoreMigration(["--apply"], env)).rejects.toThrow("CORE_MIGRATION_PREREQUISITES_MISSING_OR_INCOMPATIBLE");
  });

  it("rolls back all migration metadata on SQL failure and sanitizes the error", async () => {
    await fixture.query(`DROP TABLE ${ledger}`);
    const query = pg.Client.prototype.query;
    const spy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (sql, ...args) {
      if (typeof sql === "string" && sql.startsWith(`INSERT INTO ${ledger}`))
        return Promise.reject(new Error("database password=synthetic-secret"));
      return query.call(this, sql, ...args);
    });
    try {
      await expect(runCoreMigration(["--apply"], env)).rejects.toThrow(/^CORE_MIGRATION_FAILED$/);
    } finally {
      spy.mockRestore();
    }
    expect((await fixture.query("SELECT to_regclass($1) AS existing", [ledger])).rows[0].existing).toBeNull();
  });
});
