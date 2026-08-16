import pg from "pg";
import { DriverIdentityResolver, isBlankIdentityValue, isNumericOnlyName, normalizeDriverId, normalizeDriverToken, type DriverIdentityRecord, type DriverOperationalEvidence, type DriverIdentityResolution } from "../lib/driver-identity-resolver";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL para executar o backfill.");
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
  return !isBlankIdentityValue(name) && !isNumericOnlyName(name) && name.trim() !== normalizeDriverId(driverId);
}

function reliableDriverId(driverId: string, source: string, name: string) {
  if (!driverId) return false;
  if (source !== "alc_drivers") return true;
  return /^\d{3,}$/.test(driverId) && driverId !== normalizeDriverToken(name);
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

function buildDrivers(rows: DbRow[]) {
  const byId = new Map<string, DriverIdentityRecord>();
  for (const row of rows) {
    const driverId = normalizeDriverId(row.driver_id ?? row.driver_code);
    const source = text(row.source);
    const name = text(row.name ?? row.full_name);
    if (!reliableDriverId(driverId, source, name)) continue;
    const current = byId.get(driverId);
    const next: DriverIdentityRecord = {
      driverId,
      name: reliableName(name, driverId) ? name : current?.name ?? driverId,
      baseKey: text(row.base_key) || current?.baseKey || "",
      baseName: text(row.base_name) || current?.baseName || text(row.base_key) || "",
      sigla: text(row.sigla) || current?.sigla || "",
      lastActivityAt: latest(current?.lastActivityAt, toDate(row.last_updated ?? row.last_operational_seen_at)),
      source: source || current?.source || "driver_records",
    };
    byId.set(driverId, next);
  }
  return [...byId.values()];
}

function buildEvidence(rows: DbRow[]): DriverOperationalEvidence[] {
  return rows.map((row) => ({
    driverId: normalizeDriverId(row.driver_id),
    driverName: text(row.driver_name),
    source: text(row.source),
    shipmentId: text(row.shipment_id),
    routeId: text(row.route_id),
    plate: text(row.plate),
    baseKey: text(row.base_key),
    sigla: text(row.sigla),
    activityDate: toDate(row.activity_date),
  })).filter((row) => row.driverId);
}

function canFillName(row: DbRow, candidate: DriverIdentityRecord | null | undefined) {
  return Boolean(candidate?.name && reliableName(candidate.name, candidate.driverId) && (isBlankIdentityValue(row.driver_name) || isNumericOnlyName(row.driver_name)));
}

function basePatch(row: DbRow, resolution: DriverIdentityResolution) {
  const candidate = resolution.candidate;
  const patch: DbRow = {};
  if (isBlankIdentityValue(row.base_key) && candidate?.baseKey) {
    patch.base_key = candidate.baseKey;
    patch.base_source = resolution.source;
  }
  if (isBlankIdentityValue(row.base_name) && (candidate?.baseName || candidate?.baseKey)) patch.base_name = candidate?.baseName || candidate?.baseKey;
  if (isBlankIdentityValue(row.base_label) && (candidate?.baseName || candidate?.baseKey)) patch.base_label = candidate?.baseName || candidate?.baseKey;
  if (isBlankIdentityValue(row.sigla) && candidate?.sigla) patch.sigla = candidate.sigla;
  return patch;
}

function resolutionPatch(row: DbRow, resolution: DriverIdentityResolution) {
  const patch: DbRow = {
    quality_status: resolution.qualityStatus,
    enrichment_source: resolution.source ?? (resolution.conflicts.length ? "manual_review" : text(row.enrichment_source) || null),
    enriched_at: new Date().toISOString(),
  };
  if (resolution.canAutoApply && resolution.driverId) {
    patch.driver_id = resolution.driverId;
    patch.driver_id_source = resolution.matchedBy;
    Object.assign(patch, basePatch(row, resolution));
    if (canFillName(row, resolution.candidate)) {
      patch.driver_name = resolution.candidate?.name;
      patch.driver_name_source = "driver_records";
    }
  }
  return patch;
}

function changedPatch(row: DbRow, patch: DbRow) {
  const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => key !== "enriched_at" && value !== undefined && text(row[key]) !== text(value)));
  if (Object.keys(changed).length > 0 && patch.enriched_at) changed.enriched_at = patch.enriched_at;
  return changed;
}

function addCount(stats: Record<string, number>, key: string) {
  stats[key] = (stats[key] ?? 0) + 1;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const before = (await client.query(`
    select
      count(*)::int as total,
      count(*) filter (where coalesce(driver_id, '') <> '')::int as with_driver_id,
      count(*) filter (where coalesce(driver_id, '') = '')::int as without_driver_id
    from public.prefatura_records
  `)).rows[0];

  const driverRows = (await client.query(`
    select driver_id, name, base_key, sigla, last_updated, 'driver_records' as source
    from public.driver_records
    union all
    select driver_code as driver_id, full_name as name, base_key, sigla, last_operational_seen_at as last_updated, 'alc_drivers' as source
    from public.alc_drivers
  `)).rows;
  const evidenceRows = (await client.query(`
    select 'pnr_records' as source, shipment_id, route_id, driver_id, null::text as driver_name, base_key, sigla, null::text as plate, case_date as activity_date
    from public.pnr_records
    where coalesce(driver_id, '') <> ''
    union all
    select 'risk_lm_records' as source, shipment_id, route_id, driver_id, null::text as driver_name, base_key, sigla, null::text as plate, failure_date as activity_date
    from public.risk_lm_records
    where coalesce(driver_id, '') <> ''
  `)).rows;
  const prefaturaRows = (await client.query(`
    select id, shipment_id, route_id, route_date, driver_id, driver_name, base_key, base_name, base_label, sigla, plate, quality_status, enrichment_source, driver_id_source, driver_name_source, base_source
    from public.prefatura_records
    where coalesce(driver_id, '') = ''
       or quality_status in ('partial', 'needs_review')
    order by id
  `)).rows;

  const resolver = new DriverIdentityResolver({ drivers: buildDrivers(driverRows), operationalEvidence: buildEvidence(evidenceRows) });
  const stats: Record<string, number> = {
    total: Number(before.total ?? prefaturaRows.length),
    scanned: prefaturaRows.length,
    resolved_direct: 0,
    resolved_name: 0,
    resolved_route: 0,
    resolved_shipment: 0,
    resolved_other: 0,
    conflict: 0,
    needs_review: 0,
    unresolved: 0,
    numeric_names_corrected: 0,
    base_recovered: 0,
  };
  const uniqueDriverIds = new Set<string>();
  const patches: Array<{ id: string; patch: DbRow; resolution: DriverIdentityResolution; row: DbRow }> = [];

  for (const row of prefaturaRows) {
    const resolution = resolver.resolveDriverIdentity({
      driverId: text(row.driver_id),
      driverName: text(row.driver_name),
      baseKey: text(row.base_key),
      sigla: text(row.sigla),
      shipmentId: text(row.shipment_id),
      routeId: text(row.route_id),
      plate: text(row.plate),
      routeDate: toDate(row.route_date),
      source: "prefatura_records",
    });
    if (resolution.driverId) uniqueDriverIds.add(resolution.driverId);
    if (resolution.canAutoApply) {
      if (resolution.matchedBy === "direct") addCount(stats, "resolved_direct");
      else if (resolution.matchedBy === "driver_records_name_exact") addCount(stats, "resolved_name");
      else if (resolution.matchedBy === "route_id_unique") addCount(stats, "resolved_route");
      else if (resolution.matchedBy === "shipment_id") addCount(stats, "resolved_shipment");
      else addCount(stats, "resolved_other");
    } else if (resolution.qualityStatus === "conflict") addCount(stats, "conflict");
    else {
      addCount(stats, "needs_review");
      addCount(stats, "unresolved");
    }
    const patch = changedPatch(row, resolutionPatch(row, resolution));
    if (isNumericOnlyName(row.driver_name) && patch.driver_name) addCount(stats, "numeric_names_corrected");
    if (isBlankIdentityValue(row.base_key) && patch.base_key) addCount(stats, "base_recovered");
    if (Object.keys(patch).length) patches.push({ id: text(row.id), patch, resolution, row });
  }

  const afterProjected = {
    resolved: stats.resolved_direct + stats.resolved_name + stats.resolved_route + stats.resolved_shipment + stats.resolved_other,
    needs_review: stats.needs_review,
    conflict: stats.conflict,
    unresolved: stats.unresolved,
  };

  if (apply) {
    await client.query("begin");
    for (let index = 0; index < patches.length; index += 500) {
      const chunk = patches.slice(index, index + 500).map((item) => ({ id: item.id, ...item.patch }));
      await client.query(`
        with patch as (
          select * from jsonb_to_recordset($1::jsonb) as x(
            id uuid,
            quality_status text,
            enrichment_source text,
            enriched_at timestamptz,
            driver_id text,
            driver_id_source text,
            base_key text,
            base_name text,
            base_label text,
            sigla text,
            base_source text,
            driver_name text,
            driver_name_source text
          )
        )
        update public.prefatura_records p
        set
          quality_status = coalesce(patch.quality_status, p.quality_status),
          enrichment_source = coalesce(patch.enrichment_source, p.enrichment_source),
          enriched_at = coalesce(patch.enriched_at, p.enriched_at),
          driver_id = coalesce(patch.driver_id, p.driver_id),
          driver_id_source = coalesce(patch.driver_id_source, p.driver_id_source),
          base_key = coalesce(patch.base_key, p.base_key),
          base_name = coalesce(patch.base_name, p.base_name),
          base_label = coalesce(patch.base_label, p.base_label),
          sigla = coalesce(patch.sigla, p.sigla),
          base_source = coalesce(patch.base_source, p.base_source),
          driver_name = coalesce(patch.driver_name, p.driver_name),
          driver_name_source = coalesce(patch.driver_name_source, p.driver_name_source)
        from patch
        where p.id = patch.id
      `, [JSON.stringify(chunk)]);
    }
    await client.query("commit");
  }

  console.log(JSON.stringify({
    dryRun,
    apply,
    before,
    projected: afterProjected,
    stats,
    uniqueDriverIds: uniqueDriverIds.size,
    updates: patches.length,
    activityWindowDays: activityWindowDays(),
    activeCutoffDate: cutoffDate(),
  }, null, 2));
} catch (error) {
  if (apply) await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
