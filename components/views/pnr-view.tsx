"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Boxes, ChevronLeft, ChevronRight, CircleCheckBig, Eye, Link2, Search, TimerReset, X } from "lucide-react";
import { scopeData } from "@/lib/dashboard-scope";
import { latestPnrByShipment } from "@/lib/metrics";
import { cleanText, normalizeText } from "@/lib/normalize";
import { useDashboardStore } from "@/lib/store";
import type { PnrRecord } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, ColumnSelectFilter, NoResults, TableWrap } from "./shared";
import { PnrCaseDetailDrawer } from "./pnr-case-detail-drawer";

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
  const [dateSort, setDateSort] = useState("NONE");
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<PnrRecord | null>(null);

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
  const dateValue = (row: PnrRecord) => {
    const value = row.caseDate ? new Date(`${row.caseDate}T12:00:00`).getTime() : Number.NaN;
    return Number.isFinite(value) ? value : null;
  };
  const filteredRows = dateSort === "DESC"
    ? [...matchingRows].sort((a, b) => {
        const left = dateValue(a);
        const right = dateValue(b);
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        return right - left;
      })
    : dateSort === "ASC"
      ? [...matchingRows].sort((a, b) => {
          const left = dateValue(a);
          const right = dateValue(b);
          if (left === null) return right === null ? 0 : 1;
          if (right === null) return -1;
          return left - right;
        })
      : valueSort === "DESC"
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
  const completed = filteredRows.filter((row) => /PROCEDENTE|APROVADO|CONCLUIDO|FATURAMENTO|ANULAD/.test(normalizeText(row.status))).length;
  const prefaturaIds = new Set(scoped.prefatura.map((row) => row.shipmentId));
  const matched = filteredRows.filter((row) => prefaturaIds.has(row.shipmentId)).length;
  const divisor = filteredRows.length || 1;
  const caseCenterCount = filteredRows.filter((row) => row.sourceSystem === "case_center").length;
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
          onChange={(event) => { setIdSearch(event.target.value.replace(/\D/g, "")); setPage(1); }}
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
      <PageIntro
        description="Visão consolidada de todos os casos PNR. O histórico antigo permanece disponível e os períodos sincronizados pelo Case Center são atualizados e enriquecidos sem duplicação."
        chips={[`${formatNumber(rows.length)} casos consolidados`, `${formatNumber(caseCenterCount)} sincronizados via Case Center`]}
      />

      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Casos únicos" value={formatNumber(filteredRows.length)} detail={statusFilter === "TODOS" && !idSearch ? "IDs de envio consolidados" : "IDs no recorte selecionado"} icon={<Boxes size={19} />} />
        <KpiCard label="Valor de compra" value={formatCurrency(value)} detail={statusFilter === "TODOS" && !idSearch ? "Base dos casos PNR" : "Somente o recorte selecionado"} icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="Encerrados" value={formatPercent((completed / divisor) * 100)} detail={`${completed} casos com fechamento identificado`} icon={<CircleCheckBig size={19} />} tone="green" />
        <KpiCard label="Conciliados" value={formatPercent((matched / divisor) * 100)} detail={`${matched} IDs na pré-fatura`} icon={<Link2 size={19} />} tone="neutral" />
      </div>

      <div className="content-grid content-grid--wide">
        <Panel title="Distribuição por status" subtitle="Todos os casos consolidados por tratativa" className="panel--chart">
          <ResponsiveContainer width="100%" height={286}>
            <BarChart data={status} layout="vertical" margin={{ left: 8, right: 22, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#ECEDEF" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} />
              <YAxis dataKey="status" type="category" axisLine={false} tickLine={false} width={138} tick={{ fontSize: 11, fill: "#333" }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cases" name="Casos" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Valor por status" subtitle="Exposição financeira dos casos" className="panel--chart">
          <div className="status-list">{status.map((item, index) => <div key={item.status}><span className="status-list__rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.status}</strong><small>{item.cases} casos</small></div><span className="status-list__value">{formatCurrency(item.value)}</span></div>)}</div>
        </Panel>
      </div>

      <Panel title="Casos PNR" subtitle="Histórico legado e Case Center em uma única visão" action={<StatusBadge tone="neutral"><TimerReset size={13} /> {filteredRows.length} IDs</StatusBadge>}>
        <TableWrap>
          <thead>
            <tr>
              <th>ID de envio {idHeaderSearch}</th>
              <th>
                Status
                <ColumnSelectFilter ariaLabel="Filtrar casos PNR por status" value={statusFilter} options={statusOptions} onChange={(value) => { setStatusFilter(value); setPage(1); }} allLabel="Todos os status" />
              </th>
              <th>
                Data
                <ColumnSelectFilter
                  ariaLabel="Ordenar casos PNR por data"
                  value={dateSort}
                  options={[
                    { value: "DESC", label: "Mais recentes" },
                    { value: "ASC", label: "Mais antigas" },
                  ]}
                  onChange={(value) => {
                    setDateSort(value);
                    if (value !== "NONE") setValueSort("NONE");
                    setPage(1);
                  }}
                  allValue="NONE"
                  allLabel="Ordenar"
                />
              </th><th>Base de origem</th><th>XPT</th><th>Motorista</th><th>Rota</th>
              <th className="align-right">Valor <ColumnSelectFilter ariaLabel="Ordenar casos PNR por valor" value={valueSort} options={[{ value: "DESC", label: "Maior → menor" }, { value: "ASC", label: "Menor → maior" }]} onChange={(value) => { setValueSort(value); if (value !== "NONE") setDateSort("NONE"); setPage(1); }} allValue="NONE" allLabel="Ordenar" /></th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>{pageRows.map((row) => (
            <tr key={`${row.batchId}-${row.shipmentId}`}>
              <td><strong className="mono">{row.shipmentId}</strong><small className="cell-subtitle">{row.sourceSystem === "case_center" ? `Case Center · Caso ${row.caseId || "—"}` : row.sourceFile}</small></td>
              <td><StatusBadge tone={/FATUR|PROCEDENTE|APROVADO/.test(normalizeText(row.status)) ? "green" : /ANALISE|PENDENTE|REVISAO|COMPROVANTE|PENALIDADE/.test(normalizeText(row.status)) ? "amber" : "neutral"}>{pnrStatusLabel(row.status)}</StatusBadge></td>
              <td>{row.caseDate ? new Date(`${row.caseDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td>
              <td><strong>{row.originStation || "—"}</strong></td>
              <td className="mono">{row.xptCode || "—"}</td>
              <td>{row.driverName || <span className="mono">{row.driverId || "—"}</span>}</td>
              <td className="mono">{row.routeId || "—"}</td>
              <td className="align-right"><strong>{formatCurrency(row.purchaseValue)}</strong></td>
              <td><button className="table-action pnr-detail-trigger" type="button" onClick={() => setSelectedRow(row)}><Eye size={13} />Ver detalhes</button></td>
            </tr>
          ))}</tbody>
        </TableWrap>
        {!filteredRows.length ? <div style={{ padding: 20 }}><NoResults title="Nenhum caso corresponde à busca" detail="Limpe a pesquisa por ID ou altere o filtro de status." /></div> : (
          <div className="pnr-table-pagination">
            <span>Exibindo {formatNumber((currentPage - 1) * pageSize + 1)}–{formatNumber(Math.min(currentPage * pageSize, filteredRows.length))} de {formatNumber(filteredRows.length)} casos</span>
            <div>
              <button className="secondary-button" type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={14} />Anterior</button>
              <strong>Página {currentPage} de {pageCount}</strong>
              <button className="secondary-button" type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Próxima<ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </Panel>

      <PnrCaseDetailDrawer key={selectedRow?.caseId || selectedRow?.shipmentId || "closed"} row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}
