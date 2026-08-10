import { NextResponse, type NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/server/audit";
import { requireAuthenticated } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { session, response } = await requireAuthenticated();
  if (response) return response;

  const payload = await request.json().catch(() => null) as { name?: string } | null;
  const name = String(payload?.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nome e obrigatorio." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", session.user.id)
    .select("id,name,email,role,is_admin,cargo,setor,avatar_url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_own_profile",
    entityType: "profiles",
    entityId: session.user.id,
    details: { name },
  });

  return NextResponse.json({ profile: data });
}
