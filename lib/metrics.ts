import { normalizeText } from "@/lib/normalize";
import type {
  DashboardData,
  DashboardFilters,
  DriverRecord,
  HierarchyRecord,
  PnrRecord,
  PrefaturaRecord,
  RiskRecord,
} from "@/lib/types";

export interface ScopedData {
  hierarchy: HierarchyRecord[];
  prefatura: PrefaturaRecord[];
  pnr: PnrRecord[];
  risk: RiskRecord[];
  drivers: DriverRecord[];
}

export function fortnightFromDate(date: string | null) {
  if (!date) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${Number(day) <= 15 ? "01" : "02"}Q${month}${year}`;
}

export function normalizeFortnight(value: string | null | undefined) {
  const normalized = normalizeText(value ?? "").replace(/\s+/g, "");
  if (!normalized) return "";
  const yearFirstMatch = /(\d{4})(\d{2})Q?([12])/.exec(normalized);
  if (yearFirstMatch) return `0${yearFirstMatch[3]}Q${yearFirstMatch[2]}${yearFirstMatch[1]}`;
  const compactMatch = /0?([12])Q?(\d{2})(\d{4})/.exec(normalized);
  if (compactMatch) return `0${compactMatch[1]}Q${compactMatch[2]}${compactMatch[3]}`;
  return normalized;
}

export function monthFromFortnight(value: string) {
  const match = /^(0[12])Q(\d{2})(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}` : "";
}

export function formatMonthLabel(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));
}

export function formatFortnightLabel(value: string) {
  if (value === "Q1") return "Quinzena 1";
  if (value === "Q2") return "Quinzena 2";
  return value;
}

function rowFortnight(period: string | null | undefined, date: string | null) {
  return normalizeFortnight(period) || fortnightFromDate(date);
}

function inFortnight(period: string | null | undefined, date: string | null, filters: DashboardFilters) {
  const fortnight = rowFortnight(period, date);
  if (filters.month !== "Todos" && monthFromFortnight(fortnight) !== filters.month) return false;
  if (filters.fortnight === "Todas") return true;
  return fortnight.startsWith(filters.fortnight === "Q1" ? "01Q" : "02Q");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function uniqueByShipment<T extends { shipmentId: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!record.shipmentId || seen.has(record.shipmentId)) return false;
    seen.add(record.shipmentId);
    return true;
  });
}

function matchesScope(record: { baseKey: string; sigla: string }, allowedBases: Set<string>, allowedSiglas: Set<string>, scopeActive: boolean) {
  if (!scopeActive) return true;
  return allowedBases.has(normalizeText(record.baseKey)) || allowedSiglas.has(normalizeText(record.sigla));
}

function driverIdMap(drivers: DriverRecord[]) {
  return new Map(drivers.map((driver) => [normalizeText(driver.name), driver.driverId]));
}

export function scopeData(data: DashboardData, filters: DashboardFilters): ScopedData {
  const hierarchy = data.hierarchy.filter((row) => {
    if (filters.coordinator !== "Todos" && row.coordinator !== filters.coordinator) return false;
    if (filters.sigla !== "Todas" && row.sigla !== filters.sigla) return false;
    if (filters.base !== "Todas" && row.base !== filters.base) return false;
    if (filters.supervisor !== "Todos" && row.supervisor !== filters.supervisor) return false;
    return true;
  });
  const scopeActive = filters.coordinator !== "Todos" || filters.sigla !== "Todas" || filters.base !== "Todas" || filters.supervisor !== "Todos";
  const allowedBases = new Set(hierarchy.map((row) => normalizeText(row.baseKey)));
  const allowedSiglas = new Set(hierarchy.map((row) => normalizeText(row.sigla)));
  const idByName = driverIdMap(data.drivers);
  const selectedDriverId = filters.driver === "Todos" ? "" : idByName.get(normalizeText(filters.driver)) ?? filters.driver;

  const prefatura = data.prefatura.filter((row) => {
    if (!inFortnight(row.period, row.routeDate, filters)) return false;
    if (!matchesScope(row, allowedBases, allowedSiglas, scopeActive)) return false;
    if (filters.operation !== "Todas" && row.operation !== filters.operation) return false;
    if (filters.driver !== "Todos" && normalizeText(row.driverName) !== normalizeText(filters.driver)) return false;
    return true;
  });
  const pnr = data.pnr.filter((row) => {
    if (!inFortnight(row.billingPeriod, row.caseDate, filters)) return false;
    if (!matchesScope(row, allowedBases, allowedSiglas, scopeActive)) return false;
    if (filters.operation !== "Todas" && filters.operation !== "PNR") return false;
    if (selectedDriverId && row.driverId !== selectedDriverId) return false;
    return true;
  });
  const risk = data.risk.filter((row) => {
    if (!inFortnight(undefined, row.failureDate, filters)) return false;
    if (!matchesScope(row, allowedBases, allowedSiglas, scopeActive)) return false;
    if (selectedDriverId && row.driverId !== selectedDriverId) return false;
    return true;
  });

  const visibleDriverNames = new Set(prefatura.map((row) => normalizeText(row.driverName)));
  const visibleDriverIds = new Set([...pnr.map((row) => row.driverId), ...risk.map((row) => row.driverId)]);
  const operationalScopeActive = scopeActive || filters.operation !== "Todas" || filters.month !== "Todos" || filters.fortnight !== "Todas";
  const drivers = data.drivers.filter((driver) => {
    if (filters.driver !== "Todos" && normalizeText(driver.name) !== normalizeText(filters.driver)) return false;
    if (!operationalScopeActive) return true;
    return visibleDriverNames.has(normalizeText(driver.name)) || visibleDriverIds.has(driver.driverId);
  });

  return { hierarchy, prefatura, pnr, risk, drivers };
}

export function filterOptions(data: DashboardData, filters: DashboardFilters) {
  const afterCoordinator = data.hierarchy.filter((row) => filters.coordinator === "Todos" || row.coordinator === filters.coordinator);
  const afterSigla = afterCoordinator.filter((row) => filters.sigla === "Todas" || row.sigla === filters.sigla);
  const afterBase = afterSigla.filter((row) => filters.base === "Todas" || row.base === filters.base);
  const scoped = scopeData(data, { ...filters, driver: "Todos" });
  const namesFromIds = new Map(data.drivers.map((driver) => [driver.driverId, driver.name]));
  const driverNames = unique([
    ...scoped.prefatura.map((row) => row.driverName),
    ...scoped.pnr.map((row) => namesFromIds.get(row.driverId) ?? row.driverId),
    ...scoped.risk.map((row) => namesFromIds.get(row.driverId) ?? row.driverId),
  ].filter(Boolean)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const fortnights = [
    ...(data.prefatura.some((row) => rowFortnight(row.period, row.routeDate).startsWith("01Q")) || data.pnr.some((row) => rowFortnight(row.billingPeriod, row.caseDate).startsWith("01Q")) || data.risk.some((row) => rowFortnight(undefined, row.failureDate).startsWith("01Q")) ? ["Q1"] : []),
    ...(data.prefatura.some((row) => rowFortnight(row.period, row.routeDate).startsWith("02Q")) || data.pnr.some((row) => rowFortnight(row.billingPeriod, row.caseDate).startsWith("02Q")) || data.risk.some((row) => rowFortnight(undefined, row.failureDate).startsWith("02Q")) ? ["Q2"] : []),
  ];
  const months = unique([
    ...data.prefatura.map((row) => rowFortnight(row.period, row.routeDate)),
    ...data.pnr.map((row) => rowFortnight(row.billingPeriod, row.caseDate)),
    ...data.risk.map((row) => rowFortnight(undefined, row.failureDate)),
  ].map(monthFromFortnight).filter(Boolean)).sort();

  return {
    months,
    fortnights,
    coordinators: unique(data.hierarchy.map((row) => row.coordinator)).sort((a, b) => a.localeCompare(b, "pt-BR")),
    siglas: unique(afterCoordinator.map((row) => row.sigla)).sort(),
    bases: unique(afterSigla.map((row) => row.base)).sort((a, b) => a.localeCompare(b, "pt-BR")),
    supervisors: unique(afterBase.map((row) => row.supervisor)).sort((a, b) => a.localeCompare(b, "pt-BR")),
    drivers: driverNames,
  };
}

export interface PnrDecisionRow {
  status: string;
  cases: number;
  percentage: number;
  value: number;
  priority: "Alta" | "Média" | "Baixa";
  action: string;
  tone: "critical" | "warning" | "neutral";
}

const PNR_DECISION_RULES: Array<Omit<PnrDecisionRow, "cases" | "percentage" | "value">> = [
  { status: "Aguardando comprovante", priority: "Alta", action: "Cobrar comprovante", tone: "critical" },
  { status: "Com penalidade", priority: "Alta", action: "Revisar penalidade", tone: "critical" },
  { status: "Em revisão", priority: "Alta", action: "Priorizar análise", tone: "critical" },
  { status: "Comprovante carregado", priority: "Média", action: "Validar comprovante", tone: "warning" },
  { status: "Sin comprovante carregado", priority: "Média", action: "Corrigir documentação", tone: "warning" },
  { status: "Enviados para faturamento", priority: "Baixa", action: "Acompanhar faturamento", tone: "neutral" },
  { status: "Anulado", priority: "Baixa", action: "Monitorar encerramento", tone: "neutral" },
];

export function pnrDecisionRows(records: PnrRecord[]): PnrDecisionRow[] {
  const totalCases = records.length || 1;
  const byStatus = new Map<string, { cases: number; value: number }>();
  records.forEach((record) => {
    const status = record.status || "Sem status";
    const current = byStatus.get(status) ?? { cases: 0, value: 0 };
    current.cases += 1;
    current.value += record.purchaseValue;
    byStatus.set(status, current);
  });

  return PNR_DECISION_RULES.map((rule) => {
    const current = byStatus.get(rule.status) ?? { cases: 0, value: 0 };
    return {
      ...rule,
      cases: current.cases,
      value: current.value,
      percentage: (current.cases / totalCases) * 100,
    };
  });
}

export function sumByUniqueShipment<T extends { shipmentId: string }>(records: T[], value: (record: T) => number) {
  return uniqueByShipment(records).reduce((total, record) => total + value(record), 0);
}

export function duplicateGroups<T extends { shipmentId: string }>(records: T[]) {
  const grouped = new Map<string, T[]>();
  for (const record of records) grouped.set(record.shipmentId, [...(grouped.get(record.shipmentId) ?? []), record]);
  return [...grouped.entries()].filter(([, rows]) => rows.length > 1);
}

export function overviewMetrics(scoped: ScopedData) {
  const prefaturaUnique = uniqueByShipment(scoped.prefatura);
  const riskUnique = uniqueByShipment(scoped.risk);
  const allIds = new Set([...scoped.prefatura, ...scoped.pnr, ...scoped.risk].map((row) => row.shipmentId));
  const shipped = scoped.drivers.reduce((sum, driver) => sum + driver.shipped, 0);
  const delivered = scoped.drivers.reduce((sum, driver) => sum + driver.delivered, 0);
  return {
    uniquePackages: allIds.size,
    prefaturaValue: prefaturaUnique.reduce((sum, row) => sum + row.value, 0),
    riskValue: riskUnique.reduce((sum, row) => sum + row.gmvBrl, 0),
    deliveryRate: shipped ? (delivered / shipped) * 100 : 0,
    duplicateCount: duplicateGroups(scoped.prefatura).length,
    drivers: scoped.drivers.length,
  };
}

export function prefaturaByOperation(records: PrefaturaRecord[]) {
  return (["SVC", "XPT", "PNR"] as const).map((operation) => {
    const rows = records.filter((row) => row.operation === operation);
    return {
      operation,
      raw: rows.length,
      packages: uniqueByShipment(rows).length,
      value: sumByUniqueShipment(rows, (row) => row.value),
    };
  });
}

export function monthlyMovement(scoped: ScopedData) {
  const months = new Map<string, { month: string; prefatura: number; pnr: number; risco: number }>();
  const touch = (date: string | null) => {
    const month = date?.slice(0, 7) || "Sem data";
    if (!months.has(month)) months.set(month, { month, prefatura: 0, pnr: 0, risco: 0 });
    return months.get(month)!;
  };
  for (const row of uniqueByShipment(scoped.prefatura)) touch(row.routeDate).prefatura += row.value;
  for (const row of uniqueByShipment(scoped.pnr)) touch(row.caseDate).pnr += row.purchaseValue;
  for (const row of uniqueByShipment(scoped.risk)) touch(row.failureDate).risco += row.gmvBrl;
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
}

export function driverPerformance(scoped: ScopedData, allDrivers: DriverRecord[]) {
  const byId = new Map(allDrivers.map((driver) => [driver.driverId, driver]));
  const byName = new Map(allDrivers.map((driver) => [normalizeText(driver.name), driver]));
  const rows = new Map<string, {
    driverId: string;
    name: string;
    shipped: number;
    delivered: number;
    deliveryRate: number;
    incidents: number;
    discountValue: number;
    packages: number;
    riskValue: number;
  }>();

  const ensure = (driver: DriverRecord | undefined, fallback: string) => {
    const key = driver?.driverId || fallback;
    if (!rows.has(key)) rows.set(key, {
      driverId: driver?.driverId || "—",
      name: driver?.name || fallback || "Não identificado",
      shipped: driver?.shipped || 0,
      delivered: driver?.delivered || 0,
      deliveryRate: driver?.shipped ? (driver.delivered / driver.shipped) * 100 : 0,
      incidents: driver?.incidents || 0,
      discountValue: 0,
      packages: 0,
      riskValue: 0,
    });
    return rows.get(key)!;
  };

  scoped.drivers.forEach((driver) => ensure(driver, driver.name));
  uniqueByShipment(scoped.prefatura).forEach((record) => {
    const row = ensure(byName.get(normalizeText(record.driverName)), record.driverName);
    row.discountValue += record.value;
    row.packages += 1;
  });
  uniqueByShipment(scoped.risk).forEach((record) => {
    ensure(byId.get(record.driverId), record.driverId).riskValue += record.gmvBrl;
  });
  return [...rows.values()].sort((a, b) => b.discountValue + b.riskValue - (a.discountValue + a.riskValue));
}

export interface ReconciliationRow {
  shipmentId: string;
  prefatura: number;
  pnr: number;
  risk: number;
  sources: number;
  occurrences: number;
  status: "Conciliado" | "Duplicado" | "Isolado";
  value: number;
}

export function reconciliation(scoped: ScopedData): ReconciliationRow[] {
  const groups = new Map<string, ReconciliationRow>();
  const add = (shipmentId: string, kind: "prefatura" | "pnr" | "risk", value: number) => {
    if (!shipmentId) return;
    const row = groups.get(shipmentId) ?? { shipmentId, prefatura: 0, pnr: 0, risk: 0, sources: 0, occurrences: 0, status: "Isolado", value: 0 };
    row[kind] += 1;
    row.occurrences += 1;
    row.value = Math.max(row.value, value);
    groups.set(shipmentId, row);
  };
  scoped.prefatura.forEach((row) => add(row.shipmentId, "prefatura", row.value));
  scoped.pnr.forEach((row) => add(row.shipmentId, "pnr", row.purchaseValue));
  scoped.risk.forEach((row) => add(row.shipmentId, "risk", row.gmvBrl));
  for (const row of groups.values()) {
    row.sources = [row.prefatura, row.pnr, row.risk].filter(Boolean).length;
    row.status = row.prefatura > 1 || row.pnr > 1 || row.risk > 1 ? "Duplicado" : row.sources > 1 ? "Conciliado" : "Isolado";
  }
  return [...groups.values()].sort((a, b) => b.occurrences - a.occurrences || b.value - a.value);
}

export interface QualityIssue {
  id: string;
  severity: "Crítico" | "Atenção" | "Informativo";
  rule: string;
  dataset: string;
  count: number;
  detail: string;
}

export function qualityIssues(data: DashboardData): QualityIssue[] {
  const hierarchyBases = new Set(data.hierarchy.map((row) => normalizeText(row.baseKey)));
  const hierarchySiglas = new Set(data.hierarchy.map((row) => normalizeText(row.sigla)));
  const knownDrivers = new Set(data.drivers.map((row) => normalizeText(row.name)));
  const matchHierarchy = (row: { baseKey: string; sigla: string }) => hierarchyBases.has(normalizeText(row.baseKey)) || hierarchySiglas.has(normalizeText(row.sigla));
  const unmatchedBases = [...data.prefatura, ...data.pnr, ...data.risk].filter((row) => !matchHierarchy(row));
  const unmatchedDrivers = data.prefatura.filter((row) => row.driverName && !knownDrivers.has(normalizeText(row.driverName)));
  const duplicatePrefatura = duplicateGroups(data.prefatura);
  const missingIds = [...data.prefatura, ...data.pnr, ...data.risk].filter((row) => !row.shipmentId);
  const multipleSupervisors = new Map<string, Set<string>>();
  data.hierarchy.forEach((row) => multipleSupervisors.set(row.sigla, new Set([...(multipleSupervisors.get(row.sigla) ?? []), row.supervisor])));
  const sharedScopes = [...multipleSupervisors.values()].filter((set) => set.size > 1).length;
  const issues: QualityIssue[] = [
    {
      id: "base-unmatched",
      severity: unmatchedBases.length ? "Atenção" : "Informativo",
      rule: "Base/Sigla sem correspondência",
      dataset: "Operacional × Hierarquia",
      count: unmatchedBases.length,
      detail: "Bases operacionais que não encontraram BASE ou SIGLA na planilha de coordenadores.",
    },
    {
      id: "driver-unmatched",
      severity: unmatchedDrivers.length ? "Atenção" : "Informativo",
      rule: "Motorista sem ID conciliado",
      dataset: "Pré-faturamento × Motoristas",
      count: unmatchedDrivers.length,
      detail: "Nomes que não correspondem exatamente ao relatório de transportistas após normalização.",
    },
    {
      id: "duplicate-shipment",
      severity: duplicatePrefatura.length ? "Crítico" : "Informativo",
      rule: "ID de pacote repetido",
      dataset: "Pré-faturamento",
      count: duplicatePrefatura.length,
      detail: "O mesmo ID aparece mais de uma vez. Valores usam IDs únicos e as ocorrências ficam auditáveis.",
    },
    {
      id: "missing-id",
      severity: missingIds.length ? "Crítico" : "Informativo",
      rule: "ID obrigatório ausente",
      dataset: "Todas as fontes",
      count: missingIds.length,
      detail: "Linhas sem identificador não participam de conciliação.",
    },
    {
      id: "shared-supervision",
      severity: sharedScopes ? "Atenção" : "Informativo",
      rule: "Supervisão compartilhada",
      dataset: "Hierarquia",
      count: sharedScopes,
      detail: "Uma SIGLA possui mais de um supervisor; sem vínculo motorista-supervisor, o escopo do supervisor permanece compartilhado na base.",
    },
  ];
  return issues;
}
