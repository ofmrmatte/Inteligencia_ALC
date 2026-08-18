import { NextResponse } from "next/server";
import { DRIVER_MANAGEMENT_TABS, driverManagementTabsForProfile, type DriverManagementTab } from "@/lib/access-control";
import { accessErrorStatus, assertDriverManagementTab, driverManagementBaseScope } from "@/lib/access-control-server";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  driverPortalPatchForAction,
  loadDriverPortalBaseEnabled,
  loadTickets,
  requirePortalProfile,
  textValue,
} from "@/lib/driver-portal-server";
import { readPaged } from "@/lib/pagination";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;
type UnitType = "svc" | "xpt";
type UnitRef = {
  unitKey: string;
  baseKey: string;
  baseName: string;
  sigla: string;
  xptCode: string;
  unitType: UnitType;
};
type CanonicalDriver = DbRow & {
  driverCode: string;
  unitKey: string;
  baseKey: string;
  baseName: string;
  sigla: string;
  xptCode: string;
  unitType: UnitType | "unresolved";
};

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

function normalized(value: unknown) {
  return normalizeText(textValue(value));
}

function pairKey(sigla: unknown, baseKey: unknown) {
  const siglaKey = normalized(sigla);
  const base = normalized(baseKey);
  return siglaKey && base ? `${siglaKey}|${base}` : "";
}

function displaySigla(unit: UnitRef) {
  return unit.unitType === "xpt" ? `XPT • ${unit.sigla}` : `SVC • ${unit.sigla}`;
}

async function loadMasterUnits() {
  const admin = createAdminClient();
  const [{ data: svcData, error: svcError }, { data: xptData, error: xptError }] = await Promise.all([
    admin
      .from("operational_units")
      .select("unit_key,base_key,base_name,sigla,active")
      .eq("active", true)
      .order("sigla", { ascending: true })
      .order("base_name", { ascending: true }),
    admin
      .from("operational_xpts")
      .select("xpt_code,base_key,base_name,active")
      .eq("active", true)
      .order("xpt_code", { ascending: true }),
  ]);
  if (svcError) throw new Error(svcError.message);
  if (xptError) throw new Error(xptError.message);

  const xptCodes = new Set(((xptData ?? []) as DbRow[]).map((row) => normalized(row.xpt_code)).filter(Boolean));
  const svcUnits = ((svcData ?? []) as DbRow[])
    .filter((row) => !xptCodes.has(normalized(row.sigla)))
    .map((row): UnitRef => ({
      unitKey: textValue(row.unit_key),
      baseKey: textValue(row.base_key),
      baseName: textValue(row.base_name) || textValue(row.base_key),
      sigla: textValue(row.sigla),
      xptCode: "",
      unitType: "svc",
    }));
  const xptUnits = ((xptData ?? []) as DbRow[]).map((row): UnitRef => {
    const code = textValue(row.xpt_code);
    const baseKey = textValue(row.base_key) || normalized(row.base_name);
    return {
      unitKey: `XPT|${code}`,
      baseKey,
      baseName: textValue(row.base_name) || baseKey,
      sigla: code,
      xptCode: code,
      unitType: "xpt",
    };
  });

  return [...svcUnits, ...xptUnits];
}

function buildUnitResolver(units: UnitRef[]) {
  const byUnit = new Map(units.map((unit) => [normalized(unit.unitKey), unit]));
  const byPair = new Map(units.map((unit) => [pairKey(unit.sigla, unit.baseKey), unit]));
  const byBase = new Map<string, UnitRef[]>();
  const bySigla = new Map<string, UnitRef[]>();
  const xptByCode = new Map(units.filter((unit) => unit.unitType === "xpt").map((unit) => [normalized(unit.sigla), unit]));

  for (const unit of units) {
    const base = normalized(unit.baseKey);
    const sigla = normalized(unit.sigla);
    byBase.set(base, [...(byBase.get(base) ?? []), unit]);
    bySigla.set(sigla, [...(bySigla.get(sigla) ?? []), unit]);
  }

  const resolve = (input: { unitKey?: unknown; baseKey?: unknown; sigla?: unknown }) => {
    const unitKey = normalized(input.unitKey);
    if (unitKey && byUnit.has(unitKey)) return byUnit.get(unitKey) ?? null;

    const base = normalized(input.baseKey);
    const sigla = normalized(input.sigla);

    // XPT is authoritative when its code is present. It must never be
    // converted to an SVC merely because both operations share a base name.
    if (sigla && xptByCode.has(sigla)) return xptByCode.get(sigla) ?? null;

    if (base && sigla) {
      const exact = byPair.get(`${sigla}|${base}`);
      if (exact) return exact;
    }

    if (base) {
      const matches = byBase.get(base) ?? [];
      if (matches.length === 1) return matches[0];
    }

    if (sigla && (!base || base === sigla)) {
      const matches = (bySigla.get(sigla) ?? []).filter((unit) => unit.unitType === "svc");
      if (matches.length === 1) return matches[0];
    }

    return null;
  };

  const unitsForScope = (baseFilter: string[] | null) => {
    if (baseFilter === null) return units;
    const allowed = new Set(baseFilter.map(normalized).filter(Boolean));
    return units.filter((unit) => {
      if (allowed.has(normalized(unit.unitKey)) || allowed.has(normalized(unit.baseKey))) return true;
      if (unit.unitType === "xpt" && allowed.has(normalized(unit.sigla))) return true;
      const siglaMatches = (bySigla.get(normalized(unit.sigla)) ?? []).filter((item) => item.unitType === "svc");
      return unit.unitType === "svc" && siglaMatches.length === 1 && allowed.has(normalized(unit.sigla));
    });
  };

  return { resolve, unitsForScope };
}

async function loadDrivers(units: UnitRef[], visibleUnits: UnitRef[], scoped: boolean) {
  const admin = createAdminClient();
  const resolver = buildUnitResolver(units);
  const visible = new Set(visibleUnits.map((unit) => unit.unitKey));
  const rows = await readPaged<DbRow>(async (offset, pageSize) => {
    const { data, error, count } = await admin
      .from("alc_drivers")
      .select("id,driver_code,full_name,base_key,sigla,status,portal_status,portal_eligible,operational_status,last_seen_at,last_operational_seen_at,source_payload", { count: "exact" })
      .order("full_name", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as DbRow[], count };
  });

  return rows.flatMap((row): CanonicalDriver[] => {
    const code = textValue(row.driver_code);
    const name = textValue(row.full_name);
    const unit = resolver.resolve({ baseKey: row.base_key, sigla: row.sigla });
    if (scoped && (!unit || !visible.has(unit.unitKey))) return [];
    const portalStatus = textValue(row.portal_status) || textValue(row.status) || "not_activated";
    return [{
      ...row,
      id: textValue(row.id),
      driverCode: code,
      fullName: name,
      unitKey: unit?.unitKey ?? "",
      baseKey: unit?.baseKey ?? textValue(row.base_key),
      sigla: unit?.sigla ?? textValue(row.sigla),
      xptCode: unit?.unitType === "xpt" ? unit.xptCode : "",
      baseName: unit?.baseName ?? "",
      unitType: unit?.unitType ?? "unresolved",
      status: textValue(row.status),
      portalStatus,
      portalEligible: Boolean(row.portal_eligible),
      operationalStatus: textValue(row.operational_status) || "unknown",
      lastSeenAt: textValue(row.last_seen_at),
      lastOperationalSeenAt: textValue(row.last_operational_seen_at),
      quality: reliableName(name, code) && Boolean(unit) ? "resolved" : "needs_review",
      lastActivitySource: textValue((row.source_payload as DbRow | null)?.last_activity_source),
      pilotCandidate: !Boolean(row.portal_eligible)
        && portalStatus !== "blocked"
        && textValue(row.operational_status) === "active"
        && reliableName(name, code)
        && Boolean(unit),
    }];
  });
}

function driverUnitMap(drivers: CanonicalDriver[], units: UnitRef[]) {
  const byUnit = new Map(units.map((unit) => [unit.unitKey, unit]));
  return new Map(
    drivers
      .map((driver) => [driver.driverCode, byUnit.get(driver.unitKey)] as const)
      .filter((entry): entry is readonly [string, UnitRef] => Boolean(entry[0] && entry[1])),
  );
}

function canonicalUnitForRecord(
  resolver: ReturnType<typeof buildUnitResolver>,
  byDriver: Map<string, UnitRef>,
  input: { unitKey?: unknown; baseKey?: unknown; sigla?: unknown; driverCode?: unknown },
) {
  return resolver.resolve(input) ?? byDriver.get(textValue(input.driverCode)) ?? null;
}

async function loadDocuments(units: UnitRef[], visibleUnits: UnitRef[], scoped: boolean, byDriver: Map<string, UnitRef>) {
  const admin = createAdminClient();
  const resolver = buildUnitResolver(units);
  const visible = new Set(visibleUnits.map((unit) => unit.unitKey));
  const rows = await readPaged<DbRow>(async (offset, pageSize) => {
    const { data, error, count } = await admin
      .from("driver_payment_documents")
      .select("*,alc_drivers(driver_code,full_name,base_key,sigla),driver_payment_document_versions:driver_payment_document_versions!driver_payment_document_versions_document_id_fkey(*)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as DbRow[], count };
  });

  return rows.flatMap((row) => {
    const driver = row.alc_drivers as DbRow | null;
    const unit = canonicalUnitForRecord(resolver, byDriver, {
      baseKey: row.base_key || driver?.base_key,
      sigla: driver?.sigla,
      driverCode: driver?.driver_code,
    });
    if (scoped && (!unit || !visible.has(unit.unitKey))) return [];
    return [{
      ...row,
      base_key: unit?.baseKey ?? textValue(row.base_key),
      base_name: unit?.baseName ?? "",
      sigla: unit?.sigla ?? "",
      unit_key: unit?.unitKey ?? "",
      xpt_code: unit?.unitType === "xpt" ? unit.xptCode : "",
      unit_type: unit?.unitType ?? "unresolved",
    }];
  });
}

async function loadDisputes(units: UnitRef[], visibleUnits: UnitRef[], scoped: boolean, byDriver: Map<string, UnitRef>) {
  const admin = createAdminClient();
  const resolver = buildUnitResolver(units);
  const visible = new Set(visibleUnits.map((unit) => unit.unitKey));
  const rows = await readPaged<DbRow>(async (offset, pageSize) => {
    const { data, error, count } = await admin
      .from("driver_disputes")
      .select("*,alc_drivers(driver_code,full_name,base_key,sigla),driver_payment_documents(title)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as DbRow[], count };
  });

  return rows.flatMap((row) => {
    const driver = row.alc_drivers as DbRow | null;
    const unit = canonicalUnitForRecord(resolver, byDriver, {
      baseKey: row.base_key || driver?.base_key,
      sigla: driver?.sigla,
      driverCode: driver?.driver_code,
    });
    if (scoped && (!unit || !visible.has(unit.unitKey))) return [];
    return [{
      ...row,
      base_key: unit?.baseKey ?? textValue(row.base_key),
      base_name: unit?.baseName ?? "",
      sigla: unit?.sigla ?? "",
      unit_key: unit?.unitKey ?? "",
      xpt_code: unit?.unitType === "xpt" ? unit.xptCode : "",
      unit_type: unit?.unitType ?? "unresolved",
    }];
  });
}

async function loadCanonicalTickets(units: UnitRef[], visibleUnits: UnitRef[], scoped: boolean, byDriver: Map<string, UnitRef>) {
  const resolver = buildUnitResolver(units);
  const visible = new Set(visibleUnits.map((unit) => unit.unitKey));
  const tickets = await loadTickets({ allowedBases: null });
  return tickets.flatMap((ticket) => {
    const unit = canonicalUnitForRecord(resolver, byDriver, {
      baseKey: ticket.baseKey,
      sigla: ticket.sigla,
      driverCode: ticket.driverCode,
    });
    if (scoped && (!unit || !visible.has(unit.unitKey))) return [];
    return [{
      ...ticket,
      unitKey: unit?.unitKey ?? "",
      baseKey: unit?.baseKey ?? ticket.baseKey,
      baseName: unit?.baseName ?? "",
      sigla: unit?.sigla ?? "",
      xptCode: unit?.unitType === "xpt" ? unit.xptCode : "",
      unitType: unit?.unitType ?? "unresolved",
    }];
  });
}

async function loadAssignments(units: UnitRef[]) {
  const admin = createAdminClient();
  const resolver = buildUnitResolver(units);
  const { data, error } = await admin
    .from("admin_base_assignments")
    .select("*,profiles:profiles!admin_base_assignments_admin_id_fkey(email,full_name,role)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).map((row) => {
    const unit = resolver.resolve({ baseKey: row.base_key });
    return {
      ...row,
      operational_bases: unit ? { base_name: unit.baseName, sigla: displaySigla(unit) } : null,
    };
  });
}

export async function GET(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const allowedTabs = driverManagementTabsForProfile(profile);
    const requested = new URL(request.url).searchParams.get("tab") || allowedTabs[0] || "";
    if (!validTab(requested)) return jsonError("Aba inválida.", 400);
    assertDriverManagementTab(profile, requested);

    const baseFilter = await driverManagementBaseScope(profile);
    const allUnits = await loadMasterUnits();
    const resolver = buildUnitResolver(allUnits);
    const visibleUnits = resolver.unitsForScope(baseFilter);
    const scoped = baseFilter !== null;
    const drivers = await loadDrivers(allUnits, visibleUnits, scoped);
    const byDriver = driverUnitMap(drivers, allUnits);
    const bases = visibleUnits.map((unit) => ({
      unit_key: unit.unitKey,
      unit_type: unit.unitType,
      base_key: unit.baseKey,
      base_name: unit.baseName,
      sigla: displaySigla(unit),
      xpt_code: unit.unitType === "xpt" ? unit.xptCode : "",
      active: true,
    }));
    const payload: Record<string, unknown> = {
      access: { tabs: allowedTabs, bases: baseFilter, role: profile.role },
      bases,
    };

    if (requested === "overview") {
      const [tickets, documents, disputes] = await Promise.all([
        loadCanonicalTickets(allUnits, visibleUnits, scoped, byDriver),
        loadDocuments(allUnits, visibleUnits, scoped, byDriver),
        loadDisputes(allUnits, visibleUnits, scoped, byDriver),
      ]);
      Object.assign(payload, { drivers, tickets, documents, disputes });
    }

    if (requested === "pilot" || requested === "drivers") payload.drivers = drivers;
    if (requested === "tickets") payload.tickets = await loadCanonicalTickets(allUnits, visibleUnits, scoped, byDriver);

    if (requested === "payments") {
      const documents = await loadDocuments(allUnits, visibleUnits, scoped, byDriver);
      Object.assign(payload, { documents, drivers });
    }

    if (requested === "disputes") payload.disputes = await loadDisputes(allUnits, visibleUnits, scoped, byDriver);
    if (requested === "admins") payload.assignments = await loadAssignments(allUnits);

    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Falha ao carregar gestão de motoristas.",
      accessErrorStatus(error, 500),
    );
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
      await admin.from("admin_base_assignment_history").insert({
        assignment_id: data.id,
        admin_id: adminId,
        base_key: baseKey,
        action: "assigned",
        actor_id: profile.id,
        after_data: data,
      });
    }
    return GET(new Request(new URL("/api/driver-management?tab=admins", request.url)));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Falha ao salvar gestão de motoristas.",
      accessErrorStatus(error, 400),
    );
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
      if (!["director", "developer", "loss_supervisor", "super_admin", "administration_supervisor"].includes(profile.role)) {
        return jsonError("Acesso negado.", 403);
      }
      const id = textValue(body.id);
      const active = body.active !== false;
      const { data: before } = await admin.from("admin_base_assignments").select("*").eq("id", id).single();
      const { data, error } = await admin.from("admin_base_assignments")
        .update({ active, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await admin.from("admin_base_assignment_history").insert({
        assignment_id: id,
        admin_id: data.admin_id,
        base_key: data.base_key,
        action: active ? "reactivated" : "removed",
        actor_id: profile.id,
        before_data: before,
        after_data: data,
      });
      return GET(new Request(new URL("/api/driver-management?tab=admins", request.url)));
    }

    if (action === "driver_portal") {
      assertDriverManagementTab(profile, "drivers");
      const id = textValue(body.id);
      const portalAction = textValue(body.portalAction);
      const current = await admin.from("alc_drivers").select("*").eq("id", id).single();
      if (current.error) throw new Error(current.error.message);

      const baseFilter = await driverManagementBaseScope(profile);
      if (baseFilter) {
        const units = await loadMasterUnits();
        const resolver = buildUnitResolver(units);
        const unit = resolver.resolve({ baseKey: current.data.base_key, sigla: current.data.sigla });
        const visible = new Set(resolver.unitsForScope(baseFilter).map((item) => item.unitKey));
        if (!unit || !visible.has(unit.unitKey)) return jsonError("Acesso negado para a base solicitada.", 403);
      }

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
        const sessions = await admin.from("driver_portal_sessions")
          .update({ revoked_at: now })
          .eq("driver_id", id)
          .is("revoked_at", null);
        if (sessions.error) throw new Error(sessions.error.message);
      }

      await admin.from("driver_portal_audit_events").insert({
        actor_profile_id: profile.id,
        action: `driver_portal_${portalAction}`,
        entity_table: "alc_drivers",
        entity_id: id,
        before_data: current.data,
        after_data: patch,
      });
      return GET(new Request(new URL("/api/driver-management?tab=drivers", request.url)));
    }

    throw new Error("Ação não reconhecida.");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Falha ao atualizar gestão de motoristas.",
      accessErrorStatus(error, 400),
    );
  }
}
