"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BadgeDollarSign, Boxes, CircleCheckBig, ClipboardCheck, Link2, Search, Tags, TimerReset, X } from "lucide-react";
import { scopeData } from "@/lib/dashboard-scope";
import { latestPnrByShipment, pnrDecisionRows } from "@/lib/metrics";
import { cleanText, normalizeText } from "@/lib/normalize";
import {
  auditPnrClassification,
  PNR_BILLING_TYPES,
  PNR_CANCELLATION_TYPES,
  pnrClassificationFamily,
  pnrClassificationLabel,
} from "@/lib/pnr-classification";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, formatPercent, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, ColumnSelectFilter, NoResults, TableWrap } from "./shared";

function pnrStatusLabel(status: string) {
  return cleanText(status) || "Sem status";
}

function pnrStatusKey(status: string) {
  return normalizeText(pnrStatusLabel(status));
}

export function PnrView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const scoped = scopeData(data, filters);
  const rows = latestPnrByShipment(scoped.pnr, data.imports);
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [idSearchOpen, setIdSearchOpen] = useState(false);
  const [idSearch, setIdSearch] = useState("");
  const [valueSort, setValueSort] = useState("NONE");

  const labels = new Map<string, string>();
  rows.forEach((row) => {
    const label = pnrStatusLabel(row.status);
    const key = pnrStatusKey(label);
    if (key && !labels.has(key)) labels.set(key, label);
  });
  const statusOptions = [...labels.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const search = idSearch.replace(/\D/g, "");
  const matchingRows = rows.filter((row) => {
    if (statusFilter !== "TODOS" && pnrStatusKey(row.status) !== statusFilter) return false;
    if (search && !row.shipmentId.includes(search)) return false;
    return true;
  });
  const filteredRows = valueSort === "DESC"
    ? [...matchingRows].sort((a, b) => b.purchaseValue - a.purchaseValue)
    : valueSort === "ASC"
      ? [...matchingRows].sort((a, b) => a.purchaseValue - b.purchaseValue)
      : matchingRows;

  if (!rows.length) return <NoResults title="Nenhum caso PNR neste recorte" />;

  const value = filteredRows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const statusMap = new Map<string, { status: string; cases: number; value: number }>();
  filteredRows.forEach((row) => {
    const label = pnrStatusLabel(row.status);
    const key = pnrStatusKey(label);
    const current = statusMap.get(key) ?? { status: label, cases: 0, value: 0 };
    current.cases += 1;
    current.value += row.purchaseValue;
    statusMap.set(key, current);
  });
  const status = [...statusMap.values()].sort((a, b) => b.cases - a.cases);
  const decisions = pnrDecisionRows(filteredRows);
  const completed = filteredRows.filter((row) => /PROCEDENTE|APROVADO|CONCLUIDO/.test(normalizeText(row.status))).length;
  const prefaturaIds = new Set(scoped.prefatura.map((row) => row.shipmentId));
  const matched = filteredRows.filter((row) => prefaturaIds.has(row.shipmentId)).length;
  const divisor = filteredRows.length || 1;

  const auditableRows = filteredRows.filter((row) => row.classificationColumnsPresent);
  const auditedRows = auditableRows.map((row) => ({
    row,
    audit: auditPnrClassification(row),
    family: pnrClassificationFamily(row.status),
    label: pnrClassificationLabel(row),
  }));
  const classifiedRows = auditedRows.filter((item) => item.audit === "CLASSIFICADO");
  const pendingRows = auditedRows.filter((item) => item.audit === "PENDENTE");
  const inconsistentRows = auditedRows.filter((item) => item.audit === "INCONSISTENTE");
  const classifiedValue = classifiedRows.reduce((sum, item) => sum + item.row.purchaseValue, 0);

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
  const baseData = [...baseMap.values()].sort((a, b) => b.value - a.value).slice(0, 8);

  const idHeaderSearch = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 6, verticalAlign: "middle" }}>
      <button
        type="button"
        className="table-action"
        aria-label={idSearchOpen ? "Fechar pesquisa por ID de envio" : "Pesquisar ID de envio"}
        title="Pesquisar ID de envio"
        onClick={() => {
          if (idSearchOpen && idSearch) setIdSearch("");
          setIdSearchOpen((current) => !current);
        }}
        style={{ width: 22, height: 22, minWidth: 22, padding: 0, borderRadius: 999, color: idSearch ? "#b8000b" : undefined }}
      >
        {idSearchOpen ? <X size={11} /> : <Search size={11} />}
      </button>
      <span
        style={{
          display: "inline-flex",
          width: idSearchOpen ? 132 : 0,
          opacity: idSearchOpen ? 1 : 0,
          overflow: "hidden",
          transition: "width 180ms ease, opacity 150ms ease",
        }}
      >
        <input
          autoFocus={idSearchOpen}
          aria-label="Busca ativa por ID de envio"
          inputMode="numeric"
          placeholder="Buscar ID..."
          value={idSearch}
          onChange={(event) => setIdSearch(event.target.value.replace(/\D/g, ""))}
          style={{
            width: 128,
            height: 22,
            border: `1px solid ${idSearch ? "#f5c5c9" : "#e4e5e8"}`,
            borderRadius: 999,
            padding: "0 9px",
            background: idSearch ? "#fff3f4" : "#fff",
            color: "#333",
            fontSize: 9,
            outline: "none",
          }}
        />
      </span>
    </span>
  );

  return (
    <div className="view-stack">
      <PageIntro description="Cada ID de envio conta como um caso. A Estação de origem é conciliada com o cadastro mestre SVC + Base; o XPT permanece uma referência regional independente e é exibido separadamente. Em uploads diários repetidos, prevalece o lote mais recente." chips={[`${statusOptions.length} status encontrados`, `${formatNumber(scoped.pnr.length - rows.length)} repetições consolidadas`]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Casos únicos" value={formatNumber(filteredRows.length)} detail={statusFilter === "TODOS" && !idSearch ? "IDs de envio" : "IDs no recorte selecionado"} icon={<Boxes size={19} />} />
        <KpiCard label="Valor de compra" value={formatCurrency(value)} detail={statusFilter === "TODOS" && !idSearch ? "Base dos casos PNR" : "Somente o recorte selecionado"} icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="Procedência" value={formatPercent((completed / divisor) * 100)} detail={`${completed} casos concluídos`} icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Conciliados" value={formatPercent((matched / divisor) * 100)} detail={`${matched} IDs na pré-fatura`} icon={<Link2 size={19} />} tone="neutral" />
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

      <Panel
        title="Auditoria de Classificação PNR"
        subtitle={auditableRows.length
          ? "Quantidade e valores são calculados diretamente dos IDs da PNR importada; as novas colunas servem apenas para classificar cada caso."
          : "Aguardando uma PNR com as colunas TIPO DE FATURAMENTO e TIPO DE ANULAÇÃO. Até lá, a auditoria permanece zerada."}
      >
        <div className="kpi-grid kpi-grid--four" style={{ marginBottom: 14 }}>
          <KpiCard label="Classificados" value={formatNumber(classifiedRows.length)} detail={auditableRows.length ? `${formatNumber(auditableRows.length)} casos habilitados para auditoria` : "Nenhuma PNR classificada importada"} icon={<ClipboardCheck size={19} />} tone="green" />
          <KpiCard label="Valor classificado" value={formatCurrency(classifiedValue)} detail="Somado diretamente do valor da PNR" icon={<BadgeDollarSign size={19} />} tone="neutral" />
          <KpiCard label="Pendentes" value={formatNumber(pendingRows.length)} detail="Status final sem classificação correspondente" icon={<Tags size={19} />} tone="amber" />
          <KpiCard label="Inconsistências" value={formatNumber(inconsistentRows.length)} detail="Tipo inválido, conflito ou família incompatível" icon={<AlertTriangle size={19} />} tone={inconsistentRows.length ? "red" : "neutral"} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
          {classificationData.map((item) => (
            <div
              key={`${item.family}-${item.label}`}
              style={{
                border: "1px solid #e7e8eb",
                borderLeft: `3px solid ${item.family === "ANULAÇÃO" ? "#E30613" : "#16845B"}`,
                borderRadius: 8,
                padding: "12px 13px",
                background: "#fff",
                minHeight: 92,
              }}
            >
              <small style={{ display: "block", color: "#8a8d94", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 5 }}>{item.family}</small>
              <strong style={{ display: "block", fontSize: 12, lineHeight: 1.25, minHeight: 30 }}>{item.label}</strong>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{formatNumber(item.cases)}</span>
                <small style={{ color: "#60636A", fontWeight: 600 }}>{formatCurrency(item.value)}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="content-grid content-grid--wide">
          <Panel title="Casos por classificação" subtitle="Faturamento e anulação no mesmo recorte" className="panel--chart">
            {auditableRows.length ? (
              <ResponsiveContainer width="100%" height={280}>
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
              <NoResults title="Classificações ainda não disponíveis" detail="Os gráficos serão preenchidos automaticamente quando a próxima PNR vier com as duas colunas de classificação." />
            )}
          </Panel>

          <Panel title="Bases com maior impacto classificado" subtitle="Valor somado diretamente dos casos PNR" className="panel--chart">
            {baseData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={baseData} layout="vertical" margin={{ left: 12, right: 20, top: 6 }}>
                  <CartesianGrid stroke="#ECEDEF" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#73767d" }} tickFormatter={(number) => `${Math.round(Number(number) / 1000)}k`} />
                  <YAxis type="category" dataKey="base" width={155} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#333" }} />
                  <Tooltip content={<ChartTooltip currency />} />
                  <Bar dataKey="value" name="Valor" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <NoResults title="Nenhuma base classificada ainda" detail="O ranking será criado automaticamente pelos IDs classificados da PNR." />
            )}
          </Panel>
        </div>
      </Panel>

      <Panel title="Monitoramento e tomada de decisão" subtitle="Status, exposição e próxima ação operacional por recorte">
        <TableWrap>
          <thead><tr><th>Status</th><th>Casos</th><th>% do total</th><th className="align-right">Valor exposto</th><th>Prioridade</th><th>Ação sugerida</th></tr></thead>
          <tbody>{decisions.map((row) => <tr className={`decision-row decision-row--${row.tone}`} key={row.status}><td><strong>{pnrStatusLabel(row.status)}</strong></td><td>{formatNumber(row.cases)}</td><td>{formatPercent(row.percentage)}</td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td><td>{row.priority}</td><td>{row.action}</td></tr>)}</tbody>
        </TableWrap>
      </Panel>

      <Panel title="Casos PNR" subtitle="Detalhe rastreável até arquivo, aba e linha" action={<StatusBadge tone="neutral"><TimerReset size={13} /> {filteredRows.length} IDs</StatusBadge>}>
        <TableWrap>
          <thead>
            <tr>
              <th>ID de envio {idHeaderSearch}</th>
              <th>
                Status
                <ColumnSelectFilter ariaLabel="Filtrar casos PNR por status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} allLabel="Todos os status" />
              </th>
              <th>Data</th><th>Base de origem</th><th>XPT</th><th>Motorista</th><th>Rota</th><th>Classificação</th><th>Auditoria</th>
              <th className="align-right">Valor <ColumnSelectFilter ariaLabel="Ordenar casos PNR por valor" value={valueSort} options={[{ value: "DESC", label: "Maior → menor" }, { value: "ASC", label: "Menor → maior" }]} onChange={setValueSort} allValue="NONE" allLabel="Ordenar" /></th>
            </tr>
          </thead>
          <tbody>{filteredRows.slice(0, 50).map((row) => {
            const audit = auditPnrClassification(row);
            const family = pnrClassificationFamily(row.status);
            const label = pnrClassificationLabel(row);
            return (
              <tr key={`${row.batchId}-${row.shipmentId}`}>
                <td><strong className="mono">{row.shipmentId}</strong><small className="cell-subtitle">{row.sourceFile}</small></td>
                <td><StatusBadge tone={/PROCEDENTE|APROVADO/.test(normalizeText(row.status)) ? "green" : /ANALISE|PENDENTE/.test(normalizeText(row.status)) ? "amber" : "neutral"}>{pnrStatusLabel(row.status)}</StatusBadge></td>
                <td>{row.caseDate ? new Date(`${row.caseDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td>
                <td><strong>{row.originStation || "—"}</strong></td>
                <td className="mono">{row.xptCode || "—"}</td>
                <td className="mono">{row.driverId || "—"}</td>
                <td className="mono">{row.routeId || "—"}</td>
                <td>{row.classificationColumnsPresent && family && label ? <><strong>{family}</strong><small className="cell-subtitle">{label}</small></> : "—"}</td>
                <td>{audit === "CLASSIFICADO" ? <StatusBadge tone="green">Classificado</StatusBadge> : audit === "PENDENTE" ? <StatusBadge tone="amber">Pendente</StatusBadge> : audit === "INCONSISTENTE" ? <StatusBadge tone="red">Inconsistente</StatusBadge> : <span style={{ color: "#9a9da3" }}>—</span>}</td>
                <td className="align-right"><strong>{formatCurrency(row.purchaseValue)}</strong></td>
              </tr>
            );
          })}</tbody>
        </TableWrap>
        {!filteredRows.length ? <div style={{ padding: 20 }}><NoResults title="Nenhum caso corresponde à busca" detail="Limpe a pesquisa por ID ou altere o filtro de status." /></div> : null}
      </Panel>
    </div>
  );
}
