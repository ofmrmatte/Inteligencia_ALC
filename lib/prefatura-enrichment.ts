import { normalizeText } from "@/lib/normalize";
import type { Operation, PrefaturaQualityStatus, PrefaturaRecord } from "@/lib/types";

export interface DriverMasterRecord {
  driverId: string;
  driverIdReliable?: boolean;
  name: string;
  baseKey: string;
  baseName: string;
  sigla: string;
}

export interface PrefaturaHistoryRecord {
  id?: string;
  shipmentId: string;
  routeId: string;
  period: string;
  routeDate: string | null;
  operation: Operation;
  driverId: string;
  driverName: string;
  baseLabel: string;
  baseName: string;
  baseKey: string;
  sigla: string;
  plate?: string;
  description?: string;
  qualityStatus?: PrefaturaQualityStatus;
}

export interface PrefaturaEnrichmentContext {
  drivers: DriverMasterRecord[];
  history: PrefaturaHistoryRecord[];
}

const EMPTY_MARKERS = new Set(["NULL", "N/A", "NA", "NAN", "NONE", "UNDEFINED", "-"]);

function isBlank(value: unknown) {
  const text = String(value ?? "").trim();
  return !text || EMPTY_MARKERS.has(normalizeText(text));
}

function firstFilled(...values: Array<string | null | undefined>) {
  return values.find((value) => !isBlank(value)) ?? "";
}

function driverKey(value: string) {
  return String(value ?? "").trim().replace(/\.0$/, "");
}

function addUnique<T>(map: Map<string, T[]>, key: string, value: T) {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function consistentCandidate(candidates: PrefaturaHistoryRecord[]) {
  if (candidates.length === 0) return null;
  const values = {
    driverId: new Set(candidates.map((row) => driverKey(row.driverId)).filter(Boolean)),
    driverName: new Set(candidates.map((row) => normalizeText(row.driverName)).filter(Boolean)),
    baseKey: new Set(candidates.map((row) => normalizeText(row.baseKey)).filter(Boolean)),
    sigla: new Set(candidates.map((row) => normalizeText(row.sigla)).filter(Boolean)),
  };
  if ([...Object.values(values)].some((set) => set.size > 1)) return null;
  return candidates.find((row) => row.baseKey || row.driverId || row.driverName) ?? null;
}

function fill(row: PrefaturaRecord, field: keyof PrefaturaRecord, value: string | null | undefined) {
  if (!isBlank(row[field]) || isBlank(value)) return false;
  (row as unknown as Record<string, unknown>)[field] = value;
  return true;
}

function setSource(row: PrefaturaRecord, key: "baseSource" | "driverNameSource" | "driverIdSource", source: string) {
  if (!row[key]) row[key] = source;
}

function applyDriver(row: PrefaturaRecord, driver: DriverMasterRecord | null, source: string) {
  if (!driver) return false;
  let changed = false;
  if (driver.driverIdReliable !== false && fill(row, "driverId", driver.driverId)) {
    setSource(row, "driverIdSource", source);
    changed = true;
  }
  if (fill(row, "driverName", driver.name)) {
    setSource(row, "driverNameSource", source);
    changed = true;
  }
  if (fill(row, "baseName", driver.baseName || driver.baseKey)) {
    setSource(row, "baseSource", source);
    changed = true;
  }
  if (fill(row, "baseKey", driver.baseKey)) {
    setSource(row, "baseSource", source);
    changed = true;
  }
  if (fill(row, "sigla", driver.sigla)) changed = true;
  if (fill(row, "baseLabel", firstFilled(driver.baseName, driver.baseKey))) changed = true;
  return changed;
}

function applyHistory(row: PrefaturaRecord, history: PrefaturaHistoryRecord | null, source: string) {
  if (!history) return false;
  let changed = false;
  if (fill(row, "driverId", history.driverId)) {
    setSource(row, "driverIdSource", source);
    changed = true;
  }
  if (fill(row, "driverName", history.driverName)) {
    setSource(row, "driverNameSource", source);
    changed = true;
  }
  for (const field of ["baseLabel", "baseName", "baseKey", "sigla", "plate", "description"] as const) {
    if (fill(row, field, history[field])) {
      if (field === "baseLabel" || field === "baseName" || field === "baseKey") setSource(row, "baseSource", source);
      changed = true;
    }
  }
  return changed;
}

function classify(row: PrefaturaRecord, changed: boolean): PrefaturaQualityStatus {
  const hasBase = !isBlank(row.baseKey) || !isBlank(row.sigla);
  const hasDriver = !isBlank(row.driverId) || !isBlank(row.driverName);
  if (!hasBase || !hasDriver) return "PENDING";
  return changed ? "ENRICHED" : "COMPLETE";
}

export function prefaturaIdentityKey(row: Pick<PrefaturaRecord, "shipmentId" | "operation" | "routeId" | "period">) {
  const shipment = driverKey(row.shipmentId);
  if (!shipment) return "";
  return [shipment, row.operation || "", driverKey(row.routeId), normalizeText(row.period)].join("|");
}

export function enrichPrefaturaRows(rows: PrefaturaRecord[], context: PrefaturaEnrichmentContext) {
  const driversById = new Map<string, DriverMasterRecord>();
  const driversByName = new Map<string, DriverMasterRecord>();
  const nameCounts = new Map<string, number>();
  for (const driver of context.drivers) {
    const id = driverKey(driver.driverId);
    const name = normalizeText(driver.name);
    if (id && !driversById.has(id)) driversById.set(id, driver);
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  for (const driver of context.drivers) {
    const name = normalizeText(driver.name);
    if (name && nameCounts.get(name) === 1) driversByName.set(name, driver);
  }

  const historyByShipment = new Map<string, PrefaturaHistoryRecord[]>();
  const historyByRouteDriver = new Map<string, PrefaturaHistoryRecord[]>();
  const historyByShipmentRoute = new Map<string, PrefaturaHistoryRecord[]>();
  const historyByRouteNameDate = new Map<string, PrefaturaHistoryRecord[]>();
  for (const item of context.history) {
    addUnique(historyByShipment, driverKey(item.shipmentId), item);
    addUnique(historyByRouteDriver, `${driverKey(item.routeId)}|${driverKey(item.driverId)}`, item);
    addUnique(historyByShipmentRoute, `${driverKey(item.shipmentId)}|${driverKey(item.routeId)}`, item);
    addUnique(historyByRouteNameDate, `${driverKey(item.routeId)}|${normalizeText(item.driverName)}|${item.routeDate ?? ""}`, item);
  }

  return rows.map((input) => {
    const row: PrefaturaRecord = { ...input };
    if (!row.driverIdSource && !isBlank(row.driverId)) row.driverIdSource = "UPLOAD";
    if (!row.driverNameSource && !isBlank(row.driverName)) row.driverNameSource = "UPLOAD";
    if (!row.baseSource && (!isBlank(row.baseKey) || !isBlank(row.sigla))) row.baseSource = "UPLOAD";

    let changed = false;
    const byId = driversById.get(driverKey(row.driverId)) ?? null;
    if (byId) changed = applyDriver(row, byId, "DRIVER_MASTER") || changed;

    const byName = driversByName.get(normalizeText(row.driverName)) ?? null;
    if (!byId && byName) changed = applyDriver(row, byName, "DRIVER_MASTER_NAME") || changed;

    const historyCandidate =
      consistentCandidate(historyByShipment.get(driverKey(row.shipmentId)) ?? []) ??
      consistentCandidate(historyByRouteDriver.get(`${driverKey(row.routeId)}|${driverKey(row.driverId)}`) ?? []) ??
      consistentCandidate(historyByShipmentRoute.get(`${driverKey(row.shipmentId)}|${driverKey(row.routeId)}`) ?? []) ??
      consistentCandidate(historyByRouteNameDate.get(`${driverKey(row.routeId)}|${normalizeText(row.driverName)}|${row.routeDate ?? ""}`) ?? []);
    if (historyCandidate) changed = applyHistory(row, historyCandidate, "HISTORICAL_MATCH") || changed;

    row.qualityStatus = classify(row, changed);
    row.enrichmentSource = changed ? row.enrichmentSource || "AUTO_ENRICHMENT" : row.enrichmentSource;
    return row;
  });
}

export function prefaturaMergePatch(existing: PrefaturaHistoryRecord, incoming: PrefaturaRecord) {
  const patch: Record<string, unknown> = {};
  const existingRecord = existing as unknown as Record<string, unknown>;
  const incomingRecord = incoming as unknown as Record<string, unknown>;
  const textFields: Array<[keyof PrefaturaHistoryRecord, string]> = [
    ["driverId", "driver_id"],
    ["driverName", "driver_name"],
    ["baseLabel", "base_label"],
    ["baseName", "base_name"],
    ["baseKey", "base_key"],
    ["sigla", "sigla"],
    ["plate", "plate"],
    ["description", "description"],
    ["routeId", "route_id"],
    ["period", "period"],
  ];
  for (const [field, column] of textFields) {
    const incomingValue = incomingRecord[field] as string;
    if (isBlank(existingRecord[field]) && !isBlank(incomingValue)) patch[column] = incomingValue;
  }
  if (!existing.routeDate && incoming.routeDate) patch.route_date = incoming.routeDate;
  if (Object.keys(patch).length > 0) {
    patch.quality_status = "UPDATED";
    patch.enrichment_source = incoming.enrichmentSource || "REUPLOAD";
    patch.enriched_at = new Date().toISOString();
    if (patch.base_key || patch.base_name || patch.base_label) patch.base_source = incoming.baseSource || "REUPLOAD";
    if (patch.driver_name) patch.driver_name_source = incoming.driverNameSource || "REUPLOAD";
    if (patch.driver_id) patch.driver_id_source = incoming.driverIdSource || "REUPLOAD";
  }
  return patch;
}
