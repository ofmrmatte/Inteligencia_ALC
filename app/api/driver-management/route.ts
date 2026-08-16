import { NextResponse } from "next/server";
import { DRIVER_MANAGEMENT_TABS, driverManagementTabsForProfile, type DriverManagementTab } from "@/lib/access-control";
import { accessErrorStatus, assertDriverManagementTab, driverManagementBaseScope } from "@/lib/access-control-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { driverPortalPatchForAction, loadDriverPortalBaseEnabled, loadTickets, requirePortalProfile, textValue } from "@/lib/driver-portal-server";
import { readPaged } from "@/lib/pagination";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
}

function validTab(value: string): value is DriverManagementTab {
  return DRIVER_MANAGEMENT_TABS.includes(value as DriverManagementTab);
}

function reliableName(name: string, code: string) {
  const normalizedName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
  const normalizedCode = code.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
  return Boolean(name.trim() && normalizedName && normalizedName !== normalizedCode && !/^\d+$/.test(normalizedName));
}

async function loadBases(baseFilter: string[] | null) {
  const admin = createAdminClient();
  let query = admin.from("operational_bases").select("base_key,base_name,sigla,active").eq("active", true);
  if (baseFilter) query = query.in("base_key", baseFilter.length ? baseFilter : ["__none__"]);
  const { data, error } = await query.order("sigla", { ascending: true }).order("base_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbRow[];
}

async function loadDrivers(baseFilter: string[] | null) {
  const admin = createAdminClient();
  const rows = await readPaged<DbRow>(async (offset, pageSize) => {
    let query = admin
      .from("alc_drivers")
      .select("id,driver_code,full_name,base_key,sigla,status,portal_status,portal_eligible,operational_status,last_seen_at,last_operational_seen_at,source_payload,operational_bases(base_name)", { count: "exact" });
    if (baseFilter) query = query.in("base_key", baseFilter.length ? baseFilter : ["__none__"]);
    const { data, error, count } = await query.order("full_name", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as DbRow[], count };
  });
  return rows.map((row) => {
    const code = textValue(row.driver_code);
    const name = textValue(row.full_name);
    const portalStatus = textValue(row.portal_status) || textValue(row.status) || "not_activated";
    return {
      id: textValue(row.id),
      driverCode: code,
      fullName: name,
      baseKey: textValue(row.base_key),
      sigla: textValue(row.sigla),
      baseName: textValue((row.operational_bases as DbRow | null)?.base_name) || textValue(row.base_key),
      status: textValue(row.status),
      portalStatus,
      portalEligible: Boolean(row.portal_eligible),
      operationalStatus: textValue(row.operational_status) || "unknown",
      lastSeenAt: textValue(row.last_seen_at),
      lastOperationalSeenAt: textValue(row.last_operational_seen_at),
      quality: reliableName(name, code) && Boolean(textValue(row.base_key)) ? "resolved" : "needs_review",
      lastActivitySource: textValue((row.source_payload as DbRow | null)?.last_activity_source),
      pilotCandidate: !Boolean(row.portal_eligible)
        && portalStatus !== "blocked"
        && textValue(row.operational_status) === "active"
        && reliableName(name, code)
        && Boolean(textValue(row.base_key)),
    };
  });
}

async function loadDocuments(baseFilter: string[] | null) {
  const admin = createAdminClient();
  return readPaged<DbRow>(async (offset, pageSize) => {
    let query = admin
      .from("driver_payment_documents")
      .select("*,alc_drivers(driver_code,full_name,base_key,sigla),driver_payment_document_versions:driver_payment_document_versions!driver_payment_document_versions_document_id_fkey(*)", { count: "exact" });
    if (baseFilter) query = query.in("base_key", baseFilter.length ? baseFilter : ["__none__"]);
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as DbRow[], count };
  });
}

async function loadDisputes(baseFilter: string[] | null) {
  const admin = createAdminClient();
  return readPaged<DbRow>(async (offset, pageSize) => {
    let query = admin
      .from("driver_disputes")
      .select("*,alc_drivers(driver_code,full_name),driver_payment_documents(title)", { count: "exact" });
    if (baseFilter) query = query.in("base_key", baseFilter.length ? baseFilter : ["__none__"]);
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as DbRow[], count };
  });
}

async function loadAssignments() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_base_assignments")
    .select("*,profiles:profiles!admin_base_assignments_admin_id_fkey(email,full_name,role),operational_bases(base_name,sigla)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function GET(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const allowedTabs = driverManagementTabsForProfile(profile);
    const requested = new URL(request.url).searchParams.get("tab") || allowedTabs[0] || "";
    if (!validTab(requested)) return jsonError("Aba inválida.", 400);
    assertDriverManagementTab(profile, requested);
    const baseFilter = await driverManagementBaseScope(profile);
    const bases = await loadBases(baseFilter);
    const payload: Record<string, unknown> = {
      access: { tabs: allowedTabs, bases: baseFilter, role: profile.role },
      bases,
    };

    if (requested === "overview") {
      const [drivers, tickets, documents, disputes] = await Promise.all([
        loadDrivers(baseFilter),
        loadTickets({ allowedBases: baseFilter }),
        loadDocuments(baseFilter),
        loadDisputes(baseFilter),
      ]);
      Object.assign(payload, { drivers, tickets, documents, disputes });
    }
    if (requested === "pilot" || requested === "drivers") payload.drivers = await loadDrivers(baseFilter);
    if (requested === "tickets") payload.tickets = await loadTickets({ allowedBases: baseFilter });
    if (requested === "payments") {
      const [documents, drivers] = await Promise.all([loadDocuments(baseFilter), loadDrivers(baseFilter)]);
      Object.assign(payload, { documents, drivers });
    }
    if (requested === "disputes") payload.disputes = await loadDisputes(baseFilter);
    if (requested === "admins") payload.assignments = await loadAssignments();

    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar gestão de motoristas.", accessErrorStatus(error, 500));
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    assertDriverManagementTab(profile, "admins");
    if (!["director", "developer", "loss_supervisor", "super_admin", "administration_supervisor"].includes(profile.role)) {
      return jsonError("Ação restrita à supervisão administrativa ou perfis de acesso total.", 403);
    }
    const body = (await request.json()) as DbRow;
    if (textValue(body.action) !== "assignment") throw new Error("Ação não reconhecida.");
    const adminId = textValue(body.adminId);
    const baseKeys = arrayValue(body.baseKeys);
    if (!adminId || !baseKeys.length) throw new Error("Informe administrativo e bases.");
    const admin = createAdminClient();
    for (const baseKey of baseKeys) {
      const { data, error } = await admin.from("admin_base_assignments").upsert({
        admin_id: adminId,
        base_key: baseKey,
        assigned_by: profile.id,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "admin_id,base_key" }).select().single();
      if (error) throw new Error(error.message);
      await admin.from("admin_base_assignment_history").insert({ assignment_id: data.id, admin_id: adminId, base_key: baseKey, action: "assigned", actor_id: profile.id, after_data: data });
    }
    return GET(new Request(new URL("/api/driver-management?tab=admins", request.url)));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao salvar gestão de motoristas.", accessErrorStatus(error, 400));
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const body = (await request.json()) as DbRow;
    const action = textValue(body.action);
    const admin = createAdminClient();

    if (action === "assignment") {
      assertDriverManagementTab(profile, "admins");
      if (!["director", "developer", "loss_supervisor", "super_admin", "administration_supervisor"].includes(profile.role)) return jsonError("Acesso negado.", 403);
      const id = textValue(body.id);
      const active = body.active !== false;
      const { data: before } = await admin.from("admin_base_assignments").select("*").eq("id", id).single();
      const { data, error } = await admin.from("admin_base_assignments").update({ active, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      await admin.from("admin_base_assignment_history").insert({ assignment_id: id, admin_id: data.admin_id, base_key: data.base_key, action: active ? "reactivated" : "removed", actor_id: profile.id, before_data: before, after_data: data });
      return GET(new Request(new URL("/api/driver-management?tab=admins", request.url)));
    }

    if (action === "driver_portal") {
      assertDriverManagementTab(profile, "drivers");
      const id = textValue(body.id);
      const portalAction = textValue(body.portalAction);
      const current = await admin.from("alc_drivers").select("*").eq("id", id).single();
      if (current.error) throw new Error(current.error.message);
      const baseFilter = await driverManagementBaseScope(profile);
      if (baseFilter && !baseFilter.includes(textValue(current.data.base_key))) return jsonError("Acesso negado para a base solicitada.", 403);
      const now = new Date().toISOString();
      const credential = await admin.from("driver_portal_credentials").select("driver_id").eq("driver_id", id).maybeSingle();
      if (credential.error) throw new Error(credential.error.message);
      const patch = driverPortalPatchForAction(portalAction, Boolean(credential.data), now);
      if (["allow", "reactivate", "reset_pin"].includes(portalAction)) {
        const baseEnabled = await loadDriverPortalBaseEnabled(textValue(current.data.base_key), textValue(current.data.sigla));
        if (!baseEnabled) throw new Error("Base bloqueada no controle central do Portal do Motorista.");
      }
      if (portalAction !== "revoke_sessions") {
        const updated = await admin.from("alc_drivers").update(patch).eq("id", id).select().single();
        if (updated.error) throw new Error(updated.error.message);
      }
      if (portalAction === "reset_pin") {
        const credentials = await admin.from("driver_portal_credentials").delete().eq("driver_id", id);
        if (credentials.error) throw new Error(credentials.error.message);
      }
      if (["reset_pin", "revoke_sessions", "block"].includes(portalAction)) {
        const sessions = await admin.from("driver_portal_sessions").update({ revoked_at: now }).eq("driver_id", id).is("revoked_at", null);
        if (sessions.error) throw new Error(sessions.error.message);
      }
      await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: `driver_portal_${portalAction}`, entity_table: "alc_drivers", entity_id: id, before_data: current.data, after_data: patch });
      return GET(new Request(new URL("/api/driver-management?tab=drivers", request.url)));
    }

    throw new Error("Ação não reconhecida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao atualizar gestão de motoristas.", accessErrorStatus(error, 400));
  }
}
