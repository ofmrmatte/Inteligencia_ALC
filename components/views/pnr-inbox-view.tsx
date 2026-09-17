"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Ban, Boxes, CircleCheckBig, CloudDownload, Download, ExternalLink, History, RefreshCw, Square, XCircle } from "lucide-react";
import { toast } from "sonner";
import { canManageImports, type AuthProfile } from "@/lib/auth";
import { normalizeFortnight } from "@/lib/competence";
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
import type { PnrRecord } from "@/lib/types";
import { formatCurrency, formatNumber, KpiCard, PageIntro, Panel, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults } from "./shared";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const COLORS = ["#16845b", "#e30613"];

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
  updated: number;
  unchanged: number;
  deleted: number;
  errors: number;
}

interface TimelineConnectorResult {
  caseId: string;
  events: PnrCaseTimelineEvent[];
  detail?: { claimId?: string; preInvoiceNumber?: string; billingPeriod?: string; driverId?: string };
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

async function persistTimeline(caseId: string, result?: TimelineConnectorResult, status: "COMPLETE" | "ERROR" = "COMPLETE") {
  const response = await fetch("/api/pnr-case-center/timeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId,
      status,
      detail: result?.detail,
      events: (result?.events ?? []).map(({ eventId, eventType, dateCreated, actorName }) => ({
        eventId,
        eventType,
        dateCreated,
        ...(actorName ? { actorName } : {}),
      })),
    }),
  });
  if (!response.ok) throw new Error(await readError(response, "Falha ao arquivar timeline."));
  return response.json() as Promise<{ events: PnrCaseTimelineEvent[] }>;
}

async function fetchTimelineWithRetry(caseId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestPnrConnector<TimelineConnectorResult>("FETCH_TIMELINE", { caseId });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

export function PnrInboxView({ profile }: { profile: AuthProfile }) {
  const now = new Date();
  const data = useDashboardStore((state) => state.data);
  const hydrate = useDashboardStore((state) => state.hydrate);
  const cacheOwnerId = useDashboardStore((state) => state.cacheOwnerId);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2);
  const [connection, setConnection] = useState<PnrConnectorState>("checking");
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("Pronto para sincronizar");
  const [progress, setProgress] = useState({ page: 0, totalPages: 0, processed: 0, totalElements: 0, errors: 0 });
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [selectedCase, setSelectedCase] = useState<PnrRecord | null>(null);
  const [timeline, setTimeline] = useState<PnrCaseTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [detailRunning, setDetailRunning] = useState(false);
  const [detailProgress, setDetailProgress] = useState({ done: 0, total: 0, errors: 0 });
  const cancelRef = useRef(false);
  const detailCancelRef = useRef(false);
  const connectorCheckRef = useRef(0);
  const installDialogRef = useRef<HTMLDialogElement>(null);
  const competence = `${year}${String(month).padStart(2, "0")}Q${half}`;
  const fortnight = normalizeFortnight(competence);
  const resumeKey = `alc-pnr-case-center:${competence}`;
  const canImport = canManageImports(profile);

  const rows = useMemo(() => data.pnr.filter(
    (row) => row.sourceSystem === "case_center" && normalizeFortnight(row.billingPeriod) === fortnight,
  ), [data.pnr, fortnight]);

  const billed = rows.filter((row) => row.subStatus === "BILLED").length;
  const cancelled = rows.filter((row) => row.subStatus === "NOT_BILLED").length;
  const reviewed = rows.filter((row) => row.reviewedStatus === "reviewed").length;
  const notReviewed = rows.filter((row) => row.reviewedStatus === "not_reviewed").length;
  const totalValue = rows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const closure = [{ name: "Enviados para faturamento", cases: billed }, { name: "Anulados", cases: cancelled }];
  const review = [{ name: "Revisados", cases: reviewed }, { name: "Sem revisão", cases: notReviewed }];
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
  const years = Array.from({ length: 4 }, (_, index) => now.getFullYear() - 2 + index);

  useEffect(() => {
    queueMicrotask(() => setResumeAvailable(Boolean(window.localStorage.getItem(resumeKey))));
  }, [resumeKey]);

  const checkConnector = useCallback(async () => {
    const checkId = ++connectorCheckRef.current;
    setConnection("checking");
    try {
      const handshake = await requestPnrConnector<PnrConnectorHandshake>("PING", {}, 10_000);
      const state = handshake?.installed ? connectorStateFromHandshake(handshake) : "unsupported";
      if (checkId === connectorCheckRef.current) {
        setInstalledVersion(handshake?.installed ? handshake.version : null);
        setConnection(state);
      }
      return state;
    } catch (error) {
      const state = error instanceof PnrConnectorError
        && (error.code === "MERCADO_LIVRE_NOT_DETECTED" || error.code === "MERCADO_LIVRE_SESSION_REQUIRED")
        ? "unsupported" : connectionStateFromError(error);
      if (checkId === connectorCheckRef.current) {
        setInstalledVersion(null);
        setConnection(state);
      }
      return state;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void checkConnector());
    const onFocus = () => { void checkConnector(); };
    window.addEventListener("focus", onFocus);
    return () => {
      connectorCheckRef.current += 1;
      window.removeEventListener("focus", onFocus);
    };
  }, [checkConnector]);

  const refreshDashboard = async () => {
    useDashboardStore.setState({ lastSyncedAt: 0 });
    await hydrate(cacheOwnerId, true);
  };

  const startSync = async () => {
    if (!canImport) {
      toast.error("Seu perfil não possui permissão para importações oficiais.");
      return;
    }

    cancelRef.current = false;
    setRunning(true);
    setCompletion(null);
    setPhase("Conectando...");
    try {
      const currentConnection = await checkConnector();
      if (currentConnection !== "connected" && currentConnection !== "outdated") {
        throw new Error(connectionPresentation(currentConnection).label);
      }
      const stored = JSON.parse(window.localStorage.getItem(resumeKey) || "null") as ResumeState | null;
      const resume = stored ?? { syncId: crypto.randomUUID(), nextPage: 1, processed: 0, errors: 0 };
      let lastPersisted = resume.processed;
      let totalFound = 0;
      let lastCounts = { newCount: 0, updatedCount: 0, unchangedCount: 0, deletedCount: 0 };

      const result = await runCaseCenterPagination({
        startPage: resume.nextPage,
        initialProcessed: resume.processed,
        initialErrors: resume.errors,
        isCancelled: () => cancelRef.current,
        fetchPage: async (page) => {
          setPhase(`Consultando página ${page}${progress.totalPages ? ` de ${progress.totalPages}` : ""}`);
          return requestPnrConnector<CaseCenterPage>("FETCH_PAGE", { competence, page });
        },
        persistPage: async (pageResult, completed, processed, errors) => {
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
          const body = await response.json() as { persisted: number; newCount: number; updatedCount: number; unchangedCount: number; deletedCount: number };
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
        setPhase("Captura interrompida. A retomada foi preservada.");
      } else {
        setPhase("Sincronização concluída");
        setCompletion({
          received: totalFound || result.processed,
          persisted: lastPersisted,
          created: lastCounts.newCount,
          updated: lastCounts.updatedCount,
          unchanged: lastCounts.unchangedCount,
          deleted: lastCounts.deletedCount,
          errors: result.errors,
        });
        await refreshDashboard();
      }
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

  const archivePendingDetails = async (candidates: PnrRecord[] = rows) => {
    if (detailRunning) return;
    const pending = candidates.filter((row) => (
      row.sourceSystem === "case_center"
      && normalizeFortnight(row.billingPeriod) === fortnight
      && row.caseId
      && row.detailSyncStatus !== "COMPLETE"
    ));
    if (pending.length === 0) return;

    detailCancelRef.current = false;
    setDetailRunning(true);
    setDetailProgress({ done: 0, total: pending.length, errors: 0 });
    let done = 0;
    let errors = 0;
    try {
      for (const row of pending) {
        if (detailCancelRef.current || !row.caseId) break;
        try {
          const remote = await fetchTimelineWithRetry(row.caseId);
          await persistTimeline(row.caseId, remote);
          done += 1;
        } catch (error) {
          const state = connectionStateFromError(error);
          if (state !== "error") {
            setConnection(state);
            toast.error("Conector Mercado Livre indisponível para atualização. O histórico local permanece acessível.");
            break;
          }
          errors += 1;
          done += 1;
          await persistTimeline(row.caseId, undefined, "ERROR").catch(() => undefined);
        }
        setDetailProgress({ done, total: pending.length, errors });
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    } finally {
      setDetailRunning(false);
      await refreshDashboard();
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
      const cached = await cachedResponse.json() as { cached: boolean; events: PnrCaseTimelineEvent[] };
      setTimeline(cached.events);
      if (cached.cached) {
        return;
      }
      if (!syncReady) {
        toast.message("Conector necessário apenas para sincronização com o Mercado Livre.");
        return;
      }

      const remote = await fetchTimelineWithRetry(row.caseId);
      const persisted = await persistTimeline(row.caseId, remote);
      setTimeline(persisted.events);
    } catch (error) {
      const state = connectionStateFromError(error);
      if (state !== "error") setConnection(state);
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
              <strong>{connectionMeta.label}</strong>
              <span>{installedVersion ? `Versão instalada ${installedVersion} · Atual ${LATEST_CONNECTOR_VERSION}` : "Conector necessário apenas para sincronização com o Mercado Livre."}</span>
              {updateAvailable && connection !== "outdated" ? <span>Existe uma versão mais recente do Conector PNR.</span> : null}
            </div>
            <div className="case-center-connector__actions">
              {connection === "extension-missing" || connection === "unsupported" || updateAvailable ? <button className="secondary-button" type="button" onClick={() => installDialogRef.current?.showModal()}><Download size={15} />{connection === "extension-missing" ? "Instalar Conector PNR" : "Baixar atualização"}</button> : null}
              {connection === "ml-missing" || connection === "expired" ? <button className="secondary-button" type="button" onClick={() => window.open("https://envios.adminml.com/logistics/case-center/cases", "_blank", "noopener,noreferrer")}><ExternalLink size={15} />Abrir Bandeja Mercado Livre</button> : null}
              <button className="secondary-button" type="button" disabled={connection === "checking"} onClick={() => void checkConnector()}><RefreshCw size={15} />Verificar novamente</button>
            </div>
          </div>
          <div className="case-center-form">
            <label><span>Ano</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Mês</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
            <label><span>Quinzena</span><select value={half} onChange={(event) => setHalf(Number(event.target.value) as 1 | 2)}><option value={1}>Quinzena 1 / Q1</option><option value={2}>Quinzena 2 / Q2</option></select></label>
            <button className="primary-button" type="button" disabled={running || !canImport || !syncReady} onClick={() => void startSync()}><CloudDownload size={17} />Trazer Dados para Inteligência ALC</button>
            {running ? <button className="secondary-button" type="button" onClick={() => { cancelRef.current = true; setPhase("Cancelando após a página atual..."); }}><Square size={14} />Cancelar</button> : null}
          </div>
          <div className="case-center-progress" aria-live="polite">
            <div><strong>{phase}</strong><span>{progress.page ? `Página ${progress.page}${progress.totalPages ? ` de ${progress.totalPages}` : ""}` : competence}</span></div>
            <div className="case-center-progress__track"><i style={{ width: `${progress.totalElements ? Math.min(100, (progress.processed / progress.totalElements) * 100) : 0}%` }} /></div>
            {completion ? <div className="case-center-result"><span>{formatNumber(completion.received)} encontrados</span><span>{formatNumber(completion.created)} novos</span><span>{formatNumber(completion.updated)} atualizados</span><span>{formatNumber(completion.unchanged)} sem alteração</span><span>{formatNumber(completion.deleted)} excluídos</span><span>{formatNumber(completion.errors)} erros</span></div> : null}
            <div className="case-center-detail-sync">
              <span>{detailProgress.total ? `Detalhes arquivados: ${formatNumber(detailProgress.done)} / ${formatNumber(detailProgress.total)}${detailProgress.errors ? ` · ${formatNumber(detailProgress.errors)} erros` : ""}` : "As timelines pendentes podem ser arquivadas sem bloquear o painel."}</span>
              {detailRunning ? <button className="secondary-button" type="button" onClick={() => { detailCancelRef.current = true; }}><Square size={14} />Pausar detalhes</button> : <button className="secondary-button" type="button" disabled={!syncReady || !rows.some((row) => row.caseId && row.detailSyncStatus !== "COMPLETE")} onClick={() => void archivePendingDetails()}><History size={15} />Arquivar detalhes pendentes</button>}
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
        <KpiCard label="Enviados para faturamento" value={formatNumber(billed)} detail="BILLED" icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Anulados" value={formatNumber(cancelled)} detail="NOT_BILLED" icon={<Ban size={19} />} tone="red" />
        <KpiCard label="Revisados" value={formatNumber(reviewed)} detail="reviewed" icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Sem revisão" value={formatNumber(notReviewed)} detail="not_reviewed" icon={<History size={19} />} tone="amber" />
        <KpiCard label="Valor total" value={formatCurrency(totalValue)} detail="Soma dos casos atuais" icon={<BadgeDollarSign size={19} />} tone="neutral" />
      </div>

      <div className="content-grid content-grid--wide">
        <Panel title="Fechamento" subtitle="Enviado para faturamento x Anulado" className="panel--chart">
          {rows.length ? <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={closure} dataKey="cases" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>{closure.map((item, index) => <Cell key={item.name} fill={COLORS[index]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer> : <NoResults title="Sem casos nesta competência" />}
        </Panel>
        <Panel title="Revisão" subtitle="Revisado x Sem revisão" className="panel--chart">
          {rows.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={review} margin={{ left: 8, right: 12, top: 8 }}><CartesianGrid stroke="#ECEDEF" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="cases" name="Casos" fill="#333333" radius={[4, 4, 0, 0]} maxBarSize={54} /></BarChart></ResponsiveContainer> : <NoResults title="Sem revisão nesta competência" />}
        </Panel>
      </div>

      <Panel title="Bases" subtitle="Top bases por quantidade de casos" className="panel--chart">
        {bases.length ? <ResponsiveContainer width="100%" height={Math.max(230, bases.length * 34)}><BarChart data={bases} layout="vertical" margin={{ left: 12, right: 24 }}><CartesianGrid stroke="#ECEDEF" horizontal={false} /><XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="base" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="cases" name="Casos" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer> : <NoResults title="Nenhuma base encontrada" />}
      </Panel>

      <div className="content-grid content-grid--wide">
        <Panel title="Casos recentes" subtitle="Selecione um caso para consultar a timeline sob demanda">
          {rows.length ? <div className="case-center-case-list">{rows.slice(0, 30).map((row) => <button type="button" key={row.caseId || `${row.batchId}-${row.shipmentId}`} onClick={() => void loadTimeline(row)} className={selectedCase?.caseId === row.caseId ? "is-active" : ""}><span><strong className="mono">{row.shipmentId}</strong><small>Caso {row.caseId || "—"} · {row.originStation || "Sem base"}</small></span><span><b>{row.status}</b><small>{caseCenterReviewLabel(row.reviewedStatus || "")} · {row.detailSyncStatus === "COMPLETE" ? "timeline arquivada" : "detalhes pendentes"}</small></span><strong>{formatCurrency(row.purchaseValue)}</strong></button>)}</div> : <NoResults title="Nenhum caso importado" detail="Use o botão de captura para trazer a competência selecionada." />}
        </Panel>
        <Panel title="Timeline do caso" subtitle={selectedCase ? `Caso ${selectedCase.caseId}` : "Selecione um caso ao lado"}>
          {timelineLoading ? <div className="case-center-timeline-loading"><RefreshCw size={17} />Consultando timeline...</div> : timeline.length ? <ol className="case-center-timeline">{timeline.map((event) => <li key={event.eventId}><time>{new Date(event.dateCreated).toLocaleString("pt-BR")}</time><strong>{event.label}</strong>{event.actorName ? <small>{event.actorName}</small> : null}</li>)}</ol> : <NoResults title={selectedCase ? "Timeline ainda não disponível" : "Nenhum caso selecionado"} />}
        </Panel>
      </div>
    </div>
  );
}
