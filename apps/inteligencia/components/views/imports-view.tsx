"use client";

import { useState } from "react";
import { FileArchive, FileCheck2, HardDrive, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useDashboardStore } from "@/lib/store";
import { formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";
import { formatFortnightLabel, formatMonthLabel } from "@/lib/metrics";

function periodLabel(row: { fortnights?: string[]; months?: string[]; fortnight?: string | null; month?: string | null }) {
  const fortnights = row.fortnights?.length ? row.fortnights : row.fortnight ? [row.fortnight] : [];
  const months = row.months?.length ? row.months : row.month ? [row.month] : [];
  if (fortnights.length === 2 && months.length === 1 && fortnights.some((value) => value.startsWith("01Q")) && fortnights.some((value) => value.startsWith("02Q"))) {
    return `1ª e 2ª quinzenas de ${formatMonthLabel(months[0])}`;
  }
  if (fortnights.length === 1) return `${formatFortnightLabel(fortnights[0].startsWith("01Q") ? "Q1" : "Q2")} de ${formatMonthLabel(months[0] ?? "")}`;
  if (months.length === 1) return formatMonthLabel(months[0]);
  return "Competência não identificada";
}

export function ImportsView() {
  const data = useDashboardStore((state) => state.data);
  const removeBatch = useDashboardStore((state) => state.removeBatch);
  const clearData = useDashboardStore((state) => state.clearData);
  const [deletingBatchId, setDeletingBatchId] = useState("");
  const rows = data.imports;
  const totalSize = rows.reduce((sum, row) => sum + row.size, 0);
  const alerts = rows.reduce((sum, row) => sum + row.issues.length, 0);

  const remove = async (batchId: string, name: string) => {
    if (deletingBatchId) return;
    if (!window.confirm(`Excluir o lote "${name}" e todos os registros vinculados a ele?`)) return;
    setDeletingBatchId(batchId);
    try {
      await removeBatch(batchId);
      toast.success(`${name} removido do Supabase.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir o lote.");
    } finally {
      setDeletingBatchId("");
    }
  };

  return (
    <div className="view-stack">
      <PageIntro description="Cada arquivo ZIP é registrado como um lote independente. A exclusão remove os registros e o arquivo original do Supabase." chips={["Supabase Storage", "Banco operacional online"]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Lotes importados" value={formatNumber(rows.length)} detail="Arquivos independentes" icon={<FileArchive size={19} />} />
        <KpiCard label="Linhas processadas" value={formatNumber(rows.reduce((sum, row) => sum + row.rowCount, 0))} detail="Todas as estruturas" icon={<FileCheck2 size={19} />} tone="green" />
        <KpiCard label="Armazenamento lido" value={`${(totalSize / 1024 / 1024).toFixed(1)} MB`} detail="Tamanho dos arquivos de origem" icon={<HardDrive size={19} />} />
        <KpiCard label="Alertas de importação" value={formatNumber(alerts)} detail="Arquivos ou abas não reconhecidos" icon={<TriangleAlert size={19} />} tone={alerts ? "amber" : "green"} />
      </div>
      <Panel title="Linha do tempo de importações" subtitle="Mais recente primeiro" action={rows.length ? <button className="danger-button" onClick={() => void clearData()} disabled={Boolean(deletingBatchId)}><Trash2 size={15} />Limpar tudo</button> : undefined}>
        <TableWrap><thead><tr><th>Arquivo / lote</th><th>Data</th><th>Competência</th><th>Fontes reconhecidas</th><th>Planilhas</th><th>Linhas</th><th>Status</th><th>Alertas</th><th aria-label="Ações" /></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small className="cell-subtitle mono">{row.batchId}</small></td><td>{new Date(row.importedAt).toLocaleString("pt-BR")}</td><td>{periodLabel(row)}</td><td><div className="source-tags">{row.kinds.map((kind) => <span key={kind}>{kind}</span>)}</div></td><td>{row.workbookCount}</td><td>{formatNumber(row.rowCount)}</td><td><StatusBadge tone={row.analysisExcluded ? "amber" : row.status === "concluído" ? "green" : row.status === "erro" ? "red" : row.status === "demonstração" ? "blue" : "amber"}>{row.analysisExcluded ? "duplicado" : row.status}</StatusBadge></td><td>{row.issues.length ? <span title={row.issues.join("\n")} className="issue-count"><TriangleAlert size={14} />{row.issues.length}</span> : <span className="ok-inline"><ShieldCheck size={14} />0</span>}</td><td className="align-right">{deletingBatchId === row.batchId ? <span className="muted">Removendo...</span> : <button className="table-action" onClick={() => void remove(row.batchId, row.name)} title="Remover lote" disabled={Boolean(deletingBatchId)}><Trash2 size={16} /></button>}</td></tr>)}</tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
