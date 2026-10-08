"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, CircleCheckBig, Siren, Truck } from "lucide-react";
import { scopeData } from "@/lib/dashboard-scope";
import { driverPerformance } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, formatPercent, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults, TableWrap } from "./shared";

export function DriversView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const scoped = scopeData(data, filters, { activeOnly: true });
  const rows = driverPerformance(scoped, data.drivers);
  if (!rows.length) return <NoResults title="Nenhum motorista conciliado neste recorte" />;
  const shipped = rows.reduce((sum, row) => sum + row.shipped, 0);
  const delivered = rows.reduce((sum, row) => sum + row.delivered, 0);
  const incidents = rows.reduce((sum, row) => sum + row.incidents, 0);
  const discounts = rows.reduce((sum, row) => sum + row.discountValue, 0);
  const chartRows = rows.slice(0, 10).map((row) => ({ name: row.name.split(" ").slice(0, 2).join(" "), desconto: row.discountValue, risco: row.riskValue }));

  return (
    <div className="view-stack">
      <PageIntro description="O relatório de transportistas é cruzado por ID; a pré-fatura é conciliada por nome normalizado quando não possui ID do motorista." chips={[`${formatNumber(rows.length)} motoristas`, "Escopo do supervisor é compartilhado quando não há vínculo direto"]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Motoristas ativos" value={formatNumber(rows.length)} detail="Com dados no recorte" icon={<Truck size={19} />} />
        <KpiCard label="Taxa de entrega" value={formatPercent(shipped ? (delivered / shipped) * 100 : 0)} detail={`${formatNumber(delivered)} de ${formatNumber(shipped)}`} icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Incidentes" value={formatNumber(incidents)} detail="No relatório importado" icon={<Siren size={19} />} tone={incidents ? "amber" : "neutral"} />
        <KpiCard label="Descontos associados" value={formatCurrency(discounts)} detail="IDs únicos de pré-fatura" icon={<BadgeDollarSign size={19} />} tone="red" />
      </div>
      <Panel title="Impacto financeiro por motorista" subtitle="Desconto de pré-fatura e GMV em risco" className="panel--chart">
        <ResponsiveContainer width="100%" height={310}>
          <BarChart data={chartRows} margin={{ left: 4, right: 12, top: 10 }}>
            <CartesianGrid stroke="#ECEDEF" vertical={false} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#555" }} interval={0} angle={-18} height={48} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} tickFormatter={(number) => `${Math.round(number / 1000)}k`} />
            <Tooltip content={<ChartTooltip currency />} />
            <Bar dataKey="desconto" name="Pré-fatura" fill="#E30613" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="risco" name="Risco LM" fill="#333333" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="Scorecard de motoristas" subtitle="Visão conjunta de produtividade, qualidade e impacto">
        <TableWrap><thead><tr><th>Motorista</th><th>ID</th><th>Expedidos</th><th>Entregues</th><th>Sucesso</th><th>Incidentes</th><th>Pacotes em desconto</th><th className="align-right">Impacto total</th></tr></thead>
          <tbody>{rows.slice(0, 80).map((row) => <tr key={`${row.driverId}-${row.name}`}><td><strong>{row.name}</strong></td><td className="mono">{row.driverId}</td><td>{formatNumber(row.shipped)}</td><td>{formatNumber(row.delivered)}</td><td><StatusBadge tone={row.deliveryRate >= 97 ? "green" : row.deliveryRate >= 94 ? "amber" : "red"}>{formatPercent(row.deliveryRate)}</StatusBadge></td><td>{formatNumber(row.incidents)}</td><td>{formatNumber(row.packages)}</td><td className="align-right"><strong>{formatCurrency(row.discountValue + row.riskValue)}</strong><small className="cell-subtitle">{formatCurrency(row.discountValue)} desconto</small></td></tr>)}</tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
