"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Boxes, CircleCheckBig, Link2, TimerReset } from "lucide-react";
import { latestPnrByShipment, pnrDecisionRows, scopeData } from "@/lib/metrics";
import { normalizeText } from "@/lib/normalize";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, formatPercent, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults, TableWrap } from "./shared";

export function PnrView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const scoped = scopeData(data, filters);
  const rows = latestPnrByShipment(scoped.pnr, data.imports);
  if (!rows.length) return <NoResults title="Nenhum caso PNR neste recorte" />;

  const value = rows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const statusMap = new Map<string, { status: string; cases: number; value: number }>();
  rows.forEach((row) => {
    const key = row.status || "Sem status";
    const current = statusMap.get(key) ?? { status: key, cases: 0, value: 0 };
    current.cases += 1; current.value += row.purchaseValue; statusMap.set(key, current);
  });
  const status = [...statusMap.values()].sort((a, b) => b.cases - a.cases);
  const decisions = pnrDecisionRows(rows);
  const completed = rows.filter((row) => /PROCEDENTE|APROVADO|CONCLUIDO/.test(normalizeText(row.status))).length;
  const prefaturaIds = new Set(scoped.prefatura.map((row) => row.shipmentId));
  const matched = rows.filter((row) => prefaturaIds.has(row.shipmentId)).length;

  return (
    <div className="view-stack">
      <PageIntro description="Cada ID de envio conta como um caso. A correspondência com pré-fatura ocorre somente pelo mesmo ID." chips={[`${status.length} status encontrados`, `${formatNumber(scoped.pnr.length - rows.length)} repetições consolidadas`]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Casos únicos" value={formatNumber(rows.length)} detail="IDs de envio" icon={<Boxes size={19} />} />
        <KpiCard label="Valor de compra" value={formatCurrency(value)} detail="Base dos casos PNR" icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="Procedência" value={formatPercent((completed / rows.length) * 100)} detail={`${completed} casos concluídos`} icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Conciliados" value={formatPercent((matched / rows.length) * 100)} detail={`${matched} IDs na pré-fatura`} icon={<Link2 size={19} />} tone="neutral" />
      </div>
      <div className="content-grid content-grid--wide">
        <Panel title="Distribuição por status" subtitle="Casos únicos por tratativa" className="panel--chart">
          <ResponsiveContainer width="100%" height={286}>
            <BarChart data={status} layout="vertical" margin={{ left: 8, right: 22, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#ECEDEF" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} />
              <YAxis dataKey="status" type="category" axisLine={false} tickLine={false} width={118} tick={{ fontSize: 11, fill: "#333" }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cases" name="Casos" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Valor por status" subtitle="Exposição financeira dos casos" className="panel--chart">
          <div className="status-list">{status.map((item, index) => <div key={item.status}><span className="status-list__rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.status}</strong><small>{item.cases} casos</small></div><span className="status-list__value">{formatCurrency(item.value)}</span></div>)}</div>
        </Panel>
      </div>
      <Panel title="Monitoramento e tomada de decisão" subtitle="Status, exposição e próxima ação operacional por recorte">
        <TableWrap>
          <thead><tr><th>Status</th><th>Casos</th><th>% do total</th><th className="align-right">Valor exposto</th><th>Prioridade</th><th>Ação sugerida</th></tr></thead>
          <tbody>{decisions.map((row) => <tr className={`decision-row decision-row--${row.tone}`} key={row.status}><td><strong>{row.status}</strong></td><td>{formatNumber(row.cases)}</td><td>{formatPercent(row.percentage)}</td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td><td>{row.priority}</td><td>{row.action}</td></tr>)}</tbody>
        </TableWrap>
      </Panel>
      <Panel title="Casos PNR" subtitle="Detalhe rastreável até arquivo, aba e linha" action={<StatusBadge tone="neutral"><TimerReset size={13} /> {rows.length} IDs</StatusBadge>}>
        <TableWrap><thead><tr><th>ID de envio</th><th>Status</th><th>Data</th><th>Base de origem</th><th>Motorista</th><th>Rota</th><th className="align-right">Valor</th></tr></thead>
          <tbody>{rows.slice(0, 50).map((row) => <tr key={`${row.batchId}-${row.shipmentId}`}><td><strong className="mono">{row.shipmentId}</strong><small className="cell-subtitle">{row.sourceFile}</small></td><td><StatusBadge tone={/PROCEDENTE|APROVADO/.test(normalizeText(row.status)) ? "green" : /ANALISE|PENDENTE/.test(normalizeText(row.status)) ? "amber" : "neutral"}>{row.status || "Sem status"}</StatusBadge></td><td>{row.caseDate ? new Date(`${row.caseDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{row.originStation || "—"}</td><td className="mono">{row.driverId || "—"}</td><td className="mono">{row.routeId || "—"}</td><td className="align-right"><strong>{formatCurrency(row.purchaseValue)}</strong></td></tr>)}</tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
