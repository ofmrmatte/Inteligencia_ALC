"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Boxes, CircleCheckBig, Copy, ShieldAlert, Truck } from "lucide-react";
import { monthlyMovement, overviewMetrics, prefaturaByOperation, scopeData } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, formatPercent, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults, TableWrap } from "./shared";

export function OverviewView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const scoped = scopeData(data, filters);
  const metrics = overviewMetrics(scoped);
  const movement = monthlyMovement(scoped, data.imports);
  const operations = prefaturaByOperation(scoped.prefatura);
  const hasRows = metrics.uniquePackages || scoped.drivers.length;

  if (!hasRows) return <NoResults />;

  const topBases = [...new Set(scoped.prefatura.map((row) => row.baseLabel))]
    .map((base) => {
      const rows = scoped.prefatura.filter((row) => row.baseLabel === base);
      const ids = new Set(rows.map((row) => row.shipmentId));
      return { base, packages: ids.size, value: [...ids].reduce((sum, id) => sum + (rows.find((row) => row.shipmentId === id)?.value ?? 0), 0) };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  return (
    <div className="view-stack">
      <PageIntro description="O valor financeiro considera um único registro por ID de pacote; repetições permanecem visíveis na conciliação." chips={[`${formatNumber(scoped.prefatura.length + scoped.pnr.length + scoped.risk.length)} linhas no recorte`, `${formatNumber(data.imports.length)} lotes carregados`]} />
      <div className="kpi-grid kpi-grid--six">
        <KpiCard label="Pacotes únicos" value={formatNumber(metrics.uniquePackages)} detail="PNR, pré-fatura e risco" icon={<Boxes size={19} />} />
        <KpiCard label="Valor pré-fatura" value={formatCurrency(metrics.prefaturaValue)} detail="IDs únicos de desconto" icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="GMV em risco" value={formatCurrency(metrics.riskValue)} detail="Exposição LM identificada" icon={<ShieldAlert size={19} />} tone="amber" />
        <KpiCard label="Taxa de entrega" value={formatPercent(metrics.deliveryRate)} detail="Entregues ÷ expedidos" icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Motoristas" value={formatNumber(metrics.drivers)} detail="Com desempenho no recorte" icon={<Truck size={19} />} />
        <KpiCard label="IDs repetidos" value={formatNumber(metrics.duplicateCount)} detail="Requerem conciliação" icon={<Copy size={19} />} tone={metrics.duplicateCount ? "red" : "neutral"} />
      </div>

      <div className="content-grid content-grid--wide">
        <Panel title="Movimento financeiro" subtitle="Valores mensais por fonte; IDs consolidados" className="panel--chart">
          {movement.length ? (
            <ResponsiveContainer width="100%" height={286}>
              <AreaChart data={movement} margin={{ left: 6, right: 10, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#ECEDEF" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <Tooltip content={<ChartTooltip currency />} />
                <Area type="monotone" dataKey="prefatura" name="Pré-fatura" stroke="#E30613" strokeWidth={2.5} fill="#E30613" fillOpacity={0.08} />
                <Area type="monotone" dataKey="risco" name="Risco LM" stroke="#333333" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="pnr" name="PNR" stroke="#9B9EA5" strokeWidth={1.8} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <NoResults />}
        </Panel>
        <Panel title="Pré-fatura por operação" subtitle="Valor e pacotes únicos" className="panel--chart">
          <ResponsiveContainer width="100%" height={286}>
            <BarChart data={operations} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="#ECEDEF" vertical={false} />
              <XAxis dataKey="operation" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#333" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
              <Tooltip content={<ChartTooltip currency />} />
              <Bar dataKey="value" name="Valor" fill="#E30613" radius={[4, 4, 0, 0]} maxBarSize={46} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Bases com maior impacto" subtitle="Ranking por valor único de pré-fatura" action={<StatusBadge tone="neutral">Top {topBases.length}</StatusBadge>}>
        <TableWrap>
          <thead><tr><th>#</th><th>Base / sigla</th><th>Pacotes</th><th>Participação</th><th className="align-right">Valor</th></tr></thead>
          <tbody>{topBases.map((row, index) => <tr key={row.base}><td className="muted">{String(index + 1).padStart(2, "0")}</td><td><strong>{row.base}</strong></td><td>{formatNumber(row.packages)}</td><td><div className="progress-cell"><span><i style={{ width: `${metrics.prefaturaValue ? (row.value / metrics.prefaturaValue) * 100 : 0}%` }} /></span><small>{formatPercent(metrics.prefaturaValue ? (row.value / metrics.prefaturaValue) * 100 : 0)}</small></div></td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td></tr>)}</tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
