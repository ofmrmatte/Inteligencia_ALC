import { NextResponse } from "next/server";
import { roleModuleCap } from "@/lib/access-control";
import { canManageUsers, isUserRole, MANAGED_USER_ROLES, type UserRole } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient>;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(toStringValue).map((item) => item.trim()).filter(Boolean))];
  if (typeof value !== "string") return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function normalizeEmail(value: unknown) {
  return toStringValue(value).trim().toLowerCase();
}

function parseRole(value: unknown): UserRole {
  return isUserRole(value) && value !== "driver" && value !== "super_admin" ? value : "coordinator";
}

function managedRole(role: UserRole) {
  return MANAGED_USER_ROLES.includes(role as (typeof MANAGED_USER_ROLES)[number]);
}

function fullRole(role: UserRole) {
  return ["director", "developer", "loss_supervisor"].includes(role);
}

function globalOperationalRole(role: UserRole) {
  return ["director", "developer", "loss_supervisor", "loss_admin"].includes(role);
}

function supportsXptScope(role: UserRole) {
  return role === "coordinator" || role === "supervisor";
}

function requiresOperationalScope(role: UserRole) {
  return role === "coordinator" || role === "supervisor";
}

function allowedSubset(values: string[], allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  return [...new Set(values.filter((value) => allowedSet.has(value)))];
}

function hasPayloadField(payload: DbRow, camel: string, snake: string) {
  return Object.prototype.hasOwnProperty.call(payload, camel) || Object.prototype.hasOwnProperty.call(payload, snake);
}

function parseUserPayload(payload: DbRow, requirePassword: boolean) {
  const email = normalizeEmail(payload.email);
  const password = toStringValue(payload.password);
  const role = parseRole(payload.role);
  if (!managedRole(role)) throw new Error("Cargo não permitido para cadastro interno.");
  if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (requirePassword && password.length < 6) throw new Error("A senha inicial precisa ter pelo menos 6 caracteres.");

  const moduleCap = roleModuleCap(role);
  const hasModules = hasPayloadField(payload, "moduleScope", "module_scope");
  const requestedModules = toStringArray(payload.moduleScope ?? payload.module_scope);

  const moduleScope = fullRole(role)
    ? moduleCap
    : allowedSubset(hasModules ? requestedModules : moduleCap, moduleCap);

  if (!fullRole(role) && moduleScope.length === 0) {
    throw new Error("Selecione ao menos um módulo permitido para o usuário.");
  }

  return {
    email,
    password,
    fullName: toStringValue(payload.fullName ?? payload.full_name).trim(),
    role,
    globalAccess: globalOperationalRole(role),
    active: payload.active !== false,
    baseScope: globalOperationalRole(role) ? [] : toStringArray(payload.baseScope ?? payload.base_scope),
    xptScope: supportsXptScope(role) ? toStringArray(payload.xptScope ?? payload.xpt_scope) : [],
    moduleScope,
  };
}

async function loadBaseRows(admin: AdminClient) {
  const { data, error } = await admin
    .from("operational_units")
    .select("unit_key,base_key,base_name,sigla,xpt_code,coordinator_name,active")
    .eq("active", true)
    .order("sigla", { ascending: true })
    .order("base_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbRow[];
}

async function loadXptRows(admin: AdminClient) {
  const { data, error } = await admin
    .from("operational_xpts")
    .select("xpt_code,active")
    .eq("active", true)
    .order("xpt_code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbRow[];
}

function canonicalBaseFor(requested: string, bases: DbRow[], siglaHints: string[] = []) {
  const normalized = normalizeText(requested);
  if (!normalized) return null;

  const exactUnit = bases.filter((row) => normalizeText(row.unit_key) === normalized);
  if (exactUnit.length === 1) return exactUnit[0];

  const exactBase = bases.filter((row) => normalizeText(row.base_key) === normalized);
  if (exactBase.length === 1) return exactBase[0];
  if (exactBase.length > 1) {
    const hints = new Set(siglaHints.map(normalizeText));
    const hinted = exactBase.filter((row) => hints.has(normalizeText(row.sigla)));
    if (hinted.length === 1) return hinted[0];
  }

  const exactSigla = bases.filter((row) => normalizeText(row.sigla) === normalized);
  return exactSigla.length === 1 ? exactSigla[0] : null;
}

async function resolveBaseScopes(admin: AdminClient, requested: string[], role: UserRole, preloadedBases?: DbRow[]) {
  if (!requested.length) return { baseScope: [] as string[], siglaScope: [] as string[] };
  const bases = preloadedBases ?? await loadBaseRows(admin);
  const resolved = requested.map((value) => canonicalBaseFor(value, bases));
  const unresolved = requested.filter((_, index) => !resolved[index]);
  if (unresolved.length) throw new Error(`Base(s) não reconhecida(s): ${unresolved.join(", ")}.`);
  const rows = resolved.filter((row): row is DbRow => Boolean(row));
  const useUnitKey = role === "coordinator" || role === "supervisor";
  return {
    baseScope: [...new Set(rows.map((row) => toStringValue(useUnitKey ? row.unit_key : row.base_key)).filter(Boolean))],
    siglaScope: [...new Set(rows.map((row) => toStringValue(row.sigla)).filter(Boolean))],
  };
}

async function resolveXptScope(admin: AdminClient, requested: string[], role: UserRole, preloadedXpts?: DbRow[]) {
  if (!supportsXptScope(role) || !requested.length) return [] as string[];
  const rows = preloadedXpts ?? await loadXptRows(admin);
  const byNormalized = new Map(rows.map((row) => [normalizeText(row.xpt_code), toStringValue(row.xpt_code)]));
  const resolved = requested.map((value) => byNormalized.get(normalizeText(value)) ?? "");
  const unresolved = requested.filter((_, index) => !resolved[index]);
  if (unresolved.length) throw new Error(`XPT(s) não reconhecido(s): ${unresolved.join(", ")}.`);
  return [...new Set(resolved.filter(Boolean))];
}

function canonicalizeStoredBaseScope(values: string[], siglaScope: string[], bases: DbRow[]) {
  if (!values.length) return [];
  const result = values.map((value) => canonicalBaseFor(value, bases, siglaScope));
  return [...new Set(result.map((row, index) => {
    if (!row) return values[index];
    return toStringValue(row.unit_key) || values[index];
  }).filter(Boolean))];
}

function canonicalizeStoredXptScope(values: string[], xpts: DbRow[]) {
  if (!values.length) return [];
  const byNormalized = new Map(xpts.map((row) => [normalizeText(row.xpt_code), toStringValue(row.xpt_code)]));
  return [...new Set(values.map((value) => byNormalized.get(normalizeText(value)) ?? value).filter(Boolean))];
}

function mapManagedUser(row: DbRow, bases: DbRow[], xpts: DbRow[]) {
  const role = parseRole(row.role);
  const siglaScope = toStringArray(row.sigla_scope);
  return {
    id: toStringValue(row.id),
    email: toStringValue(row.email),
    fullName: toStringValue(row.full_name),
    role,
    globalAccess: globalOperationalRole(role),
    active: row.active !== false,
    baseScope: canonicalizeStoredBaseScope(toStringArray(row.base_scope), siglaScope, bases),
    xptScope: canonicalizeStoredXptScope(toStringArray(row.xpt_scope), xpts),
    moduleScope: toStringArray(row.module_scope),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
  };
}

async function requireUserManager() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Sessão expirada. Entre novamente.");
  if (!canManageUsers(profile)) throw new Error("Gestão de usuários restrita à Diretoria, Desenvolvedor e Supervisor Loss.");
  return profile;
}

async function responsePayload() {
  const admin = createAdminClient();
  const [usersResult, bases, xpts] = await Promise.all([
    admin.from("profiles").select("*").in("role", [...MANAGED_USER_ROLES]).order("email", { ascending: true }),
    loadBaseRows(admin),
    loadXptRows(admin),
  ]);
  if (usersResult.error) throw new Error(usersResult.error.message);
  return NextResponse.json({
    roles: MANAGED_USER_ROLES,
    users: ((usersResult.data ?? []) as DbRow[]).map((row) => mapManagedUser(row, bases, xpts)),
    bases: bases.map((row) => ({
      baseKey: toStringValue(row.unit_key),
      baseName: toStringValue(row.base_name) || toStringValue(row.base_key),
      sigla: toStringValue(row.sigla),
      label: `${toStringValue(row.sigla)} - ${toStringValue(row.base_name) || toStringValue(row.base_key)}`,
    })),
    xpts: xpts.map((row) => ({
      xptCode: toStringValue(row.xpt_code),
      label: toStringValue(row.xpt_code),
    })),
  });
}

export async function GET() {
  try {
    await requireUserManager();
    return await responsePayload();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar usuários.";
    const status = message.includes("SERVICE_ROLE") ? 503 : message.includes("restrita") ? 403 : 401;
    return jsonError(message, status);
  }
}

export async function POST(request: Request) {
  try {
    await requireUserManager();
    const admin = createAdminClient();
    const payload = parseUserPayload((await request.json()) as DbRow, true);
    const [scopes, xptScope] = await Promise.all([
      resolveBaseScopes(admin, payload.baseScope, payload.role),
      resolveXptScope(admin, payload.xptScope, payload.role),
    ]);
    if (requiresOperationalScope(payload.role) && scopes.baseScope.length === 0 && xptScope.length === 0) {
      throw new Error("Selecione ao menos uma SVC/base ou um XPT responsável para este cargo.");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName },
    });
    if (createError) throw new Error(createError.message);
    if (!created.user) throw new Error("Usuário não retornado pelo Supabase Auth.");

    const { error: profileError } = await admin.from("profiles").upsert({
      id: created.user.id,
      email: payload.email,
      full_name: payload.fullName || payload.email,
      role: payload.role,
      global_access: payload.globalAccess,
      active: payload.active,
      base_scope: scopes.baseScope,
      sigla_scope: scopes.siglaScope,
      xpt_scope: xptScope,
      module_scope: payload.moduleScope,
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw new Error(profileError.message);

    return await responsePayload();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cadastrar usuário.";
    return jsonError(message, message.includes("restrita") ? 403 : message.includes("SERVICE_ROLE") ? 503 : 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const manager = await requireUserManager();
    const admin = createAdminClient();
    const body = (await request.json()) as DbRow;
    const id = toStringValue(body.id);
    if (!id) throw new Error("Usuário não informado.");
    const payload = parseUserPayload(body, false);
    if (id === manager.id && payload.active === false) throw new Error("Você não pode desativar sua própria conta.");
    const [scopes, xptScope] = await Promise.all([
      resolveBaseScopes(admin, payload.baseScope, payload.role),
      resolveXptScope(admin, payload.xptScope, payload.role),
    ]);
    if (requiresOperationalScope(payload.role) && scopes.baseScope.length === 0 && xptScope.length === 0) {
      throw new Error("Selecione ao menos uma SVC/base ou um XPT responsável para este cargo.");
    }

    const { error: profileError } = await admin.from("profiles").update({
      email: payload.email,
      full_name: payload.fullName || payload.email,
      role: payload.role,
      global_access: payload.globalAccess,
      active: payload.active,
      base_scope: scopes.baseScope,
      sigla_scope: scopes.siglaScope,
      xpt_scope: xptScope,
      module_scope: payload.moduleScope,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (profileError) throw new Error(profileError.message);

    const updateAuth: { email?: string; password?: string; user_metadata?: { full_name: string } } = {
      email: payload.email,
      user_metadata: { full_name: payload.fullName },
    };
    if (payload.password) updateAuth.password = payload.password;
    const { error: authError } = await admin.auth.admin.updateUserById(id, updateAuth);
    if (authError) throw new Error(authError.message);

    return await responsePayload();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar usuário.";
    return jsonError(message, message.includes("restrita") ? 403 : message.includes("SERVICE_ROLE") ? 503 : 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const manager = await requireUserManager();
    const admin = createAdminClient();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Usuário não informado.");
    if (id === manager.id) throw new Error("Você não pode remover sua própria conta.");

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    await admin.from("profiles").delete().eq("id", id);
    return await responsePayload();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover usuário.";
    return jsonError(message, message.includes("restrita") ? 403 : message.includes("SERVICE_ROLE") ? 503 : 400);
  }
}
