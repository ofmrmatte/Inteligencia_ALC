import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { normalizePnrRpcPayload } from "@/features/desvios-pnr/domain";

export type MonthlyValuePoint = {
  key: string;
  label: string;
  value: number;
};

export type CategorySlice = {
  label: string;
  value: number;
  share: number;
};

export type GoalComparisonPoint = {
  key: string;
  label: string;
  realized: number;
  planned: number | null;
};

export type PnrTrendPoint = {
  key: string;
  label: string;
  count: number;
};

export type VariationRow = {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

export type OffenderRow = {
  label: string;
  count: number;
  share: number;
};

export type DashboardAnalytics = {
  monthlyValues: MonthlyValuePoint[];
  categoryMix: CategorySlice[];
  goalComparison: GoalComparisonPoint[];
  pnrTrend: PnrTrendPoint[];
  variation: VariationRow[];
  offenders: OffenderRow[];
  currentPeriodLabel: string | null;
  previousPeriodLabel: string | null;
  error: string | null;
};

type PreFaturaAnalyticsRow = {
  competencia: string | null;
  tipo: string | null;
  base: string | null;
  codigo_base: string | null;
  valor: number | string | null;
};

type GoalSettingsRow = {
  key: string;
  value: {
    monthly_goal?: number;
    monthlyGoal?: number;
  } | null;
};

const MONTH_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function periodLabel(key: string) {
  const match = /^(\d{4})-(\d{2})/.exec(key);
  if (!match) return key;
  const monthIndex = Number(match[2]) - 1;
  const month = MONTH_LABELS[monthIndex] ?? match[2];
  return `${month}/${match[1].slice(2)}`;
}

function sortByKey<T extends { key: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
}

function emptyAnalytics(error: string | null): DashboardAnalytics {
  return {
    monthlyValues: [],
    categoryMix: [],
    goalComparison: [],
    pnrTrend: [],
    variation: [],
    offenders: [],
    currentPeriodLabel: null,
    previousPeriodLabel: null,
    error,
  };
}

function buildMonthlyValues(rows: PreFaturaAnalyticsRow[]) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = (row.competencia || "").trim();
    if (!key) return;
    totals.set(key, (totals.get(key) ?? 0) + toNumber(row.valor));
  });
  return sortByKey(
    [...totals.entries()].map(([key, value]) => ({
      key,
      label: periodLabel(key),
      value,
    })),
  ).slice(-12);
}

function buildCategoryMix(rows: PreFaturaAnalyticsRow[]) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const label = (row.tipo || "Sem tipo").trim() || "Sem tipo";
    totals.set(label, (totals.get(label) ?? 0) + toNumber(row.valor));
  });
  const ordered = [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const total = ordered.reduce((accumulator, item) => accumulator + item.value, 0);
  return ordered.map((item) => ({
    ...item,
    share: total > 0 ? (item.value / total) * 100 : 0,
  }));
}

function buildVariation(rows: PreFaturaAnalyticsRow[], currentKey: string | null, previousKey: string | null) {
  if (!currentKey) return [];
  const current = new Map<string, number>();
  const previous = new Map<string, number>();

  rows.forEach((row) => {
    const key = (row.competencia || "").trim();
    if (!key) return;
    const label = (row.base || row.codigo_base || "Sem base").trim() || "Sem base";
    if (key === currentKey) current.set(label, (current.get(label) ?? 0) + toNumber(row.valor));
    if (previousKey && key === previousKey) previous.set(label, (previous.get(label) ?? 0) + toNumber(row.valor));
  });

  const labels = new Set([...current.keys(), ...previous.keys()]);
  return [...labels]
    .map((label) => {
      const currentValue = current.get(label) ?? 0;
      const previousValue = previous.get(label) ?? 0;
      const delta = currentValue - previousValue;
      return {
        label,
        current: currentValue,
        previous: previousValue,
        delta,
        deltaPercent: previousValue > 0 ? (delta / previousValue) * 100 : null,
      };
    })
    .filter((row) => row.current !== 0 || row.previous !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  try {
    const supabase = await createServerSupabaseClient();

    const preFaturaRowsPromise = fetchAllSupabaseRows<PreFaturaAnalyticsRow>((from, to) => supabase
      .from("pre_fatura_records")
      .select("competencia,tipo,base,codigo_base,valor")
      .eq("module_key", "pre_fatura")
      .range(from, to));

    const [preFaturaRows, settingsResult, pnrResult] = await Promise.all([
      preFaturaRowsPromise,
      supabase.from("dashboard_settings").select("key,value").eq("key", "pnr_goal").maybeSingle(),
      supabase.rpc("desvios_pnr_summary", {
        p_file_ids: [],
        p_month_keys: [],
        p_quinzenas: [],
        p_statuses: [],
        p_tipos: [],
        p_estacoes: [],
        p_status_motoristas: [],
        p_fontes: [],
        p_motoristas: [],
        p_rotas: [],
        p_search: "",
      }),
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (pnrResult.error) throw pnrResult.error;

    const goalRow = settingsResult.data as GoalSettingsRow | null;
    const monthlyGoal = goalRow?.value?.monthly_goal ?? goalRow?.value?.monthlyGoal ?? null;

    const monthlyValues = buildMonthlyValues(preFaturaRows);
    const currentKey = monthlyValues.length ? monthlyValues[monthlyValues.length - 1].key : null;
    const previousKey = monthlyValues.length > 1 ? monthlyValues[monthlyValues.length - 2].key : null;

    const pnrPayload = normalizePnrRpcPayload(pnrResult.data);
    const pnrTrend = sortByKey(
      pnrPayload.evolutionRows.map((row) => ({
        key: row.key || `${row.year}-${String(row.month).padStart(2, "0")}`,
        label: row.label || periodLabel(row.key || ""),
        count: toNumber(row.count),
      })),
    ).slice(-12);

    const offenderTotal = pnrPayload.driverRows.reduce((accumulator, row) => accumulator + toNumber(row.count), 0);
    const offenders = [...pnrPayload.driverRows]
      .map((row) => ({ label: row.label, count: toNumber(row.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((row) => ({
        ...row,
        share: offenderTotal > 0 ? (row.count / offenderTotal) * 100 : 0,
      }));

    return {
      monthlyValues,
      categoryMix: buildCategoryMix(preFaturaRows),
      goalComparison: monthlyValues.map((point) => ({
        key: point.key,
        label: point.label,
        realized: point.value,
        planned: monthlyGoal,
      })),
      pnrTrend,
      variation: buildVariation(preFaturaRows, currentKey, previousKey),
      offenders,
      currentPeriodLabel: currentKey ? periodLabel(currentKey) : null,
      previousPeriodLabel: previousKey ? periodLabel(previousKey) : null,
      error: null,
    };
  } catch (error) {
    return emptyAnalytics(error instanceof Error ? error.message : "Falha ao carregar graficos do painel.");
  }
}
