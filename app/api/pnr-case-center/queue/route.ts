import { NextResponse } from "next/server";
import { canAccessSection } from "@/lib/access-control";
import { getCurrentProfile } from "@/lib/auth-server";
import {
  PNR_DETAIL_QUEUE_CANDIDATE_LIMIT,
  PNR_DETAIL_SYNC_BATCH_SIZE,
  pnrDetailQueuePriority,
  type PnrDetailQueueRecord,
} from "@/lib/pnr-case-sync";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return json({ error: "Sessão expirada. Entre novamente." }, 401);
    if (!canAccessSection(profile, "gestao-pnr")) {
      return json({ error: "Seu perfil não possui permissão para acessar a Gestão PNR." }, 403);
    }

    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error, count } = await supabase
      .from("pnr_case_center_cases")
      .select("case_id,detail_sync_status,detail_parser_version,detail_last_success_at,main_status,source_last_seen_at", { count: "exact" })
      .or(`detail_next_sync_at.is.null,detail_next_sync_at.lte.${now}`)
      .order("detail_next_sync_at", { ascending: true, nullsFirst: true })
      .order("case_date", { ascending: false })
      .limit(PNR_DETAIL_QUEUE_CANDIDATE_LIMIT);
    if (error) throw new Error(`pnr_case_center_cases: ${error.message}`);

    const candidates = (data ?? [])
      .map((record) => ({ ...record, priority: pnrDetailQueuePriority(record as PnrDetailQueueRecord) }))
      .filter((record): record is typeof record & { priority: number } => record.priority !== null)
      .sort((left, right) => left.priority - right.priority);

    const cases = candidates.slice(0, PNR_DETAIL_SYNC_BATCH_SIZE).map((record) => ({
      caseId: record.case_id,
      priority: record.priority,
    }));

    return json({
      pending: count ?? candidates.length,
      cases,
      case: cases[0] ?? null,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha ao consultar fila PNR." }, 400);
  }
}
