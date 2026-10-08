import { NextResponse } from "next/server";
import { GET as getImports } from "@/app/api/imports/route";
import { canAccessScopedRecord } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import { getCurrentProfile } from "@/lib/auth-server";
import {
  monthlyMovement,
  overviewMetrics,
  prefaturaByOperation,
  scopeData,
  uniqueByShipment,
} from "@/lib/metrics";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMPTY_FILTERS, type DashboardData, type DashboardFilters } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

interface OverviewSummary {
  rowCount: number;
  importsCount: number;
  metrics: ReturnType<typeof overviewMetrics>;
  movement: ReturnType<typeof monthlyMovement>;
  operations: Array<{ operation: string; packages: number; value: number }>;
  topBases: Array<{ base: string; packages: number; value: number }>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function optionalFilter(url: URL, key: string, allValues: string[]) {
  const value = text(url.searchParams.get(key));
  return !value || allValues.includes(value) ? null : value;
}

function pair(sigla: unknown, baseKey: unknown) {
  const left = text(sigla).toUpperCase();
  const right = text(baseKey).toUpperCase();
  return left && right ? `${left}|${right}` : "";
}

function dashboardFilters(url: URL): DashboardFilters {
  return {
    month: optionalFilter(url, "month", ["Todos"]) ?? EMPTY_FILTERS.month,
    fortnight: optionalFilter(url, "fortnight", ["Todas"]) ?? EMPTY_FILTERS.fortnight,
    xpt: optionalFilter(url, "xpt", ["Todos"]) ?? EMPTY_FILTERS.xpt,
    coordinator: optionalFilter(url, "coordinator", ["Todos"]) ?? EMPTY_FILTERS.coordinator,
    base: optionalFilter(url, "base", ["Todas"]) ?? EMPTY_FILTERS.base,
    sigla: optionalFilter(url, "sigla", ["Todas"]) ?? EMPTY_FILTERS.sigla,
    operation: optionalFilter(url, "operation", ["Todas"]) ?? EMPTY_FILTERS.operation,
    supervisor: optionalFilter(url, "supervisor", ["Todos"]) ?? EMPTY_FILTERS.supervisor,
    driver: optionalFilter(url, "driver", ["Todos"]) ?? EMPTY_FILTERS.driver,
  };
}

function filtersAreDefault(filters: DashboardFilters) {
  return (Object.keys(EMPTY_FILTERS) as Array<keyof DashboardFilters>)
    .every((key) => filters[key] === EMPTY_FILTERS[key]);
}

function fallbackTopBases(data: ReturnType<typeof scopeData>) {
  const byBase = new Map<string, { base: string; packages: number; value: number }>();
  for (const row of uniqueByShipment(data.prefatura)) {
    const base = text(row.baseName || row.baseLabel || row.baseKey || row.sigla) || "Sem base";
    const current = byBase.get(base) ?? { base, packages: 0, value: 0 };
    current.packages += 1;
    current.value += Number(row.value || 0);
    byBase.set(base, current);
  }
  return [...byBase.values()]
    .sort((a, b) => b.value - a.value || b.packages - a.packages || a.base.localeCompare(b.base, "pt-BR"))
    .slice(0, 10);
}

function fallbackImportsCount(data: DashboardData, scoped: ReturnType<typeof scopeData>, filters: DashboardFilters) {
  if (filtersAreDefault(filters)) return data.imports.length;

  const visibleBatchIds = new Set([
    ...scoped.prefatura.map((row) => row.batchId),
    ...scoped.pnr.map((row) => row.batchId),
    ...scoped.risk.map((row) => row.batchId),
  ].filter(Boolean));

  return data.imports.filter((entry) => visibleBatchIds.has(entry.batchId)).length;
}

function buildOverviewFallback(data: DashboardData, filters: DashboardFilters): OverviewSummary {
  const scoped = scopeData(data, filters);
  return {
    rowCount: scoped.prefatura.length + scoped.pnr.length + scoped.risk.length,
    importsCount: fallbackImportsCount(data, scoped, filters),
    metrics: overviewMetrics(scoped),
    movement: monthlyMovement(scoped, data.imports),
    operations: prefaturaByOperation(scoped.prefatura).map(({ operation, packages, value }) => ({
      operation,
      packages,
      value,
    })),
    topBases: fallbackTopBases(scoped),
  };
}

async function loadOverviewFallback(request: Request, filters: DashboardFilters) {
  const url = new URL("/api/imports", request.url);
  const response = await getImports(new Request(url, { method: "GET" }));

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Fallback da visão geral retornou HTTP ${response.status}.`);
  }

  return buildOverviewFallback(await response.json() as DashboardData, filters);
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });

    const url = new URL(request.url);
    const filters = dashboardFilters(url);
    const month = filters.month === EMPTY_FILTERS.month ? null : filters.month;
    const fortnight = filters.fortnight === EMPTY_FILTERS.fortnight ? null : filters.fortnight;
    const operation = filters.operation === EMPTY_FILTERS.operation ? null : filters.operation;
    const driver = filters.driver === EMPTY_FILTERS.driver ? null : filters.driver;
    const xpt = filters.xpt === EMPTY_FILTERS.xpt ? null : filters.xpt;
    const coordinator = filters.coordinator === EMPTY_FILTERS.coordinator ? null : filters.coordinator;
    const sigla = filters.sigla === EMPTY_FILTERS.sigla ? null : filters.sigla;
    const base = filters.base === EMPTY_FILTERS.base ? null : filters.base;
    const supervisor = filters.supervisor === EMPTY_FILTERS.supervisor ? null : filters.supervisor;

    const admin = createAdminClient();
    const accessScope = await getUserAccessScope(profile);
    const [unitsResult, supervisorsResult] = await Promise.all([
      admin
        .from("operational_units")
        .select("unit_key,sigla,base_name,base_key,xpt_code,coordinator_name,active")
        .eq("active", true),
      supervisor
        ? admin
            .from("operational_unit_supervisors")
            .select("unit_key,supervisor_name,active")
            .eq("active", true)
            .eq("supervisor_name", supervisor)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (unitsResult.error) throw new Error(`operational_units: ${unitsResult.error.message}`);
    if (supervisorsResult.error) throw new Error(`operational_unit_supervisors: ${supervisorsResult.error.message}`);

    const supervisorUnits = new Set(((supervisorsResult.data ?? []) as unknown as DbRow[]).map((row) => text(row.unit_key)));
    const operationalFilterActive = Boolean(xpt || coordinator || sigla || base || supervisor);
    const visibleUnits = ((unitsResult.data ?? []) as unknown as DbRow[]).filter((row) => {
      if (!canAccessScopedRecord(accessScope, { baseKey: text(row.base_key), sigla: text(row.sigla) })) return false;
      if (xpt && normalizeText(row.xpt_code) !== normalizeText(xpt)) return false;
      if (coordinator && normalizeText(row.coordinator_name) !== normalizeText(coordinator)) return false;
      if (sigla && normalizeText(row.sigla) !== normalizeText(sigla)) return false;
      if (base && normalizeText(row.base_name) !== normalizeText(base)) return false;
      if (supervisor && !supervisorUnits.has(text(row.unit_key))) return false;
      return true;
    });

    const pairs = accessScope.fullAccess && !operationalFilterActive
      ? null
      : [...new Set(visibleUnits.map((row) => pair(row.sigla, row.base_key)).filter(Boolean))];

    const rpc = await admin.rpc("dashboard_overview_v1", {
      p_pairs: pairs,
      p_month: month,
      p_fortnight: fortnight,
      p_operation: operation,
      p_driver: driver,
    });

    let data = rpc.data;
    let source = "railway-rpc";

    if (rpc.error) {
      console.error("[dashboard-overview] Railway RPC failed; using server fallback:", rpc.error.message);
      data = await loadOverviewFallback(request, filters);
      source = "railway-fallback";
    }

    const durationMs = performance.now() - startedAt;
    return NextResponse.json(data ?? {}, {
      headers: {
        "Server-Timing": `overview;dur=${durationMs.toFixed(1)}`,
        "Cache-Control": "private, no-store",
        "X-ALC-Overview-Source": source,
      },
    });
  } catch (error) {
    console.error("[dashboard-overview] request failed:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os indicadores agora. Tente novamente em alguns instantes." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
