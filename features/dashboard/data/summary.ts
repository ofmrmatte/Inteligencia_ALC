import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DashboardSummary = {
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
    trend?: string;
  }>;
  preFatura: {
    totalValue: number;
    totalRows: number;
    bases: number;
    drivers: number;
    routes: number;
    packageIds: number;
    topBases: Array<{ label: string; value: number; count: number }>;
    topDrivers: Array<{ label: string; value: number; count: number }>;
    typeMix: Array<{ label: string; value: number; count: number }>;
    monthlyGoal: number | null;
  };
  recentFiles: Array<{
    id: string;
    file_name: string | null;
    file_type: string | null;
    status: string | null;
    created_at: string | null;
  }>;
  error: string | null;
};

type DashboardSettingsRow = {
  key: string;
  value: {
    monthly_goal?: number;
    monthlyGoal?: number;
  } | null;
};

type RankingItem = {
  label: string;
  value: number | string;
  count: number | string;
};

type DashboardMetricsRow = {
  pre_fatura_count: number | string | null;
  gestao_pacotes_count: number | string | null;
  desvios_pnr_count: number | string | null;
  pacotes_faltantes_count: number | string | null;
  pre_fatura_total: number | string | null;
  pre_fatura_bases: number | string | null;
  pre_fatura_drivers: number | string | null;
  pre_fatura_routes: number | string | null;
  pre_fatura_package_ids: number | string | null;
  top_bases: RankingItem[] | null;
  top_drivers: RankingItem[] | null;
  type_mix: RankingItem[] | null;
};

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRanking(value: RankingItem[] | null | undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && String(item.label || "").trim())
    .map((item) => ({
      label: String(item.label).trim(),
      value: toFiniteNumber(item.value),
      count: toFiniteNumber(item.count),
    }));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const supabase = await createServerSupabaseClient();
    const [metricsResult, recentFilesResult, settingsResult] = await Promise.all([
      supabase.rpc("get_dashboard_summary_metrics").single(),
      supabase
        .from("dashboard_files")
        .select("id,file_name,file_type,status,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("dashboard_settings").select("key,value").eq("key", "pnr_goal").maybeSingle(),
    ]);

    if (metricsResult.error) throw metricsResult.error;
    if (recentFilesResult.error) throw recentFilesResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const aggregates = metricsResult.data as DashboardMetricsRow | null;
    if (!aggregates) throw new Error("Resumo operacional não retornou dados.");

    const preFaturaCount = toFiniteNumber(aggregates.pre_fatura_count);
    const gestaoPacotes = toFiniteNumber(aggregates.gestao_pacotes_count);
    const desviosPnr = toFiniteNumber(aggregates.desvios_pnr_count);
    const pacotesFaltantes = toFiniteNumber(aggregates.pacotes_faltantes_count);
    const totalValue = toFiniteNumber(aggregates.pre_fatura_total);
    const monthlyGoal = ((settingsResult.data as DashboardSettingsRow | null)?.value?.monthly_goal
      ?? (settingsResult.data as DashboardSettingsRow | null)?.value?.monthlyGoal
      ?? null);

    return {
      metrics: [
        { label: "Pré-Fatura", value: preFaturaCount.toLocaleString("pt-BR"), detail: "registros processados", trend: formatCurrency(totalValue) },
        { label: "Gestão de Pacotes", value: gestaoPacotes.toLocaleString("pt-BR"), detail: "registros processados" },
        { label: "Desvios PNR", value: desviosPnr.toLocaleString("pt-BR"), detail: "registros processados" },
        { label: "Pacotes Faltantes", value: pacotesFaltantes.toLocaleString("pt-BR"), detail: "registros processados" },
      ],
      preFatura: {
        totalValue,
        totalRows: preFaturaCount,
        bases: toFiniteNumber(aggregates.pre_fatura_bases),
        drivers: toFiniteNumber(aggregates.pre_fatura_drivers),
        routes: toFiniteNumber(aggregates.pre_fatura_routes),
        packageIds: toFiniteNumber(aggregates.pre_fatura_package_ids),
        topBases: normalizeRanking(aggregates.top_bases),
        topDrivers: normalizeRanking(aggregates.top_drivers),
        typeMix: normalizeRanking(aggregates.type_mix),
        monthlyGoal,
      },
      recentFiles: recentFilesResult.data ?? [],
      error: null,
    };
  } catch (error) {
    return {
      metrics: [],
      preFatura: {
        totalValue: 0,
        totalRows: 0,
        bases: 0,
        drivers: 0,
        routes: 0,
        packageIds: 0,
        topBases: [],
        topDrivers: [],
        typeMix: [],
        monthlyGoal: null,
      },
      recentFiles: [],
      error: error instanceof Error ? error.message : "Falha ao carregar indicadores.",
    };
  }
}
