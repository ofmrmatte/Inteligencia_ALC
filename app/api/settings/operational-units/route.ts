import { NextResponse } from "next/server";
import { canManageUsers, hasFullAccess } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeText } from "@/lib/normalize";
import type { DriverUnitMapping, OperationalDirectoryPayload, OperationalUnit } from "@/lib/operational-directory";
import { readPaged } from "@/lib/pagination";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalized(value: unknown) {
  return normalizeText(text(value));
}

function canonicalUnitKey(sigla: string, baseKey: string) {
  return `${normalized(sigla)}|${normalized(baseKey)}`;
}

function stringArray(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]+/) : [];
  return [...new Set(values.map(text).filter(Boolean))];
}

async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("UNAUTHENTICATED");
  return profile;
}

async function allRows(table: string, select: string, orderColumn: string) {
  const admin = createAdminClient();
  return readPaged<DbRow>(async (offset, size) => {
    const { data, error, count } = await admin
      .from(table)
      .select(select, { count: "exact" })
      .order(orderColumn, { ascending: true })
      .range(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as DbRow[], count: count ?? null };
  });
}

function unitVisible(profile: Awaited<ReturnType<typeof requireProfile>>, row: DbRow) {
  if (hasFullAccess(profile) || profile.role === "administration_supervisor") return true;
  const unitKey = normalized(row.unit_key);
  const baseKey = normalized(row.base_key);
  const sigla = normalized(row.sigla);
  const allowedBases = new Set(profile.baseScope.map(normalized));
  const allowedSiglas = new Set(profile.siglaScope.map(normalized));

  if (profile.role === "coordinator" || profile.role === "supervisor") {
    if (allowedBases.has(unitKey)) return true;
    return allowedBases.has(baseKey) && (allowedSiglas.size === 0 || allowedSiglas.has(sigla));
  }
  if (profile.role === "admin") return allowedBases.has(baseKey) || allowedBases.has(unitKey);
  return false;
}

function groupUnits(rows: DbRow[], supervisorRows: DbRow[]): OperationalUnit[] {
  const supervisors = new Map<string, string[]>();
  for (const row of supervisorRows) {
    if (row.active === false) continue;
    const unitKey = text(row.unit_key);
    if (!unitKey) continue;
    supervisors.set(unitKey, [...(supervisors.get(unitKey) ?? []), text(row.supervisor_name)].filter(Boolean));
  }

  return rows.map((row) => ({
    unitKey: text(row.unit_key),
    sigla: text(row.sigla),
    baseName: text(row.base_name),
    baseKey: text(row.base_key),
    xptCode: text(row.xpt_code),
    coordinator: text(row.coordinator_name),
    supervisors: [...new Set(supervisors.get(text(row.unit_key)) ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    active: row.active !== false,
  }));
}

function ambiguousKeys(units: OperationalUnit[], field: "sigla" | "baseKey") {
  const counts = new Map<string, number>();
  for (const unit of units.filter((item) => item.active)) {
    const value = normalized(unit[field]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function resolveDriverUnits(units: OperationalUnit[], driverRows: DbRow[], visibleUnitKeys: Set<string>): DriverUnitMapping[] {
  const byUnit = new Map(units.map((unit) => [normalized(unit.unitKey), unit]));
  const byPair = new Map(units.map((unit) => [canonicalUnitKey(unit.sigla, unit.baseKey), unit]));
  const bySigla = new Map<string, OperationalUnit[]>();
  const byBase = new Map<string, OperationalUnit[]>();
  for (const unit of units) {
    const sigla = normalized(unit.sigla);
    const baseKey = normalized(unit.baseKey);
    bySigla.set(sigla, [...(bySigla.get(sigla) ?? []), unit]);
    byBase.set(baseKey, [...(byBase.get(baseKey) ?? []), unit]);
  }

  const mappings = new Map<string, string>();
  for (const row of driverRows) {
    const driverId = text(row.driver_code).replace(/\.0$/, "");
    if (!driverId) continue;
    const rawBase = normalized(row.base_key);
    const rawSigla = normalized(row.sigla);
    let unit = byUnit.get(rawBase);
    if (!unit && rawSigla && rawBase) unit = byPair.get(canonicalUnitKey(rawSigla, rawBase));
    if (!unit && rawBase) {
      const matches = byBase.get(rawBase) ?? [];
      if (matches.length === 1) unit = matches[0];
    }
    if (!unit && rawSigla) {
      const matches = bySigla.get(rawSigla) ?? [];
      if (matches.length === 1) unit = matches[0];
    }
    if (unit && visibleUnitKeys.has(unit.unitKey)) mappings.set(driverId, unit.unitKey);
  }
  return [...mappings].map(([driverId, unitKey]) => ({ driverId, unitKey }));
}

async function loadPayload(profile: Awaited<ReturnType<typeof requireProfile>>): Promise<OperationalDirectoryPayload> {
  const [unitRows, supervisorRows, driverRows] = await Promise.all([
    allRows("operational_units", "unit_key,sigla,base_name,base_key,xpt_code,coordinator_name,source,active,updated_at", "sigla"),
    allRows("operational_unit_supervisors", "unit_key,supervisor_name,active", "supervisor_name"),
    allRows("alc_drivers", "driver_code,base_key,sigla,updated_at", "driver_code"),
  ]);
  const allUnits = groupUnits(unitRows, supervisorRows);
  const visibleUnits = allUnits.filter((row) => unitVisible(profile, {
    unit_key: row.unitKey,
    base_key: row.baseKey,
    sigla: row.sigla,
  }));
  const visibleUnitKeys = new Set(visibleUnits.map((unit) => unit.unitKey));

  return {
    units: visibleUnits,
    driverMappings: resolveDriverUnits(allUnits, driverRows, visibleUnitKeys),
    ambiguousSiglas: ambiguousKeys(allUnits, "sigla"),
    ambiguousBaseKeys: ambiguousKeys(allUnits, "baseKey"),
    fullAccess: hasFullAccess(profile),
  };
}

async function syncLegacyBase(baseKey: string, baseName: string, sigla: string) {
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("operational_bases").select("base_key,sigla").eq("base_key", baseKey).maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) {
    const { error: insertError } = await admin.from("operational_bases").insert({ base_key: baseKey, id: baseKey, base_name: baseName, sigla, active: true, updated_at: new Date().toISOString() });
    if (insertError) throw new Error(insertError.message);
  } else if (normalized(existing.sigla) === normalized(sigla)) {
    const { error: updateError } = await admin.from("operational_bases").update({ base_name: baseName, sigla, active: true, updated_at: new Date().toISOString() }).eq("base_key", baseKey);
    if (updateError) throw new Error(updateError.message);
  }
}

function parseUnit(body: DbRow) {
  const sigla = normalized(body.sigla);
  const baseName = text(body.baseName ?? body.base_name);
  const baseKey = normalized(baseName || body.baseKey || body.base_key);
  const coordinator = text(body.coordinator ?? body.coordinator_name);
  const supervisors = stringArray(body.supervisors);
  if (!sigla || !baseName || !baseKey) throw new Error("Informe a sigla SVC e o nome da base.");
  if (!coordinator) throw new Error("Informe o coordenador responsável.");
  return { sigla, baseName, baseKey, coordinator, supervisors, active: body.active !== false, unitKey: canonicalUnitKey(sigla, baseKey) };
}

async function regionalXptForSvc(sigla: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("operational_units")
    .select("xpt_code")
    .eq("sigla", sigla)
    .not("xpt_code", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return text((data as DbRow | null)?.xpt_code) || null;
}

async function replaceSupervisors(unitKey: string, supervisors: string[]) {
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("operational_unit_supervisors").delete().eq("unit_key", unitKey);
  if (deleteError) throw new Error(deleteError.message);
  if (!supervisors.length) return;
  const { error } = await admin.from("operational_unit_supervisors").insert(supervisors.map((name) => ({ unit_key: unitKey, supervisor_name: name, active: true })));
  if (error) throw new Error(error.message);
}

export async function GET() {
  try {
    const profile = await requireProfile();
    return NextResponse.json(await loadPayload(profile));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar cadastro operacional.";
    return jsonError(message === "UNAUTHENTICATED" ? "Sessão expirada. Entre novamente." : message, message === "UNAUTHENTICATED" ? 401 : 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (!canManageUsers(profile)) return jsonError("Cadastro de bases restrito à gestão autorizada.", 403);
    const body = (await request.json()) as DbRow;
    const unit = parseUnit(body);
    const admin = createAdminClient();
    const xptCode = await regionalXptForSvc(unit.sigla);
    const { error } = await admin.from("operational_units").insert({
      unit_key: unit.unitKey,
      sigla: unit.sigla,
      base_name: unit.baseName,
      base_key: unit.baseKey,
      xpt_code: xptCode,
      coordinator_name: unit.coordinator,
      source: "manual",
      active: unit.active,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.code === "23505" ? "Esta combinação de sigla e base já está cadastrada." : error.message);
    await replaceSupervisors(unit.unitKey, unit.supervisors);
    await syncLegacyBase(unit.baseKey, unit.baseName, unit.sigla);
    return NextResponse.json({ ok: true, ...(await loadPayload(profile)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cadastrar base.";
    return jsonError(message, message === "UNAUTHENTICATED" ? 401 : 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requireProfile();
    if (!canManageUsers(profile)) return jsonError("Edição de bases restrita à gestão autorizada.", 403);
    const body = (await request.json()) as DbRow;
    const originalUnitKey = text(body.originalUnitKey ?? body.unitKey ?? body.unit_key);
    if (!originalUnitKey) throw new Error("Base original não informada.");
    const unit = parseUnit(body);
    const admin = createAdminClient();
    const { data: original, error: originalError } = await admin
      .from("operational_units")
      .select("sigla,xpt_code")
      .eq("unit_key", originalUnitKey)
      .maybeSingle();
    if (originalError) throw new Error(originalError.message);
    const originalRow = (original ?? {}) as DbRow;
    const xptCode = normalized(originalRow.sigla) === unit.sigla
      ? text(originalRow.xpt_code) || null
      : await regionalXptForSvc(unit.sigla);

    const { error } = await admin.from("operational_units").update({
      unit_key: unit.unitKey,
      sigla: unit.sigla,
      base_name: unit.baseName,
      base_key: unit.baseKey,
      xpt_code: xptCode,
      coordinator_name: unit.coordinator,
      active: unit.active,
      updated_at: new Date().toISOString(),
    }).eq("unit_key", originalUnitKey);
    if (error) throw new Error(error.code === "23505" ? "Já existe outra base com esta sigla e nome." : error.message);
    await replaceSupervisors(unit.unitKey, unit.supervisors);
    await syncLegacyBase(unit.baseKey, unit.baseName, unit.sigla);
    return NextResponse.json({ ok: true, ...(await loadPayload(profile)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar base.";
    return jsonError(message, message === "UNAUTHENTICATED" ? 401 : 400);
  }
}
