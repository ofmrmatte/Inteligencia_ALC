"use client";

import { useState } from "react";
import { CheckCheck, CircleDashed, Copy, Eye, GitMerge, Link2, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { scopeData } from "@/lib/dashboard-scope";
import { detailedReconciliation, type DetailedReconciliationRow } from "@/lib/reconciliation-details";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { NoResults, TableWrap } from "./shared";

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function ReconciliationView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const [analysis, setAnalysis] = useState<DetailedReconciliationRow | null>(null);
  const [mergingId, setMergingId] = useState("");
  const rows = detailedReconciliation(scopeData(data, filters), data.imports);
  if (!rows.length) return <NoResults title="Nenhum ID disponível para conciliação" />;
  const reconciled = rows.filter((row) => row.status === "Conciliado");
  const duplicates = rows.filter((row) => row.status === "Duplicado");
  const isolated = rows.filter((row) => row.status === "Isolado");

  const mergeDuplicate = async (row: DetailedReconciliationRow) => {
    if (mergingId) return;
    const confirmed = window.confirm(
      `Mesclar as duplicidades atuais do ID ${row.shipmentId}?\n\nEm cada fonte, o sistema manterá somente a ocorrência mais recente do lote atual. Os registros removidos ficarão preservados na auditoria da conciliação.`,
    );
    if (!confirmed) return;

    setMergingId(row.shipmentId);
    try {
      const response = await fetch("/api/reconciliation/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: row.shipmentId }),
      });
      if (!response.ok) throw new Error(await readError(response, "Falha ao mesclar duplicidades."));
      const result = (await response.json()) as { removed?: number };

      const owner = useDashboardStore.getState().cacheOwnerId;
      useDashboardStore.setState({ lastSyncedAt: 0 });
      if (owner) await useDashboardStore.getState().hydrate(owner);

      setAnalysis(null);
      const removed = Number(result.removed ?? 0);
      toast.success(removed > 0
        ? `${removed} ocorrência${removed === 1 ? "" : "s"} duplicada${removed === 1 ? "" : "s"} mesclada${removed === 1 ? "" : "s"}. O registro mais recente foi mantido.`
        : "O ID já estava consolidado no estado atual.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao mesclar duplicidades.");
    } finally {
      setMergingId("");
    }
  };

  return (
    <div className="view-stack">
      <PageIntro description="Fontes diferentes só se conectam quando compartilham o mesmo ID. Em uploads repetidos, o lote mais recente define o estado atual; o histórico anterior continua disponível para análise." chips={["1 ID = 1 produto", "Status mais recente prevalece"]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="IDs mapeados" value={formatNumber(rows.length)} detail="Chaves explícitas" icon={<Link2 size={19} />} />
        <KpiCard label="Conciliados" value={formatNumber(reconciled.length)} detail="Presentes em 2+ fontes atuais" icon={<CheckCheck size={19} />} tone="green" />
        <KpiCard label="Duplicados" value={formatNumber(duplicates.length)} detail="Repetidos dentro do lote atual" icon={<Copy size={19} />} tone={duplicates.length ? "red" : "neutral"} />
        <KpiCard label="Isolados" value={formatNumber(isolated.length)} detail="Presentes em uma fonte atual" icon={<CircleDashed size={19} />} tone="amber" />
      </div>
      <Panel title="Mapa de conciliação" subtitle="Estado atual por ID, com rastreabilidade dos lotes anteriores" action={<StatusBadge tone="neutral">{rows.length} chaves</StatusBadge>}>
        <TableWrap><thead><tr><th>ID do pacote</th><th>Pré-fatura</th><th>KPI PNR</th><th>Risco LM</th><th>Fontes</th><th>Ocorrências</th><th>Conciliação</th><th>Status mais recente</th><th className="align-right">Valor de referência</th><th aria-label="Ações" /></tr></thead>
          <tbody>{rows.slice(0, 100).map((row) => <tr key={row.shipmentId}><td><strong className="mono">{row.shipmentId}</strong>{row.historicalOccurrences > row.occurrences ? <small className="cell-subtitle">{row.historicalOccurrences} ocorrências no histórico</small> : null}</td><td><SourceCount value={row.prefatura} /></td><td><SourceCount value={row.pnr} /></td><td><SourceCount value={row.risk} /></td><td>{row.sources}</td><td>{row.occurrences}</td><td><StatusBadge tone={row.status === "Conciliado" ? "green" : row.status === "Duplicado" ? "red" : "amber"}>{row.status}</StatusBadge></td><td><strong>{row.latestStatus}</strong>{row.latestSource ? <small className="cell-subtitle">{row.latestSource}</small> : null}</td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td><td className="align-right">{row.status === "Duplicado" ? <div style={{ display: "inline-flex", gap: 6 }}><button className="table-action" title="Analisar duplicação" onClick={() => setAnalysis(row)} type="button"><Eye size={15} /></button><button className="table-action" title="Mesclar e manter o mais recente" onClick={() => void mergeDuplicate(row)} type="button" disabled={Boolean(mergingId)}>{mergingId === row.shipmentId ? <LoaderCircle size={15} className="spin" /> : <GitMerge size={15} />}</button></div> : null}</td></tr>)}</tbody>
        </TableWrap>
      </Panel>
      {analysis ? <AnalysisModal row={analysis} onClose={() => setAnalysis(null)} onMerge={() => void mergeDuplicate(analysis)} merging={mergingId === analysis.shipmentId} /> : null}
    </div>
  );
}

function SourceCount({ value }: { value: number }) {
  return value ? <span className={value > 1 ? "source-count source-count--duplicate" : "source-count"}>{value}</span> : <span className="muted">—</span>;
}

function AnalysisModal({ row, onClose, onMerge, merging }: { row: DetailedReconciliationRow; onClose: () => void; onMerge: () => void; merging: boolean }) {
  return <div role="dialog" aria-modal="true" aria-label={`Análise do ID ${row.shipmentId}`} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 24, background: "rgba(16,17,20,.42)" }}>
    <div style={{ width: "min(1080px, 96vw)", maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: 20, borderBottom: "1px solid #eceef1" }}>
        <div><small className="muted">ANÁLISE DE DUPLICAÇÃO</small><h3 style={{ margin: "4px 0 0" }}>ID {row.shipmentId}</h3><p className="muted" style={{ margin: "6px 0 0" }}>O lote mais recente define o estado atual. Ao mesclar, permanece somente a ocorrência mais recente de cada fonte; as removidas ficam registradas na auditoria.</p></div>
        <button className="table-action" title="Fechar" onClick={onClose} type="button" disabled={merging}><X size={17} /></button>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}><StatusBadge tone="red">{row.occurrences} ocorrências atuais</StatusBadge><StatusBadge tone="neutral">{row.historicalOccurrences} no histórico</StatusBadge><StatusBadge tone="neutral">Status atual: {row.latestStatus}</StatusBadge></div>
        <TableWrap><thead><tr><th>Vigência</th><th>Fonte</th><th>Arquivo</th><th>Aba / linha</th><th>Data</th><th>Status</th><th className="align-right">Valor</th></tr></thead><tbody>{row.history.map((item, index) => <tr key={`${item.source}-${item.batchId}-${item.rowNumber}-${index}`}><td><StatusBadge tone={item.current ? "green" : "neutral"}>{item.current ? "Atual" : "Histórico"}</StatusBadge></td><td>{item.source}</td><td><strong>{item.sourceFile || "—"}</strong><small className="cell-subtitle mono">{item.batchId}</small></td><td>{item.sourceSheet || "—"} · {item.rowNumber || "—"}</td><td>{item.date ? new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{item.status || "—"}</td><td className="align-right">{formatCurrency(item.value)}</td></tr>)}</tbody></TableWrap>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}><button className="secondary-button" type="button" onClick={onClose} disabled={merging}>Cancelar</button><button className="primary-button" type="button" onClick={onMerge} disabled={merging}>{merging ? <LoaderCircle size={16} className="spin" /> : <GitMerge size={16} />}Mesclar e manter mais recente</button></div>
      </div>
    </div>
  </div>;
}
