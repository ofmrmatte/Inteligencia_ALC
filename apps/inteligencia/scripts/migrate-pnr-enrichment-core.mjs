import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATION = "20261009090422_pnr_verified_contact_enrichment.sql";
const LEDGER = "pnr_enrichment_schema_migrations";
const TABLES = ["pnr_enrichment_nonces", "pnr_enrichment_receipts", LEDGER];
class MigrationError extends Error {}

function target(value) {
  try {
    const url = new URL(value);
    const database = decodeURIComponent(url.pathname.slice(1));
    const keys = [...url.searchParams.keys()];
    if (typeof value !== "string" || value !== value.trim() ||
        !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username ||
        !database || /[\/\u0000]/.test(database) || url.hash || url.port === "0" ||
        keys.some(key => !["sslmode", "sslrootcert", "sslcert", "sslkey", "application_name"].includes(key)) ||
        new Set(keys).size !== keys.length) throw new Error();
    return JSON.stringify([url.hostname.toLowerCase().replace(/\.$/, ""), url.port || "5432", database]);
  } catch {
    throw new MigrationError("CORE_MIGRATION_DATABASE_CONFIG_INVALID");
  }
}

async function identity(client) {
  return (await client.query(
    "SELECT system_identifier::text AS cluster, current_database() AS database FROM pg_control_system()",
  )).rows[0];
}

async function signature(client, table) {
  return (await client.query(`
    SELECT c.relkind='r' AND c.relpersistence='p'
      AND NOT EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal)
      AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid) AS plain,
      c.relrowsecurity AS rls,
      NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
        WHERE acl.grantee=0 OR acl.grantee IN
          (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))
      AND NOT EXISTS(SELECT 1 FROM pg_attribute a, aclexplode(a.attacl) acl
        WHERE a.attrelid=c.oid AND (acl.grantee=0 OR acl.grantee IN
          (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))) AS private,
      jsonb_build_object(
        'columns', (SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.atttypmod,
            a.attnotnull,a.attcollation,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attname)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
        'constraints', (SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid))
          FROM pg_constraint WHERE conrelid=c.oid AND contype IN ('p','u','c','n','e'))
      ) AS definition,
      NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=c.oid AND NOT convalidated) AS validated,
      (SELECT count(*)::integer FROM pg_constraint WHERE conrelid=c.oid AND contype='f') AS foreign_keys
    FROM pg_class c WHERE c.oid=to_regclass($1)`, [table])).rows[0];
}

async function compatible(client, name, required = false) {
  const actual = await signature(client, `app_private.${name}`);
  if (!actual && !required) return;
  const expected = await signature(client, `pg_temp.expected_${name}`);
  if (!actual || !actual.plain || !actual.rls || !actual.private || !actual.validated ||
      JSON.stringify(actual.definition) !== JSON.stringify(expected.definition) ||
      actual.foreign_keys !== (name === "pnr_enrichment_receipts" ? 1 : 0))
    throw new MigrationError("CORE_MIGRATION_EXISTING_OBJECT_INCOMPATIBLE");
  if (name === "pnr_enrichment_receipts") {
    const valid = (await client.query(`
      SELECT EXISTS(SELECT 1 FROM pg_constraint f
        WHERE f.conrelid='app_private.pnr_enrichment_receipts'::regclass AND f.contype='f'
          AND f.confrelid='public.pnr_case_center_cases'::regclass
          AND f.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=f.conrelid AND attname='case_id')]
          AND f.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=f.confrelid AND attname='case_id')]
          AND f.confdeltype='r' AND f.confupdtype='a' AND f.confmatchtype='s'
          AND NOT f.condeferrable AND NOT f.condeferred) AS valid`)).rows[0].valid;
    if (!valid) throw new MigrationError("CORE_MIGRATION_EXISTING_OBJECT_INCOMPATIBLE");
  }
}

async function compatibleIndex(client, required = false) {
  const row = (await client.query(`
    SELECT c.relkind='i' AND i.indrelid=to_regclass('app_private.pnr_enrichment_receipts')
      AND i.indisvalid AND i.indisready AND NOT i.indisunique
      AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL
      AND am.amname='btree' AND i.indkey[0]=a.attnum AS valid
    FROM pg_class c LEFT JOIN pg_index i ON i.indexrelid=c.oid
      LEFT JOIN pg_am am ON am.oid=c.relam
      LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='case_id'
    WHERE c.oid=to_regclass('app_private.pnr_enrichment_receipts_case')`)).rows[0];
  if ((!row && required) || (row && !row.valid))
    throw new MigrationError("CORE_MIGRATION_EXISTING_OBJECT_INCOMPATIBLE");
}

const EXPECTED = `
  CREATE TEMP TABLE expected_pnr_enrichment_nonces (
    nonce uuid PRIMARY KEY, event_key text NOT NULL,
    request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    signed_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
  ) ON COMMIT DROP;
  CREATE TEMP TABLE expected_pnr_enrichment_receipts (
    event_key text PRIMARY KEY, case_id text NOT NULL, shipment_id text NOT NULL,
    schema_version smallint NOT NULL CHECK(schema_version=2),
    source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
    payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
    outcome text NOT NULL CHECK(outcome IN ('applied','superseded')),
    received_at timestamptz NOT NULL DEFAULT now()
  ) ON COMMIT DROP;
  CREATE TEMP TABLE expected_pnr_enrichment_schema_migrations (
    name text PRIMARY KEY, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now()
  ) ON COMMIT DROP;`;

export async function runCoreMigration(args = [], env = process.env) {
  let client, aux;
  let transactionStarted = false;
  try {
    if (args.length && (args.length !== 1 || args[0] !== "--apply"))
      throw new MigrationError("CORE_MIGRATION_EXPLICIT_APPLY_REQUIRED");
    const sql = await readFile(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    if (!args.length) return { status: "not-applied", migration: MIGRATION, sha256 };
    if (target(env.DATABASE_URL) === target(env.PNR_DATABASE_URL))
      throw new MigrationError("CORE_MIGRATION_TARGETS_NOT_DISTINCT");
    const options = { connectionTimeoutMillis: 5000, statement_timeout: 30000,
      application_name: "pnr_enrichment_core_migration" };
    client = new pg.Client({ ...options, connectionString: env.DATABASE_URL });
    aux = new pg.Client({ ...options, connectionString: env.PNR_DATABASE_URL });
    await client.connect();
    await aux.connect();
    const coreIdentity = await identity(client), auxIdentity = await identity(aux);
    if (!coreIdentity?.cluster || !coreIdentity.database || !auxIdentity?.cluster || !auxIdentity.database)
      throw new MigrationError("CORE_MIGRATION_TARGET_IDENTITY_UNAVAILABLE");
    if (coreIdentity.cluster === auxIdentity.cluster && coreIdentity.database === auxIdentity.database)
      throw new MigrationError("CORE_MIGRATION_TARGETS_NOT_DISTINCT");
    await aux.end();
    aux = undefined;
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pnr_enrichment_core_migration'))");
    await client.query("LOCK TABLE public.pnr_case_center_cases IN ACCESS EXCLUSIVE MODE");
    const prerequisites = (await client.query(`
      SELECT to_regnamespace('app_private') IS NOT NULL AS schema,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
          WHERE c.oid=to_regclass('public.pnr_case_center_cases') AND c.relkind='r'
            AND a.attname='case_id' AND a.atttypid='text'::regtype AND NOT a.attisdropped
            AND EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisunique
              AND i.indisvalid AND i.indimmediate AND i.indnkeyatts=1
              AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indkey[0]=a.attnum)) AS cases,
        NOT EXISTS(SELECT 1 FROM pg_attribute a
          WHERE a.attrelid=to_regclass('public.pnr_case_center_cases')
            AND a.attname='atendimento_verified_contact' AND NOT a.attisdropped
            AND (a.atttypid<>'jsonb'::regtype OR a.attnotnull OR a.atthasdef
              OR a.attidentity<>'' OR a.attgenerated<>'')) AS contact`)).rows[0];
    if (!prerequisites.schema || !prerequisites.cases || !prerequisites.contact)
      throw new MigrationError("CORE_MIGRATION_PREREQUISITES_MISSING_OR_INCOMPATIBLE");
    await client.query(EXPECTED);
    for (const name of TABLES) {
      const exists = (await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`app_private.${name}`])).rows[0].present;
      if (exists) await client.query(`LOCK TABLE app_private.${name} IN ACCESS EXCLUSIVE MODE`);
      await compatible(client, name);
    }
    await compatibleIndex(client);
    await client.query(`CREATE TABLE IF NOT EXISTS app_private.${LEDGER} (
      name text PRIMARY KEY, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    ); ALTER TABLE app_private.${LEDGER} ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON app_private.${LEDGER} FROM PUBLIC;
    DO $$ DECLARE restricted_role text; BEGIN
      FOR restricted_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
        EXECUTE format('REVOKE ALL ON app_private.${LEDGER} FROM %I', restricted_role);
      END LOOP;
    END $$`);
    const previous = (await client.query(`SELECT name,sha256 FROM app_private.${LEDGER}`)).rows;
    if (previous.length > 1 || previous.some(row => row.name !== MIGRATION || row.sha256 !== sha256))
      throw new MigrationError("CORE_MIGRATION_CHECKSUM_MISMATCH");
    if (!previous.length) {
      await client.query(sql);
      await client.query(`INSERT INTO app_private.${LEDGER}(name,sha256) VALUES($1,$2)`, [MIGRATION, sha256]);
    }
    for (const name of TABLES) await compatible(client, name, true);
    await compatibleIndex(client, true);
    const contact = (await client.query(`SELECT EXISTS(SELECT 1 FROM pg_attribute
      WHERE attrelid='public.pnr_case_center_cases'::regclass AND attname='atendimento_verified_contact'
        AND atttypid='jsonb'::regtype AND NOT attisdropped) AS valid`)).rows[0].valid;
    if (!contact) throw new MigrationError("CORE_MIGRATION_EXISTING_OBJECT_INCOMPATIBLE");
    await client.query("COMMIT");
    transactionStarted = false;
    return { status: previous.length ? "already-applied" : "applied", migration: MIGRATION, sha256 };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    throw error instanceof MigrationError ? error : new MigrationError("CORE_MIGRATION_FAILED");
  } finally {
    if (aux) await aux.end().catch(() => {});
    if (client) await client.end().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runCoreMigration(process.argv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
