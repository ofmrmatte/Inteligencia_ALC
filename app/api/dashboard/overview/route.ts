import { NextResponse } from "next/server";
import { canAccessScopedRecord } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

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

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });

    const url = new URL(request.url);
    const month = optionalFilter(url, "month", ["Todos"]);
    const fortnight = optionalFilter(url, "fortnight", ["Todas"]);
    const operation = optionalFilter(url, "operation", ["Todas"]);
    const driver = optionalFilter(url, "driver", ["Todos"]);
    const xpt = optionalFilter(url, "xpt", ["Todos"]);
    const coordinator = optionalFilter(url, "coordinator", ["Todos"]);
    const sigla = optionalFilter(url, "sigla", ["Todas"]);
    const base = optionalFilter(url, "base", ["Todas"]);
    const supervisor = optionalFilter(url, "supervisor", ["Todos"]);

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

    const { data, error } = await admin.rpc("dashboard_overview_v1", {
      p_pairs: pairs,
      p_month: month,
      p_fortnight: fortnight,
      p_operation: operation,
      p_driver: driver,
    });
    if (error) throw new Error(error.message);

    const durationMs = performance.now() - startedAt;
    return NextResponse.json(data ?? {}, {
      headers: {
        "Server-Timing": `overview;dur=${durationMs.toFixed(1)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar a visão geral." },
      { status: 500 },
    );
  }
}
