export type PnrSortKey = "" | "valorCompraNumerico" | "statusNormalizado" | "estacaoOrigem";

export type PnrFilters = {
  page: number;
  pageSize: number;
  q: string;
  mes: string;
  quinzena: string;
  status: string;
  tipo: string;
  estacao: string;
  statusMotorista: string;
  fonte: string;
  motorista: string;
  rota: string;
  sort: PnrSortKey;
  dir: "asc" | "desc";
};

export type PnrSummary = {
  count: number;
  totalValue: number;
  avgValue: number;
  anulado: number;
  valorAnulado: number;
  faturamento: number;
  valorFaturado: number;
  aberto: number;
  valorAberto: number;
  ticketMedioGeral: number;
  ticketMedioAnulado: number;
  ticketMedioFaturado: number;
};

export type PnrMetricRow = {
  label: string;
  detail?: string;
  count: number;
  totalValue?: number;
  share?: number;
};

export type PnrEvolutionRow = {
  key: string;
  label: string;
  year: number;
  month: number;
  quinzena?: string;
  count: number;
  totalValue: number;
  valorAnulado?: number;
  valorFaturado?: number;
  saldoValue?: number;
};

export type PnrMonthOption = {
  key: string;
  label: string;
  year: number;
  month: number;
};

export type PnrSummaryPayload = {
  total: number;
  summary: PnrSummary;
  statusRows: PnrMetricRow[];
  operationRows: PnrMetricRow[];
  stationRows: PnrMetricRow[];
  driverRows: PnrMetricRow[];
  evolutionRows: PnrEvolutionRow[];
  monthOptions: PnrMonthOption[];
  filterOptions: {
    statuses: string[];
    tipos: string[];
    estacoes: string[];
    statusMotoristas: string[];
    fontesCruzamento: string[];
    motoristas: string[];
    rotas: string[];
  };
};

export type PnrRecord = {
  id: string;
  file_id: string;
  dedupe_key: string | null;
  competencia: string | null;
  quinzena: string | null;
  status_original: string | null;
  status_normalizado: string | null;
  periodo_faturamento: string | null;
  month_key: string | null;
  quinzena_key: string | null;
  periodo_label: string | null;
  source_file_name: string | null;
  data_encerramento_caso: string | null;
  id_envio: string | null;
  produtos?: string | null;
  valor_compra: number | string | null;
  estacao_origem: string | null;
  tipo_base: string | null;
  tipo_operacional: string | null;
  id_rota: string | null;
  id_motorista: string | null;
  nome_motorista: string | null;
  motorista_display: string | null;
  status_motorista: string | null;
  fonte_cruzamento: string | null;
  data_caso: string | null;
  data_entrega: string | null;
  id_reclamacao: string | null;
};

export type PnrPageData = {
  summary: PnrSummaryPayload;
  rows: PnrRecord[];
  totalRows: number;
  totalPages: number;
  filters: PnrFilters;
  error: string | null;
};

export const PNR_SORT_KEYS: PnrSortKey[] = ["", "valorCompraNumerico", "statusNormalizado", "estacaoOrigem"];

export function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(String(value).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function emptyPnrSummary(): PnrSummaryPayload {
  return {
    total: 0,
    summary: {
      count: 0,
      totalValue: 0,
      avgValue: 0,
      anulado: 0,
      valorAnulado: 0,
      faturamento: 0,
      valorFaturado: 0,
      aberto: 0,
      valorAberto: 0,
      ticketMedioGeral: 0,
      ticketMedioAnulado: 0,
      ticketMedioFaturado: 0,
    },
    statusRows: [],
    operationRows: [],
    stationRows: [],
    driverRows: [],
    evolutionRows: [],
    monthOptions: [],
    filterOptions: {
      statuses: [],
      tipos: [],
      estacoes: [],
      statusMotoristas: [],
      fontesCruzamento: [],
      motoristas: [],
      rotas: [],
    },
  };
}

export function normalizePnrRpcPayload(value: unknown): PnrSummaryPayload {
  const payload = (value && typeof value === "object" ? value : {}) as Partial<PnrSummaryPayload>;
  const fallback = emptyPnrSummary();
  return {
    ...fallback,
    ...payload,
    summary: { ...fallback.summary, ...(payload.summary || {}) },
    statusRows: Array.isArray(payload.statusRows) ? payload.statusRows : [],
    operationRows: Array.isArray(payload.operationRows) ? payload.operationRows : [],
    stationRows: Array.isArray(payload.stationRows) ? payload.stationRows : [],
    driverRows: Array.isArray(payload.driverRows) ? payload.driverRows : [],
    evolutionRows: Array.isArray(payload.evolutionRows) ? payload.evolutionRows : [],
    monthOptions: Array.isArray(payload.monthOptions) ? payload.monthOptions : [],
    filterOptions: { ...fallback.filterOptions, ...(payload.filterOptions || {}) },
  };
}
