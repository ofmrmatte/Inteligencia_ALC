import { NextResponse } from "next/server";
import { canManageUsers } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalized(value: unknown) {
  return normalizeText(text(value));
}

function stringArray(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]+/) : [];
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function requireManager() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("UNAUTHENTICATED");
  if (!canManageUsers(profile)) throw new Error("FORBIDDEN");
  return profile;
}

async function loadPayload() {
  const admin = createAdminClient();
  const [{ data: xptRows, error: xptError }, { data: unitRows, error: unitError }] = await Promise.all([
    admin.from("operational_xpts").select("xpt_code,active,updated_at").order("xpt_code", { ascending: true }),
    admin.from("operational_units").select("sigla,xpt_code,active").order("sigla", { ascending: true }),
  ]);
  if (xptError) throw new Error(xptError.message);
  if (unitError) throw new Error(unitError.message);

  const byXpt = new Map<string, Set<string>>();
  for (const row of (unitRows ?? []) as DbRow[]) {
    const xptCode = normalized(row.xpt_code);
    const sigla = normalized(row.sigla);
    if (!xptCode || !sigla || row.active === false) continue;
    if (!byXpt.has(xptCode)) byXpt.set(xptCode, new Set());
    byXpt.get(xptCode)!.add(sigla);
  }

  const xpts = ((xptRows ?? []) as DbRow[]).map((row) => {
    const xptCode = normalized(row.xpt_code);
    return {
      xptCode,
      svcSiglas: [...(byXpt.get(xptCode) ?? new Set<string>())].sort((a, b) => a.localeCompare(b, "pt-BR")),
      active: row.active !== false,
    };
  });

  const svcSiglas = [...new Set(((unitRows ?? []) as DbRow[]).filter((row) => row.active !== false).map((row) => normalized(row.sigla)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return { xpts, svcSiglas };
}

async function validateSvcSiglas(svcSiglas: string[]) {
  if (!svcSiglas.length) return;
  const admin = createAdminClient();
  const { data, error } = await admin.from("operational_units").select("sigla").in("sigla", svcSiglas);
  if (error) throw new Error(error.message);
  const existing = new Set(((data ?? []) as DbRow[]).map((row) => normalized(row.sigla)));
  const unknown = svcSiglas.filter((sigla) => !existing.has(sigla));
  if (unknown.length) throw new Error(`SVC não cadastrada: ${unknown.join(", ")}.`);
}

async function replaceRegionalLinks(originalXptCode: string | null, xptCode: string, svcSiglas: string[]) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await validateSvcSiglas(svcSiglas);

  if (originalXptCode) {
    const { error } = await admin
      .from("operational_units")
      .update({ xpt_code: null, updated_at: now })
      .eq("xpt_code", originalXptCode);
    if (error) throw new Error(error.message);
  }

  if (originalXptCode !== xptCode) {
    const { error } = await admin
      .from("operational_units")
      .update({ xpt_code: null, updated_at: now })
      .eq("xpt_code", xptCode);
    if (error) throw new Error(error.message);
  }

  if (svcSiglas.length) {
    const { error } = await admin
      .from("operational_units")
      .update({ xpt_code: xptCode, updated_at: now })
      .in("sigla", svcSiglas);
    if (error) throw new Error(error.message);
  }
}

export async function GET() {
  try {
    await requireManager();
    return NextResponse.json(await loadPayload());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar XPTs.";
    if (message === "UNAUTHENTICATED") return jsonError("Sessão expirada. Entre novamente.", 401);
    if (message === "FORBIDDEN") return jsonError("Cadastro de XPT restrito à gestão autorizada.", 403);
    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  try {
    await requireManager();
    const body = (await request.json()) as DbRow;
    const xptCode = normalized(body.xptCode ?? body.xpt_code);
    const svcSiglas = stringArray(body.svcSiglas ?? body.svc_siglas);
    if (!xptCode) throw new Error("Informe o código do XPT.");

    const admin = createAdminClient();
    const { error } = await admin.from("operational_xpts").insert({
      xpt_code: xptCode,
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.code === "23505" ? "Este XPT já está cadastrado." : error.message);
    await replaceRegionalLinks(null, xptCode, svcSiglas);
    return NextResponse.json({ ok: true, ...(await loadPayload()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cadastrar XPT.";
    if (message === "UNAUTHENTICATED") return jsonError("Sessão expirada. Entre novamente.", 401);
    if (message === "FORBIDDEN") return jsonError("Cadastro de XPT restrito à gestão autorizada.", 403);
    return jsonError(message, 400);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireManager();
    const body = (await request.json()) as DbRow;
    const originalXptCode = normalized(body.originalXptCode ?? body.original_xpt_code ?? body.xptCode ?? body.xpt_code);
    const xptCode = normalized(body.xptCode ?? body.xpt_code);
    const svcSiglas = stringArray(body.svcSiglas ?? body.svc_siglas);
    if (!originalXptCode || !xptCode) throw new Error("XPT original ou novo código não informado.");

    const admin = createAdminClient();
    const { error } = await admin
      .from("operational_xpts")
      .update({ xpt_code: xptCode, active: body.active !== false, updated_at: new Date().toISOString() })
      .eq("xpt_code", originalXptCode);
    if (error) throw new Error(error.code === "23505" ? "Já existe outro XPT com este código." : error.message);

    await replaceRegionalLinks(originalXptCode, xptCode, svcSiglas);
    return NextResponse.json({ ok: true, ...(await loadPayload()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar XPT.";
    if (message === "UNAUTHENTICATED") return jsonError("Sessão expirada. Entre novamente.", 401);
    if (message === "FORBIDDEN") return jsonError("Edição de XPT restrita à gestão autorizada.", 403);
    return jsonError(message, 400);
  }
}
