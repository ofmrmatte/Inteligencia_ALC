import { buildOperationalAlerts, type OperationalAlertsResponse } from "@/features/operational-alerts/domain";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

async function countRows(label: string, query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) return { label, count: 0, error: result.error.message };
  return { label, count: result.count ?? 0, error: null };
}

export async function getOperationalAlerts(includeAdmin: boolean): Promise<OperationalAlertsResponse> {
  const supabase = await createServerSupabaseClient();

  const [pnrAwaitingProof, missingExpired, missingNearDeadline, missingPending, processingIssues] = await Promise.all([
    countRows(
      "Desvios PNR",
      supabase
        .from("desvios_pnr_records")
        .select("id", { count: "exact", head: true })
        .eq("module_key", "desvios_pnr")
        .eq("status_normalizado", "Aguardando Comprovante"),
    ),
    countRows(
      "Pacotes Faltantes",
      supabase
        .from("gestao_desvios_pacotes_faltantes")
        .select("id", { count: "exact", head: true })
        .eq("situacao_prazo", "Vencido"),
    ),
    countRows(
      "Pacotes Faltantes",
      supabase
        .from("gestao_desvios_pacotes_faltantes")
        .select("id", { count: "exact", head: true })
        .eq("situacao_prazo", "Próximo do vencimento"),
    ),
    countRows(
      "Pacotes Faltantes",
      supabase
        .from("gestao_desvios_pacotes_faltantes")
        .select("id", { count: "exact", head: true })
        .eq("status_caso", "Pendente"),
    ),
    includeAdmin
      ? countRows(
        "Processamento",
        supabase
          .from("dashboard_files")
          .select("id", { count: "exact", head: true })
          .neq("status", "processed"),
      )
      : Promise.resolve({ label: "Processamento", count: 0, error: null }),
  ]);

  const alerts = buildOperationalAlerts({
    pnrAwaitingProof: pnrAwaitingProof.count,
    missingExpired: missingExpired.count,
    missingNearDeadline: missingNearDeadline.count,
    missingPending: missingPending.count,
    processingIssues: processingIssues.count,
    includeAdmin,
  });

  return {
    total: alerts.reduce((sum, alert) => sum + alert.count, 0),
    generatedAt: new Date().toISOString(),
    alerts,
    errors: [pnrAwaitingProof, missingExpired, missingNearDeadline, missingPending, processingIssues]
      .map((result) => result.error ? `${result.label}: ${result.error}` : null)
      .filter(Boolean) as string[],
  };
}
