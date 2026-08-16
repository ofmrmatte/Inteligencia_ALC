import { hasFullAccess, type AuthProfile } from "@/lib/auth";
import { getAllowedBaseIds } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { driverPortalBaseAccessKey, portalEligibilityFromBase } from "@/lib/driver-portal-base-access";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeDriverKey, pnrStatusToTicket, type DriverTicket } from "@/lib/driver-portal";
import { normalizeText } from "@/lib/normalize";
import { readPaged } from "@/lib/pagination";

type DbRow = Record<string, unknown>;

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function textValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
}

function isReliableDriverName(name: string, driverCode: string) {
  const normalizedName = normalizeDriverKey(name);
  const normalizedCode = normalizeDriverKey(driverCode);
  return Boolean(name.trim() && normalizedName && normalizedName !== normalizedCode && !/^\d+$/.test(normalizedName));
}

function activityWindowDays() {
  const value = Number(process.env.DRIVER_ACTIVITY_WINDOW_DAYS ?? 90);
  return Number.isFinite(value) && value > 0 ? value : 90;
}

function activeCutoffDate() {
  return new Date(Date.now() - activityWindowDays() * 86400000).toISOString().slice(0, 10);
}

function latestDate(...values: Array<unknown>) {
  return values.map(textValue).filter(Boolean).sort().at(-1) ?? "";
}

function operationalStatusFor(lastActivity: string) {
  if (!lastActivity) return "unknown";
  return lastActivity.slice(0, 10) >= activeCutoffDate() ? "active" : "inactive";
}

export function requireCanonicalDriverCode(value: unknown) {
  const code = normalizeDriverKey(value);
  if (!code) throw new Error("Informe o ID do motorista.");
  return code;
}

export function driverPortalPatchForAction(portalAction: string, hasCredential: boolean, now = new Date().toISOString()) {
  const patch: DbRow = { updated_at: now };
  if (portalAction === "allow") return { ...patch, portal_eligible: true, portal_status: hasCredential ? "reset_required" : "not_activated", status: "pending_activation" };
  if (portalAction === "block") return { ...patch, portal_eligible: false, portal_status: "blocked", status: "blocked" };
  if (portalAction === "reset_pin") return { ...patch, portal_eligible: true, portal_status: "reset_required", status: "pending_activation" };
  if (portalAction === "reactivate") {
    return hasCredential
      ? { ...patch, portal_eligible: true, portal_status: "active", status: "active" }
      : { ...patch, portal_eligible: true, portal_status: "not_activated", status: "pending_activation" };
  }
  if (portalAction === "revoke_sessions") return patch;
  throw new Error("Ação do portal não reconhecida.");
}

export function isSuperAdminProfile(profile: Pick<AuthProfile, "role" | "globalAccess">) {
  return hasFullAccess(profile) || profile.role === "super_admin";
}

export async function requirePortalProfile() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Sessão expirada. Entre novamente.");
  return profile;
}

export async function adminBaseScope(profile: AuthProfile) {
  if (isSuperAdminProfile(profile)) return null;
  const scope = await getUserAccessScope(profile);
  return getAllowedBaseIds(scope) ?? null;
}

export function assertBaseAccess(baseKey: string, allowedBases: string[] | null) {
  if (allowedBases && !allowedBases.includes(normalizeText(baseKey))) throw new Error("Acesso negado para a base solicitada.");
}

export async function loadDriverPortalBaseEnabled(baseKey: string, sigla?: string) {
  const normalized = driverPortalBaseAccessKey(baseKey, sigla);
  if (!normalized) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("driver_portal_base_access")
    .select("enabled")
    .eq("base_key", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.enabled);
}

async function loadDriverPortalBaseAccessMap() {
  const admin = createAdminClient();
  const rows = await readPaged<DbRow>(async (offset, pageSize) => {
    const { data, error, count } = await admin
      .from("driver_portal_base_access")
      .select("base_key,enabled", { count: "exact" })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as DbRow[], count };
  });
  return new Map(rows.map((row) => [textValue(row.base_key).trim().toUpperCase(), Boolean(row.enabled)]));
}

export async function syncOperationalBasesAndDrivers() {
  const admin = createAdminClient();
  const [hierarchy, driverRows, prefRows, pnrRows, riskRows, existingDrivers, baseAccess] = await Promise.all([
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin.from("hierarchy_scopes").select("base_key,base_name,sigla", { count: "exact" }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin.from("driver_records").select("driver_id,name,source_file,last_updated,base_key,sigla", { count: "exact" }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin.from("prefatura_records").select("driver_id,driver_name,base_key,base_name,sigla,route_date,created_at", { count: "exact" }).not("driver_id", "is", null).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin.from("pnr_records").select("driver_id,base_key,sigla,case_date,created_at", { count: "exact" }).not("driver_id", "is", null).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin.from("risk_lm_records").select("driver_id,base_key,sigla,failure_date,created_at", { count: "exact" }).not("driver_id", "is", null).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      const { data, error, count } = await admin.from("alc_drivers").select("id,driver_code,portal_eligible,portal_status,status,base_key", { count: "exact" }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    loadDriverPortalBaseAccessMap(),
  ]);
  const existingByCode = new Map(existingDrivers.map((row) => [textValue(row.driver_code), row]));

  const bases = new Map<string, { base_key: string; base_name: string; sigla: string }>();
  for (const row of hierarchy) {
    const baseKey = textValue(row.base_key);
    if (baseKey) bases.set(baseKey, { base_key: baseKey, base_name: textValue(row.base_name) || baseKey, sigla: textValue(row.sigla) });
  }
  for (const row of prefRows) {
    const baseKey = textValue(row.base_key);
    if (baseKey && !bases.has(baseKey)) bases.set(baseKey, { base_key: baseKey, base_name: textValue(row.base_name) || baseKey, sigla: textValue(row.sigla) });
  }
  if (bases.size) {
    const { error } = await admin.from("operational_bases").upsert([...bases.values()], { onConflict: "base_key" });
    if (error) throw new Error(error.message);
  }

  const drivers = new Map<string, { driver_code: string; full_name: string; base_key: string; sigla: string; operational_status: string; portal_eligible: boolean; portal_status: string; status: string; last_operational_seen_at?: string; source_updated_at?: string; source_payload: DbRow }>();
  for (const row of driverRows) {
    const code = textValue(row.driver_id);
    const name = textValue(row.name);
    if (!code) continue;
    const existing = existingByCode.get(code);
    const lastActivity = textValue(row.last_updated);
    drivers.set(code, {
      driver_code: code,
      full_name: isReliableDriverName(name, code) ? name : code,
      base_key: textValue(row.base_key),
      sigla: textValue(row.sigla),
      operational_status: operationalStatusFor(lastActivity),
      portal_eligible: portalEligibilityFromBase(Boolean(baseAccess.get(driverPortalBaseAccessKey(row.base_key, row.sigla))), textValue(existing?.portal_status) || "not_activated"),
      portal_status: textValue(existing?.portal_status) || "not_activated",
      status: textValue(existing?.status) || "pending_activation",
      last_operational_seen_at: lastActivity || undefined,
      source_updated_at: textValue(row.last_updated) || undefined,
      source_payload: { source: "driver_records", source_file: row.source_file, last_activity_source: "driver_records", activity_window_days: activityWindowDays() },
    });
  }
  const touchDriver = (row: DbRow, source: string, dateField: string, nameField = "driver_name") => {
    const code = textValue(row.driver_id);
    if (!code) return;
    const name = textValue(row[nameField]);
    const current = drivers.get(code);
    const existing = existingByCode.get(code);
    const activity = latestDate(row[dateField], row.created_at);
    const lastActivity = latestDate(current?.last_operational_seen_at, activity);
    drivers.set(code, {
      driver_code: code,
      full_name: current && isReliableDriverName(current.full_name, code) ? current.full_name : isReliableDriverName(name, code) ? name : code,
      base_key: current?.base_key || textValue(row.base_key),
      sigla: current?.sigla || textValue(row.sigla),
      operational_status: operationalStatusFor(lastActivity),
      portal_eligible: portalEligibilityFromBase(Boolean(baseAccess.get(driverPortalBaseAccessKey(current?.base_key || row.base_key, current?.sigla || row.sigla))), textValue(existing?.portal_status ?? current?.portal_status) || "not_activated"),
      portal_status: textValue(existing?.portal_status ?? current?.portal_status) || "not_activated",
      status: textValue(existing?.status ?? current?.status) || "pending_activation",
      last_operational_seen_at: lastActivity || undefined,
      source_updated_at: current?.source_updated_at,
      source_payload: { source, last_activity_source: source, activity_window_days: activityWindowDays() },
    });
  };
  for (const row of prefRows) touchDriver(row, "prefatura_records", "route_date");
  for (const row of pnrRows) touchDriver(row, "pnr_records", "case_date", "driver_id");
  for (const row of riskRows) touchDriver(row, "risk_lm_records", "failure_date", "driver_id");
  if (drivers.size) {
    const rows = [...drivers.values()].filter((driver) => driver.base_key);
    if (rows.length) {
      const { error } = await admin.from("alc_drivers").upsert(rows, { onConflict: "driver_code" });
      if (error) throw new Error(error.message);
      const driverIdsToRevoke = rows
        .filter((row) => !row.portal_eligible && Boolean(existingByCode.get(row.driver_code)?.portal_eligible))
        .map((row) => textValue(existingByCode.get(row.driver_code)?.id))
        .filter(Boolean);
      if (driverIdsToRevoke.length) {
        const { error: sessionError } = await admin
          .from("driver_portal_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .in("driver_id", driverIdsToRevoke)
          .is("revoked_at", null);
        if (sessionError) throw new Error(sessionError.message);
      }
    }
  }
}

export async function loadKnownDrivers(allowedBases: string[] | null = null) {
  const admin = createAdminClient();
  let query = admin
    .from("alc_drivers")
    .select("id,driver_code,full_name,base_key,sigla,status,portal_status,portal_eligible,operational_status,last_seen_at,last_operational_seen_at,auth_user_id,source_payload,operational_bases(base_name)");
  if (allowedBases) query = query.in("base_key", allowedBases.length ? allowedBases : ["__none__"]);
  const { data, error } = await query.order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).map((row) => ({
    id: textValue(row.id),
    driverCode: textValue(row.driver_code),
    fullName: textValue(row.full_name),
    baseKey: textValue(row.base_key),
    sigla: textValue(row.sigla),
    status: textValue(row.status),
    portalStatus: textValue(row.portal_status) || textValue(row.status),
    portalEligible: Boolean(row.portal_eligible),
    operationalStatus: textValue(row.operational_status) || "unknown",
    lastSeenAt: textValue(row.last_seen_at),
    lastOperationalSeenAt: textValue(row.last_operational_seen_at),
    authUserId: textValue(row.auth_user_id),
    baseName: textValue((row.operational_bases as DbRow | null)?.base_name) || textValue(row.base_key),
    quality: isReliableDriverName(textValue(row.full_name), textValue(row.driver_code)) && textValue(row.base_key) && textValue(row.sigla) ? "resolved" : "needs_review",
    lastActivitySource: textValue((row.source_payload as DbRow | null)?.last_activity_source),
    pilotCandidate: !Boolean(row.portal_eligible)
      && textValue(row.portal_status) !== "blocked"
      && textValue(row.operational_status) === "active"
      && isReliableDriverName(textValue(row.full_name), textValue(row.driver_code))
      && Boolean(textValue(row.base_key) && textValue(row.sigla)),
  }));
}

export async function loadDriverByAuthUser(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("alc_drivers")
    .select("id,driver_code,full_name,base_key,sigla,status,auth_user_id,operational_bases(base_name)")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DbRow | null;
}

export async function loadTickets(options: { allowedBases?: string[] | null; driverId?: string; driverCode?: string }) {
  const admin = createAdminClient();
  const driverCode = options.driverCode ? normalizeDriverKey(options.driverCode) : "";
  const allowedBases = options.allowedBases ?? null;
  const baseFilter = allowedBases ? (allowedBases.length ? allowedBases : ["__none__"]) : null;
  const [prefaturaRows, pnrRows, riskRows] = await Promise.all([
    readPaged<DbRow>(async (offset, pageSize) => {
      let query = admin
        .from("prefatura_records")
        .select("id,shipment_id,route_id,operation,route_date,base_key,base_name,sigla,driver_id,driver_name,value,created_at", { count: "exact" });
      if (driverCode) query = query.eq("driver_id", driverCode);
      if (baseFilter) query = query.in("base_key", baseFilter);
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      let query = admin
        .from("pnr_records")
        .select("id,shipment_id,route_id,status,case_date,base_key,sigla,driver_id,purchase_value,created_at", { count: "exact" });
      if (driverCode) query = query.eq("driver_id", driverCode);
      if (baseFilter) query = query.in("base_key", baseFilter);
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
    readPaged<DbRow>(async (offset, pageSize) => {
      let query = admin
        .from("risk_lm_records")
        .select("id,shipment_id,route_id,failure_date,base_key,sigla,driver_id,gmv_brl,failure_reason,created_at", { count: "exact" });
      if (driverCode) query = query.eq("driver_id", driverCode);
      if (baseFilter) query = query.in("base_key", baseFilter);
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DbRow[], count };
    }),
  ]);

  const tickets: DriverTicket[] = [];

  for (const row of prefaturaRows) {
    const baseKey = textValue(row.base_key);
    const code = textValue(row.driver_id);
    const driverName = textValue(row.driver_name);
    const operation = textValue(row.operation);
    const type = operation === "PNR" ? "pnr" : "pacote_perdido";
    const date = textValue(row.route_date) || textValue(row.created_at);
    tickets.push({
      id: `prefatura:${textValue(row.id)}`,
      type,
      operationalId: textValue(row.shipment_id),
      routeId: textValue(row.route_id),
      baseKey,
      baseName: textValue(row.base_name) || baseKey,
      sigla: textValue(row.sigla),
      driverCode: code,
      driverName,
      date,
      value: numberValue(row.value),
      status: "com_penalidade",
      lastUpdate: textValue(row.created_at),
      source: "prefatura",
      history: [{ at: date, label: "Pré-fatura", detail: operation === "PNR" ? "Desconto PNR vinculado ao pacote." : "Pacote perdido lançado para conferência." }],
      isNew: new Date(textValue(row.created_at)).getTime() > Date.now() - 7 * 86400000,
    });
  }

  for (const row of pnrRows) {
    const baseKey = textValue(row.base_key);
    const code = textValue(row.driver_id);
    const status = pnrStatusToTicket(textValue(row.status));
    const date = textValue(row.case_date) || textValue(row.created_at);
    tickets.push({
      id: `pnr:${textValue(row.id)}`,
      type: status === "aguardando_comprovante" ? "aguardando_comprovante" : "pnr",
      operationalId: textValue(row.shipment_id),
      routeId: textValue(row.route_id),
      baseKey,
      baseName: baseKey,
      sigla: textValue(row.sigla),
      driverCode: code,
      driverName: code,
      date,
      value: numberValue(row.purchase_value),
      status,
      lastUpdate: textValue(row.created_at),
      source: "pnr",
      history: [{ at: date, label: textValue(row.status) || "PNR", detail: "Status operacional recebido no relatório PNR." }],
      isNew: new Date(textValue(row.created_at)).getTime() > Date.now() - 7 * 86400000,
    });
  }

  for (const row of riskRows) {
    const baseKey = textValue(row.base_key);
    const code = textValue(row.driver_id);
    const date = textValue(row.failure_date) || textValue(row.created_at);
    tickets.push({
      id: `risk:${textValue(row.id)}`,
      type: "pendente",
      operationalId: textValue(row.shipment_id),
      routeId: textValue(row.route_id),
      baseKey,
      baseName: baseKey,
      sigla: textValue(row.sigla),
      driverCode: code,
      driverName: code,
      date,
      value: numberValue(row.gmv_brl),
      status: "pendente",
      lastUpdate: textValue(row.created_at),
      source: "risk",
      history: [{ at: date, label: "Risco LM", detail: textValue(row.failure_reason) || "Ocorrência operacional em acompanhamento." }],
      isNew: new Date(textValue(row.created_at)).getTime() > Date.now() - 7 * 86400000,
    });
  }

  return tickets.sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate));
}
