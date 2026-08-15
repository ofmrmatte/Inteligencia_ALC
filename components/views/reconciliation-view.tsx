"use client";

import { CheckCheck, CircleDashed, Copy, Link2 } from "lucide-react";
import { reconciliation, scopeData } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { NoResults, TableWrap } from "./shared";

export function ReconciliationView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const rows = reconciliation(scopeData(data, filters), data.imports);
  if (!rows.length) return <NoResults title="Nenhum ID disponível para conciliação" />;
  const reconciled = rows.filter((row) => row.status === "Conciliado");
  const duplicates = rows.filter((row) => row.status === "Duplicado");
  const isolated = rows.filter((row) => row.status === "Isolado");

  return (
    <div className="view-stack">
      <PageIntro description="Fontes diferentes só se conectam quando compartilham o mesmo ID. Rotas ou valores iguais não são usados como chave." chips={["1 ID = 1 produto", "ZIPs mantêm lote de origem"]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="IDs mapeados" value={formatNumber(rows.length)} detail="Chaves explícitas" icon={<Link2 size={19} />} />
        <KpiCard label="Conciliados" value={formatNumber(reconciled.length)} detail="Presentes em 2+ fontes" icon={<CheckCheck size={19} />} tone="green" />
        <KpiCard label="Duplicados" value={formatNumber(duplicates.length)} detail="Repetidos na mesma fonte" icon={<Copy size={19} />} tone={duplicates.length ? "red" : "neutral"} />
        <KpiCard label="Isolados" value={formatNumber(isolated.length)} detail="Presentes em uma fonte" icon={<CircleDashed size={19} />} tone="amber" />
      </div>
      <Panel title="Mapa de conciliação" subtitle="Ocorrências por ID e por fonte" action={<StatusBadge tone="neutral">{rows.length} chaves</StatusBadge>}>
        <TableWrap><thead><tr><th>ID do pacote</th><th>Pré-fatura</th><th>KPI PNR</th><th>Risco LM</th><th>Fontes</th><th>Ocorrências</th><th>Status</th><th className="align-right">Valor de referência</th></tr></thead>
          <tbody>{rows.slice(0, 100).map((row) => <tr key={row.shipmentId}><td><strong className="mono">{row.shipmentId}</strong></td><td><SourceCount value={row.prefatura} /></td><td><SourceCount value={row.pnr} /></td><td><SourceCount value={row.risk} /></td><td>{row.sources}</td><td>{row.occurrences}</td><td><StatusBadge tone={row.status === "Conciliado" ? "green" : row.status === "Duplicado" ? "red" : "amber"}>{row.status}</StatusBadge></td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td></tr>)}</tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}

function SourceCount({ value }: { value: number }) {
  return value ? <span className={value > 1 ? "source-count source-count--duplicate" : "source-count"}>{value}</span> : <span className="muted">—</span>;
}
