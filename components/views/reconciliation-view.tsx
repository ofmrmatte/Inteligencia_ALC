"use client";

import { useState } from "react";
import { CheckCheck, CircleDashed, Copy, Eye, GitMerge, Link2, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { scopeData } from "@/lib/dashboard-scope";
import { detailedReconciliation, type DetailedReconciliationRow } from "@/lib/reconciliation-details";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ColumnSelectFilter, NoResults, TableWrap } from "./shared";

type ColumnFilters = {
  prefatura: string;
  pnr: string;
  risk: string;
  sources: string;
  occurrences: string;
  status: string;
  latestStatus: string;
};

const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  prefatura: "TODOS",
  pnr: "TODOS",
  risk: "TODOS",
  sources: "TODOS",
  occurrences: "TODOS",
  status: "TODOS",
  latestStatus: "TODOS",
};

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function numericOptions(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b).map((value) => ({ value: String(value), label: String(value) }));
}

function textOptions(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")).map((value) => ({ value, label: value }));
}

export function ReconciliationView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const [analysis, setAnalysis] = useState<DetailedReconciliationRow | null>(null);
  const [mergingId, setMergingId] = useState("");
  const [bulkMerging, setBulkMerging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);

  const rows = detailedReconciliation(scopeData(data, filters), data.imports);
  if (!rows.length) return <NoResults title="Nenhum ID disponível para conciliação" />;

  const reconciled = rows.filter((row) => row.status === "Conciliado");
  const duplicates = rows.filter((row) => row.status === "Duplicado");
  const isolated = rows.filter((row) => row.status === "Isolado");

  const filteredRows = rows.filter((row) => {
    if (columnFilters.prefatura !== "TODOS" && String(row.prefatura) !== columnFilters.prefatura) return false;
    if (columnFilters.pnr !== "TODOS" && String(row.pnr) !== columnFilters.pnr) return false;
    if (columnFilters.risk !== "TODOS" && String(row.risk) !== columnFilters.risk) return false;
    if (columnFilters.sources !== "TODOS" && String(row.sources) !== columnFilters.sources) return false;
    if (columnFilters.occurrences !== "TODOS" && String(row.occurrences) !== columnFilters.occurrences) return false;
    if (columnFilters.status !== "TODOS" && row.status !== columnFilters.status) return false;
    if (columnFilters.latestStatus !== "TODOS" && row.latestStatus !== columnFilters.latestStatus) return false;
    return true;
  });

  const visibleRows = filteredRows.slice(0, 100);
  const visibleDuplicateIds = visibleRows.filter((row) => row.status === "Duplicado").map((row) => row.shipmentId);
  const allVisibleDuplicatesSelected = visibleDuplicateIds.length > 0 && visibleDuplicateIds.every((id) => selectedIds.has(id));
  const busy = Boolean(mergingId) || bulkMerging;

  const setColumnFilter = (key: keyof ColumnFilters, value: string) => {
    setColumnFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleSelected = (shipmentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleDuplicatesSelected) visibleDuplicateIds.forEach((id) => next.delete(id));
      else visibleDuplicateIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const refreshDashboard = async () => {
    const owner = useDashboardStore.getState().cacheOwnerId;
    useDashboardStore.setState({ lastSyncedAt: 0 });
    if (owner) await useDashboardStore.getState().hydrate(owner);
  };

  const mergeShipmentIds = async (shipmentIds: string[], singleRow?: DetailedReconciliationRow) => {
    if (busy || !shipmentIds.length) return;
    const uniqueIds = [...new Set(shipmentIds)];
    const confirmed = window.confirm(singleRow
      ? `Mesclar as duplicidades atuais do ID ${singleRow.shipmentId}?\n\nEm cada fonte, o sistema manterá somente a ocorrência mais recente do lote atual. Os registros removidos ficarão preservados na auditoria da conciliação.`
      : `Combinar ${uniqueIds.length} pacote${uniqueIds.length === 1 ? "" : "s"} selecionado${uniqueIds.length === 1 ? "" : "s"}?\n\nPara cada ID, permanecerá somente a ocorrência mais recente dentro de cada fonte. Os registros removidos continuarão registrados na auditoria.`);
    if (!confirmed) return;

    if (singleRow) setMergingId(singleRow.shipmentId);
    else setBulkMerging(true);

    try {
      const response = await fetch("/api/reconciliation/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(uniqueIds.length === 1 ? { shipmentId: uniqueIds[0] } : { shipmentIds: uniqueIds }),
      });
      if (!response.ok) throw new Error(await readError(response, "Falha ao mesclar duplicidades."));
      const result = (await response.json()) as { removed?: number; processed?: number };
      await refreshDashboard();

      setAnalysis(null);
      setSelectedIds((current) => {
        const next = new Set(current);
        uniqueIds.forEach((id) => next.delete(id));
        return next;
      });

      const removed = Number(result.removed ?? 0);
      const processed = Number(result.processed ?? uniqueIds.length);
      toast.success(removed > 0
        ? `${processed} ID${processed === 1 ? "" : "s"} processado${processed === 1 ? "" : "s"}; ${removed} ocorrência${removed === 1 ? "" : "s"} duplicada${removed === 1 ? "" : "s"} removida${removed === 1 ? "" : "s"}. O mais recente foi mantido.`
        : "Os IDs selecionados já estavam consolidados no estado atual.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao mesclar duplicidades.");
    } finally {
      setMergingId("");
      setBulkMerging(false);
    }
  };

  const mergeDuplicate = (row: DetailedReconciliationRow) => mergeShipmentIds([row.shipmentId], row);
  const mergeSelected = () => mergeShipmentIds([...selectedIds]);

  const panelAction = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {selectedIds.size ? <button className="primary-button primary-button--small" type="button" onClick={() => void mergeSelected()} disabled={busy}><GitMerge size={14} />{bulkMerging ? "Combinando..." : `Combinar selecionados (${selectedIds.size})`}</button> : null}
      <StatusBadge tone="neutral">{filteredRows.length} chaves</StatusBadge>
    </div>
  );

  return (
    <div className="view-stack">
      <PageIntro description="Fontes diferentes só se conectam quando compartilham o mesmo ID. Em uploads repetidos, o lote mais recente define o estado atual; o histórico anterior continua disponível para análise." chips={["1 ID = 1 produto", "Status mais recente prevalece"]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="IDs mapeados" value={formatNumber(rows.length)} detail="Chaves explícitas" icon={<Link2 size={19} />} />
        <KpiCard label="Conciliados" value={formatNumber(reconciled.length)} detail="Presentes em 2+ fontes atuais" icon={<CheckCheck size={19} />} tone="green" />
        <KpiCard label="Duplicados" value={formatNumber(duplicates.length)} detail="Repetidos dentro do lote atual" icon={<Copy size={19} />} tone={duplicates.length ? "red" : "neutral"} />
        <KpiCard label="Isolados" value={formatNumber(isolated.length)} detail="Presentes em uma fonte atual" icon={<CircleDashed size={19} />} tone="amber" />
      </div>
      <Panel title="Mapa de conciliação" subtitle="Estado atual por ID, com rastreabilidade dos lotes anteriores" action={panelAction}>
        <TableWrap>
          <thead>
            <tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label="Selecionar duplicados visíveis" checked={allVisibleDuplicatesSelected} onChange={toggleAllVisible} disabled={!visibleDuplicateIds.length || busy} /></th>
              <th>ID do pacote</th>
              <th>Pré-fatura <ColumnSelectFilter ariaLabel="Filtrar Pré-fatura" value={columnFilters.prefatura} options={numericOptions(rows.map((row) => row.prefatura))} onChange={(value) => setColumnFilter("prefatura", value)} /></th>
              <th>KPI PNR <ColumnSelectFilter ariaLabel="Filtrar KPI PNR" value={columnFilters.pnr} options={numericOptions(rows.map((row) => row.pnr))} onChange={(value) => setColumnFilter("pnr", value)} /></th>
              <th>Risco LM <ColumnSelectFilter ariaLabel="Filtrar Risco LM" value={columnFilters.risk} options={numericOptions(rows.map((row) => row.risk))} onChange={(value) => setColumnFilter("risk", value)} /></th>
              <th>Fontes <ColumnSelectFilter ariaLabel="Filtrar quantidade de fontes" value={columnFilters.sources} options={numericOptions(rows.map((row) => row.sources))} onChange={(value) => setColumnFilter("sources", value)} /></th>
              <th>Ocorrências <ColumnSelectFilter ariaLabel="Filtrar ocorrências" value={columnFilters.occurrences} options={numericOptions(rows.map((row) => row.occurrences))} onChange={(value) => setColumnFilter("occurrences", value)} /></th>
              <th>Conciliação <ColumnSelectFilter ariaLabel="Filtrar conciliação" value={columnFilters.status} options={textOptions(rows.map((row) => row.status))} onChange={(value) => setColumnFilter("status", value)} /></th>
              <th>Status mais recente <ColumnSelectFilter ariaLabel="Filtrar status mais recente" value={columnFilters.latestStatus} options={textOptions(rows.map((row) => row.latestStatus))} onChange={(value) => setColumnFilter("latestStatus", value)} /></th>
              <th className="align-right">Valor de referência</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>{visibleRows.map((row) => <tr key={row.shipmentId}>
            <td>{row.status === "Duplicado" ? <input type="checkbox" aria-label={`Selecionar ID ${row.shipmentId}`} checked={selectedIds.has(row.shipmentId)} onChange={() => toggleSelected(row.shipmentId)} disabled={busy} /> : null}</td>
            <td><strong className="mono">{row.shipmentId}</strong>{row.historicalOccurrences > row.occurrences ? <small className="cell-subtitle">{row.historicalOccurrences} ocorrências no histórico</small> : null}</td>
            <td><SourceCount value={row.prefatura} /></td>
            <td><SourceCount value={row.pnr} /></td>
            <td><SourceCount value={row.risk} /></td>
            <td>{row.sources}</td>
            <td>{row.occurrences}</td>
            <td><StatusBadge tone={row.status === "Conciliado" ? "green" : row.status === "Duplicado" ? "red" : "amber"}>{row.status}</StatusBadge></td>
            <td><strong>{row.latestStatus}</strong>{row.latestSource ? <small className="cell-subtitle">{row.latestSource}</small> : null}</td>
            <td className="align-right"><strong>{formatCurrency(row.value)}</strong></td>
            <td className="align-right">{row.status === "Duplicado" ? <div style={{ display: "inline-flex", gap: 6 }}><button className="table-action" title="Analisar duplicação" onClick={() => setAnalysis(row)} type="button" disabled={busy}><Eye size={15} /></button><button className="table-action" title="Mesclar e manter o mais recente" onClick={() => void mergeDuplicate(row)} type="button" disabled={busy}>{mergingId === row.shipmentId ? <LoaderCircle size={15} className="spin" /> : <GitMerge size={15} />}</button></div> : null}</td>
          </tr>)}</tbody>
        </TableWrap>
        {!visibleRows.length ? <div style={{ padding: 20 }}><NoResults title="Nenhum ID corresponde aos filtros da tabela" detail="Limpe ou altere os filtros minimalistas do cabeçalho." /></div> : null}
      </Panel>
      {analysis ? <AnalysisModal row={analysis} onClose={() => setAnalysis(null)} onMerge={() => void mergeDuplicate(analysis)} merging={mergingId === analysis.shipmentId} disabled={busy && mergingId !== analysis.shipmentId} /> : null}
    </div>
  );
}

function SourceCount({ value }: { value: number }) {
  return value ? <span className={value > 1 ? "source-count source-count--duplicate" : "source-count"}>{value}</span> : <span className="muted">—</span>;
}

function AnalysisModal({ row, onClose, onMerge, merging, disabled }: { row: DetailedReconciliationRow; onClose: () => void; onMerge: () => void; merging: boolean; disabled: boolean }) {
  return <div role="dialog" aria-modal="true" aria-label={`Análise do ID ${row.shipmentId}`} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 24, background: "rgba(16,17,20,.42)" }}>
    <div style={{ width: "min(1080px, 96vw)", maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: 20, borderBottom: "1px solid #eceef1" }}>
        <div><small className="muted">ANÁLISE DE DUPLICAÇÃO</small><h3 style={{ margin: "4px 0 0" }}>ID {row.shipmentId}</h3><p className="muted" style={{ margin: "6px 0 0" }}>O lote mais recente define o estado atual. Ao mesclar, permanece somente a ocorrência mais recente de cada fonte; as removidas ficam registradas na auditoria.</p></div>
        <button className="table-action" title="Fechar" onClick={onClose} type="button" disabled={merging}><X size={17} /></button>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}><StatusBadge tone="red">{row.occurrences} ocorrências atuais</StatusBadge><StatusBadge tone="neutral">{row.historicalOccurrences} no histórico</StatusBadge><StatusBadge tone="neutral">Status atual: {row.latestStatus}</StatusBadge></div>
        <TableWrap><thead><tr><th>Vigência</th><th>Fonte</th><th>Arquivo</th><th>Aba / linha</th><th>Data</th><th>Status</th><th className="align-right">Valor</th></tr></thead><tbody>{row.history.map((item, index) => <tr key={`${item.source}-${item.batchId}-${item.rowNumber}-${index}`}><td><StatusBadge tone={item.current ? "green" : "neutral"}>{item.current ? "Atual" : "Histórico"}</StatusBadge></td><td>{item.source}</td><td><strong>{item.sourceFile || "—"}</strong><small className="cell-subtitle mono">{item.batchId}</small></td><td>{item.sourceSheet || "—"} · {item.rowNumber || "—"}</td><td>{item.date ? new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{item.status || "—"}</td><td className="align-right">{formatCurrency(item.value)}</td></tr>)}</tbody></TableWrap>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}><button className="secondary-button" type="button" onClick={onClose} disabled={merging}>Cancelar</button><button className="primary-button" type="button" onClick={onMerge} disabled={merging || disabled}>{merging ? <LoaderCircle size={16} className="spin" /> : <GitMerge size={16} />}Mesclar e manter mais recente</button></div>
      </div>
    </div>
  </div>;
}
