import { NextResponse, type NextRequest } from "next/server";
import { PNR_ALLOWED_STATUSES } from "@/features/desvios-pnr/domain";
import { recordAuditLog } from "@/lib/server/audit";
import { requireAdmin } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const payload = await request.json().catch(() => null) as { id?: string; status?: string } | null;
  if (!payload?.id || !payload.status) {
    return NextResponse.json({ error: "Registro e status sao obrigatorios." }, { status: 400 });
  }
  if (!PNR_ALLOWED_STATUSES.includes(payload.status as never)) {
    return NextResponse.json({ error: "Status PNR invalido." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("update_desvios_pnr_status", {
    p_record_id: payload.id,
    p_status: payload.status,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_pnr_status",
    entityType: "desvios_pnr_records",
    entityId: payload.id,
    details: { status: payload.status, result: data },
  });

  return NextResponse.json({ data });
}
