import { normalizeText } from "@/lib/normalize";
import type { DashboardData, HierarchyRecord, PnrRecord, PrefaturaRecord, RiskRecord } from "@/lib/types";

export interface OperationalUnit {
  unitKey: string;
  sigla: string;
  baseName: string;
  baseKey: string;
  xptCode: string;
  coordinator: string;
  supervisors: string[];
  active: boolean;
}

export interface DriverUnitMapping {
  driverId: string;
  unitKey: string;
}

export interface OperationalDirectoryPayload {
  units: OperationalUnit[];
  driverMappings: DriverUnitMapping[];
  ambiguousSiglas: string[];
  ambiguousBaseKeys: string[];
  fullAccess: boolean;
}

function key(value: unknown) {
  return normalizeText(value);
}

function pairKey(sigla: string, baseKey: string) {
  const left = key(sigla);
  const right = key(baseKey);
  return left && right ? `${left}|${right}` : "";
}

function label(unit: OperationalUnit) {
  return `${unit.sigla} - ${unit.baseName}`;
}

function buildDirectory(payload: OperationalDirectoryPayload) {
  const activeUnits = payload.units.filter((unit) => unit.active !== false);
  const byUnit = new Map(activeUnits.map((unit) => [key(unit.unitKey), unit]));
  const byPair = new Map(activeUnits.map((unit) => [pairKey(unit.sigla, unit.baseKey), unit]));
  const bySigla = new Map<string, OperationalUnit[]>();
  const byBase = new Map<string, OperationalUnit[]>();

  for (const unit of activeUnits) {
    const sigla = key(unit.sigla);
    const base = key(unit.baseKey);
    bySigla.set(sigla, [...(bySigla.get(sigla) ?? []), unit]);
    byBase.set(base, [...(byBase.get(base) ?? []), unit]);
  }

  const ambiguousSiglas = new Set(payload.ambiguousSiglas.map(key));
  const ambiguousBaseKeys = new Set(payload.ambiguousBaseKeys.map(key));
  const driverUnit = new Map(
    payload.driverMappings
      .map((item) => [String(item.driverId || "").trim(), byUnit.get(key(item.unitKey))] as const)
      .filter((entry): entry is readonly [string, OperationalUnit] => Boolean(entry[0] && entry[1])),
  );

  const fromExplicit = (sigla: string, baseKey: string, unitKey?: string) => {
    if (unitKey) {
      const exactUnit = byUnit.get(key(unitKey));
      if (exactUnit) return exactUnit;
    }
    const siglaKey = key(sigla);
    const base = key(baseKey);
    if (siglaKey && base && siglaKey !== base) {
      const exact = byPair.get(pairKey(siglaKey, base));
      if (exact) return exact;
    }
    if (base && !ambiguousBaseKeys.has(base)) {
      const matches = byBase.get(base) ?? [];
      if (matches.length === 1) return matches[0];
    }
    return null;
  };

  const fromSigla = (sigla: string) => {
    const siglaKey = key(sigla);
    if (!siglaKey || ambiguousSiglas.has(siglaKey)) return null;
    const matches = bySigla.get(siglaKey) ?? [];
    return matches.length === 1 ? matches[0] : null;
  };

  const fromSourceSigla = (sigla: string, driverId: string, inferredDrivers: Map<string, OperationalUnit>) => {
    const siglaKey = key(sigla);
    if (!siglaKey) return inferredDrivers.get(driverId) ?? null;
    const matches = bySigla.get(siglaKey) ?? [];
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const mapped = inferredDrivers.get(driverId);
      return mapped && key(mapped.sigla) === siglaKey ? mapped : null;
    }
    // Quando a planilha informou uma estação/facility que não existe no
    // cadastro mestre, ela fica pendente. Não trocamos por outra SVC.
    return null;
  };

  return { activeUnits, driverUnit, fromExplicit, fromSigla, fromSourceSigla };
}

function hierarchyRows(units: OperationalUnit[]): HierarchyRecord[] {
  return units.flatMap((unit) => {
    const supervisors = unit.supervisors.length ? unit.supervisors : [""];
    return supervisors.map((supervisor, index) => ({
      batchId: "operational-directory",
      sourceFile: "Cadastro de bases",
      sourceSheet: "Hierarquia operacional",
      rowNumber: index + 1,
      coordinator: unit.coordinator,
      supervisor,
      sigla: unit.sigla,
      base: unit.baseName,
      baseKey: unit.baseKey,
      unitKey: unit.unitKey,
      xptCode: unit.xptCode,
    }));
  });
}

function enrichPrefatura(row: PrefaturaRecord, unit: OperationalUnit): PrefaturaRecord {
  return {
    ...row,
    unitKey: unit.unitKey,
    xptCode: unit.xptCode,
    sigla: unit.sigla,
    baseKey: unit.baseKey,
    baseName: unit.baseName,
    baseLabel: label(unit),
  };
}

function enrichPnr(row: PnrRecord, unit: OperationalUnit): PnrRecord {
  return {
    ...row,
    unitKey: unit.unitKey,
    xptCode: unit.xptCode,
    sigla: unit.sigla,
    baseKey: unit.baseKey,
    baseName: unit.baseName,
    originStation: label(unit),
  };
}

function enrichRisk(row: RiskRecord, unit: OperationalUnit): RiskRecord {
  return {
    ...row,
    unitKey: unit.unitKey,
    xptCode: unit.xptCode,
    sigla: unit.sigla,
    baseKey: unit.baseKey,
    baseName: unit.baseName,
    facilityId: label(unit),
  };
}

export function applyOperationalDirectory(data: DashboardData, payload: OperationalDirectoryPayload): DashboardData {
  if (!payload.units.length) return data;
  const directory = buildDirectory(payload);

  const inferredDrivers = new Map(directory.driverUnit);
  for (const row of data.prefatura) {
    const unit = directory.fromExplicit(row.sigla, row.baseKey, row.unitKey) ?? directory.fromSigla(row.sigla);
    if (unit && row.driverId && !inferredDrivers.has(row.driverId)) inferredDrivers.set(row.driverId, unit);
  }

  const resolvePrefatura = (row: PrefaturaRecord) => {
    const explicit = directory.fromExplicit(row.sigla, row.baseKey, row.unitKey);
    if (explicit) return explicit;
    const sourceSigla = key(row.sigla);
    if (sourceSigla) return directory.fromSourceSigla(sourceSigla, row.driverId, inferredDrivers);
    return inferredDrivers.get(row.driverId) ?? null;
  };

  const resolvePnr = (row: PnrRecord) => {
    const explicit = directory.fromExplicit(row.sigla, row.baseKey, row.unitKey);
    if (explicit) return explicit;
    const sourceStation = key(row.originStation);
    if (sourceStation) return directory.fromSourceSigla(sourceStation, row.driverId, inferredDrivers);
    return directory.fromSourceSigla(row.sigla, row.driverId, inferredDrivers);
  };

  const resolveRisk = (row: RiskRecord) => {
    const explicit = directory.fromExplicit(row.sigla, row.baseKey, row.unitKey);
    if (explicit) return explicit;
    const sourceStation = key(row.facilityId);
    if (sourceStation) return directory.fromSourceSigla(sourceStation, row.driverId, inferredDrivers);
    return directory.fromSourceSigla(row.sigla, row.driverId, inferredDrivers);
  };

  const prefatura = data.prefatura.flatMap((row) => {
    const unit = resolvePrefatura(row);
    if (!unit) return payload.fullAccess ? [row] : [];
    return [enrichPrefatura(row, unit)];
  });

  const pnr = data.pnr.flatMap((row) => {
    const unit = resolvePnr(row);
    if (!unit) return payload.fullAccess ? [row] : [];
    return [enrichPnr(row, unit)];
  });

  const risk = data.risk.flatMap((row) => {
    const unit = resolveRisk(row);
    if (!unit) return payload.fullAccess ? [row] : [];
    return [enrichRisk(row, unit)];
  });

  return {
    ...data,
    hierarchy: hierarchyRows(directory.activeUnits),
    prefatura,
    pnr,
    risk,
  };
}
