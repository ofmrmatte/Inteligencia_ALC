import { normalizeText } from "@/lib/normalize";

export type DriverIdentityConfidence = "none" | "low" | "medium" | "high";
export type DriverIdentityQualityStatus = "resolved" | "partial" | "needs_review" | "conflict";

export interface DriverIdentityInput {
  driverId?: string | null;
  driverName?: string | null;
  baseKey?: string | null;
  sigla?: string | null;
  shipmentId?: string | null;
  routeId?: string | null;
  plate?: string | null;
  routeDate?: string | null;
  source?: string | null;
}

export interface DriverIdentityRecord {
  driverId: string;
  name: string;
  baseKey?: string | null;
  baseName?: string | null;
  sigla?: string | null;
  lastActivityAt?: string | null;
  source?: string | null;
}

export interface DriverOperationalEvidence {
  driverId: string;
  source: string;
  shipmentId?: string | null;
  routeId?: string | null;
  plate?: string | null;
  baseKey?: string | null;
  sigla?: string | null;
  activityDate?: string | null;
  driverName?: string | null;
}

export interface DriverIdentityResolution {
  driverId: string | null;
  confidence: DriverIdentityConfidence;
  source: string | null;
  matchedBy: string | null;
  conflicts: string[];
  canAutoApply: boolean;
  qualityStatus: DriverIdentityQualityStatus;
  candidate?: DriverIdentityRecord | null;
  evidence: Array<{ driverId: string; source: string; matchedBy: string }>;
}

export interface DriverIdentityContext {
  drivers: DriverIdentityRecord[];
  operationalEvidence: DriverOperationalEvidence[];
}

interface CandidateEvidence {
  driverId: string;
  source: string;
  matchedBy: string;
}

const EMPTY_MARKERS = new Set(["NULL", "N/A", "NA", "NAN", "NONE", "UNDEFINED", "-"]);

export function normalizeDriverId(value: unknown) {
  return String(value ?? "").trim().replace(/\.0$/, "");
}

export function normalizeDriverNameForMatch(value: unknown) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeDriverToken(value: unknown) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, "");
}

export function isBlankIdentityValue(value: unknown) {
  const normalized = normalizeText(value);
  return !normalized || EMPTY_MARKERS.has(normalized);
}

export function isNumericOnlyName(value: unknown) {
  const normalized = normalizeDriverToken(value);
  return Boolean(normalized && /^\d+$/.test(normalized));
}

function normalizeDate(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 10) : "";
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function addUnique(map: Map<string, Set<string>>, key: string, driverId: string) {
  if (!key || !driverId) return;
  const list = map.get(key) ?? new Set<string>();
  list.add(driverId);
  map.set(key, list);
}

function firstFilled(...values: Array<string | null | undefined>) {
  return values.find((value) => !isBlankIdentityValue(value)) ?? "";
}

function sameOperationalScope(input: DriverIdentityInput, candidate?: Pick<DriverIdentityRecord, "baseKey" | "sigla"> | null) {
  if (!candidate) return true;
  const inputBase = normalizeText(input.baseKey);
  const inputSigla = normalizeText(input.sigla);
  const candidateBase = normalizeText(candidate.baseKey);
  const candidateSigla = normalizeText(candidate.sigla);
  if (!inputBase && !inputSigla) return true;
  if (inputBase && candidateBase && inputBase === candidateBase) return true;
  if (inputSigla && candidateSigla && inputSigla === candidateSigla) return true;
  if (inputBase && candidateSigla && inputBase === candidateSigla) return true;
  if (inputSigla && candidateBase && inputSigla === candidateBase) return true;
  return !(candidateBase || candidateSigla);
}

function isReliableName(name: string, driverId: string) {
  const normalizedName = normalizeDriverToken(name);
  return Boolean(normalizedName && normalizedName !== normalizeDriverToken(driverId) && !/^\d+$/.test(normalizedName));
}

function chooseMostComplete(drivers: DriverIdentityRecord[]) {
  return [...drivers].sort((a, b) => {
    const aScore = [isReliableName(a.name, a.driverId), a.baseKey, a.sigla, a.lastActivityAt].filter(Boolean).length;
    const bScore = [isReliableName(b.name, b.driverId), b.baseKey, b.sigla, b.lastActivityAt].filter(Boolean).length;
    return bScore - aScore;
  })[0] ?? null;
}

export class DriverIdentityResolver {
  private readonly driversById = new Map<string, DriverIdentityRecord[]>();
  private readonly driverIdsByName = new Map<string, Set<string>>();
  private readonly routeDriverIds = new Map<string, Set<string>>();
  private readonly shipmentDriverIds = new Map<string, Set<string>>();
  private readonly plateDriverIds = new Map<string, Set<string>>();

  constructor(private readonly context: DriverIdentityContext) {
    for (const driver of context.drivers) {
      const driverId = normalizeDriverId(driver.driverId);
      if (!driverId) continue;
      this.driversById.set(driverId, [...(this.driversById.get(driverId) ?? []), { ...driver, driverId }]);
      const nameKey = normalizeDriverNameForMatch(driver.name);
      if (nameKey && !isNumericOnlyName(driver.name)) addUnique(this.driverIdsByName, nameKey, driverId);
    }
    for (const item of context.operationalEvidence) {
      const driverId = normalizeDriverId(item.driverId);
      if (!driverId) continue;
      addUnique(this.routeDriverIds, normalizeDriverToken(item.routeId), driverId);
      addUnique(this.shipmentDriverIds, normalizeDriverToken(item.shipmentId), driverId);
      const plate = normalizeDriverToken(item.plate);
      const plateDate = normalizeDate(item.activityDate);
      if (plate && plateDate) addUnique(this.plateDriverIds, `${plate}|${plateDate}`, driverId);
    }
  }

  resolveDriverIdentity(input: DriverIdentityInput): DriverIdentityResolution {
    const directId = normalizeDriverId(input.driverId);
    if (directId) {
      const candidate = chooseMostComplete(this.driversById.get(directId) ?? []);
      if (candidate) {
        return this.resolved(directId, "direct", "direct", "driver_database", [], candidate, [{ driverId: directId, matchedBy: "direct", source: "driver_database" }]);
      }
      return this.unresolved("needs_review", [`driver_id '${directId}' nao encontrado nas bases canonicas`]);
    }

    const evidences: CandidateEvidence[] = [];
    const conflicts: string[] = [];
    const nameKey = normalizeDriverNameForMatch(input.driverName);
    const hasUsableName = Boolean(nameKey && !isNumericOnlyName(input.driverName));
    const nameDriverIds = hasUsableName ? [...(this.driverIdsByName.get(nameKey) ?? new Set<string>())] : [];
    if (hasUsableName && nameDriverIds.length === 1) {
      evidences.push({ driverId: nameDriverIds[0], matchedBy: "driver_records_name_exact", source: "driver_database" });
    } else if (hasUsableName && nameDriverIds.length > 1) {
      const scoped = nameDriverIds.filter((driverId) => sameOperationalScope(input, chooseMostComplete(this.driversById.get(driverId) ?? [])));
      if (unique(scoped).length === 1) evidences.push({ driverId: scoped[0], matchedBy: "driver_records_name_exact", source: "driver_database" });
      else conflicts.push("nome exato possui mais de um driver_id possivel");
    }

    const routeIds = [...(this.routeDriverIds.get(normalizeDriverToken(input.routeId)) ?? new Set<string>())];
    if (routeIds.length === 1) evidences.push({ driverId: routeIds[0], matchedBy: "route_id_unique", source: "operational_cross_reference" });
    else if (routeIds.length > 1) conflicts.push("route_id possui mais de um driver_id operacional");

    const shipmentIds = [...(this.shipmentDriverIds.get(normalizeDriverToken(input.shipmentId)) ?? new Set<string>())];
    if (shipmentIds.length === 1) evidences.push({ driverId: shipmentIds[0], matchedBy: "shipment_id", source: "operational_cross_reference" });
    else if (shipmentIds.length > 1) conflicts.push("shipment_id possui mais de um driver_id operacional");

    const plateKey = `${normalizeDriverToken(input.plate)}|${normalizeDate(input.routeDate)}`;
    const plateIds = [...(this.plateDriverIds.get(plateKey) ?? new Set<string>())];
    if (plateIds.length === 1) evidences.push({ driverId: plateIds[0], matchedBy: "plate_date_unique", source: "operational_cross_reference" });
    else if (plateIds.length > 1) conflicts.push("placa possui mais de um driver_id no periodo operacional");

    const evidenceDriverIds = unique(evidences.map((item) => item.driverId));
    if (evidenceDriverIds.length > 1) {
      return this.unresolved("conflict", [...conflicts, "evidencias apontam para driver_ids diferentes"], evidences);
    }

    if (evidenceDriverIds.length === 1) {
      const driverId = evidenceDriverIds[0];
      const candidate = chooseMostComplete(this.driversById.get(driverId) ?? []) ?? this.recordFromEvidence(driverId);
      const evidence = evidences.find((item) => item.driverId === driverId);
      return this.resolved(driverId, evidence?.matchedBy ?? "unknown", evidence?.matchedBy ?? "unknown", evidence?.source ?? "driver_database", conflicts, candidate, evidences);
    }

    if (!hasUsableName && !isBlankIdentityValue(input.driverName)) conflicts.push("driver_name numerico ou invalido nao foi usado como ID");
    return this.unresolved(conflicts.length ? "needs_review" : "needs_review", conflicts, evidences);
  }

  private recordFromEvidence(driverId: string): DriverIdentityRecord | null {
    const evidence = this.context.operationalEvidence.find((item) => normalizeDriverId(item.driverId) === driverId);
    if (!evidence) return null;
    return {
      driverId,
      name: firstFilled(evidence.driverName, driverId),
      baseKey: evidence.baseKey,
      sigla: evidence.sigla,
      lastActivityAt: evidence.activityDate,
      source: evidence.source,
    };
  }

  private resolved(driverId: string, driverIdSource: string, matchedBy: string, source: string, conflicts: string[], candidate: DriverIdentityRecord | null, evidence: CandidateEvidence[]): DriverIdentityResolution {
    return {
      driverId,
      confidence: "high",
      source,
      matchedBy,
      conflicts,
      canAutoApply: conflicts.length === 0,
      qualityStatus: conflicts.length ? "conflict" : "resolved",
      candidate,
      evidence,
    };
  }

  private unresolved(qualityStatus: DriverIdentityQualityStatus, conflicts: string[], evidence: CandidateEvidence[] = []): DriverIdentityResolution {
    return {
      driverId: null,
      confidence: "none",
      source: null,
      matchedBy: null,
      conflicts,
      canAutoApply: false,
      qualityStatus,
      candidate: null,
      evidence,
    };
  }
}
