import { NextResponse } from "next/server";
import { filterByAccessScope } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import { hasFullAccess, isUserRole, type AuthProfile } from "@/lib/auth";
import { fortnightFromDate, monthFromFortnight, normalizeFortnight } from "@/lib/competence";
import { duplicateFileImportError, findDuplicateFileHash } from "@/lib/import-dedupe";
import { normalizeText } from "@/lib/normalize";
import {
  enrichPrefaturaRows,
  prefaturaIdentityKey,
  prefaturaMergePatch,
  type DriverMasterRecord,
  type PrefaturaHistoryRecord,
} from "@/lib/prefatura-enrichment";
import { readPaged } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardData,
  DriverRecord,
  HierarchyRecord,
  ImportEntry,
  ParsedBatch,
  PnrRecord,
  PrefaturaRecord,
  RiskRecord,
  SourceKind,
} from "@/lib/types";
import { EMPTY_DATA } from "@/lib/types";

export const dynamic = "force-dynamic";

const IMPORT_BUCKET = "alc-imports";
const CHILD_TABLES = ["hierarchy_scopes", "prefatura_records", "pnr_records", "risk_lm_records", "driver_records"] as const;

interface UploadedFilePayload {
  batchId: string;
  originalName: string;
  storagePath: string;
  fileSize: number;
  fileHash: string;
  workbookCount: number;
}

interface PersistRequest {
  batches: ParsedBatch[];
  files: UploadedFilePayload[];
}

type DbRow = Record<string, unknown>;
type ServerClient = Awaited<ReturnType<typeof createClient>>;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toNumberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toIntegerValue(value: unknown) {
  return Math.trunc(toNumberValue(value));
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(toStringValue).filter(Boolean) : [];
}

function toDateString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sourceTrace(row: DbRow) {
  return {
    batchId: toStringValue(row.batch_id),
    sourceFile: toStringValue(row.source_file),
    sourceSheet: toStringValue(row.source_sheet),
    rowNumber: toIntegerValue(row.source_row),
  };
}

function rowFortnight(period: string | null | undefined, date: string | null) {
  const normalized = normalizeFortnight(period);
  return monthFromFortnight(normalized) ? normalized : fortnightFromDate(date);
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function batchFortnights(batch: ParsedBatch) {
  return uniqueSorted([
    ...batch.prefatura.map((row) => rowFortnight(row.period, row.routeDate)),
    ...batch.pnr.map((row) => rowFortnight(row.billingPeriod, row.caseDate)),
    ...batch.risk.map((row) => rowFortnight(undefined, row.failureDate)),
  ].filter((fortnight) => Boolean(fortnight && monthFromFortnight(fortnight))));
}

function isSourceKindArray(value: unknown): value is SourceKind[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function metadataEntry(row: DbRow): Partial<ImportEntry> {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const entry = (metadata as { entry?: unknown }).entry;
  return entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Partial<ImportEntry>) : {};
}

function mapImportEntry(row: DbRow): ImportEntry {
  const entry = metadataEntry(row);
  const issues = Array.isArray(entry.issues) ? entry.issues.map(toStringValue) : [];
  const kinds = isSourceKindArray(entry.kinds) ? entry.kinds : [];
  const status = entry.status === "com-alertas" || entry.status === "erro" || entry.status === "demonstração" ? entry.status : "concluído";
  return {
    id: toStringValue(entry.id || row.id),
    batchId: toStringValue(entry.batchId || row.id),
    name: toStringValue(entry.name || row.name),
    importedAt: toStringValue(entry.importedAt || row.finished_at || row.started_at || new Date().toISOString()),
    fortnight: toStringValue(entry.fortnight || row.fortnight),
    month: toStringValue(entry.month || row.month || row.competence),
    fortnights: toStringArray(row.fortnights || entry.fortnights),
    months: toStringArray(row.months || entry.months),
    analysisExcluded: Boolean(row.analysis_excluded || entry.analysisExcluded),
    duplicateOf: toStringValue(row.duplicate_of || entry.duplicateOf) || null,
    size: toNumberValue(entry.size),
    status,
    kinds,
    workbookCount: toIntegerValue(entry.workbookCount),
    rowCount: toIntegerValue(row.row_count || entry.rowCount),
    issues,
  };
}

function mapHierarchy(row: DbRow): HierarchyRecord {
  return {
    ...sourceTrace(row),
    coordinator: toStringValue(row.coordinator_name),
    supervisor: toStringValue(row.supervisor_name),
    sigla: toStringValue(row.sigla),
    base: toStringValue(row.base_name),
    baseKey: toStringValue(row.base_key),
  };
}

function mapPrefatura(row: DbRow): PrefaturaRecord {
  const operation = toStringValue(row.operation);
  return {
    ...sourceTrace(row),
    period: toStringValue(row.period),
    baseLabel: toStringValue(row.base_label),
    baseName: toStringValue(row.base_name),
    baseKey: toStringValue(row.base_key),
    sigla: toStringValue(row.sigla),
    driverId: toStringValue(row.driver_id),
    driverName: toStringValue(row.driver_name),
    plate: toStringValue(row.plate),
    description: toStringValue(row.description),
    routeDate: toDateString(row.route_date),
    shipmentId: toStringValue(row.shipment_id),
    routeId: toStringValue(row.route_id),
    value: toNumberValue(row.value),
    operation: operation === "XPT" || operation === "PNR" ? operation : "SVC",
    qualityStatus: toStringValue(row.quality_status) as PrefaturaRecord["qualityStatus"],
    enrichmentSource: toStringValue(row.enrichment_source),
    baseSource: toStringValue(row.base_source),
    driverNameSource: toStringValue(row.driver_name_source),
    driverIdSource: toStringValue(row.driver_id_source),
  };
}

function mapPnr(row: DbRow): PnrRecord {
  return {
    ...sourceTrace(row),
    caseDate: toDateString(row.case_date),
    status: toStringValue(row.status),
    billingPeriod: toStringValue(row.billing_period),
    shipmentId: toStringValue(row.shipment_id),
    products: toStringValue(row.products),
    purchaseValue: toNumberValue(row.purchase_value),
    carrier: toStringValue(row.carrier),
    originStation: toStringValue(row.origin_station),
    baseKey: toStringValue(row.base_key),
    sigla: toStringValue(row.sigla),
    routeId: toStringValue(row.route_id),
    driverId: toStringValue(row.driver_id),
    custom: toStringValue(row.custom),
  };
}

function mapRisk(row: DbRow): RiskRecord {
  return {
    ...sourceTrace(row),
    failureDate: toDateString(row.failure_date),
    shipmentId: toStringValue(row.shipment_id),
    itemDescription: toStringValue(row.item_description),
    driverId: toStringValue(row.driver_id),
    facilityId: toStringValue(row.facility_id),
    destinationType: toStringValue(row.destination_type),
    carrierName: toStringValue(row.carrier_name),
    failureReason: toStringValue(row.failure_reason),
    lastSubstatus: toStringValue(row.last_substatus),
    routeId: toStringValue(row.route_id),
    routeStatus: toStringValue(row.route_status),
    destinationFacilityId: toStringValue(row.destination_facility_id),
    vehicleType: toStringValue(row.vehicle_type),
    quantity: toIntegerValue(row.quantity),
    stoppedDays: toIntegerValue(row.stopped_days),
    gmvUsd: toNumberValue(row.gmv_usd),
    gmvBrl: toNumberValue(row.gmv_brl),
    baseKey: toStringValue(row.base_key),
    sigla: toStringValue(row.sigla),
  };
}

function mapDriver(row: DbRow): DriverRecord {
  return {
    ...sourceTrace(row),
    driverId: toStringValue(row.driver_id),
    name: toStringValue(row.name),
    experience: toStringValue(row.experience),
    incidents: toIntegerValue(row.incidents),
    lastUpdated: toDateString(row.last_updated),
    state: toStringValue(row.state),
    shipped: toIntegerValue(row.shipped),
    delivered: toIntegerValue(row.delivered),
    undelivered: toIntegerValue(row.undelivered),
    unvisited: toIntegerValue(row.unvisited),
    penalized: toIntegerValue(row.penalized),
    contradictoryPnr: toIntegerValue(row.contradictory_pnr),
    emptyBoxes: toIntegerValue(row.empty_boxes),
    lost: toIntegerValue(row.lost),
    stolen: toIntegerValue(row.stolen),
  };
}

async function requireProfile(supabase: ServerClient): Promise<AuthProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,global_access,base_scope,sigla_scope")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  const row = (profile ?? {}) as DbRow;
  const role = isUserRole(row.role) ? row.role : "coordinator";

  return {
    id: userData.user.id,
    email: toStringValue(row.email || userData.user.email),
    fullName: toStringValue(row.full_name || userData.user.email || "Usuário ALC"),
    role,
    globalAccess: Boolean(row.global_access),
    baseScope: toStringArray(row.base_scope),
    siglaScope: toStringArray(row.sigla_scope),
  };
}

async function readTable(supabase: ServerClient, table: string, select = "*", orderColumn = "created_at", pageSize = 1000) {
  return readPaged<DbRow>(async (offset, size) => {
    const { data, error, count } = await supabase
      .from(table)
      .select(select, { count: "exact" })
      .order(orderColumn, { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    return { rows: (data ?? []) as unknown as DbRow[], count: count ?? null };
  }, pageSize);
}

async function readImportedFiles(supabase: ServerClient, batchId: string | null) {
  return readPaged<DbRow>(async (offset, size) => {
    let query = supabase
      .from("imported_files")
      .select("storage_path", { count: "exact" })
      .order("id", { ascending: false });
    if (batchId) query = query.eq("batch_id", batchId);
    const { data, error, count } = await query.range(offset, offset + size - 1);
    if (error) throw new Error(`imported_files: ${error.message}`);
    return { rows: (data ?? []) as unknown as DbRow[], count: count ?? null };
  });
}

async function loadDashboardData(supabase: ServerClient, profile: AuthProfile): Promise<DashboardData> {
  const accessScope = await getUserAccessScope(profile);
  const [imports, hierarchy, prefatura, pnr, risk, drivers] = await Promise.all([
    readTable(supabase, "import_batches", "*", "started_at"),
    readTable(supabase, "hierarchy_scopes"),
    readTable(supabase, "prefatura_records"),
    readTable(supabase, "pnr_records"),
    readTable(supabase, "risk_lm_records"),
    readTable(supabase, "driver_records"),
  ]);

  const mappedImports = imports.map(mapImportEntry);
  const activeBatchIds = new Set(mappedImports.filter((entry) => !entry.analysisExcluded).map((entry) => entry.batchId));
  const hierarchyRows = hierarchy.filter((row) => activeBatchIds.has(toStringValue(row.batch_id))).map(mapHierarchy);
  const prefaturaRows = prefatura.filter((row) => activeBatchIds.has(toStringValue(row.batch_id))).map(mapPrefatura);
  const pnrRows = pnr.filter((row) => activeBatchIds.has(toStringValue(row.batch_id))).map(mapPnr);
  const riskRows = risk.filter((row) => activeBatchIds.has(toStringValue(row.batch_id))).map(mapRisk);

  const scopedHierarchy = filterByAccessScope(accessScope, hierarchyRows);
  const scopedPrefatura = filterByAccessScope(accessScope, prefaturaRows);
  const scopedPnr = filterByAccessScope(accessScope, pnrRows);
  const scopedRisk = filterByAccessScope(accessScope, riskRows);
  const visibleBatchIds = new Set([
    ...scopedHierarchy.map((row) => row.batchId),
    ...scopedPrefatura.map((row) => row.batchId),
    ...scopedPnr.map((row) => row.batchId),
    ...scopedRisk.map((row) => row.batchId),
  ]);
  const visibleDriverNames = new Set(scopedPrefatura.map((row) => normalizeText(row.driverName)).filter(Boolean));
  const visibleDriverIds = new Set([
    ...scopedPrefatura.map((row) => row.driverId),
    ...scopedPnr.map((row) => row.driverId),
    ...scopedRisk.map((row) => row.driverId),
  ].filter(Boolean));
  const driverRows = drivers.filter((row) => activeBatchIds.has(toStringValue(row.batch_id))).map(mapDriver);

  return {
    hierarchy: scopedHierarchy,
    prefatura: scopedPrefatura,
    pnr: scopedPnr,
    risk: scopedRisk,
    drivers: accessScope.fullAccess
      ? driverRows
      : driverRows.filter((row) => visibleDriverIds.has(row.driverId) || visibleDriverNames.has(normalizeText(row.name))),
    imports: accessScope.fullAccess ? mappedImports : mappedImports.filter((entry) => visibleBatchIds.has(entry.batchId)),
    isDemo: false,
  };
}

async function insertRows(supabase: ServerClient, table: string, rows: DbRow[]) {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    if (chunk.length === 0) continue;
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function traceColumns(row: { sourceFile: string; sourceSheet: string; rowNumber: number }) {
  return {
    source_file: row.sourceFile,
    source_sheet: row.sourceSheet,
    source_row: row.rowNumber,
  };
}

function normalizeDriverCode(value: string) {
  return toStringValue(value).trim().replace(/\.0$/, "");
}

function normalizeDriverNameKey(value: string) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, "");
}

function reliableOperationalDriverId(driverId: string, name: string) {
  const normalizedId = normalizeDriverCode(driverId);
  return /^\d{3,}$/.test(normalizedId) && normalizedId !== normalizeDriverNameKey(name);
}

function mapPrefaturaHistory(row: DbRow): PrefaturaHistoryRecord {
  const mapped = mapPrefatura(row);
  return {
    id: toStringValue(row.id),
    shipmentId: mapped.shipmentId,
    routeId: mapped.routeId,
    period: mapped.period,
    routeDate: mapped.routeDate,
    operation: mapped.operation,
    driverId: mapped.driverId,
    driverName: mapped.driverName,
    baseLabel: mapped.baseLabel,
    baseName: mapped.baseName,
    baseKey: mapped.baseKey,
    sigla: mapped.sigla,
    plate: mapped.plate,
    description: mapped.description,
    qualityStatus: mapped.qualityStatus,
  };
}

async function readRowsByIn(supabase: ServerClient, table: string, select: string, column: string, values: string[], excludeBatchId?: string) {
  const unique = uniqueSorted(values.map(normalizeDriverCode));
  const rows: DbRow[] = [];
  for (let index = 0; index < unique.length; index += 500) {
    const chunk = unique.slice(index, index + 500);
    if (chunk.length === 0) continue;
    let query = supabase.from(table).select(select).in(column, chunk);
    if (excludeBatchId) query = query.neq("batch_id", excludeBatchId);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as DbRow[]));
  }
  return rows;
}

async function loadDriverMaster(supabase: ServerClient): Promise<DriverMasterRecord[]> {
  const [bases, alcDrivers, driverRecords] = await Promise.all([
    readTable(supabase, "operational_bases", "base_key,base_name,sigla", "base_key"),
    readTable(supabase, "alc_drivers", "driver_code,full_name,base_key,sigla", "full_name"),
    readTable(supabase, "driver_records", "driver_id,name", "name"),
  ]);
  const baseNames = new Map(bases.map((row) => [toStringValue(row.base_key), { name: toStringValue(row.base_name), sigla: toStringValue(row.sigla) }]));
  const drivers = new Map<string, DriverMasterRecord>();
  for (const row of alcDrivers) {
    const driverId = normalizeDriverCode(toStringValue(row.driver_code));
    if (!driverId) continue;
    const baseKey = toStringValue(row.base_key);
    const base = baseNames.get(baseKey);
    drivers.set(driverId, {
      driverId,
      driverIdReliable: reliableOperationalDriverId(driverId, toStringValue(row.full_name)),
      name: toStringValue(row.full_name),
      baseKey,
      baseName: base?.name || baseKey,
      sigla: toStringValue(row.sigla) || base?.sigla || "",
    });
  }
  for (const row of driverRecords) {
    const driverId = normalizeDriverCode(toStringValue(row.driver_id));
    if (!driverId || drivers.has(driverId)) continue;
    drivers.set(driverId, { driverId, driverIdReliable: reliableOperationalDriverId(driverId, toStringValue(row.name)), name: toStringValue(row.name), baseKey: "", baseName: "", sigla: "" });
  }
  return [...drivers.values()];
}

async function loadPrefaturaHistory(supabase: ServerClient, batchId: string, rows: PrefaturaRecord[]) {
  const select = "id,batch_id,shipment_id,route_id,operation,period,route_date,base_label,base_name,base_key,sigla,driver_id,driver_name,plate,description,quality_status";
  const [byShipment, byRoute, byDriver] = await Promise.all([
    readRowsByIn(supabase, "prefatura_records", select, "shipment_id", rows.map((row) => row.shipmentId), batchId),
    readRowsByIn(supabase, "prefatura_records", select, "route_id", rows.map((row) => row.routeId), batchId),
    readRowsByIn(supabase, "prefatura_records", select, "driver_id", rows.map((row) => row.driverId), batchId),
  ]);
  const unique = new Map<string, DbRow>();
  for (const row of [...byShipment, ...byRoute, ...byDriver]) unique.set(toStringValue(row.id), row);
  return [...unique.values()].map(mapPrefaturaHistory);
}

function prefaturaInsertRow(batchId: string, row: PrefaturaRecord) {
  const rowFt = rowFortnight(row.period, row.routeDate);
  return {
    batch_id: batchId,
    shipment_id: row.shipmentId,
    route_id: row.routeId,
    operation: row.operation,
    period: row.period,
    fortnight: rowFt,
    month: monthFromFortnight(rowFt),
    route_date: row.routeDate,
    base_label: row.baseLabel,
    base_name: row.baseName,
    base_key: row.baseKey,
    sigla: row.sigla,
    driver_id: row.driverId,
    driver_name: row.driverName,
    plate: row.plate,
    description: row.description,
    value: row.value,
    quality_status: row.qualityStatus ?? "PENDING",
    enrichment_source: row.enrichmentSource || null,
    base_source: row.baseSource || null,
    driver_name_source: row.driverNameSource || null,
    driver_id_source: row.driverIdSource || null,
    enriched_at: row.enrichmentSource ? new Date().toISOString() : null,
    original_payload: row,
    ...traceColumns(row),
  };
}

function existingPrefaturaMatch(row: PrefaturaRecord, exact: Map<string, PrefaturaHistoryRecord>, byShipment: Map<string, PrefaturaHistoryRecord[]>) {
  const exactMatch = exact.get(prefaturaIdentityKey(row));
  if (exactMatch) return exactMatch;
  const candidates = (byShipment.get(normalizeDriverCode(row.shipmentId)) ?? []).filter((candidate) => {
    if (candidate.operation && row.operation && candidate.operation !== row.operation) return false;
    if (candidate.routeId && row.routeId && candidate.routeId !== row.routeId) return false;
    if (candidate.period && row.period && candidate.period !== row.period) return false;
    return true;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

async function persistPrefaturaRows(supabase: ServerClient, batchId: string, rows: PrefaturaRecord[]) {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const history = await loadPrefaturaHistory(supabase, batchId, rows);
  const exact = new Map(history.map((row) => [prefaturaIdentityKey(row), row]));
  const byShipment = new Map<string, PrefaturaHistoryRecord[]>();
  for (const row of history) {
    const key = normalizeDriverCode(row.shipmentId);
    if (!key) continue;
    byShipment.set(key, [...(byShipment.get(key) ?? []), row]);
  }

  const inserts: DbRow[] = [];
  let updated = 0;
  for (const row of rows) {
    const existing = existingPrefaturaMatch(row, exact, byShipment);
    if (!existing?.id) {
      inserts.push(prefaturaInsertRow(batchId, row));
      continue;
    }
    const patch = prefaturaMergePatch(existing, row);
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("prefatura_records").update(patch).eq("id", existing.id);
    if (error) throw new Error(`prefatura_records: ${error.message}`);
    updated += 1;
  }
  await insertRows(supabase, "prefatura_records", inserts);
  return { inserted: inserts.length, updated };
}

async function persistBatch(supabase: ServerClient, profile: AuthProfile, batch: ParsedBatch, files: UploadedFilePayload[]) {
  const batchId = batch.entry.batchId;
  const prefaturaHistory = await loadPrefaturaHistory(supabase, batchId, batch.prefatura);
  const prefaturaRows = enrichPrefaturaRows(batch.prefatura, {
    drivers: await loadDriverMaster(supabase),
    history: prefaturaHistory,
  });
  const fortnights = batchFortnights(batch);
  const months = uniqueSorted(fortnights.map(monthFromFortnight));
  const fortnight = fortnights.length === 1 ? fortnights[0] : null;
  const month = months.length === 1 ? months[0] : null;
  const fileHash = files.map((file) => file.fileHash).join(",");

  for (const table of CHILD_TABLES) {
    const { error } = await supabase.from(table).delete().eq("batch_id", batchId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  await supabase.from("imported_files").delete().eq("batch_id", batchId);
  await supabase.from("import_batches").delete().eq("id", batchId);

  const { error: batchError } = await supabase.from("import_batches").insert({
    id: batchId,
    imported_by: profile.id,
    name: batch.entry.name,
    module: batch.entry.kinds.join(",") || "painel",
    competence: month,
    fortnight,
    month,
    fortnights,
    months,
    analysis_excluded: false,
    duplicate_of: null,
    status: batch.entry.status,
    file_hash: fileHash || null,
    row_count: batch.entry.rowCount,
    valid_count: batch.entry.rowCount,
    persisted_count: batch.entry.rowCount,
    ignored_count: 0,
    error_count: batch.entry.issues.length,
    started_at: batch.entry.importedAt,
    finished_at: new Date().toISOString(),
    metadata: { entry: { ...batch.entry, fortnight, month, fortnights, months } },
  });
  if (batchError) throw new Error(`import_batches: ${batchError.message}`);

  await insertRows(
    supabase,
    "imported_files",
    files.map((file) => ({
      batch_id: batchId,
      original_name: file.originalName,
      storage_path: file.storagePath,
      file_size: file.fileSize,
      file_hash: file.fileHash,
      workbook_count: file.workbookCount,
    })),
  );

  await insertRows(
    supabase,
    "hierarchy_scopes",
    batch.hierarchy.map((row) => ({
      batch_id: batchId,
      coordinator_name: row.coordinator,
      supervisor_name: row.supervisor,
      sigla: row.sigla,
      base_name: row.base,
      base_key: row.baseKey,
      ...traceColumns(row),
    })),
  );

  await persistPrefaturaRows(supabase, batchId, prefaturaRows);

  await insertRows(
    supabase,
    "pnr_records",
    batch.pnr.map((row) => {
      const rowFt = rowFortnight(row.billingPeriod, row.caseDate);
      return {
        batch_id: batchId,
        shipment_id: row.shipmentId,
        case_date: row.caseDate,
        status: row.status,
        billing_period: row.billingPeriod,
        fortnight: rowFt,
        month: monthFromFortnight(rowFt),
        products: row.products,
        purchase_value: row.purchaseValue,
        carrier: row.carrier,
        origin_station: row.originStation,
        base_key: row.baseKey,
        sigla: row.sigla,
        route_id: row.routeId,
        driver_id: row.driverId,
        custom: row.custom,
        original_payload: row,
        ...traceColumns(row),
      };
    }),
  );

  await insertRows(
    supabase,
    "risk_lm_records",
    batch.risk.map((row) => {
      const rowFt = rowFortnight(undefined, row.failureDate);
      return {
        batch_id: batchId,
        shipment_id: row.shipmentId,
        failure_date: row.failureDate,
        fortnight: rowFt,
        month: monthFromFortnight(rowFt),
        item_description: row.itemDescription,
        driver_id: row.driverId,
        facility_id: row.facilityId,
        destination_type: row.destinationType,
        carrier_name: row.carrierName,
        failure_reason: row.failureReason,
        last_substatus: row.lastSubstatus,
        route_id: row.routeId,
        route_status: row.routeStatus,
        destination_facility_id: row.destinationFacilityId,
        vehicle_type: row.vehicleType,
        quantity: row.quantity,
        stopped_days: row.stoppedDays,
        gmv_usd: row.gmvUsd,
        gmv_brl: row.gmvBrl,
        base_key: row.baseKey,
        sigla: row.sigla,
        original_payload: row,
        ...traceColumns(row),
      };
    }),
  );

  await insertRows(
    supabase,
    "driver_records",
    batch.drivers.map((row) => ({
      batch_id: batchId,
      driver_id: row.driverId,
      name: row.name,
      experience: row.experience,
      incidents: row.incidents,
      last_updated: row.lastUpdated,
      state: row.state,
      shipped: row.shipped,
      delivered: row.delivered,
      undelivered: row.undelivered,
      unvisited: row.unvisited,
      penalized: row.penalized,
      contradictory_pnr: row.contradictoryPnr,
      empty_boxes: row.emptyBoxes,
      lost: row.lost,
      stolen: row.stolen,
      original_payload: row,
      ...traceColumns(row),
    })),
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    const profile = await requireProfile(supabase);
    return NextResponse.json(await loadDashboardData(supabase, profile));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar dados online.", 401);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const profile = await requireProfile(supabase);
    if (!hasFullAccess(profile)) return jsonError("Importação restrita a Diretor, ADM ou Desenvolvedor.", 403);

    const payload = (await request.json()) as Partial<PersistRequest>;
    const batches = Array.isArray(payload.batches) ? payload.batches : [];
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (batches.length === 0) return jsonError("Nenhum lote recebido para persistência.");

    for (const batch of batches) {
      const batchFiles = files.filter((file) => file.batchId === batch.entry.batchId);
      for (const file of batchFiles) {
        const { data: duplicate, error: duplicateError } = await supabase
          .from("imported_files")
          .select("batch_id,original_name,file_hash")
          .eq("file_hash", file.fileHash)
          .neq("batch_id", batch.entry.batchId)
          .limit(1)
          .maybeSingle();
        if (duplicateError) throw new Error(`imported_files: ${duplicateError.message}`);
        const duplicateFile = duplicate
          ? findDuplicateFileHash(
            { batchId: batch.entry.batchId, fileHash: file.fileHash },
            [{ batchId: toStringValue((duplicate as DbRow).batch_id), fileHash: toStringValue((duplicate as DbRow).file_hash) }],
          )
          : null;
        if (duplicateFile) throw new Error(duplicateFileImportError(file.originalName, duplicateFile.batchId));
      }
      await persistBatch(supabase, profile, batch, batchFiles);
    }

    return NextResponse.json(await loadDashboardData(supabase, profile));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao salvar dados online.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const profile = await requireProfile(supabase);
    if (!hasFullAccess(profile)) return jsonError("Exclusão restrita a Diretor, ADM ou Desenvolvedor.", 403);

    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId");
    const fileRows = await readImportedFiles(supabase, batchId);
    const paths = fileRows.map((row) => toStringValue(row.storage_path)).filter(Boolean);
    if (paths.length > 0) await supabase.storage.from(IMPORT_BUCKET).remove(paths);

    const deleteQuery = batchId
      ? supabase.from("import_batches").delete().eq("id", batchId)
      : supabase.from("import_batches").delete().gte("started_at", "1900-01-01");
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw new Error(`import_batches: ${deleteError.message}`);

    return NextResponse.json(batchId ? await loadDashboardData(supabase, profile) : EMPTY_DATA);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao excluir dados online.", 500);
  }
}
