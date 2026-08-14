"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Clock3, PackageX, ShieldAlert } from "lucide-react";
import { scopeData, uniqueByShipment } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults, TableWrap } from "./shared";

export function RiskView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const scoped = scopeData(data, filters);
  const rows = uniqueByShipment(scoped.risk);
  if (!rows.length) return <NoResults title="Nenhum pacote de risco LM neste recorte" />;
  const gmv = rows.reduce((sum, row) => sum + row.gmvBrl, 0);
  const avgStopped = rows.reduce((sum, row) => sum + row.stoppedDays, 0) / rows.length;
  const critical = rows.filter((row) => row.stoppedDays >= 4).length;
  const reasons = new Map<string, { reason: string; packages: number; gmv: number }>();
  rows.forEach((row) => { const key = row.failureReason || "Sem motivo"; const current = reasons.get(key) ?? { reason: key, packages: 0, gmv: 0 }; current.packages += 1; current.gmv += row.gmvBrl; reasons.set(key, current); });
  const reasonData = [...reasons.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 8);

  return (
    <div className="view-stack">
      <PageIntro description="A exposição considera um registro por ID de pacote. Snapshots repetidos no mesmo ZIP são conciliados pela chave explícita." chips={[`${formatNumber(scoped.risk.length)} ocorrências`, `${reasonData.length} motivos principais`]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="GMV exposto" value={formatCurrency(gmv)} detail="IDs únicos em risco" icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="Pacotes em risco" value={formatNumber(rows.length)} detail="Unidades identificadas" icon={<ShieldAlert size={19} />} tone="amber" />
        <KpiCard label="Tempo médio parado" value={`${avgStopped.toFixed(1)} dias`} detail="Desde o insucesso" icon={<Clock3 size={19} />} />
        <KpiCard label="Risco crítico" value={formatNumber(critical)} detail="4 dias ou mais" icon={<PackageX size={19} />} tone={critical ? "red" : "neutral"} />
      </div>
      <div className="content-grid content-grid--wide">
        <Panel title="GMV por motivo de insucesso" subtitle="Oito maiores exposições" className="panel--chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={reasonData} layout="vertical" margin={{ left: 12, right: 20, top: 4 }}>
              <CartesianGrid stroke="#ECEDEF" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} tickFormatter={(number) => `${Math.round(number / 1000)}k`} />
              <YAxis type="category" dataKey="reason" width={140} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#333" }} />
              <Tooltip content={<ChartTooltip currency />} />
              <Bar dataKey="gmv" name="GMV" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Faixa de permanência" subtitle="Priorização por dias parados" className="panel--chart">
          <div className="risk-bands">
            {[{ label: "Até 1 dia", test: (n: number) => n <= 1, tone: "green" }, { label: "2 a 3 dias", test: (n: number) => n >= 2 && n <= 3, tone: "amber" }, { label: "4 a 6 dias", test: (n: number) => n >= 4 && n <= 6, tone: "red" }, { label: "7+ dias", test: (n: number) => n >= 7, tone: "dark" }].map((band) => { const bandRows = rows.filter((row) => band.test(row.stoppedDays)); return <div key={band.label} className={`risk-band risk-band--${band.tone}`}><span>{band.label}</span><strong>{bandRows.length}</strong><small>{formatCurrency(bandRows.reduce((sum, row) => sum + row.gmvBrl, 0))}</small></div>; })}
          </div>
        </Panel>
      </div>
      <Panel title="Fila de priorização" subtitle="Ordenada por dias parados e GMV" action={<StatusBadge tone="red">{critical} críticos</StatusBadge>}>
        <TableWrap><thead><tr><th>ID do pacote</th><th>Base</th><th>Motorista</th><th>Motivo</th><th>Substatus</th><th>Dias</th><th className="align-right">GMV</th></tr></thead>
          <tbody>{[...rows].sort((a, b) => b.stoppedDays - a.stoppedDays || b.gmvBrl - a.gmvBrl).slice(0, 60).map((row) => <tr key={`${row.batchId}-${row.shipmentId}`}><td><strong className="mono">{row.shipmentId}</strong><small className="cell-subtitle">Rota {row.routeId || "—"}</small></td><td>{row.facilityId || "—"}</td><td className="mono">{row.driverId || "—"}</td><td>{row.failureReason || "—"}</td><td>{row.lastSubstatus || "—"}</td><td><StatusBadge tone={row.stoppedDays >= 4 ? "red" : row.stoppedDays >= 2 ? "amber" : "green"}>{row.stoppedDays} dias</StatusBadge></td><td className="align-right"><strong>{formatCurrency(row.gmvBrl)}</strong></td></tr>)}</tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
