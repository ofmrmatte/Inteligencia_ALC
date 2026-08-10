import { NextResponse, type NextRequest } from "next/server";
import {
  MISSING_PACKAGE_CASE_STATUSES,
  MISSING_PACKAGE_CONTACT_STATUSES,
  deadlineStatus,
} from "@/features/pacotes-faltantes/domain";
import { recordAuditLog } from "@/lib/server/audit";
import { requireAdmin } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const payload = await request.json().catch(() => null) as {
    id?: string;
    status_caso?: string;
    status_contato_meli?: string;
  } | null;

  if (!payload?.id) {
    return NextResponse.json({ error: "Registro nao informado." }, { status: 400 });
  }

  const update: Record<string, string> = {};
  if (payload.status_caso) {
    if (!MISSING_PACKAGE_CASE_STATUSES.includes(payload.status_caso as never)) {
      return NextResponse.json({ error: "Status de caso invalido." }, { status: 400 });
    }
    update.status_caso = payload.status_caso;
    update.status_updated_at = new Date().toISOString();
  }
  if (payload.status_contato_meli) {
    if (!MISSING_PACKAGE_CONTACT_STATUSES.includes(payload.status_contato_meli as never)) {
      return NextResponse.json({ error: "Status MELI invalido." }, { status: 400 });
    }
    update.status_contato_meli = payload.status_contato_meli;
    update.contato_updated_at = new Date().toISOString();
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nenhum status para atualizar." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from("gestao_desvios_pacotes_faltantes")
    .select("id,status_caso,status_contato_meli,prazo_tratativa,situacao_prazo")
    .eq("id", payload.id)
    .single();

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 404 });
  }

  const situacao_prazo = deadlineStatus({
    ...current,
    ...update,
  });

  const { data, error } = await supabase
    .from("gestao_desvios_pacotes_faltantes")
    .update({ ...update, situacao_prazo, updated_at: new Date().toISOString() })
    .eq("id", payload.id)
    .select("id,status_caso,status_contato_meli,situacao_prazo")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_missing_package_status",
    entityType: "gestao_desvios_pacotes_faltantes",
    entityId: payload.id,
    details: { before: current, after: data },
  });

  return NextResponse.json({ data });
}
