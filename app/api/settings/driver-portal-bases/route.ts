import { NextResponse } from "next/server";
import { canManageDriverPortalBaseSettings, normalizePortalBaseKey } from "@/lib/driver-portal-base-access";
import { getCurrentProfile } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readPaged } from "@/lib/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

function textValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function requireBasePortalManager() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("UNAUTHENTICATED");
  if (!canManageDriverPortalBaseSettings(profile)) throw new Error("FORBIDDEN");
  return profile;
}

function toBaseKeys(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(raw.map(normalizePortalBaseKey).filter(Boolean))];
}

function actorLabel(row: DbRow | undefined) {
  if (!row) return "";
  return textValue(row.full_name) || textValue(row.email);
}

async function loadPayload() {
  const admin = createAdminClient();
  const [bases, configs, drivers, sessions] = await Promise.all([
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin
        .from("operational_bases")
        .select("base_key,base_name,sigla,active", { count: "exact" })
        .order("base_key", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin
        .from("driver_portal_base_access")
        .select("*", { count: "exact" })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin
        .from("alc_drivers")
        .select("base_key,portal_eligible,portal_status", { count: "exact" })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin
        .from("driver_portal_sessions")
        .select("driver_id,alc_drivers(base_key)", { count: "exact" })
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
  ]);

  const actorIds = [...new Set(configs.flatMap((row) => [textValue(row.enabled_by), textValue(row.disabled_by)]).filter(Boolean))];
  const actors = new Map<string, DbRow>();
  if (actorIds.length) {
    const { data, error } = await admin.from("profiles").select("id,email,full_name").in("id", actorIds);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as DbRow[]) actors.set(textValue(row.id), row);
  }

  const configByBase = new Map(configs.map((row) => [normalizePortalBaseKey(row.base_key), row]));
  const baseByKey = new Map<string, DbRow>();
  for (const base of bases) {
    const key = normalizePortalBaseKey(base.base_key);
    if (key) baseByKey.set(key, base);
  }
  for (const row of drivers) {
    const key = normalizePortalBaseKey(row.base_key);
    if (key && !baseByKey.has(key)) baseByKey.set(key, { base_key: key, base_name: key, sigla: key, active: true });
  }

  const counts = new Map<string, { total: number; eligible: number; activated: number; blocked: number; activeSessions: number }>();
  const ensureCounts = (baseKey: string) => {
    const key = normalizePortalBaseKey(baseKey);
    const current = counts.get(key) ?? { total: 0, eligible: 0, activated: 0, blocked: 0, activeSessions: 0 };
    counts.set(key, current);
    return current;
  };
  for (const driver of drivers) {
    const item = ensureCounts(textValue(driver.base_key));
    const status = textValue(driver.portal_status);
    item.total += 1;
    if (driver.portal_eligible) item.eligible += 1;
    if (status === "active") item.activated += 1;
    if (status === "blocked") item.blocked += 1;
  }
  for (const session of sessions) {
    const driver = session.alc_drivers as DbRow | null;
    ensureCounts(textValue(driver?.base_key)).activeSessions += 1;
  }

  const rows = [...baseByKey.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([baseKey, base]) => {
    const config = configByBase.get(baseKey);
    const enabled = Boolean(config?.enabled);
    const disabledAt = textValue(config?.disabled_at);
    const enabledAt = textValue(config?.enabled_at);
    const changedAt = textValue(config?.updated_at) || enabledAt || disabledAt;
    const actorId = enabled ? textValue(config?.enabled_by) : textValue(config?.disabled_by);
    const count = counts.get(baseKey) ?? { total: 0, eligible: 0, activated: 0, blocked: 0, activeSessions: 0 };
    return {
      baseKey,
      baseName: textValue(base.base_name) || baseKey,
      sigla: textValue(base.sigla) || baseKey,
      enabled,
      status: enabled ? "LIBERADO" : "BLOQUEADO",
      enabledAt,
      disabledAt,
      changedAt,
      changedBy: actorLabel(actors.get(actorId)),
      counts: count,
    };
  });

  return {
    summary: {
      bases: rows.length,
      enabled: rows.filter((row) => row.enabled).length,
      blocked: rows.filter((row) => !row.enabled).length,
      eligibleDrivers: rows.reduce((sum, row) => sum + row.counts.eligible, 0),
      activatedDrivers: rows.reduce((sum, row) => sum + row.counts.activated, 0),
      blockedDrivers: rows.reduce((sum, row) => sum + row.counts.blocked, 0),
    },
    rows,
  };
}

export async function GET() {
  try {
    await requireBasePortalManager();
    return NextResponse.json(await loadPayload());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar bases do portal.";
    if (message === "UNAUTHENTICATED") return jsonError("Sessão expirada. Entre novamente.", 401);
    if (message === "FORBIDDEN") return jsonError("Configuração restrita a director, super_admin ou developer.", 403);
    return jsonError(message, message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requireBasePortalManager();
    const body = (await request.json()) as DbRow;
    const enabled = Boolean(body.enabled);
    const baseKeys = toBaseKeys(body.baseKeys ?? body.baseKey);
    if (!baseKeys.length) throw new Error("Selecione ao menos uma base.");

    const admin = createAdminClient();
    const results = [];
    for (const baseKey of baseKeys) {
      const { data, error } = await admin.rpc("set_driver_portal_base_access", {
        target_base_key: baseKey,
        target_enabled: enabled,
        actor_profile_id: profile.id,
      });
      if (error) throw new Error(error.message);
      results.push(data);
    }

    if (baseKeys.length > 1) {
      await admin.from("driver_portal_audit_events").insert({
        actor_profile_id: profile.id,
        action: enabled ? "driver_portal_base_bulk_enabled" : "driver_portal_base_bulk_disabled",
        entity_table: "driver_portal_base_access",
        after_data: { baseKeys, enabled, results },
      });
    }

    return NextResponse.json({ ok: true, results, ...(await loadPayload()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao alterar liberação do portal.";
    if (message === "UNAUTHENTICATED") return jsonError("Sessão expirada. Entre novamente.", 401);
    if (message === "FORBIDDEN") return jsonError("Configuração restrita a director, super_admin ou developer.", 403);
    return jsonError(message, message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 400);
  }
}
