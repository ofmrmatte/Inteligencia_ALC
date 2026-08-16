import { NextResponse } from "next/server";
import { canManageUsers, isUserRole, USER_ROLES, type UserRole } from "@/lib/auth";
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
  if (Array.isArray(value)) return value.map(toStringValue).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeEmail(value: unknown) {
  return toStringValue(value).trim().toLowerCase();
}

function parseRole(value: unknown): UserRole {
  return isUserRole(value) ? value : "coordinator";
}

function mapManagedUser(row: DbRow) {
  return {
    id: toStringValue(row.id),
    email: toStringValue(row.email),
    fullName: toStringValue(row.full_name),
    role: parseRole(row.role),
    globalAccess: Boolean(row.global_access),
    active: row.active !== false,
    baseScope: toStringArray(row.base_scope),
    siglaScope: toStringArray(row.sigla_scope),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
  };
}

async function requireUserManager() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Sessão expirada. Entre novamente.");
  if (!canManageUsers(profile)) throw new Error("Gestão de usuários restrita a Diretor, ADM ou Desenvolvedor.");
  return profile;
}

function parseUserPayload(payload: DbRow, requirePassword: boolean) {
  const email = normalizeEmail(payload.email);
  const password = toStringValue(payload.password);
  const role = parseRole(payload.role);
  if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (requirePassword && password.length < 6) throw new Error("A senha inicial precisa ter pelo menos 6 caracteres.");
  return {
    email,
    password,
    fullName: toStringValue(payload.fullName ?? payload.full_name).trim(),
    role,
    globalAccess: Boolean(payload.globalAccess ?? payload.global_access),
    active: payload.active !== false,
    baseScope: toStringArray(payload.baseScope ?? payload.base_scope),
    siglaScope: toStringArray(payload.siglaScope ?? payload.sigla_scope),
  };
}

export async function GET() {
  try {
    await requireUserManager();
    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").select("*").order("email", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ roles: USER_ROLES, users: ((data ?? []) as DbRow[]).map(mapManagedUser) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar usuários.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : message.includes("restrita") ? 403 : 401;
    return jsonError(message, status);
  }
}

export async function POST(request: Request) {
  try {
    await requireUserManager();
    const admin = createAdminClient();
    const payload = parseUserPayload((await request.json()) as DbRow, true);
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
      base_scope: payload.baseScope,
      sigla_scope: payload.siglaScope,
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw new Error(profileError.message);

    return GET();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cadastrar usuário.";
    return jsonError(message, message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 400);
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

    const { error: profileError } = await admin.from("profiles").update({
      email: payload.email,
      full_name: payload.fullName || payload.email,
      role: payload.role,
      global_access: payload.globalAccess,
      active: payload.active,
      base_scope: payload.baseScope,
      sigla_scope: payload.siglaScope,
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

    return GET();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar usuário.";
    return jsonError(message, message.includes("restrita") ? 403 : message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 400);
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
    return GET();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover usuário.";
    return jsonError(message, message.includes("restrita") ? 403 : message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 400);
  }
}
