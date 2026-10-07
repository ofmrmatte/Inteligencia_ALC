import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;

const required = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`[migration] missing ${name}`);
    process.exit(1);
  }
}

if (process.env.RAILWAY_MIGRATION_RUN !== "1") {
  console.log("[migration] RAILWAY_MIGRATION_RUN != 1; skipping");
  process.exit(0);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  ssl: false,
});

const PAGE_SIZE = 500;
const INSERT_CHUNK_SIZE = 50;

function qident(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

function normalizeIndex(sql) {
  return String(sql)
    .replace(/^CREATE INDEX /i, "CREATE INDEX IF NOT EXISTS ")
    .replace(/^CREATE UNIQUE INDEX /i, "CREATE UNIQUE INDEX IF NOT EXISTS ");
}

function normalizeTableDdl(meta) {
  let ddl = String(meta.ddl);
  if (meta.table === "operational_bases") {
    ddl = ddl.replace(/id text DEFAULT base_key/g, "id text");
  }
  return ddl;
}

async function rpc(name) {
  const { data, error } = await supabase.rpc(name);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function sourceCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: source count failed: ${error.message}`);
  return Number(count || 0);
}

async function readPage(table, pk, offset) {
  let query = supabase.from(table).select("*");
  for (const column of pk) query = query.order(column, { ascending: true });
  const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(`${table}: source page ${offset}: ${error.message}`);
  return data || [];
}

async function upsertRows(client, table, pk, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map(qident).join(", ");
  const conflict = pk.length ? ` ON CONFLICT (${pk.map(qident).join(", ")}) ` : "";
  const updateColumns = columns.filter((column) => !pk.includes(column));
  const action = !pk.length
    ? ""
    : updateColumns.length
      ? "DO UPDATE SET " + updateColumns.map((column) => `${qident(column)} = EXCLUDED.${qident(column)}`).join(", ")
      : "DO NOTHING";

  for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + INSERT_CHUNK_SIZE);
    const values = [];
    const groups = chunk.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const sql = `INSERT INTO ${qident(table)} (${quotedColumns}) VALUES ${groups.join(", ")}${conflict}${action}`;
    await client.query(sql, values);
  }
}

async function copyTable(client, meta, pass) {
  const table = meta.table;
  const pk = Array.isArray(meta.pk) ? meta.pk : [];
  const expected = await sourceCount(table);
  let copied = 0;

  for (let offset = 0; offset < expected; offset += PAGE_SIZE) {
    const rows = await readPage(table, pk, offset);
    if (!rows.length) break;
    await upsertRows(client, table, pk, rows);
    copied += rows.length;
    if (copied % 5000 === 0 || copied === expected) {
      console.log(`[migration] pass ${pass} ${table}: ${copied}/${expected}`);
    }
  }

  return expected;
}

async function targetCount(client, table) {
  const result = await client.query(`SELECT count(*)::bigint AS count FROM ${qident(table)}`);
  return Number(result.rows[0]?.count || 0);
}

async function installRevisionTriggers(client) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS app_private;

    CREATE OR REPLACE FUNCTION app_private.sync_operational_base_id()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $
    BEGIN
      IF NEW.id IS NULL OR btrim(NEW.id) = '' THEN
        NEW.id := NEW.base_key;
      END IF;
      RETURN NEW;
    END;
    $;

    DROP TRIGGER IF EXISTS operational_bases_sync_id ON public.operational_bases;
    CREATE TRIGGER operational_bases_sync_id
    BEFORE INSERT OR UPDATE OF base_key, id ON public.operational_bases
    FOR EACH ROW EXECUTE FUNCTION app_private.sync_operational_base_id();

    CREATE OR REPLACE FUNCTION app_private.bump_global_data_revision()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO public.global_data_revision (id, revision, updated_at)
      VALUES (1, 1, now())
      ON CONFLICT (id) DO UPDATE
      SET revision = public.global_data_revision.revision + 1,
          updated_at = now();
      RETURN NULL;
    END;
    $$;
  `);

  const tables = [
    "discount_cases",
    "driver_records",
    "import_batches",
    "operational_units",
    "operational_xpts",
    "pnr_records",
    "prefatura_records",
    "risk_lm_records",
  ];

  for (const table of tables) {
    await client.query(`DROP TRIGGER IF EXISTS global_data_revision_trigger ON ${qident(table)}`);
    await client.query(`
      CREATE TRIGGER global_data_revision_trigger
      AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${qident(table)}
      FOR EACH STATEMENT EXECUTE FUNCTION app_private.bump_global_data_revision()
    `);
  }

  await client.query("DROP TRIGGER IF EXISTS global_data_revision_case_lifecycle_trigger ON pnr_case_center_cases");
  await client.query(`
    CREATE TRIGGER global_data_revision_case_lifecycle_trigger
    AFTER INSERT OR DELETE OR TRUNCATE ON pnr_case_center_cases
    FOR EACH STATEMENT EXECUTE FUNCTION app_private.bump_global_data_revision()
  `);
  await client.query("DROP TRIGGER IF EXISTS global_data_revision_case_update_trigger ON pnr_case_center_cases");
  await client.query(`
    CREATE TRIGGER global_data_revision_case_update_trigger
    AFTER UPDATE OF shipment_id, competence, case_date, route_id, route_code, svc_name,
      driver_id, driver_name, purchase_value, currency, main_status, sub_status,
      reviewed_status, case_type, route_status, priority, billing_period, claim_id,
      pre_invoice_number, base_key, sigla, case_capture_status, detail_sync_status,
      timeline_synced_at, latest_batch_id, raw_snapshot_jsonb
    ON pnr_case_center_cases
    FOR EACH STATEMENT EXECUTE FUNCTION app_private.bump_global_data_revision()
  `);
}

async function installExtras(client, extras) {
  for (const fn of extras.functions || []) {
    await client.query(fn.definition);
    console.log(`[migration] function ready: ${fn.name}`);
  }
  for (const view of extras.views || []) {
    await client.query(`CREATE OR REPLACE VIEW ${qident(view.name)} AS ${view.definition}`);
    console.log(`[migration] view ready: ${view.name}`);
  }
  await installRevisionTriggers(client);
}

async function main() {
  const schema = await rpc("railway_migration_schema");
  const extras = await rpc("railway_migration_extras");
  if (!Array.isArray(schema) || !schema.length) throw new Error("migration schema is empty");

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");

    for (const meta of schema) {
      await client.query(normalizeTableDdl(meta));
      console.log(`[migration] table ready: ${meta.table}`);
    }

    if (process.env.RAILWAY_MIGRATION_RESET === "1") {
      const tables = schema.map((meta) => qident(meta.table)).join(", ");
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      console.log("[migration] target tables reset");
    }

    const sourceCounts = new Map();
    for (const pass of [1, 2]) {
      for (const meta of schema) {
        const expected = await copyTable(client, meta, pass);
        sourceCounts.set(meta.table, expected);
      }
    }

    for (const meta of schema) {
      for (const rawIndex of meta.indexes || []) {
        try {
          await client.query(normalizeIndex(rawIndex));
        } catch (error) {
          throw new Error(`${meta.table}: index failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    await installExtras(client, extras);

    const failures = [];
    for (const meta of schema) {
      const source = await sourceCount(meta.table);
      const target = await targetCount(client, meta.table);
      console.log(`[migration] validate ${meta.table}: source=${source} target=${target}`);
      if (source !== target) failures.push({ table: meta.table, source, target });
    }

    const identity = schema.find((meta) => meta.table === "desvios_pnr_metrics_summary");
    if (identity) {
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('desvios_pnr_metrics_summary', 'id'),
          COALESCE((SELECT max(id) FROM desvios_pnr_metrics_summary), 1),
          true
        )
      `).catch(() => undefined);
    }

    const size = await client.query(`
      SELECT pg_database_size(current_database())::bigint AS bytes,
             pg_size_pretty(pg_database_size(current_database())) AS pretty
    `);
    console.log(`[migration] Railway database size: ${size.rows[0]?.pretty} (${size.rows[0]?.bytes} bytes)`);

    if (failures.length) {
      console.error("[migration] validation failures", JSON.stringify(failures));
      process.exitCode = 2;
      return;
    }

    console.log(`[migration] COMPLETE: ${schema.length} tables validated`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("[migration] FAILED:", error instanceof Error ? error.stack || error.message : error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
