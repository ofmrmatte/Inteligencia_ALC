import { NextResponse } from "next/server";
import { DRIVER_MANAGEMENT_TABS, roleDriverManagementCap, roleModuleCap } from "@/lib/access-control";
import { canManageUsers, isUserRole, MANAGED_USER_ROLES, type UserRole } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

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

function allowedSubset(values: string[], allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  return values.filter((value) => allowedSet.has(value));
}

function mapManagedUser(row: DbRow) {
  const role = parseRole(row.role);
  return {
    id: toStringValue(row.id),
    email: toStringValue(row.email),
    fullName: toStringValue(row.full_name),
    role,
    globalAccess: fullRole(role),
    active: row.active !== false,
    baseScope: toStringArray(row.base_scope),
    moduleScope: toStringArray(row.module_scope),
    driverManagementScope: toStringArray(row.driver_management_scope),
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

function parseUserPayload(payload: DbRow, requirePassword: boolean) {
  const email = normalizeEmail(payload.email);
  const password = toStringValue(payload.password);
  const role = parseRole(payload.role);
  if (!managedRole(role)) throw new Error("Cargo não permitido para cadastro interno.");
  if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (requirePassword && password.length < 6) throw new Error("A senha inicial precisa ter pelo menos 6 caracteres.");

  const moduleCap = roleModuleCap(role);
  const tabCap = roleDriverManagementCap(role);
  const requestedModules = toStringArray(payload.moduleScope ?? payload.module_scope);
  const requestedTabs = toStringArray(payload.driverManagementScope ?? payload.driver_management_scope);
  const moduleScope = fullRole(role) ? moduleCap : allowedSubset(requestedModules.length ? requestedModules : moduleCap, moduleCap);
  const driverManagementScope = fullRole(role) ? tabCap : allowedSubset(requestedTabs.length ? requestedTabs : tabCap, tabCap);

  return {
    email,
    password,
    fullName: toStringValue(payload.fullName ?? payload.full_name).trim(),
    role,
    globalAccess: fullRole(role),
    active: payload.active !== false,
    baseScope: fullRole(role) || role === "administration_supervisor" ? [] : toStringArray(payload.baseScope ?? payload.base_scope),
    moduleScope,
    driverManagementScope,
  };
}

async function resolveBaseScopes(admin: ReturnType<typeof createAdminClient>, baseScope: string[]) {
  if (!baseScope.length) return { baseScope: [], siglaScope: [] };
  const { data, error } = await admin.from("operational_bases").select("base_key,sigla").in("base_key", baseScope);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DbRow[];
  const validBaseScope = [...new Set(rows.map((row) => toStringValue(row.base_key)).filter(Boolean))];
  const siglaScope = [...new Set(rows.map((row) => toStringValue(row.sigla)).filter(Boolean))];
  return { baseScope: validBaseScope, siglaScope };
}

async function responsePayload() {
  const admin = createAdminClient();
  const [{ data: users, error: usersError }, { data: bases, error: basesError }] = await Promise.all([
    admin.from("profiles").select("*").neq("role", "driver").order("email", { ascending: true }),
    admin.from("operational_bases").select("base_key,base_name,sigla,active").eq("active", true).order("sigla", { ascending: true }),
  ]);
  if (usersError) throw new Error(usersError.message);
  if (basesError) throw new Error(basesError.message);
  return NextResponse.json({
    roles: MANAGED_USER_ROLES,
    driverManagementTabs: DRIVER_MANAGEMENT_TABS,
    users: ((users ?? []) as DbRow[]).map(mapManagedUser),
    bases: ((bases ?? []) as DbRow[]).map((row) => ({
      baseKey: toStringValue(row.base_key),
      baseName: toStringValue(row.base_name) || toStringValue(row.base_key),
      sigla: toStringValue(row.sigla),
      label: `${toStringValue(row.sigla) || toStringValue(row.base_key)} - ${toStringValue(row.base_name) || toStringValue(row.base_key)}`,
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
    const scopes = await resolveBaseScopes(admin, payload.baseScope);
    if (!["director", "developer", "loss_supervisor", "administration_supervisor"].includes(payload.role) && scopes.baseScope.length === 0) {
      throw new Error("Selecione ao menos uma base responsável para este cargo.");
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
      module_scope: payload.moduleScope,
      driver_management_scope: payload.driverManagementScope,
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw new Error(profileError.message);

    return await responsePayload();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cadastrar usuário.";
    return jsonError(message, message.includes("SERVICE_ROLE") ? 503 : 400);
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
    const scopes = await resolveBaseScopes(admin, payload.baseScope);
    if (!["director", "developer", "loss_supervisor", "administration_supervisor"].includes(payload.role) && scopes.baseScope.length === 0) {
      throw new Error("Selecione ao menos uma base responsável para este cargo.");
    }

    const { error: profileError } = await admin.from("profiles").update({
      email: payload.email,
      full_name: payload.fullName || payload.email,
      role: payload.role,
      global_access: payload.globalAccess,
      active: payload.active,
      base_scope: scopes.baseScope,
      sigla_scope: scopes.siglaScope,
      module_scope: payload.moduleScope,
      driver_management_scope: payload.driverManagementScope,
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
