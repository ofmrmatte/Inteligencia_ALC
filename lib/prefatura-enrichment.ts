import { normalizeText } from "@/lib/normalize";
import {
  DriverIdentityResolver,
  isBlankIdentityValue,
  isNumericOnlyName,
  normalizeDriverId,
  type DriverIdentityRecord,
  type DriverOperationalEvidence,
} from "@/lib/driver-identity-resolver";
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
  operationalEvidence?: DriverOperationalEvidence[];
}

function isBlank(value: unknown) {
  return isBlankIdentityValue(value);
}

function firstFilled(...values: Array<string | null | undefined>) {
  return values.find((value) => !isBlank(value)) ?? "";
}

function driverKey(value: string) {
  return normalizeDriverId(value);
}

function fill(row: PrefaturaRecord, field: keyof PrefaturaRecord, value: string | null | undefined) {
  if (!isBlank(row[field]) || isBlank(value)) return false;
  (row as unknown as Record<string, unknown>)[field] = value;
  return true;
}

function canReplaceDriverName(row: PrefaturaRecord, candidate: DriverIdentityRecord | null | undefined) {
  if (!candidate?.name || isBlank(candidate.name) || isNumericOnlyName(candidate.name)) return false;
  return isBlank(row.driverName) || isNumericOnlyName(row.driverName);
}

function setResolvedDriverName(row: PrefaturaRecord, candidate: DriverIdentityRecord | null | undefined, source: string) {
  if (!canReplaceDriverName(row, candidate)) return false;
  row.driverName = candidate?.name ?? "";
  row.driverNameSource = source;
  return true;
}

function canonicalDrivers(context: PrefaturaEnrichmentContext): DriverIdentityRecord[] {
  return context.drivers
    .filter((driver) => driver.driverIdReliable !== false)
    .map((driver) => ({
      driverId: driver.driverId,
      name: driver.name,
      baseKey: driver.baseKey,
      baseName: driver.baseName,
      sigla: driver.sigla,
      source: "driver_records",
    }));
}

function historyEvidence(context: PrefaturaEnrichmentContext): DriverOperationalEvidence[] {
  return context.history
    .filter((row) => !isBlank(row.driverId))
    .map((row) => ({
      driverId: row.driverId,
      driverName: row.driverName,
      baseKey: row.baseKey,
      sigla: row.sigla,
      shipmentId: row.shipmentId,
      routeId: row.routeId,
      plate: row.plate,
      activityDate: row.routeDate,
      source: "prefatura_records",
    }));
}

export function prefaturaIdentityKey(row: Pick<PrefaturaRecord, "shipmentId" | "operation" | "routeId" | "period">) {
  const shipment = driverKey(row.shipmentId);
  if (!shipment) return "";
  return [shipment, row.operation || "", driverKey(row.routeId), normalizeText(row.period)].join("|");
}

export function enrichPrefaturaRows(rows: PrefaturaRecord[], context: PrefaturaEnrichmentContext) {
  const resolver = new DriverIdentityResolver({
    drivers: canonicalDrivers(context),
    operationalEvidence: [...historyEvidence(context), ...(context.operationalEvidence ?? [])],
  });

  return rows.map((input) => {
    const row: PrefaturaRecord = { ...input };
    if (!row.driverNameSource && !isBlank(row.driverName)) row.driverNameSource = "import";
    if (!row.baseSource && (!isBlank(row.baseKey) || !isBlank(row.sigla))) row.baseSource = "import";
    const resolution = resolver.resolveDriverIdentity({
      driverId: row.driverId,
      driverName: row.driverName,
      baseKey: row.baseKey,
      sigla: row.sigla,
      shipmentId: row.shipmentId,
      routeId: row.routeId,
      plate: row.plate,
      routeDate: row.routeDate,
      source: "prefatura",
    });
    if (resolution.canAutoApply && resolution.driverId) {
      fill(row, "driverId", resolution.driverId);
      row.driverIdSource = resolution.matchedBy ?? "direct";
      row.enrichmentSource = resolution.source ?? "driver_database";
      setResolvedDriverName(row, resolution.candidate, "driver_records");
      if (fill(row, "baseKey", resolution.candidate?.baseKey)) {
        row.baseSource = "driver_database";
      }
      fill(row, "baseName", resolution.candidate?.baseName || resolution.candidate?.baseKey);
      fill(row, "baseLabel", firstFilled(resolution.candidate?.baseName, resolution.candidate?.baseKey));
      fill(row, "sigla", resolution.candidate?.sigla);
      row.qualityStatus = "resolved";
    } else {
      row.qualityStatus = resolution.qualityStatus as PrefaturaQualityStatus;
      if (resolution.conflicts.length) row.enrichmentSource = "manual_review";
    }
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
    patch.quality_status = patch.driver_id || existing.driverId ? "resolved" : "partial";
    patch.enrichment_source = incoming.enrichmentSource || "REUPLOAD";
    patch.enriched_at = new Date().toISOString();
    if (patch.base_key || patch.base_name || patch.base_label) patch.base_source = incoming.baseSource || "REUPLOAD";
    if (patch.driver_name) patch.driver_name_source = incoming.driverNameSource || "REUPLOAD";
    if (patch.driver_id) patch.driver_id_source = incoming.driverIdSource || "REUPLOAD";
  }
  return patch;
}
