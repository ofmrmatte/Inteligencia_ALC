import { NextResponse, type NextRequest } from "next/server";
import {
  MISSING_PACKAGE_CASE_STATUSES,
  MISSING_PACKAGE_CONTACT_STATUSES,
  deadlineStatus,
} from "@/features/pacotes-faltantes/domain";
import { recordAuditLog } from "@/lib/server/audit";
import { apiError, isUuid } from "@/lib/server/api-response";
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

  const recordId = payload?.id;
  if (!isUuid(recordId)) {
    return apiError("Registro inválido.", 400);
  }

  const update: Record<string, string> = {};
  if (payload?.status_caso) {
    if (!MISSING_PACKAGE_CASE_STATUSES.includes(payload.status_caso as never)) {
      return apiError("Status de caso inválido.", 400);
    }
    update.status_caso = payload.status_caso;
    update.status_updated_at = new Date().toISOString();
  }
  if (payload?.status_contato_meli) {
    if (!MISSING_PACKAGE_CONTACT_STATUSES.includes(payload.status_contato_meli as never)) {
      return apiError("Status MELI inválido.", 400);
    }
    update.status_contato_meli = payload.status_contato_meli;
    update.contato_updated_at = new Date().toISOString();
  }

  if (!Object.keys(update).length) {
    return apiError("Nenhum status para atualizar.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from("gestao_desvios_pacotes_faltantes")
    .select("id,status_caso,status_contato_meli,prazo_tratativa,situacao_prazo")
    .eq("id", recordId)
    .single();

  if (currentError) {
    return apiError("Registro não encontrado.", 404);
  }

  const situacao_prazo = deadlineStatus({
    ...current,
    ...update,
  });

  const { data, error } = await supabase
    .from("gestao_desvios_pacotes_faltantes")
    .update({ ...update, situacao_prazo, updated_at: new Date().toISOString() })
    .eq("id", recordId)
    .select("id,status_caso,status_contato_meli,situacao_prazo")
    .single();

  if (error) {
    return apiError("Não foi possível atualizar o pacote faltante agora.", 400);
  }

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_missing_package_status",
    entityType: "gestao_desvios_pacotes_faltantes",
    entityId: recordId,
    details: { before: current, after: data },
  });

  return NextResponse.json({ data });
}
