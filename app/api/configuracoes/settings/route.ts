import { NextResponse, type NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/server/audit";
import { apiError } from "@/lib/server/api-response";
import { requireAdmin } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const payload = await request.json().catch(() => null) as {
    key?: string;
    monthly_goal?: number;
    annual_goal?: number;
  } | null;

  if (payload?.key !== "pnr_goal") {
    return apiError("Configuração inválida.", 400);
  }

  const monthlyGoal = Number(payload.monthly_goal);
  const annualGoal = Number(payload.annual_goal);
  if (!Number.isFinite(monthlyGoal) || monthlyGoal < 0 || !Number.isFinite(annualGoal) || annualGoal < 0) {
    return apiError("Metas precisam ser números positivos.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const value = {
    monthly_goal: monthlyGoal,
    annual_goal: annualGoal,
    currency: "BRL",
    goal_type: "loss_limit",
  };

  const { data, error } = await supabase
    .from("dashboard_settings")
    .upsert({
      key: "pnr_goal",
      value,
      updated_by: session.user.id,
      updated_by_email: session.profile?.email || session.user.email || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" })
    .select("key,value,updated_by_email,updated_at")
    .single();
  if (error) return apiError("Não foi possível atualizar as metas agora.", 400);

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_goal_settings",
    entityType: "dashboard_settings",
    entityId: "pnr_goal",
    details: { value },
  });

  return NextResponse.json({ setting: data });
}
