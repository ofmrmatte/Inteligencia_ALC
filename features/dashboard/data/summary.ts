import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toNumber } from "@/features/pre-fatura/domain";

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

type PreFaturaDashboardRow = {
  tipo: string | null;
  base: string | null;
  codigo_base: string | null;
  driver: string | null;
  rota: string | null;
  id_envio: string | null;
  valor: number | string | null;
};

type DashboardSettingsRow = {
  key: string;
  value: {
    monthly_goal?: number;
    monthlyGoal?: number;
  } | null;
};

async function countRows(table: string) {
  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function ranking(rows: PreFaturaDashboardRow[], getLabel: (row: PreFaturaDashboardRow) => string | null) {
  const map = new Map<string, { value: number; count: number }>();
  rows.forEach((row) => {
    const label = getLabel(row);
    if (!label) return;
    const current = map.get(label) || { value: 0, count: 0 };
    current.value += toNumber(row.valor);
    current.count += 1;
    map.set(label, current);
  });

  return [...map.entries()]
    .map(([label, item]) => ({ label, value: item.value, count: item.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const supabase = await createServerSupabaseClient();
    const [preFaturaCount, gestaoPacotes, desviosPnr, pacotesFaltantes, preFaturaRowsResult, recentFilesResult, settingsResult] = await Promise.all([
      countRows("pre_fatura_records"),
      countRows("gestao_pacotes_records"),
      countRows("desvios_pnr_records"),
      countRows("gestao_desvios_pacotes_faltantes"),
      supabase
        .from("pre_fatura_records")
        .select("tipo,base,codigo_base,driver,rota,id_envio,valor")
        .eq("module_key", "pre_fatura")
        .limit(12000),
      supabase
        .from("dashboard_files")
        .select("id,file_name,file_type,status,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("dashboard_settings").select("key,value").eq("key", "pnr_goal").maybeSingle(),
    ]);

    if (recentFilesResult.error) throw recentFilesResult.error;
    if (preFaturaRowsResult.error) throw preFaturaRowsResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const preRows = (preFaturaRowsResult.data ?? []) as PreFaturaDashboardRow[];
    const totalValue = preRows.reduce((sum, row) => sum + toNumber(row.valor), 0);
    const monthlyGoal = ((settingsResult.data as DashboardSettingsRow | null)?.value?.monthly_goal
      ?? (settingsResult.data as DashboardSettingsRow | null)?.value?.monthlyGoal
      ?? null);
    const baseSet = new Set(preRows.map((row) => row.codigo_base || row.base).filter(Boolean));
    const driverSet = new Set(preRows.map((row) => row.driver).filter(Boolean));
    const routeSet = new Set(preRows.map((row) => row.rota).filter(Boolean));
    const packageSet = new Set(preRows.map((row) => row.id_envio).filter(Boolean));

    return {
      metrics: [
        { label: "Pré-Fatura", value: preFaturaCount.toLocaleString("pt-BR"), detail: "registros processados", trend: formatCurrency(totalValue) },
        { label: "Gestão de Pacotes", value: gestaoPacotes.toLocaleString("pt-BR"), detail: "registros processados" },
        { label: "Desvios PNR", value: desviosPnr.toLocaleString("pt-BR"), detail: "registros processados" },
        { label: "Pacotes Faltantes", value: pacotesFaltantes.toLocaleString("pt-BR"), detail: "registros processados" },
      ],
      preFatura: {
        totalValue,
        totalRows: preRows.length,
        bases: baseSet.size,
        drivers: driverSet.size,
        routes: routeSet.size,
        packageIds: packageSet.size,
        topBases: ranking(preRows, (row) => row.codigo_base || row.base),
        topDrivers: ranking(preRows, (row) => row.driver),
        typeMix: ranking(preRows, (row) => row.tipo),
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
