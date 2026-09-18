"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleDollarSign, FileText, History, LoaderCircle, MapPinned, PackageOpen, RefreshCw, Route, UserRound, X } from "lucide-react";
import { formatCurrency, StatusBadge } from "@/components/ui";
import type { PnrRecord } from "@/lib/types";
import type { PnrCaseTimelineEvent } from "@/lib/pnr-case-center";
import type { PnrCaseDetailSnapshot } from "@/lib/pnr-case-detail";
import { requestPnrConnector } from "@/lib/pnr-connector-client";

interface TimelineResponse {
  cached: boolean;
  detailSyncStatus: string;
  detailLastAttemptAt?: string | null;
  detailLastSuccessAt?: string | null;
  detailNextSyncAt?: string | null;
  detailLastError?: string | null;
  timelineSyncedAt?: string | null;
  detail?: PnrCaseDetailSnapshot;
  events: PnrCaseTimelineEvent[];
}

interface TimelineConnectorResult {
  caseId: string;
  sourceEventCount: number;
  events: PnrCaseTimelineEvent[];
  detail?: PnrCaseDetailSnapshot;
}

async function readArchivedTimeline(caseId: string) {
  const response = await fetch(`/api/pnr-case-center/timeline?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Falha ao carregar os detalhes arquivados.");
  }
  return response.json() as Promise<TimelineResponse>;
}

async function persistTimelineResult(caseId: string, result: TimelineConnectorResult) {
  const response = await fetch("/api/pnr-case-center/timeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId,
      status: "COMPLETE",
      detail: result.detail,
      sourceEventCount: result.sourceEventCount,
      events: result.events.map(({ eventId, eventType, dateCreated, actorName, actorUserId }) => ({
        eventId,
        eventType,
        dateCreated,
        ...(actorName ? { actorName } : {}),
        ...(actorUserId ? { actorUserId } : {}),
      })),
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Falha ao arquivar os detalhes atualizados.");
  }
}

function display(value?: string | null) {
  return value?.trim() || "—";
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : value;
}

function DetailField({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return <div className="pnr-detail-field"><span>{label}</span><strong className={mono ? "mono" : undefined}>{display(value)}</strong></div>;
}

function DetailSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="pnr-detail-section">
      <header>{icon}<h3>{title}</h3></header>
      <div className="pnr-detail-section__body">{children}</div>
    </section>
  );
}

export function PnrCaseDetailDrawer({ row, onClose }: { row: PnrRecord | null; onClose: () => void }) {
  const [remote, setRemote] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(row?.caseId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCaseNow = async () => {
    if (!row?.caseId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const result = await requestPnrConnector<TimelineConnectorResult>("FETCH_TIMELINE", { caseId: row.caseId }, 30_000);
      await persistTimelineResult(row.caseId, result);
      const refreshed = await readArchivedTimeline(row.caseId);
      setRemote(refreshed);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error
        ? refreshError.message
        : "Não foi possível receber os dados deste caso agora.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  useEffect(() => {
    let cancelled = false;
    if (!row?.caseId) return;

    setRemote(null);
    setError(null);
    setLoading(true);
    setRefreshing(false);

    const load = async () => {
      let cached: TimelineResponse | null = null;
      try {
        cached = await readArchivedTimeline(row.caseId!);
        if (!cancelled) {
          setRemote(cached);
          setLoading(false);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Falha ao carregar os detalhes.");
          setLoading(false);
        }
        return;
      }

      const needsImmediateRefresh = row.sourceSystem === "case_center"
        && (cached.detailSyncStatus !== "COMPLETE" || !cached.detail);
      if (!needsImmediateRefresh || cancelled) return;

      setRefreshing(true);
      try {
        const result = await requestPnrConnector<TimelineConnectorResult>("FETCH_TIMELINE", { caseId: row.caseId }, 30_000);
        if (cancelled) return;
        await persistTimelineResult(row.caseId!, result);
        if (cancelled) return;
        const refreshed = await readArchivedTimeline(row.caseId!);
        if (!cancelled) {
          setRemote(refreshed);
          setError(null);
        }
      } catch (refreshError) {
        // Cached data remains usable. The background queue will keep trying when
        // the connector/session is available, so do not replace usable content
        // with a hard error just because the live refresh could not run.
        if (!cancelled && !cached.detail && !cached.events.length) {
          setError(refreshError instanceof Error
            ? refreshError.message
            : "Detalhes ainda pendentes de enriquecimento.");
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [row]);

  const classification = useMemo(() => {
    if (!row) return "";
    if (row.billingType) return `Faturamento · ${row.billingType}`;
    if (row.cancellationType) return `Anulação · ${row.cancellationType}`;
    return "Pendente de classificação";
  }, [row]);

  if (!row) return null;

  const detail = remote?.detail;
  const events = remote?.events ?? [];
  const lossDispatcherActor = row.billingType?.includes("LOSS/DISPATCHER")
    ? events.find((event) => event.eventType === "NOT_ATTACHED_RECEIPT" && event.actorName)?.actorName
    : undefined;
  const reviewActor = detail?.reviewRequestedBy
    || events.find((event) => /ON_REVIEW/.test(event.eventType) && event.actorName)?.actorName;
  const receiptActor = detail?.receiptActorName
    || events.find((event) => (event.eventType === "ATTACHED_RECEIPT" || event.eventType === "NOT_ATTACHED_RECEIPT") && event.actorName)?.actorName;
  const archivedAt = remote?.detailLastSuccessAt || remote?.timelineSyncedAt;
  const archiveStatus = remote?.detailSyncStatus === "ERROR"
    ? "Dados arquivados no ALC · atualização com erro"
    : remote?.cached
      ? "Dados arquivados no ALC · sincronização atualizada"
      : detail || events.length
        ? "Dados arquivados no ALC · nova sincronização pendente"
        : "Detalhes ainda pendentes de enriquecimento";

  return (
    <div className="pnr-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="pnr-detail-drawer" role="dialog" aria-modal="true" aria-label={`Detalhes do caso ${row.caseId || row.shipmentId}`}>
        <div className="pnr-detail-drawer__header">
          <div>
            <span>Detalhes do caso</span>
            <h2>{row.caseId ? `Caso ${row.caseId}` : `Envio ${row.shipmentId}`}</h2>
            <p>{row.originStation || "Base não identificada"} · {row.shipmentId}</p>
          </div>
          <div className="pnr-detail-drawer__actions">
            {row.sourceSystem === "case_center" && row.caseId ? (
              <button
                className="pnr-detail-refresh-button"
                type="button"
                onClick={() => { void refreshCaseNow(); }}
                disabled={refreshing}
                aria-label="Receber dados deste caso agora"
              >
                {refreshing ? <LoaderCircle size={14} className="is-spinning" /> : <RefreshCw size={14} />}
                <span>{refreshing ? "Recebendo..." : "Receber dados"}</span>
              </button>
            ) : null}
            <button className="icon-button" type="button" aria-label="Fechar detalhes" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="pnr-detail-drawer__status">
          <StatusBadge tone={/FATUR|BILLED/i.test(row.status) ? "green" : /ANUL/i.test(row.status) ? "red" : "amber"}>{row.status || "Sem status"}</StatusBadge>
          <span>{classification}</span>
          {row.sourceSystem === "case_center" ? <small>{archiveStatus}{archivedAt ? ` · ${dateTime(archivedAt)}` : ""}</small> : <small>Histórico legado por planilha</small>}
        </div>

        <div className="pnr-detail-drawer__content">
          {loading ? <div className="pnr-detail-note">Carregando detalhes arquivados…</div> : null}
          {refreshing ? <div className="pnr-detail-note">Atualizando este caso diretamente no Case Center…</div> : null}
          {error ? <div className="pnr-detail-note pnr-detail-note--error">{error}</div> : null}

          <DetailSection icon={<FileText size={17} />} title="Resumo do caso">
            <div className="pnr-detail-grid">
              <DetailField label="ID do envio" value={row.shipmentId} mono />
              <DetailField label="Case ID" value={row.caseId} mono />
              <DetailField label="Status atual" value={row.status} />
              <DetailField label="Competência" value={detail?.billingPeriod || row.billingPeriod} />
              <DetailField label="Data do caso" value={row.caseDate ? new Date(`${row.caseDate}T12:00:00`).toLocaleDateString("pt-BR") : null} />
              <DetailField label="Última sincronização" value={dateTime(archivedAt)} />
              <DetailField label="Base / estação" value={row.originStation} />
              <DetailField label="XPT" value={row.xptCode} />
              <DetailField label="Motorista" value={detail?.driverName || row.driverName || row.driverId} />
              <DetailField label="Rota" value={detail?.routeId || row.routeId} mono />
              <DetailField label="Valor da compra" value={formatCurrency(row.purchaseValue)} />
              <DetailField label="Nº da pré-fatura" value={detail?.preInvoiceNumber} />
            </div>
          </DetailSection>

          <DetailSection icon={<UserRound size={17} />} title="Dados da reclamação">
            <div className="pnr-detail-grid">
              <DetailField label="Comprador / reclamante" value={detail?.buyerName} />
              <DetailField label="Designado para receber" value={detail?.assignedReceiver} />
              <DetailField label="ID de seguimento" value={detail?.trackingId} />
              <DetailField label="Claim ID" value={detail?.claimId} mono />
            </div>
            <div className="pnr-detail-text"><span>Mensagem da reclamação</span><p>{display(detail?.complaintMessage)}</p></div>
            <div className="pnr-detail-products">
              <span>Produtos</span>
              {detail?.products?.length ? detail.products.map((product, index) => (
                <div key={`${product.id || product.title}-${index}`}>
                  <strong>{product.title}</strong>
                  <small>{product.price != null ? formatCurrency(product.price) : "Valor não disponível"}</small>
                </div>
              )) : <p>Não disponível neste histórico.</p>}
            </div>
          </DetailSection>

          <DetailSection icon={<PackageOpen size={17} />} title="Dados de quem recebeu">
            <div className="pnr-detail-grid">
              <DetailField label="Data da entrega" value={dateTime(detail?.deliveryAt)} />
              <DetailField label="Quem recebeu" value={detail?.receivedBy} />
              <DetailField label="Nome completo" value={detail?.receiverName} />
              <DetailField label="Documento" value={detail?.receiverDocument} />
            </div>
          </DetailSection>

          <DetailSection icon={<Route size={17} />} title="Dados da rota">
            <div className="pnr-detail-grid">
              <DetailField label="Rota" value={detail?.routeId || row.routeId} mono />
              <DetailField label="Transportadora" value={detail?.carrierName || row.carrier} />
              <DetailField label="Motorista" value={detail?.driverName || row.driverName} />
              <DetailField label="ID do motorista" value={detail?.driverId || row.driverId} mono />
              <DetailField label="Telefone" value={detail?.driverPhone} />
              <DetailField label="Base / estação" value={row.originStation} />
            </div>
          </DetailSection>

          <DetailSection icon={<MapPinned size={17} />} title="Comprovante e revisão">
            <div className="pnr-detail-grid">
              <DetailField label="Situação do comprovante" value={detail?.receiptStatus} />
              <DetailField label="Responsável" value={receiptActor} />
              <DetailField label="Data do comprovante" value={dateTime(detail?.receiptAt)} />
              <DetailField label="Pedido de revisão por" value={reviewActor} />
              <DetailField label="Data do pedido" value={dateTime(detail?.reviewRequestedAt)} />
            </div>
            <div className="pnr-detail-text"><span>Comprovante / evidência</span><p>{display(detail?.receiptMessage)}</p></div>
            {detail?.receiptEvidenceNames?.length ? <div className="pnr-detail-tags">{detail.receiptEvidenceNames.map((name) => <span key={name}>{name}</span>)}</div> : null}
            <div className="pnr-detail-text"><span>Pedido de revisão</span><p>{display(detail?.reviewMessage)}</p></div>
            <div className="pnr-detail-text"><span>Resultado Méli</span><p>{display(detail?.reviewOutcome)}</p></div>
            <div className="pnr-detail-text"><span>Mensagem do resultado</span><p>{display(detail?.reviewOutcomeMessage)}</p></div>
            <div className="pnr-detail-grid"><DetailField label="Data do resultado" value={dateTime(detail?.reviewOutcomeAt)} /></div>
            {detail?.reviewEvidenceNames?.length ? <div className="pnr-detail-tags">{detail.reviewEvidenceNames.map((name) => <span key={name}>{name}</span>)}</div> : null}
          </DetailSection>

          <DetailSection icon={<CircleDollarSign size={17} />} title="Faturamento e classificação">
            <div className="pnr-detail-grid">
              <DetailField label="Classificação" value={classification} />
              <DetailField label="Operador Loss/Dispatcher" value={lossDispatcherActor} />
              <DetailField label="Quem enviou para revisão" value={reviewActor} />
              <DetailField label="Pré-fatura" value={detail?.preInvoiceNumber} />
            </div>
          </DetailSection>

          <DetailSection icon={<History size={17} />} title="Atividade">
            {events.length ? (
              <ol className="pnr-detail-timeline">
                {events.map((event) => (
                  <li key={event.eventId}>
                    <time>{dateTime(event.dateCreated)}</time>
                    <strong>{event.label}</strong>
                    {event.actorName && !event.label.startsWith(event.actorName) ? <small>{event.actorName}</small> : null}
                  </li>
                ))}
              </ol>
            ) : <p className="pnr-detail-empty">{row.caseId ? "Timeline ainda não arquivada. Use o Sync PNR para enriquecer este caso." : "Este caso pertence ao histórico legado e não possui timeline do Case Center."}</p>}
          </DetailSection>
        </div>
      </aside>
    </div>
  );
}
