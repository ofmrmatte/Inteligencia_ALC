"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Ban, Boxes, CircleCheckBig, CloudDownload, Download, ExternalLink, History, Pause, Play, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { canManageImports, type AuthProfile } from "@/lib/auth";
import { fortnightFromDate, halfFromFortnight, monthFromFortnight, normalizeFortnight, yearFromFortnight } from "@/lib/competence";
import {
  caseCenterReviewLabel,
  type CaseCenterPage,
  type PnrCaseTimelineEvent,
  runCaseCenterPagination,
} from "@/lib/pnr-case-center";
import {
  CONNECTOR_DOWNLOAD_URL,
  LATEST_CONNECTOR_VERSION,
  compareConnectorVersions,
  connectorStateFromHandshake,
  connectorStatusFromCode,
  PnrConnectorError,
  requestPnrConnector,
  type PnrConnectorHandshake,
  type PnrConnectorState,
} from "@/lib/pnr-connector-client";
import { useDashboardStore } from "@/lib/store";
import { usePnrInboxFiltersStore } from "@/lib/pnr-inbox-filters-store";
import { normalizeText } from "@/lib/normalize";
import { retryPnrPersistence, runWithPnrImportLock } from "@/lib/pnr-case-sync";
import {
  getPnrBackgroundSyncStatus,
  getServerPnrBackgroundSyncStatus,
  requestPnrBackgroundSyncNow,
  subscribePnrBackgroundSync,
  togglePnrBackgroundSyncPaused,
} from "@/lib/pnr-background-sync-store";
import type { PnrRecord } from "@/lib/types";
import { formatCurrency, formatNumber, KpiCard, PageIntro, Panel, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults } from "./shared";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const TREND_SERIES = {
  billed: { label: "Enviados para faturamento", color: "#16845b" },
  cancelled: { label: "Anulados", color: "#e30613" },
  reviewed: { label: "Revisados", color: "#2563eb" },
  notReviewed: { label: "Sem revisão", color: "#d98b12" },
} as const;

type TrendSeriesKey = keyof typeof TREND_SERIES;
type TrendMetric = "cases" | "value";

interface TrendPoint {
  period: string;
  label: string;
  sortKey: number;
  totalCases: number;
  totalValue: number;
  billedCases: number;
  billedValue: number;
  cancelledCases: number;
  cancelledValue: number;
  reviewedCases: number;
  reviewedValue: number;
  notReviewedCases: number;
  notReviewedValue: number;
}

interface ResumeState {
  syncId: string;
  nextPage: number;
  processed: number;
  errors: number;
}

interface CompletionState {
  received: number;
  persisted: number;
  created: number;
  reconciled: number;
  updated: number;
  unchanged: number;
  deleted: number;
  errors: number;
}

function connectionPresentation(state: PnrConnectorState) {
  if (state === "connected") return { label: "Conector Mercado Livre conectado", tone: "green" as const };
  if (state === "outdated") return { label: "Existe uma versão mais recente do Conector PNR.", tone: "amber" as const };
  if (state === "unsupported") return { label: "Atualize o Conector PNR para sincronizar novos dados.", tone: "red" as const };
  if (state === "ml-missing") return { label: "Aba Mercado Livre não encontrada", tone: "amber" as const };
  if (state === "extension-missing") return { label: "Conector PNR não instalado neste computador.", tone: "red" as const };
  if (state === "expired") return { label: "Abra ou entre novamente na Bandeja de suporte do Mercado Livre.", tone: "amber" as const };
  if (state === "checking") return { label: "Verificando conexão...", tone: "neutral" as const };
  return { label: "Falha na conexão com o Mercado Livre", tone: "red" as const };
}

function connectionStateFromError(error: unknown): PnrConnectorState {
  if (!(error instanceof PnrConnectorError)) return "error";
  if (error.code === "EXTENSION_NOT_FOUND") return "extension-missing";
  if (error.code === "MERCADO_LIVRE_NOT_DETECTED") return "ml-missing";
  if (error.code === "MERCADO_LIVRE_SESSION_REQUIRED") return "expired";
  return "error";
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

export function PnrInboxView({ profile }: { profile: AuthProfile }) {
  const now = new Date();
  const data = useDashboardStore((state) => state.data);
  const hydrate = useDashboardStore((state) => state.hydrate);
  const cacheOwnerId = useDashboardStore((state) => state.cacheOwnerId);
  const [captureYear, setCaptureYear] = useState(now.getFullYear());
  const [captureMonth, setCaptureMonth] = useState(now.getMonth() + 1);
  const [captureHalf, setCaptureHalf] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2);
  const dataYear = usePnrInboxFiltersStore((state) => state.year);
  const dataMonth = usePnrInboxFiltersStore((state) => state.month);
  const dataFortnight = usePnrInboxFiltersStore((state) => state.fortnight);
  const dataBase = usePnrInboxFiltersStore((state) => state.base);
  const dataStatus = usePnrInboxFiltersStore((state) => state.status);
  const dataSearch = usePnrInboxFiltersStore((state) => state.search);
  const [connection, setConnection] = useState<PnrConnectorState>("checking");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("Pronto para sincronizar");
  const [progress, setProgress] = useState({ page: 0, totalPages: 0, processed: 0, totalElements: 0, errors: 0 });
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [selectedCase, setSelectedCase] = useState<PnrRecord | null>(null);
  const [timeline, setTimeline] = useState<PnrCaseTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("cases");
  const [trendSelection, setTrendSelection] = useState<{ period: string; series: TrendSeriesKey } | null>(null);
  const detailSync = useSyncExternalStore(
    subscribePnrBackgroundSync,
    getPnrBackgroundSyncStatus,
    getServerPnrBackgroundSyncStatus,
  );
  const importPauseRef = useRef(false);
  const connectorCheckRef = useRef(0);
  const installDialogRef = useRef<HTMLDialogElement>(null);
  const competence = `${captureYear}${String(captureMonth).padStart(2, "0")}Q${captureHalf}`;
  const resumeKey = `alc-pnr-case-center:${competence}`;
  const canImport = canManageImports(profile);

  const rows = useMemo(() => {
    const search = normalizeText(dataSearch);
    return data.pnr.filter((row) => {
      if (row.sourceSystem !== "case_center") return false;
      const rowFortnight = normalizeFortnight(row.billingPeriod) || fortnightFromDate(row.caseDate);
      const rowYear = yearFromFortnight(rowFortnight);
      const rowMonth = monthFromFortnight(rowFortnight).slice(-2);
      const rowHalf = halfFromFortnight(rowFortnight);
      const rowBase = row.originStation || row.sigla || row.baseKey || "Sem base";
      if (dataYear !== "Todos" && rowYear !== dataYear) return false;
      if (dataMonth !== "Todos" && rowMonth !== dataMonth) return false;
      if (dataFortnight !== "Todas" && rowHalf !== (dataFortnight === "Q1" ? 1 : 2)) return false;
      if (dataBase !== "Todas" && rowBase !== dataBase) return false;
      if (dataStatus !== "Todos" && normalizeText(row.status) !== dataStatus) return false;
      if (search) {
        const haystack = normalizeText([
          row.caseId,
          row.shipmentId,
          row.routeId,
          row.routeCode,
          row.driverId,
          row.driverName,
          row.originStation,
          row.sigla,
          row.status,
        ].filter(Boolean).join(" "));
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [data.pnr, dataYear, dataMonth, dataFortnight, dataBase, dataStatus, dataSearch]);

  const billed = rows.filter((row) => row.subStatus === "BILLED").length;
  const cancelled = rows.filter((row) => row.subStatus === "NOT_BILLED").length;
  const reviewed = rows.filter((row) => row.reviewedStatus === "reviewed").length;
  const notReviewed = rows.filter((row) => row.reviewedStatus === "not_reviewed").length;
  const totalValue = rows.reduce((sum, row) => sum + row.purchaseValue, 0);

  const trendData = useMemo(() => {
    const periodMap = new Map<string, TrendPoint>();
    rows.forEach((row) => {
      const normalized = normalizeFortnight(row.billingPeriod) || fortnightFromDate(row.caseDate);
      const match = /^(0[12])Q(\d{2})(\d{4})$/.exec(normalized);
      if (!match) return;
      const half = match[1] === "01" ? 1 : 2;
      const month = Number(match[2]);
      const year = Number(match[3]);
      const period = `${year}${String(month).padStart(2, "0")}Q${half}`;
      const shortMonth = new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(new Date(year, month - 1, 1))
        .replace(".", "");
      const point = periodMap.get(period) ?? {
        period,
        label: `${shortMonth.charAt(0).toUpperCase() + shortMonth.slice(1)} Q${half}`,
        sortKey: year * 1000 + month * 10 + half,
        totalCases: 0,
        totalValue: 0,
        billedCases: 0,
        billedValue: 0,
        cancelledCases: 0,
        cancelledValue: 0,
        reviewedCases: 0,
        reviewedValue: 0,
        notReviewedCases: 0,
        notReviewedValue: 0,
      };
      point.totalCases += 1;
      point.totalValue += row.purchaseValue;
      if (row.subStatus === "BILLED") {
        point.billedCases += 1;
        point.billedValue += row.purchaseValue;
      }
      if (row.subStatus === "NOT_BILLED") {
        point.cancelledCases += 1;
        point.cancelledValue += row.purchaseValue;
      }
      if (row.reviewedStatus === "reviewed") {
        point.reviewedCases += 1;
        point.reviewedValue += row.purchaseValue;
      }
      if (row.reviewedStatus === "not_reviewed") {
        point.notReviewedCases += 1;
        point.notReviewedValue += row.purchaseValue;
      }
      periodMap.set(period, point);
    });
    return [...periodMap.values()].sort((a, b) => a.sortKey - b.sortKey);
  }, [rows]);

  useEffect(() => {
    if (trendSelection && !trendData.some((point) => point.period === trendSelection.period)) {
      setTrendSelection(null);
    }
  }, [trendData, trendSelection]);

  const selectedTrendIndex = trendSelection
    ? trendData.findIndex((point) => point.period === trendSelection.period)
    : Math.max(0, trendData.length - 1);
  const selectedTrendPoint = trendData[selectedTrendIndex] ?? null;
  const previousTrendPoint = selectedTrendIndex > 0 ? trendData[selectedTrendIndex - 1] : null;
  const selectedTrendSeries = trendSelection?.series ?? null;
  const selectedTrendLabel = selectedTrendSeries ? TREND_SERIES[selectedTrendSeries].label : "Total de casos";
  const selectedTrendColor = selectedTrendSeries ? TREND_SERIES[selectedTrendSeries].color : "#333333";

  const metricField = (series: TrendSeriesKey, metric: TrendMetric) => `${series}${metric === "cases" ? "Cases" : "Value"}` as keyof TrendPoint;
  const comparisonValue = (point: TrendPoint | null, metric: TrendMetric) => {
    if (!point) return 0;
    if (!selectedTrendSeries) return metric === "cases" ? point.totalCases : point.totalValue;
    return Number(point[metricField(selectedTrendSeries, metric)] || 0);
  };
  const currentCases = comparisonValue(selectedTrendPoint, "cases");
  const previousCases = comparisonValue(previousTrendPoint, "cases");
  const currentValue = comparisonValue(selectedTrendPoint, "value");
  const previousValue = comparisonValue(previousTrendPoint, "value");
  const caseDelta = previousCases ? (currentCases - previousCases) / previousCases : null;
  const valueDelta = previousValue ? (currentValue - previousValue) / previousValue : null;
  const currentShare = selectedTrendPoint && selectedTrendSeries
    ? currentCases / Math.max(1, selectedTrendPoint.totalCases)
    : selectedTrendPoint ? 1 : 0;
  const previousShare = previousTrendPoint && selectedTrendSeries
    ? previousCases / Math.max(1, previousTrendPoint.totalCases)
    : previousTrendPoint ? 1 : 0;
  const comparisonBars = [
    ...(previousTrendPoint ? [{ period: previousTrendPoint.label, value: comparisonValue(previousTrendPoint, trendMetric), current: false }] : []),
    ...(selectedTrendPoint ? [{ period: selectedTrendPoint.label, value: comparisonValue(selectedTrendPoint, trendMetric), current: true }] : []),
  ];

  const formatTrendValue = (value: number) => trendMetric === "value" ? formatCurrency(value) : formatNumber(value);
  const formatDelta = (value: number | null) => value === null
    ? "Sem período anterior"
    : `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}`;

  const renderTrendDot = (series: TrendSeriesKey) => (props: { cx?: number; cy?: number; payload?: TrendPoint }) => {
    if (props.cx === undefined || props.cy === undefined || !props.payload) return <g />;
    const selected = trendSelection?.period === props.payload.period && trendSelection.series === series;
    return (
      <circle
        cx={props.cx}
        cy={props.cy}
        r={selected ? 5 : 3.5}
        fill={TREND_SERIES[series].color}
        stroke="#fff"
        strokeWidth={selected ? 2.5 : 1.5}
        style={{ cursor: "pointer" }}
        onClick={(event) => {
          event.stopPropagation();
          setTrendSelection((current) => current?.period === props.payload?.period && current?.series === series
            ? null
            : { period: props.payload?.period || "", series });
        }}
      />
    );
  };

  const baseMap = new Map<string, { base: string; cases: number; value: number }>();
  rows.forEach((row) => {
    const base = row.originStation || row.sigla || "Sem base";
    const current = baseMap.get(base) ?? { base, cases: 0, value: 0 };
    current.cases += 1;
    current.value += row.purchaseValue;
    baseMap.set(base, current);
  });
  const bases = [...baseMap.values()].sort((a, b) => b.cases - a.cases).slice(0, 8);
  const connectionMeta = connectionPresentation(connection);
  const syncReady = connection === "connected" || connection === "outdated";
  const updateAvailable = connection !== "unsupported" && installedVersion !== null
    && /^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(installedVersion)
    && compareConnectorVersions(installedVersion, LATEST_CONNECTOR_VERSION) < 0;
  const captureYears = Array.from({ length: 4 }, (_, index) => now.getFullYear() - 2 + index);

  useEffect(() => {
    queueMicrotask(() => setResumeAvailable(Boolean(window.localStorage.getItem(resumeKey))));
  }, [resumeKey]);

  const checkConnector = useCallback(async () => {
    const checkId = ++connectorCheckRef.current;
    setConnection("checking");
    setConnectionMessage(null);
    try {
      const handshake = await requestPnrConnector<PnrConnectorHandshake>("PING", { competence }, 10_000);
      const state = handshake?.installed ? connectorStateFromHandshake(handshake) : "unsupported";
      if (checkId === connectorCheckRef.current) {
        setInstalledVersion(handshake?.installed ? handshake.version : null);
        setConnection(state);
        setConnectionMessage(state === "error" || state === "expired" ? handshake?.sessionMessage || null : null);
      }
      return state;
    } catch (error) {
      const state = error instanceof PnrConnectorError
        && (error.code === "MERCADO_LIVRE_NOT_DETECTED" || error.code === "MERCADO_LIVRE_SESSION_REQUIRED")
        ? "unsupported" : connectionStateFromError(error);
      if (checkId === connectorCheckRef.current) {
        setInstalledVersion(null);
        setConnection(state);
        setConnectionMessage(error instanceof Error ? error.message : null);
      }
      return state;
    }
  }, [competence]);

  useEffect(() => {
    queueMicrotask(() => void checkConnector());
    return () => {
      connectorCheckRef.current += 1;
    };
  }, [checkConnector]);

  const refreshDashboard = async () => {
    useDashboardStore.setState({ lastSyncedAt: 0 });
    await hydrate(cacheOwnerId, true);
  };

  const openCaseCenter = async () => {
    setConnection("checking");
    setConnectionMessage(null);
    try {
      await requestPnrConnector("OPEN_CASE_CENTER", { competence }, 30_000);
      await checkConnector();
    } catch (error) {
      const state = connectionStateFromError(error);
      setConnection(state);
      setConnectionMessage(error instanceof Error ? error.message : null);
      toast.error(error instanceof Error ? error.message : "Falha ao abrir a Bandeja Mercado Livre.");
    }
  };

  const startSync = async () => {
    if (!canImport) {
      toast.error("Seu perfil não possui permissão para importações oficiais.");
      return;
    }

    importPauseRef.current = false;
    setRunning(true);
    setCompletion(null);
    setPhase("Iniciando captura...");
    try {
      await runWithPnrImportLock(navigator.locks, async () => {
      const currentConnection = syncReady ? connection : await checkConnector();
      if (currentConnection !== "connected" && currentConnection !== "outdated") {
        throw new Error(connectionPresentation(currentConnection).label);
      }
      const stored = JSON.parse(window.localStorage.getItem(resumeKey) || "null") as ResumeState | null;
      const resume = stored ?? { syncId: crypto.randomUUID(), nextPage: 1, processed: 0, errors: 0 };
      let lastPersisted = resume.processed;
      let totalFound = 0;
      let lastCounts = { newCount: 0, reconciledCount: 0, updatedCount: 0, unchangedCount: 0, deletedCount: 0 };

      const result = await runCaseCenterPagination({
        startPage: resume.nextPage,
        initialProcessed: resume.processed,
        initialErrors: resume.errors,
        delayMs: 0,
        isCancelled: () => importPauseRef.current,
        fetchPage: async (page) => {
          setPhase(`Consultando página ${page}${progress.totalPages ? ` de ${progress.totalPages}` : ""}`);
          return requestPnrConnector<CaseCenterPage>("FETCH_PAGE", { competence, page });
        },
        persistPage: async (pageResult, completed, processed, errors) => {
          const body = await retryPnrPersistence(async () => {
            const response = await fetch("/api/pnr-case-center/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                syncId: resume.syncId,
                competence,
                page: pageResult.page,
                totalPages: pageResult.totalPages,
                totalElements: pageResult.totalElements,
                completed,
                processed,
                errorCount: errors,
                records: pageResult.records,
              }),
            });
            if (!response.ok) throw new Error(await readError(response, "Falha ao persistir casos PNR."));
            return response.json() as Promise<{ persisted: number; newCount: number; reconciledCount: number; updatedCount: number; unchangedCount: number; deletedCount: number }>;
          }, (attempt) => {
            setPhase(`Banco ocupado ao salvar página ${pageResult.page}. Nova tentativa ${attempt}/3...`);
          });
          lastPersisted = body.persisted;
          totalFound = pageResult.totalElements;
          lastCounts = body;
          if (completed) {
            window.localStorage.removeItem(resumeKey);
          } else {
            window.localStorage.setItem(resumeKey, JSON.stringify({ syncId: resume.syncId, nextPage: pageResult.page + 1, processed, errors } satisfies ResumeState));
          }
        },
        onProgress: (next) => {
          setProgress(next);
          setPhase(`${formatNumber(next.processed)} / ${formatNumber(next.totalElements)} casos`);
        },
      });

      setResumeAvailable(!result.completed);
      if (result.cancelled) {
        setResumeAvailable(true);
        setPhase("Captura pausada. Use Play para continuar.");
      } else {
        setPhase("Sincronização concluída");
        setCompletion({
          received: totalFound || result.processed,
          persisted: lastPersisted,
          created: lastCounts.newCount,
          reconciled: lastCounts.reconciledCount,
          updated: lastCounts.updatedCount,
          unchanged: lastCounts.unchangedCount,
          deleted: lastCounts.deletedCount,
          errors: result.errors,
        });
        setResumeAvailable(false);
        await refreshDashboard();
      }
      });
    } catch (error) {
      const state = connectionStateFromError(error);
      if (state !== "error") setConnection(state);
      setResumeAvailable(Boolean(window.localStorage.getItem(resumeKey)));
      const message = error instanceof Error ? error.message : connectorStatusFromCode();
      setPhase(message);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const loadTimeline = async (row: PnrRecord) => {
    if (!row.caseId) return;
    setSelectedCase(row);
    setTimeline([]);
    setTimelineLoading(true);
    try {
      const cachedResponse = await fetch(`/api/pnr-case-center/timeline?caseId=${encodeURIComponent(row.caseId)}`, { cache: "no-store" });
      if (!cachedResponse.ok) throw new Error(await readError(cachedResponse, "Falha ao consultar timeline."));
      const cached = await cachedResponse.json() as { events: PnrCaseTimelineEvent[] };
      setTimeline(cached.events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar timeline.");
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <div className="view-stack">
      <PageIntro
        description="Capture atualizações pela Bandeja do Mercado Livre e consulte no ALC todo o histórico já arquivado, mesmo sem o conector ativo."
        chips={[competence, resumeAvailable ? "retomada disponível" : "sem captura pendente"]}
      />

      <Panel title="Captura do Case Center" subtitle="Selecione a competência e mantenha a Bandeja de suporte aberta no Chrome." action={<StatusBadge tone={connectionMeta.tone}>{connection === "checking" ? <RefreshCw size={12} /> : syncReady ? <CircleCheckBig size={12} /> : <XCircle size={12} />}{syncReady ? "Pronto" : connection === "checking" ? "Verificando" : "Atenção"}</StatusBadge>}>
        <div className="case-center-control">
          <div className="case-center-connector">
            <div>
              <strong>{connectionMessage || connectionMeta.label}</strong>
              <span>{installedVersion ? `Versão instalada ${installedVersion} · Atual ${LATEST_CONNECTOR_VERSION}` : "Conector necessário apenas para sincronização com o Mercado Livre."}</span>
              {updateAvailable && connection !== "outdated" ? <span>Existe uma versão mais recente do Conector PNR.</span> : null}
            </div>
            <div className="case-center-connector__actions">
              {connection === "extension-missing" || connection === "unsupported" || updateAvailable ? <button className="secondary-button" type="button" onClick={() => installDialogRef.current?.showModal()}><Download size={15} />{connection === "extension-missing" ? "Instalar Conector PNR" : "Baixar atualização"}</button> : null}
              {connection === "ml-missing" || connection === "expired" ? <button className="secondary-button" type="button" onClick={() => void openCaseCenter()}><ExternalLink size={15} />Abrir Bandeja Mercado Livre</button> : null}
              <button className="secondary-button" type="button" disabled={connection === "checking"} onClick={() => void checkConnector()}><RefreshCw size={15} />Verificar novamente</button>
            </div>
          </div>
          <div className="case-center-form">
            <label><span>Ano</span><select value={captureYear} onChange={(event) => setCaptureYear(Number(event.target.value))}>{captureYears.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Mês</span><select value={captureMonth} onChange={(event) => setCaptureMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
            <label><span>Quinzena</span><select value={captureHalf} onChange={(event) => setCaptureHalf(Number(event.target.value) as 1 | 2)}><option value={1}>Quinzena 1 / Q1</option><option value={2}>Quinzena 2 / Q2</option></select></label>
            <div className="case-center-import-actions">
              <button className="primary-button" type="button" disabled={running || !canImport || !syncReady} onClick={() => void startSync()}><CloudDownload size={17} />Trazer Dados para Inteligência ALC</button>
              <button
                className="icon-button"
                type="button"
                disabled={!canImport || !syncReady}
                aria-label={running ? "Pausar captura do Case Center" : "Iniciar ou retomar captura do Case Center"}
                title={running ? "Pausar captura" : "Iniciar ou retomar captura"}
                onClick={() => {
                  if (running) {
                    importPauseRef.current = true;
                    setPhase("Pausando após a página atual...");
                    return;
                  }
                  void startSync();
                }}
              >
                {running ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
          </div>
          <div className="case-center-progress" aria-live="polite">
            <div><strong>{phase}</strong><span>{progress.page ? `Página ${progress.page}${progress.totalPages ? ` de ${progress.totalPages}` : ""}` : competence}</span></div>
            <div className="case-center-progress__track"><i style={{ width: `${progress.totalElements ? Math.min(100, (progress.processed / progress.totalElements) * 100) : 0}%` }} /></div>
            {completion ? <div className="case-center-result"><span>{formatNumber(completion.received)} encontrados</span><span>{formatNumber(completion.reconciled)} reconciliados com histórico</span><span>{formatNumber(completion.created)} novos</span><span>{formatNumber(completion.updated)} atualizados</span><span>{formatNumber(completion.unchanged)} sem alteração</span><span>{formatNumber(completion.deleted)} excluídos</span><span>{formatNumber(completion.errors)} erros</span></div> : null}
            <div className="case-center-detail-sync">
              <span><strong>Sincronização de detalhes</strong> · {detailSync.message} · Pendentes: {formatNumber(detailSync.pending)} · Processados nesta sessão: {formatNumber(detailSync.processed)} · Erros: {formatNumber(detailSync.errors)}{detailSync.lastSuccessAt ? ` · Última: ${new Date(detailSync.lastSuccessAt).toLocaleTimeString("pt-BR")}` : ""}</span>
              <div className="case-center-detail-sync__actions">
                <button className="secondary-button" type="button" disabled={detailSync.phase === "active" || detailSync.manuallyPaused} onClick={requestPnrBackgroundSyncNow}><History size={15} />Sincronizar agora</button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={detailSync.manuallyPaused ? "Retomar sincronização de detalhes" : "Pausar sincronização de detalhes"}
                  title={detailSync.manuallyPaused ? "Retomar sincronização de detalhes" : "Pausar sincronização de detalhes"}
                  onClick={togglePnrBackgroundSyncPaused}
                >
                  {detailSync.manuallyPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <dialog ref={installDialogRef} className="case-center-install-dialog" onClose={() => void checkConnector()} aria-labelledby="case-center-install-title">
        <form method="dialog"><button className="icon-button" aria-label="Fechar instruções" title="Fechar instruções" type="submit"><XCircle size={18} /></button></form>
        <h2 id="case-center-install-title">Instalar Conector PNR</h2>
        <p>Instale uma única vez neste computador. O histórico permanece disponível sem o conector.</p>
        {connection === "unsupported" || updateAvailable ? <p>Desative a versão anterior antes de carregar a nova pasta.</p> : null}
        <ol>
          <li>Baixe e extraia o Conector PNR.</li>
          <li>Abra <code>chrome://extensions</code>.</li>
          <li>Ative &quot;Modo do desenvolvedor&quot;.</li>
          <li>Clique em &quot;Carregar sem compactação&quot;.</li>
          <li>Selecione a pasta extraída <code>alc-pnr-connector</code>.</li>
          <li>Volte ao Inteligência ALC.</li>
        </ol>
        <div className="case-center-install-dialog__actions">
          <a className="primary-button" href={CONNECTOR_DOWNLOAD_URL} download><Download size={16} />Baixar Conector v{LATEST_CONNECTOR_VERSION}</a>
          <button className="secondary-button" type="button" onClick={() => installDialogRef.current?.close()}><RefreshCw size={15} />Verificar instalação</button>
        </div>
      </dialog>

      <div className="kpi-grid kpi-grid--six">
        <KpiCard label="Casos encontrados" value={formatNumber(rows.length)} detail={competence} icon={<Boxes size={19} />} />
        <KpiCard label="Enviados para faturamento" value={formatNumber(billed)} detail="Fechamento concluído" icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Anulados" value={formatNumber(cancelled)} detail="Fechamento sem faturamento" icon={<Ban size={19} />} tone="red" />
        <KpiCard label="Revisados" value={formatNumber(reviewed)} detail="Com revisão registrada" icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Sem revisão" value={formatNumber(notReviewed)} detail="Sem revisão registrada" icon={<History size={19} />} tone="amber" />
        <KpiCard label="Valor total" value={formatCurrency(totalValue)} detail="Soma dos casos atuais" icon={<BadgeDollarSign size={19} />} tone="neutral" />
      </div>

      <div className="content-grid content-grid--wide">
        <Panel
          title="Evolução das classificações"
          subtitle="Clique em um ponto para comparar a classificação com a competência anterior"
          className="panel--chart"
          action={(
            <div className="pnr-trend-toggle" aria-label="Métrica do gráfico">
              <button type="button" className={trendMetric === "cases" ? "is-active" : ""} onClick={() => setTrendMetric("cases")}>Casos</button>
              <button type="button" className={trendMetric === "value" ? "is-active" : ""} onClick={() => setTrendMetric("value")}>Valor</button>
            </div>
          )}
        >
          {trendData.length ? (
            <>
              <div className="pnr-trend-legend">
                {(Object.entries(TREND_SERIES) as Array<[TrendSeriesKey, (typeof TREND_SERIES)[TrendSeriesKey]]>).map(([key, item]) => (
                  <span key={key} className={trendSelection?.series === key ? "is-selected" : ""}>
                    <i style={{ background: item.color }} />{item.label}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={286}>
                <LineChart data={trendData} margin={{ left: 4, right: 18, top: 14, bottom: 4 }}>
                  <CartesianGrid stroke="#ECEDEF" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#73767d" }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={trendMetric === "value"}
                    tick={{ fontSize: 9, fill: "#73767d" }}
                    tickFormatter={(value) => trendMetric === "value" ? `R$ ${formatNumber(Number(value) / 1000)}k` : formatNumber(Number(value))}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatTrendValue(Number(value)), String(name)]}
                    labelFormatter={(label) => `Competência ${String(label)}`}
                  />
                  {(Object.entries(TREND_SERIES) as Array<[TrendSeriesKey, (typeof TREND_SERIES)[TrendSeriesKey]]>).map(([key, item]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={metricField(key, trendMetric)}
                      name={item.label}
                      stroke={item.color}
                      strokeWidth={trendSelection?.series === key ? 3 : 2}
                      dot={renderTrendDot(key)}
                      activeDot={{ r: 6, strokeWidth: 2, fill: item.color, stroke: "#fff" }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : <NoResults title="Sem histórico suficiente para evolução" />}
        </Panel>

        <Panel
          title={trendSelection ? `Comparação — ${selectedTrendLabel}` : "Comparação geral"}
          subtitle={selectedTrendPoint
            ? `${selectedTrendPoint.label}${previousTrendPoint ? ` x ${previousTrendPoint.label}` : " · sem período anterior no recorte"}`
            : "Selecione um ponto no gráfico ao lado"}
          className="panel--chart"
          action={trendSelection ? <button className="table-action pnr-trend-clear" type="button" onClick={() => setTrendSelection(null)}><XCircle size={13} />Limpar</button> : null}
        >
          {selectedTrendPoint ? (
            <div className="pnr-comparison">
              <ResponsiveContainer width="100%" height={174}>
                <BarChart data={comparisonBars} margin={{ left: 0, right: 6, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="#ECEDEF" vertical={false} />
                  <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} allowDecimals={trendMetric === "value"} tickFormatter={(value) => trendMetric === "value" ? `R$ ${formatNumber(Number(value) / 1000)}k` : formatNumber(Number(value))} />
                  <Tooltip formatter={(value) => [formatTrendValue(Number(value)), trendMetric === "value" ? "Valor" : "Casos"]} />
                  <Bar dataKey="value" name={trendMetric === "value" ? "Valor" : "Casos"} radius={[4, 4, 0, 0]} maxBarSize={54}>
                    {comparisonBars.map((item) => <Cell key={item.period} fill={item.current ? selectedTrendColor : "#a7a9ad"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="pnr-comparison-summary">
                <div>
                  <span>Casos</span>
                  <strong>{formatNumber(currentCases)}</strong>
                  <small className={caseDelta !== null && caseDelta < 0 ? "is-down" : caseDelta !== null ? "is-up" : ""}>{formatDelta(caseDelta)}</small>
                </div>
                <div>
                  <span>Valor</span>
                  <strong>{formatCurrency(currentValue)}</strong>
                  <small className={valueDelta !== null && valueDelta < 0 ? "is-down" : valueDelta !== null ? "is-up" : ""}>{formatDelta(valueDelta)}</small>
                </div>
                <div>
                  <span>Participação</span>
                  <strong>{new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 }).format(currentShare)}</strong>
                  <small>{previousTrendPoint ? `${new Intl.NumberFormat("pt-BR", { signDisplay: "always", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((currentShare - previousShare) * 100)} p.p.` : "Sem período anterior"}</small>
                </div>
              </div>
              <p className="pnr-comparison-hint">{trendSelection ? "Clique novamente no ponto selecionado ou use Limpar para voltar à comparação geral." : "Clique em qualquer ponto do gráfico de linhas para comparar uma classificação específica."}</p>
            </div>
          ) : <NoResults title="Sem dados para comparação" />}
        </Panel>
      </div>

      <Panel title="Bases" subtitle="Top bases por quantidade de casos" className="panel--chart">
        {bases.length ? <ResponsiveContainer width="100%" height={Math.max(230, bases.length * 34)}><BarChart data={bases} layout="vertical" margin={{ left: 12, right: 24 }}><CartesianGrid stroke="#ECEDEF" horizontal={false} /><XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="base" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="cases" name="Casos" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer> : <NoResults title="Nenhuma base encontrada" />}
      </Panel>

      <div className="content-grid content-grid--wide">
        <Panel title="Casos recentes" subtitle="Selecione um caso para consultar a timeline arquivada">
          {rows.length ? <div className="case-center-case-list">{rows.slice(0, 30).map((row) => <button type="button" key={row.caseId || `${row.batchId}-${row.shipmentId}`} onClick={() => void loadTimeline(row)} className={selectedCase?.caseId === row.caseId ? "is-active" : ""}><span><strong className="mono">{row.shipmentId}</strong><small>Caso {row.caseId || "—"} · {row.originStation || "Sem base"}</small></span><span><b>{row.status}</b><small>{caseCenterReviewLabel(row.reviewedStatus || "")} · {row.detailSyncStatus === "COMPLETE" ? "timeline arquivada" : "detalhes pendentes"}</small></span><strong>{formatCurrency(row.purchaseValue)}</strong></button>)}</div> : <NoResults title="Nenhum caso importado" detail="Use o botão de captura para trazer a competência selecionada." />}
        </Panel>
        <Panel title="Timeline do caso" subtitle={selectedCase ? `Caso ${selectedCase.caseId}` : "Selecione um caso ao lado"}>
          {timelineLoading ? <div className="case-center-timeline-loading"><RefreshCw size={17} />Consultando timeline...</div> : timeline.length ? <ol className="case-center-timeline">{timeline.map((event) => <li key={event.eventId}><time>{new Date(event.dateCreated).toLocaleString("pt-BR")}</time><strong>{event.label}</strong>{event.actorName && !event.label.startsWith(event.actorName) ? <small>{event.actorName}</small> : null}</li>)}</ol> : <NoResults title={selectedCase ? "Timeline ainda não disponível" : "Nenhum caso selecionado"} />}
        </Panel>
      </div>
    </div>
  );
}
