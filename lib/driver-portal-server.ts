import { hasFullAccess, type AuthProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeDriverKey, pnrStatusToTicket, type DriverTicket } from "@/lib/driver-portal";

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
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_base_assignments")
    .select("base_key")
    .eq("admin_id", profile.id)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return [...new Set([...profile.baseScope, ...((data ?? []) as DbRow[]).map((row) => textValue(row.base_key))].filter(Boolean))];
}

export function assertBaseAccess(baseKey: string, allowedBases: string[] | null) {
  if (allowedBases && !allowedBases.includes(baseKey)) throw new Error("Acesso negado para a base solicitada.");
}

export async function syncOperationalBasesAndDrivers() {
  const admin = createAdminClient();
  const [{ data: hierarchy }, { data: driverRows }, { data: prefRows }] = await Promise.all([
    admin.from("hierarchy_scopes").select("base_key,base_name,sigla"),
    admin.from("driver_records").select("driver_id,name,source_file,last_updated"),
    admin.from("prefatura_records").select("driver_name,base_key,base_name,sigla").not("driver_name", "is", null),
  ]);

  const bases = new Map<string, { base_key: string; base_name: string; sigla: string }>();
  for (const row of (hierarchy ?? []) as DbRow[]) {
    const baseKey = textValue(row.base_key);
    if (baseKey) bases.set(baseKey, { base_key: baseKey, base_name: textValue(row.base_name) || baseKey, sigla: textValue(row.sigla) });
  }
  for (const row of (prefRows ?? []) as DbRow[]) {
    const baseKey = textValue(row.base_key);
    if (baseKey && !bases.has(baseKey)) bases.set(baseKey, { base_key: baseKey, base_name: textValue(row.base_name) || baseKey, sigla: textValue(row.sigla) });
  }
  if (bases.size) {
    const { error } = await admin.from("operational_bases").upsert([...bases.values()], { onConflict: "base_key" });
    if (error) throw new Error(error.message);
  }

  const drivers = new Map<string, { driver_code: string; full_name: string; base_key: string; sigla: string; portal_login: string }>();
  for (const row of (driverRows ?? []) as DbRow[]) {
    const code = textValue(row.driver_id);
    const name = textValue(row.name);
    if (code && name) drivers.set(code, { driver_code: code, full_name: name, base_key: "", sigla: "", portal_login: `${normalizeDriverKey(code).toLowerCase()}@motorista.alc.local` });
  }
  for (const row of (prefRows ?? []) as DbRow[]) {
    const name = textValue(row.driver_name);
    const code = normalizeDriverKey(name);
    if (!name || !code) continue;
    const current = drivers.get(code);
    drivers.set(code, {
      driver_code: code,
      full_name: current?.full_name || name,
      base_key: current?.base_key || textValue(row.base_key),
      sigla: current?.sigla || textValue(row.sigla),
      portal_login: `${code.toLowerCase()}@motorista.alc.local`,
    });
  }
  if (drivers.size) {
    const rows = [...drivers.values()].filter((driver) => driver.base_key);
    if (rows.length) {
      const { error } = await admin.from("alc_drivers").upsert(rows, { onConflict: "driver_code" });
      if (error) throw new Error(error.message);
    }
  }
}

export async function loadKnownDrivers(allowedBases: string[] | null = null) {
  const admin = createAdminClient();
  let query = admin.from("alc_drivers").select("id,driver_code,full_name,base_key,sigla,status,auth_user_id,operational_bases(base_name)");
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
    authUserId: textValue(row.auth_user_id),
    baseName: textValue((row.operational_bases as DbRow | null)?.base_name) || textValue(row.base_key),
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
  const [prefatura, pnr, risk] = await Promise.all([
    admin.from("prefatura_records").select("id,shipment_id,route_id,operation,route_date,base_key,base_name,sigla,driver_name,value,created_at").limit(5000),
    admin.from("pnr_records").select("id,shipment_id,route_id,status,case_date,base_key,sigla,driver_id,purchase_value,created_at").limit(5000),
    admin.from("risk_lm_records").select("id,shipment_id,route_id,failure_date,base_key,sigla,driver_id,gmv_brl,failure_reason,created_at").limit(5000),
  ]);
  for (const result of [prefatura, pnr, risk]) if (result.error) throw new Error(result.error.message);

  const tickets: DriverTicket[] = [];
  const allowed = (baseKey: string) => !allowedBases || allowedBases.includes(baseKey);
  const driverMatches = (value: string) => !driverCode || normalizeDriverKey(value) === driverCode;

  for (const row of (prefatura.data ?? []) as DbRow[]) {
    const baseKey = textValue(row.base_key);
    const driverName = textValue(row.driver_name);
    if (!allowed(baseKey) || !driverMatches(driverName)) continue;
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
      driverCode: normalizeDriverKey(driverName),
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

  for (const row of (pnr.data ?? []) as DbRow[]) {
    const baseKey = textValue(row.base_key);
    const code = textValue(row.driver_id);
    if (!allowed(baseKey) || !driverMatches(code)) continue;
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

  for (const row of (risk.data ?? []) as DbRow[]) {
    const baseKey = textValue(row.base_key);
    const code = textValue(row.driver_id);
    if (!allowed(baseKey) || !driverMatches(code)) continue;
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
