"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BadgeDollarSign, Building2, ClipboardCheck, Tags } from "lucide-react";
import { scopeData } from "@/lib/dashboard-scope";
import { latestPnrByShipment } from "@/lib/metrics";
import {
  auditPnrClassification,
  PNR_BILLING_TYPES,
  PNR_CANCELLATION_TYPES,
  pnrClassificationFamily,
  pnrClassificationLabel,
} from "@/lib/pnr-classification";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, KpiCard, Panel } from "@/components/ui";
import { ChartTooltip, NoResults } from "./shared";

export function PnrAuditView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const scoped = scopeData(data, filters);
  const rows = latestPnrByShipment(scoped.pnr, data.imports);

  const auditedRows = rows.map((row) => ({
    row,
    audit: auditPnrClassification(row),
    family: pnrClassificationFamily(row),
    label: pnrClassificationLabel(row),
  })).filter((item) => item.audit !== "NAO_APLICAVEL");
  const auditableRows = auditedRows.map((item) => item.row);

  const classifiedRows = auditedRows.filter((item) => item.audit === "CLASSIFICADO");
  const pendingRows = auditedRows.filter((item) => item.audit === "PENDENTE");
  const inconsistentRows = auditedRows.filter((item) => item.audit === "INCONSISTENTE");
  const classifiedValue = classifiedRows.reduce((sum, item) => sum + item.row.purchaseValue, 0);
  const classifiedBases = new Set(
    classifiedRows
      .map(({ row }) => row.originStation || row.sigla)
      .filter(Boolean),
  );

  const classificationData = [
    ...PNR_BILLING_TYPES.map((label) => ({ family: "FATURAMENTO" as const, label })),
    ...PNR_CANCELLATION_TYPES.map((label) => ({ family: "ANULAÇÃO" as const, label })),
  ].map((definition) => {
    const matches = classifiedRows.filter((item) => item.family === definition.family && item.label === definition.label);
    return {
      ...definition,
      cases: matches.length,
      value: matches.reduce((sum, item) => sum + item.row.purchaseValue, 0),
      chartLabel: definition.family === "FATURAMENTO"
        ? definition.label.replace("MLP ALC - LOSS/DISPATCHER", "MLP ALC")
        : `Anulada · ${definition.label}`,
    };
  });

  const baseMap = new Map<string, { base: string; cases: number; value: number }>();
  classifiedRows.forEach(({ row }) => {
    const base = row.originStation || row.sigla || "Base não identificada";
    const current = baseMap.get(base) ?? { base, cases: 0, value: 0 };
    current.cases += 1;
    current.value += row.purchaseValue;
    baseMap.set(base, current);
  });
  const baseData = [...baseMap.values()].sort((a, b) => b.value - a.value).slice(0, 10);

  return (
    <div className="view-stack">
      <div className="kpi-grid kpi-grid--four">
        <KpiCard
          label="Classificados"
          value={formatNumber(classifiedRows.length)}
          detail={auditableRows.length ? `${formatNumber(auditableRows.length)} casos avaliados no recorte` : "Nenhuma PNR disponível para auditoria"}
          icon={<ClipboardCheck size={19} />}
          tone="green"
        />
        <KpiCard
          label="Valor classificado"
          value={formatCurrency(classifiedValue)}
          detail="Somado diretamente dos valores dos casos PNR"
          icon={<BadgeDollarSign size={19} />}
          tone="neutral"
        />
        <KpiCard
          label="Pendentes"
          value={formatNumber(pendingRows.length)}
          detail="Status final sem classificação correspondente"
          icon={<Tags size={19} />}
          tone="amber"
        />
        <KpiCard
          label="Inconsistências"
          value={formatNumber(inconsistentRows.length)}
          detail="Tipo inválido, conflito ou família incompatível"
          icon={<AlertTriangle size={19} />}
          tone={inconsistentRows.length ? "red" : "neutral"}
        />
      </div>

      <Panel
        title="Classificação financeira PNR"
        subtitle={auditableRows.length
          ? "Quantidade e valor são calculados diretamente dos IDs da PNR importada. As colunas de classificação apenas definem em qual grupo cada caso entra."
          : "Aguardando casos PNR do Case Center ou do histórico por planilha."}
      >
        <div className="pnr-audit-classifications">
          {classificationData.map((item) => (
            <article className={item.family === "ANULAÇÃO" ? "pnr-audit-classification pnr-audit-classification--cancel" : "pnr-audit-classification"} key={`${item.family}-${item.label}`}>
              <small>{item.family}</small>
              <strong>{item.label}</strong>
              <div>
                <span>{formatNumber(item.cases)} <em>casos</em></span>
                <b>{formatCurrency(item.value)}</b>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <div className="content-grid content-grid--wide">
        <Panel title="Casos por classificação" subtitle="Distribuição entre faturamento e anulação" className="panel--chart">
          {auditableRows.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={classificationData} layout="vertical" margin={{ left: 12, right: 20, top: 6 }}>
                <CartesianGrid stroke="#ECEDEF" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#73767d" }} />
                <YAxis type="category" dataKey="chartLabel" width={148} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#333" }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="cases" name="Casos" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {classificationData.map((item) => <Cell key={`${item.family}-${item.label}`} fill={item.family === "ANULAÇÃO" ? "#E30613" : "#16845B"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoResults title="Classificações ainda não disponíveis" detail="O gráfico será preenchido automaticamente pelos casos sincronizados ou pelo histórico classificado." />
          )}
        </Panel>

        <Panel title="Bases com maior impacto classificado" subtitle="Valor somado diretamente dos casos PNR" className="panel--chart">
          {baseData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={baseData} layout="vertical" margin={{ left: 12, right: 20, top: 6 }}>
                <CartesianGrid stroke="#ECEDEF" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#73767d" }} tickFormatter={(number) => `${Math.round(Number(number) / 1000)}k`} />
                <YAxis type="category" dataKey="base" width={155} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#333" }} />
                <Tooltip content={<ChartTooltip currency />} />
                <Bar dataKey="value" name="Valor" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoResults title="Nenhuma base classificada ainda" detail="O ranking será criado pelos IDs da PNR assim que existirem classificações válidas." />
          )}
        </Panel>
      </div>

      <Panel title="Cobertura da auditoria" subtitle="Leitura resumida do recorte atual">
        <div className="pnr-audit-coverage">
          <div><Building2 size={18} /><span><strong>{formatNumber(classifiedBases.size)}</strong><small>Bases classificadas</small></span></div>
          <div><ClipboardCheck size={18} /><span><strong>{formatNumber(auditableRows.length)}</strong><small>Casos avaliados</small></span></div>
          <div><Tags size={18} /><span><strong>{formatNumber(classifiedRows.length)}</strong><small>Casos válidos para consolidação</small></span></div>
          <div><AlertTriangle size={18} /><span><strong>{formatNumber(pendingRows.length + inconsistentRows.length)}</strong><small>Casos que exigem conferência</small></span></div>
        </div>
      </Panel>
    </div>
  );
}
