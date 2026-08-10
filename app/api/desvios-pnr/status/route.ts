import { NextResponse, type NextRequest } from "next/server";
import { PNR_ALLOWED_STATUSES } from "@/features/desvios-pnr/domain";
import { recordAuditLog } from "@/lib/server/audit";
import { apiError, isUuid } from "@/lib/server/api-response";
import { requireAdmin } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const payload = await request.json().catch(() => null) as { id?: string; status?: string } | null;
  const recordId = payload?.id;
  const status = payload?.status;
  if (!isUuid(recordId) || !status) {
    return apiError("Registro e status são obrigatórios.", 400);
  }
  if (!PNR_ALLOWED_STATUSES.includes(status as never)) {
    return apiError("Status PNR inválido.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("update_desvios_pnr_status", {
    p_record_id: recordId,
    p_status: status,
  });

  if (error) {
    return apiError("Não foi possível atualizar o status PNR agora.", 400);
  }

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_pnr_status",
    entityType: "desvios_pnr_records",
    entityId: recordId,
    details: { status, result: data },
  });

  return NextResponse.json({ data });
}
