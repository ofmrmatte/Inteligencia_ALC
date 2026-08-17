"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Clock3, PackageX, ShieldAlert } from "lucide-react";
import { scopeData } from "@/lib/metrics";
import { cleanText, normalizeText } from "@/lib/normalize";
import { useDashboardStore } from "@/lib/store";
import type { ImportEntry, RiskRecord } from "@/lib/types";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, ColumnSelectFilter, NoResults, TableWrap } from "./shared";

function reasonLabel(reason: string) {
  return cleanText(reason) || "Sem motivo";
}

function reasonKey(reason: string) {
  return normalizeText(reasonLabel(reason));
}

function latestRiskByShipment(records: RiskRecord[], imports: ImportEntry[]): RiskRecord[] {
  const importTime = new Map(imports.map((entry) => [entry.batchId, Date.parse(entry.importedAt) || 0]));
  const latest = new Map<string, RiskRecord>();

  for (const record of records) {
    if (!record.shipmentId) continue;
    const current = latest.get(record.shipmentId);
    if (!current) {
      latest.set(record.shipmentId, record);
      continue;
    }

    const recordTime = importTime.get(record.batchId) ?? 0;
    const currentTime = importTime.get(current.batchId) ?? 0;
    if (recordTime > currentTime || (recordTime === currentTime && record.rowNumber > current.rowNumber)) {
      latest.set(record.shipmentId, record);
    }
  }

  return [...latest.values()];
}

export function RiskView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const scoped = scopeData(data, filters);
  const rows = latestRiskByShipment(scoped.risk, data.imports);
  const [reasonFilter, setReasonFilter] = useState("TODOS");

  const reasonOptions = useMemo(() => {
    const labels = new Map<string, string>();
    rows.forEach((row) => {
      const label = reasonLabel(row.failureReason);
      const key = reasonKey(label);
      if (key && !labels.has(key)) labels.set(key, label);
    });
    return [...labels.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [rows]);

  const tableRows = reasonFilter === "TODOS"
    ? rows
    : rows.filter((row) => reasonKey(row.failureReason) === reasonFilter);

  if (!rows.length) return <NoResults title="Nenhum pacote de risco LM neste recorte" />;
  const gmv = rows.reduce((sum, row) => sum + row.gmvBrl, 0);
  const avgStopped = rows.reduce((sum, row) => sum + row.stoppedDays, 0) / rows.length;
  const critical = rows.filter((row) => row.stoppedDays >= 4).length;
  const reasons = new Map<string, { reason: string; packages: number; gmv: number }>();
  rows.forEach((row) => {
    const label = reasonLabel(row.failureReason);
    const key = reasonKey(label);
    const current = reasons.get(key) ?? { reason: label, packages: 0, gmv: 0 };
    current.packages += 1;
    current.gmv += row.gmvBrl;
    reasons.set(key, current);
  });
  const reasonData = [...reasons.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 8);

  return (
    <div className="view-stack">
      <PageIntro description="A exposição considera um registro por ID de pacote. SVC + Base são conciliados pelo cadastro mestre; o XPT permanece independente e é exibido separadamente quando houver relação regional. Em uploads recorrentes, prevalece o lote mais recente." chips={[`${formatNumber(scoped.risk.length - rows.length)} repetições consolidadas`, `${reasonData.length} motivos principais`]} />
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
      <Panel title="Fila de priorização" subtitle="Ordenada por dias parados e GMV" action={<StatusBadge tone="red">{tableRows.length} IDs exibidos</StatusBadge>}>
        <TableWrap>
          <thead>
            <tr>
              <th>ID do pacote</th><th>Base</th><th>XPT</th><th>Motorista</th>
              <th>
                Motivo
                <ColumnSelectFilter ariaLabel="Filtrar Risco LM por motivo" value={reasonFilter} options={reasonOptions} onChange={setReasonFilter} allLabel="Todos os motivos" />
              </th>
              <th>Substatus</th><th>Dias</th><th className="align-right">GMV</th>
            </tr>
          </thead>
          <tbody>{[...tableRows].sort((a, b) => b.stoppedDays - a.stoppedDays || b.gmvBrl - a.gmvBrl).slice(0, 60).map((row) => <tr key={`${row.batchId}-${row.shipmentId}`}><td><strong className="mono">{row.shipmentId}</strong><small className="cell-subtitle">Rota {row.routeId || "—"}</small></td><td><strong>{row.facilityId || "—"}</strong></td><td className="mono">{row.xptCode || "—"}</td><td className="mono">{row.driverId || "—"}</td><td>{reasonLabel(row.failureReason)}</td><td>{cleanText(row.lastSubstatus) || "—"}</td><td><StatusBadge tone={row.stoppedDays >= 4 ? "red" : row.stoppedDays >= 2 ? "amber" : "green"}>{row.stoppedDays} dias</StatusBadge></td><td className="align-right"><strong>{formatCurrency(row.gmvBrl)}</strong></td></tr>)}</tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
