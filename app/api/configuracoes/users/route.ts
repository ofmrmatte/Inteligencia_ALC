import { NextResponse, type NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/server/audit";
import { apiError, isUuid } from "@/lib/server/api-response";
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

  const userId = payload?.id;
  if (!isUuid(userId)) {
    return apiError("Usuário inválido.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data: before, error: beforeError } = await supabase
    .from("profiles")
    .select("id,name,email,role,is_admin,cargo,setor")
    .eq("id", userId)
    .single();
  if (beforeError) return apiError("Usuário não encontrado.", 404);

  const isAdmin = payload?.admin === true;
  const update = {
    name: String(payload?.name || "").trim() || null,
    setor: String(payload?.setor || "").trim() || null,
    cargo: String(payload?.cargo || "").trim() || null,
    role: isAdmin ? "admin" : "user",
    is_admin: isAdmin,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select("id,name,email,role,is_admin,cargo,setor,avatar_url")
    .single();
  if (error) return apiError("Não foi possível atualizar o usuário agora.", 400);

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_user_permissions",
    entityType: "profiles",
    entityId: userId,
    details: { before, after: data },
  });

  return NextResponse.json({ profile: data });
}
