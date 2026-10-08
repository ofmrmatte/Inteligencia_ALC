import { NextResponse } from "next/server";
import { roleModuleCap } from "@/lib/access-control";
import { canManageRole, canManageUserTransition, canManageUsers, isUserRole, manageableUserRoles, MANAGED_USER_ROLES, type AuthProfile, type UserRole } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { hrDb } from "@/lib/hr/db";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient>;
type DepartmentRow = { id: string; name: string };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
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

class UserManagementAccessError extends Error {}

function parseRole(value: unknown): UserRole {
  if (!isUserRole(value)) throw new Error("Cargo inválido.");
  return value;
}

function validateManagedPassword(password: string, required: boolean) {
  if (!password && !required) return;
  if (password.length < 12) throw new Error("A senha precisa ter pelo menos 12 caracteres.");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("A senha precisa combinar maiúscula, minúscula, número e símbolo.");
  }
}

function ensureCanManageRole(manager: Pick<AuthProfile, "role">, role: UserRole) {
  if (!canManageRole(manager, role)) {
    throw new UserManagementAccessError("Você não possui permissão para gerenciar este cargo.");
  }
}

function userManagementStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha na gestão de usuários.";
  if (error instanceof UserManagementAccessError) return { message, status: 403 };
  if (message.includes("SERVICE_ROLE") || message.includes("HR_DATABASE_UNAVAILABLE")) return { message, status: 503 };
  if (message.includes("Sessão expirada")) return { message, status: 401 };
  if (message.includes("restrita")) return { message, status: 403 };
  return { message, status: 400 };
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
  validateManagedPassword(password, requirePassword);

  const setor = toStringValue(payload.setor).trim();
  if (setor.length > 160) throw new Error("Setor inválido.");

  const moduleCap = roleModuleCap(role);
  const hasModules = hasPayloadField(payload, "moduleScope", "module_scope");
  const requestedModules = toStringArray(payload.moduleScope ?? payload.module_scope);
  const moduleScope = fullRole(role) ? moduleCap : allowedSubset(hasModules ? requestedModules : moduleCap, moduleCap);

  if (!fullRole(role) && moduleScope.length === 0) {
    throw new Error("Selecione ao menos um módulo permitido para o usuário.");
  }

  return {
    email,
    password,
    fullName: toStringValue(payload.fullName ?? payload.full_name).trim(),
    role,
    setor,
    globalAccess: globalOperationalRole(role),
    active: payload.active !== false,
    moduleScope,
  };
}

async function loadDepartments(): Promise<DepartmentRow[]> {
  const { rows } = await hrDb().query<DepartmentRow>(
    "SELECT id::text,name FROM hr_departments WHERE active=true ORDER BY name",
  );
  return rows;
}

function canonicalSetor(requested: string, departments: DepartmentRow[], current = "") {
  if (!requested) return "";
  const normalized = normalizeText(requested);
  const match = departments.find((department) => normalizeText(department.name) === normalized);
  if (match) return match.name;
  if (current && normalizeText(current) === normalized) return current;
  throw new Error("Selecione um setor ativo do Recursos Humanos.");
}

function mapManagedUser(row: DbRow) {
  const role = parseRole(row.role);
  return {
    id: toStringValue(row.id),
    email: toStringValue(row.email),
    fullName: toStringValue(row.full_name),
    role,
    setor: toStringValue(row.setor),
    globalAccess: globalOperationalRole(role),
    active: row.active !== false,
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

async function loadTargetProfile(admin: AdminClient, id: string) {
  const { data, error } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Usuário não encontrado.");
  return data as DbRow;
}

async function writeUserAudit(
  admin: AdminClient,
  actorId: string,
  action: string,
  entityId: string,
  beforeData: DbRow | null,
  afterData: DbRow | null,
) {
  const { error } = await admin.from("audit_events").insert({
    actor_id: actorId,
    action,
    entity_table: "profiles",
    entity_id: entityId,
    before_data: beforeData,
    after_data: afterData,
  });
  if (error) console.error("[security-audit] Falha ao registrar gestão de usuário:", error.message);
}

async function responsePayload(manager: AuthProfile) {
  const admin = createAdminClient();
  const allowedRoles = manageableUserRoles(manager);
  const [usersResult, departments] = await Promise.all([
    admin.from("profiles").select("*").in("role", allowedRoles).order("email", { ascending: true }),
    loadDepartments(),
  ]);
  if (usersResult.error) throw new Error(usersResult.error.message);
  return NextResponse.json({
    roles: allowedRoles,
    users: ((usersResult.data ?? []) as DbRow[]).map(mapManagedUser),
    departments,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  try {
    const manager = await requireUserManager();
    return await responsePayload(manager);
  } catch (error) {
    const result = userManagementStatus(error);
    return jsonError(result.message, result.status);
  }
}

export async function POST(request: Request) {
  try {
    const manager = await requireUserManager();
    const admin = createAdminClient();
    const payload = parseUserPayload((await request.json()) as DbRow, true);
    ensureCanManageRole(manager, payload.role);
    const departments = await loadDepartments();
    const setor = canonicalSetor(payload.setor, departments);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName },
    });
    if (createError) throw new Error(createError.message);
    if (!created.user) throw new Error("Usuário não retornado pelo Supabase Auth.");

    const afterData = {
      id: created.user.id,
      email: payload.email,
      full_name: payload.fullName || payload.email,
      role: payload.role,
      setor,
      global_access: payload.globalAccess,
      active: payload.active,
      base_scope: [],
      sigla_scope: [],
      xpt_scope: [],
      module_scope: payload.moduleScope,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await admin.from("profiles").upsert(afterData);
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw new Error(profileError.message);
    }

    await writeUserAudit(admin, manager.id, "user.create", created.user.id, null, afterData);
    return await responsePayload(manager);
  } catch (error) {
    const result = userManagementStatus(error);
    return jsonError(result.message, result.status);
  }
}

export async function PATCH(request: Request) {
  try {
    const manager = await requireUserManager();
    const admin = createAdminClient();
    const body = (await request.json()) as DbRow;
    const id = toStringValue(body.id);
    if (!id) throw new Error("Usuário não informado.");
    if (id === manager.id) throw new UserManagementAccessError("Por segurança, sua própria conta não pode ser alterada pela gestão de usuários.");

    const before = await loadTargetProfile(admin, id);
    const currentRole = parseRole(before.role);
    const payload = parseUserPayload(body, false);
    validateManagedPassword(payload.password, false);
    if (!canManageUserTransition(manager, currentRole, payload.role)) {
      throw new UserManagementAccessError("Você não possui permissão para alterar este usuário ou atribuir esse cargo.");
    }

    const departments = await loadDepartments();
    const setor = canonicalSetor(payload.setor, departments, toStringValue(before.setor));

    const afterData = {
      ...before,
      email: payload.email,
      full_name: payload.fullName || payload.email,
      role: payload.role,
      setor,
      global_access: payload.globalAccess,
      active: payload.active,
      base_scope: [],
      sigla_scope: [],
      xpt_scope: [],
      module_scope: payload.moduleScope,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await admin.from("profiles").update({
      email: afterData.email,
      full_name: afterData.full_name,
      role: afterData.role,
      setor: afterData.setor,
      global_access: afterData.global_access,
      active: afterData.active,
      base_scope: afterData.base_scope,
      sigla_scope: afterData.sigla_scope,
      xpt_scope: afterData.xpt_scope,
      module_scope: afterData.module_scope,
      updated_at: afterData.updated_at,
    }).eq("id", id);
    if (profileError) throw new Error(profileError.message);

    const updateAuth: { email?: string; password?: string; user_metadata?: { full_name: string } } = {
      email: payload.email,
      user_metadata: { full_name: payload.fullName },
    };
    if (payload.password) updateAuth.password = payload.password;
    const { error: authError } = await admin.auth.admin.updateUserById(id, updateAuth);
    if (authError) throw new Error(authError.message);

    await writeUserAudit(admin, manager.id, "user.update", id, before, afterData);
    return await responsePayload(manager);
  } catch (error) {
    const result = userManagementStatus(error);
    return jsonError(result.message, result.status);
  }
}

export async function DELETE(request: Request) {
  try {
    const manager = await requireUserManager();
    const admin = createAdminClient();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Usuário não informado.");
    if (id === manager.id) throw new UserManagementAccessError("Você não pode remover sua própria conta.");

    const before = await loadTargetProfile(admin, id);
    const currentRole = parseRole(before.role);
    ensureCanManageRole(manager, currentRole);

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", id);
    if (profileDeleteError) throw new Error(profileDeleteError.message);
    await writeUserAudit(admin, manager.id, "user.delete", id, before, null);
    return await responsePayload(manager);
  } catch (error) {
    const result = userManagementStatus(error);
    return jsonError(result.message, result.status);
  }
}
