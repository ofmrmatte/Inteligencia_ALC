import { NextResponse, type NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/server/audit";
import { requireAdmin } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const payload = await request.json().catch(() => null) as {
    id?: string;
    name?: string;
    setor?: string;
    cargo?: string;
    admin?: boolean;
  } | null;

  if (!payload?.id) {
    return NextResponse.json({ error: "Usuario nao informado." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: before, error: beforeError } = await supabase
    .from("profiles")
    .select("id,name,email,role,is_admin,cargo,setor")
    .eq("id", payload.id)
    .single();
  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 404 });

  const isAdmin = payload.admin === true;
  const update = {
    name: String(payload.name || "").trim() || null,
    setor: String(payload.setor || "").trim() || null,
    cargo: String(payload.cargo || "").trim() || null,
    role: isAdmin ? "admin" : "user",
    is_admin: isAdmin,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", payload.id)
    .select("id,name,email,role,is_admin,cargo,setor,avatar_url")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_user_permissions",
    entityType: "profiles",
    entityId: payload.id,
    details: { before, after: data },
  });

  return NextResponse.json({ profile: data });
}
