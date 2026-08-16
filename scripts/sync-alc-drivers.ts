import pg from "pg";
import { isBlankIdentityValue, isNumericOnlyName, normalizeDriverId } from "../lib/driver-identity-resolver";
import { driverPortalBaseAccessKey, portalEligibilityFromBase } from "../lib/driver-portal-base-access";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL para sincronizar alc_drivers.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
if (!dryRun && !apply) {
  console.error("Use --dry-run ou --apply.");
  process.exit(1);
}

type DbRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "";
}

function reliableName(name: string, driverId: string) {
  return !isBlankIdentityValue(name) && !isNumericOnlyName(name) && normalizeDriverId(name) !== normalizeDriverId(driverId);
}

function latest(a?: string | null, b?: string | null) {
  if (!a) return b ?? "";
  if (!b) return a;
  return a > b ? a : b;
}

function activityWindowDays() {
  const value = Number(process.env.DRIVER_ACTIVITY_WINDOW_DAYS ?? 90);
  return Number.isFinite(value) && value > 0 ? value : 90;
}

function cutoffDate() {
  return new Date(Date.now() - activityWindowDays() * 86400000).toISOString().slice(0, 10);
}

function operationalStatus(lastActivity: string) {
  if (!lastActivity) return "unknown";
  return lastActivity.slice(0, 10) >= cutoffDate() ? "active" : "inactive";
}

interface DriverAggregate {
  driver_code: string;
  full_name: string;
  base_key: string;
  sigla: string;
  last_operational_seen_at: string;
  source_updated_at: string;
  source_payload: DbRow;
}

function touch(map: Map<string, DriverAggregate>, row: DbRow, source: string, dateField: string, nameField: string) {
  const driverId = normalizeDriverId(row.driver_id);
  if (!driverId) return;
  const current = map.get(driverId);
  const activity = toDate(row[dateField]);
  const last = latest(current?.last_operational_seen_at, activity);
  const incomingName = text(row[nameField]);
  map.set(driverId, {
    driver_code: driverId,
    full_name: current && reliableName(current.full_name, driverId) ? current.full_name : reliableName(incomingName, driverId) ? incomingName : driverId,
    base_key: current?.base_key || text(row.base_key),
    sigla: current?.sigla || text(row.sigla),
    last_operational_seen_at: last,
    source_updated_at: latest(current?.source_updated_at, toDate(row.last_updated)),
    source_payload: { source, last_activity_source: source, activity_window_days: activityWindowDays() },
  });
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const [drivers, prefatura, pnr, risk, existing, baseAccess] = await Promise.all([
    client.query("select driver_id, name, base_key, sigla, last_updated, created_at from public.driver_records"),
    client.query("select driver_id, driver_name, base_key, sigla, route_date, created_at from public.prefatura_records where coalesce(driver_id, '') <> ''"),
    client.query("select driver_id, base_key, sigla, case_date, created_at from public.pnr_records where coalesce(driver_id, '') <> ''"),
    client.query("select driver_id, base_key, sigla, failure_date, created_at from public.risk_lm_records where coalesce(driver_id, '') <> ''"),
    client.query("select id, driver_code, portal_eligible, portal_status, status, base_key from public.alc_drivers"),
    client.query("select base_key, enabled from public.driver_portal_base_access"),
  ]);
  const byCode = new Map<string, DbRow>(existing.rows.map((row) => [text(row.driver_code), row]));
  const baseEnabled = new Map<string, boolean>(baseAccess.rows.map((row) => [text(row.base_key).trim().toUpperCase(), Boolean(row.enabled)]));
  const aggregate = new Map<string, DriverAggregate>();

  for (const row of drivers.rows) touch(aggregate, row, "driver_records", "last_updated", "name");
  for (const row of prefatura.rows) touch(aggregate, row, "prefatura_records", "route_date", "driver_name");
  for (const row of pnr.rows) touch(aggregate, row, "pnr_records", "case_date", "driver_id");
  for (const row of risk.rows) touch(aggregate, row, "risk_lm_records", "failure_date", "driver_id");

  const rows = [...aggregate.values()].map((row) => {
    const existingRow = byCode.get(row.driver_code);
    const portalStatus = text(existingRow?.portal_status) || "not_activated";
    return {
      ...row,
      operational_status: operationalStatus(row.last_operational_seen_at),
      portal_eligible: portalEligibilityFromBase(Boolean(baseEnabled.get(driverPortalBaseAccessKey(row.base_key, row.sigla))), portalStatus),
      portal_status: portalStatus,
      status: text(existingRow?.status) || "pending_activation",
    };
  });

  const stats = {
    total: rows.length,
    active: rows.filter((row) => row.operational_status === "active").length,
    inactive: rows.filter((row) => row.operational_status === "inactive").length,
    unknown: rows.filter((row) => row.operational_status === "unknown").length,
    candidates: rows.filter((row) => !row.portal_eligible && row.portal_status !== "blocked" && row.operational_status === "active" && reliableName(row.full_name, row.driver_code) && row.base_key && row.sigla).length,
  };

  if (apply) {
    await client.query("begin");
    const bases = [...new Map(rows.filter((row) => row.base_key).map((row) => [row.base_key, { base_key: row.base_key, base_name: row.base_key, sigla: row.sigla || row.base_key }])).values()];
    for (let index = 0; index < bases.length; index += 500) {
      const chunk = bases.slice(index, index + 500);
      await client.query(`
        insert into public.operational_bases(base_key, base_name, sigla, active, updated_at)
        select base_key, coalesce(nullif(base_name, ''), base_key), nullif(sigla, ''), true, now()
        from jsonb_to_recordset($1::jsonb) as x(base_key text, base_name text, sigla text)
        on conflict (base_key) do update set
          base_name = coalesce(public.operational_bases.base_name, excluded.base_name),
          sigla = coalesce(public.operational_bases.sigla, excluded.sigla),
          updated_at = now()
      `, [JSON.stringify(chunk)]);
    }
    for (let index = 0; index < rows.length; index += 500) {
      const chunk = rows.slice(index, index + 500);
      await client.query(`
        insert into public.alc_drivers(driver_code, full_name, base_key, sigla, status, portal_status, portal_eligible, operational_status, last_operational_seen_at, source_updated_at, source_payload, updated_at)
        select
          driver_code,
          full_name,
          nullif(base_key, ''),
          nullif(sigla, ''),
          status,
          portal_status,
          portal_eligible,
          operational_status,
          nullif(last_operational_seen_at, '')::timestamptz,
          nullif(source_updated_at, '')::timestamptz,
          source_payload,
          now()
        from jsonb_to_recordset($1::jsonb) as x(
          driver_code text,
          full_name text,
          base_key text,
          sigla text,
          status text,
          portal_status text,
          portal_eligible boolean,
          operational_status text,
          last_operational_seen_at text,
          source_updated_at text,
          source_payload jsonb
        )
        on conflict (driver_code) do update set
          full_name = excluded.full_name,
          base_key = excluded.base_key,
          sigla = excluded.sigla,
          portal_eligible = excluded.portal_eligible,
          operational_status = excluded.operational_status,
          last_operational_seen_at = excluded.last_operational_seen_at,
          source_updated_at = excluded.source_updated_at,
          source_payload = excluded.source_payload,
          updated_at = now()
      `, [JSON.stringify(chunk)]);
    }
    const revokedDriverIds = rows
      .filter((row) => !row.portal_eligible && Boolean(byCode.get(row.driver_code)?.portal_eligible))
      .map((row) => text(byCode.get(row.driver_code)?.id))
      .filter(Boolean);
    for (let index = 0; index < revokedDriverIds.length; index += 500) {
      const chunk = revokedDriverIds.slice(index, index + 500);
      await client.query(`
        update public.driver_portal_sessions
        set revoked_at = now()
        where revoked_at is null
          and driver_id = any($1::uuid[])
      `, [chunk]);
    }
    await client.query("commit");
  }

  const candidates = rows
    .filter((row) => !row.portal_eligible && row.portal_status !== "blocked" && row.operational_status === "active" && reliableName(row.full_name, row.driver_code) && row.base_key && row.sigla)
    .sort((a, b) => b.last_operational_seen_at.localeCompare(a.last_operational_seen_at))
    .slice(0, 10)
    .map((row) => ({ nome: row.full_name, driver_id: row.driver_code, base: row.base_key, sigla: row.sigla, ultima_atividade: row.last_operational_seen_at }));

  console.log(JSON.stringify({ dryRun, apply, activityWindowDays: activityWindowDays(), activeCutoffDate: cutoffDate(), stats, candidates }, null, 2));
} catch (error) {
  if (apply) await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
