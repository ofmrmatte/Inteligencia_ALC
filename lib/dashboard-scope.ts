import { normalizeText } from "@/lib/normalize";
import { filterOptions as baseFilterOptions, scopeData as baseScopeData } from "@/lib/metrics";
import type { DashboardData, DashboardFilters } from "@/lib/types";

interface ScopeOptions {
  activeOnly?: boolean;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function matchesXpt(value: string | undefined, selected: string) {
  return normalizeText(value) === normalizeText(selected);
}

export function scopeData(data: DashboardData, filters: DashboardFilters, options: ScopeOptions = {}) {
  // XPT é uma dimensão paralela: não participa da hierarquia SVC → Base → Coordenador → Supervisor.
  const scoped = baseScopeData(data, { ...filters, xpt: "Todos" }, options);
  if (filters.xpt === "Todos") return scoped;

  const prefatura = scoped.prefatura.filter((row) => matchesXpt(row.xptCode, filters.xpt));
  const pnr = scoped.pnr.filter((row) => matchesXpt(row.xptCode, filters.xpt));
  const risk = scoped.risk.filter((row) => matchesXpt(row.xptCode, filters.xpt));

  const visibleDriverNames = new Set(prefatura.map((row) => normalizeText(row.driverName)).filter(Boolean));
  const visibleDriverIds = new Set([
    ...prefatura.map((row) => row.driverId),
    ...pnr.map((row) => row.driverId),
    ...risk.map((row) => row.driverId),
  ].filter(Boolean));

  const drivers = scoped.drivers.filter((driver) =>
    visibleDriverIds.has(driver.driverId) || visibleDriverNames.has(normalizeText(driver.name)),
  );

  return {
    ...scoped,
    // A hierarquia continua sendo somente SVC/Base. Selecionar XPT não a transforma em filha do XPT.
    hierarchy: scoped.hierarchy,
    prefatura,
    pnr,
    risk,
    drivers,
  };
}

export function filterOptions(data: DashboardData, filters: DashboardFilters) {
  // As opções de SVC/Base/Coordenador não dependem do XPT selecionado.
  const options = baseFilterOptions(data, { ...filters, xpt: "Todos" });
  const xpts = uniqueSorted([
    ...data.hierarchy.map((row) => row.xptCode ?? ""),
    ...data.prefatura.map((row) => row.xptCode ?? ""),
    ...data.pnr.map((row) => row.xptCode ?? ""),
    ...data.risk.map((row) => row.xptCode ?? ""),
  ]);

  return { ...options, xpts };
}
