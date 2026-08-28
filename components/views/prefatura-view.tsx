"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Boxes, Copy, ReceiptText, Search, X } from "lucide-react";
import { scopeData } from "@/lib/dashboard-scope";
import { duplicateGroups, prefaturaByOperation, uniqueByShipment } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults, TableWrap } from "./shared";

export function PrefaturaView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const [idSearchOpen, setIdSearchOpen] = useState(false);
  const [idSearch, setIdSearch] = useState("");
  const scoped = scopeData(data, filters);
  const uniqueRows = uniqueByShipment(scoped.prefatura);
  if (!scoped.prefatura.length) return <NoResults title="Nenhum lançamento de pré-fatura neste recorte" />;
  const duplicateIds = new Set(duplicateGroups(scoped.prefatura).map(([id]) => id));
  const value = uniqueRows.reduce((sum, row) => sum + row.value, 0);
  const operations = prefaturaByOperation(scoped.prefatura);
  const driverMap = new Map<string, { driver: string; packages: Set<string>; value: number }>();
  uniqueRows.forEach((row) => {
    const current = driverMap.get(row.driverName) ?? { driver: row.driverName || "Não identificado", packages: new Set(), value: 0 };
    current.packages.add(row.shipmentId); current.value += row.value; driverMap.set(row.driverName, current);
  });
  const topDrivers = [...driverMap.values()].map((row) => ({ ...row, packageCount: row.packages.size })).sort((a, b) => b.value - a.value).slice(0, 8);
  const search = idSearch.replace(/\D/g, "");
  const tableRows = search ? scoped.prefatura.filter((row) => row.shipmentId.includes(search)) : scoped.prefatura;

  const idHeaderSearch = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 6, verticalAlign: "middle" }}>
      <button
        type="button"
        className="table-action"
        aria-label={idSearchOpen ? "Fechar pesquisa por ID do pacote" : "Pesquisar ID do pacote"}
        title="Pesquisar ID do pacote"
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
          aria-label="Busca ativa por ID do pacote"
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
      <PageIntro description="SVC, XPT e PNR permanecem identificados por aba. SVC + Base formam a unidade operacional; o XPT é uma estrutura independente e aparece em campo próprio quando houver relação regional." chips={[`${formatNumber(scoped.prefatura.length)} linhas brutas`, `${formatNumber(uniqueRows.length)} IDs únicos`]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Valor consolidado" value={formatCurrency(value)} detail="Sem duplicar o mesmo ID" icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="Pacotes únicos" value={formatNumber(uniqueRows.length)} detail="Unidade de faturamento" icon={<Boxes size={19} />} />
        <KpiCard label="Linhas importadas" value={formatNumber(scoped.prefatura.length)} detail="Ocorrências auditáveis" icon={<ReceiptText size={19} />} />
        <KpiCard label="IDs repetidos" value={formatNumber(duplicateIds.size)} detail="Entre abas ou arquivos" icon={<Copy size={19} />} tone={duplicateIds.size ? "red" : "neutral"} />
      </div>
      <div className="content-grid content-grid--wide">
        <Panel title="Composição por operação" subtitle="Valor consolidado por ID" className="panel--chart">
          <ResponsiveContainer width="100%" height={286}>
            <BarChart data={operations} margin={{ left: 4, right: 12, top: 10 }}>
              <CartesianGrid stroke="#ECEDEF" vertical={false} />
              <XAxis dataKey="operation" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#333" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} tickFormatter={(number) => `${Math.round(number / 1000)}k`} />
              <Tooltip content={<ChartTooltip currency />} />
              <Bar dataKey="value" name="Valor" fill="#E30613" radius={[4, 4, 0, 0]} maxBarSize={52} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Motoristas com maior desconto" subtitle="IDs únicos no recorte" className="panel--chart">
          <div className="rank-list">{topDrivers.map((row, index) => <div key={row.driver}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{row.driver}</strong><small>{row.packageCount} pacotes</small></div><b>{formatCurrency(row.value)}</b></div>)}</div>
        </Panel>
      </div>
      <Panel title="Lançamentos de pré-fatura" subtitle="Repetições são marcadas, não removidas da auditoria" action={<StatusBadge tone={duplicateIds.size ? "red" : "green"}>{search ? `${formatNumber(tableRows.length)} encontrados` : duplicateIds.size ? `${duplicateIds.size} duplicados` : "Sem duplicados"}</StatusBadge>}>
        <TableWrap><thead><tr><th>ID do pacote {idHeaderSearch}</th><th>Operação</th><th>Base</th><th>XPT</th><th>Motorista</th><th>Data da rota</th><th>Rota</th><th>Status do ID</th><th className="align-right">Valor</th></tr></thead>
          <tbody>{tableRows.slice(0, 60).map((row) => <tr key={`${row.batchId}-${row.sourceFile}-${row.sourceSheet}-${row.rowNumber}`}><td><strong className="mono">{row.shipmentId}</strong><small className="cell-subtitle">{row.sourceSheet}</small></td><td><StatusBadge tone={row.operation === "PNR" ? "amber" : row.operation === "SVC" ? "blue" : "neutral"}>{row.operation}</StatusBadge></td><td><strong>{row.sigla && row.baseName ? `${row.sigla} - ${row.baseName}` : row.baseName || row.baseLabel || "—"}</strong></td><td className="mono">{row.xptCode || "—"}</td><td>{row.driverName || "—"}</td><td>{row.routeDate ? new Date(`${row.routeDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td className="mono">{row.routeId || "—"}</td><td>{duplicateIds.has(row.shipmentId) ? <StatusBadge tone="red">Repetido</StatusBadge> : <StatusBadge tone="green">Único</StatusBadge>}</td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td></tr>)}</tbody>
        </TableWrap>
        {!tableRows.length ? <div style={{ padding: 20 }}><NoResults title="Nenhum ID encontrado" detail="Limpe a pesquisa ou informe outro ID do pacote." /></div> : null}
      </Panel>
    </div>
  );
}
