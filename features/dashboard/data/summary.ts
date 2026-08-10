import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DashboardSummary = {
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  recentFiles: Array<{
    id: string;
    file_name: string | null;
    file_type: string | null;
    status: string | null;
    created_at: string | null;
  }>;
  error: string | null;
};

async function countRows(table: string) {
  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const supabase = await createServerSupabaseClient();
    const [preFatura, gestaoPacotes, desviosPnr, pacotesFaltantes, recentFilesResult] = await Promise.all([
      countRows("pre_fatura_records"),
      countRows("gestao_pacotes_records"),
      countRows("desvios_pnr_records"),
      countRows("gestao_desvios_pacotes_faltantes"),
      supabase
        .from("dashboard_files")
        .select("id,file_name,file_type,status,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (recentFilesResult.error) throw recentFilesResult.error;

    return {
      metrics: [
        { label: "Pre-Fatura", value: preFatura.toLocaleString("pt-BR"), detail: "registros processados" },
        { label: "Gestao de Pacotes", value: gestaoPacotes.toLocaleString("pt-BR"), detail: "registros processados" },
        { label: "Desvios PNR", value: desviosPnr.toLocaleString("pt-BR"), detail: "registros processados" },
        { label: "Pacotes Faltantes", value: pacotesFaltantes.toLocaleString("pt-BR"), detail: "registros processados" },
      ],
      recentFiles: recentFilesResult.data ?? [],
      error: null,
    };
  } catch (error) {
    return {
      metrics: [],
      recentFiles: [],
      error: error instanceof Error ? error.message : "Falha ao carregar indicadores.",
    };
  }
}
