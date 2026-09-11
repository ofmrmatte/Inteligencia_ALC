"use client";

import { Download } from "lucide-react";
import { scopeData } from "@/lib/dashboard-scope";
import { latestPnrByShipment } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { useReportFiltersStore } from "@/lib/report-filters-store";

export function ReportFilterExtras() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const kind = useReportFiltersStore((state) => state.kind);
  const dateStart = useReportFiltersStore((state) => state.dateStart);
  const dateEnd = useReportFiltersStore((state) => state.dateEnd);
  const statusFilter = useReportFiltersStore((state) => state.statusFilter);
  const setKind = useReportFiltersStore((state) => state.setKind);
  const setDateStart = useReportFiltersStore((state) => state.setDateStart);
  const setDateEnd = useReportFiltersStore((state) => state.setDateEnd);
  const setStatusFilter = useReportFiltersStore((state) => state.setStatusFilter);
  const requestExport = useReportFiltersStore((state) => state.requestExport);

  const scoped = scopeData(data, filters);
  const statusOptions = [...new Set(
    latestPnrByShipment(scoped.pnr, data.imports)
      .map((row) => row.status)
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <>
      <label className="filter-control">
        <span>Relatório</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as "PNR" | "PERDIDO")}>
          <option value="PNR">PNR</option>
          <option value="PERDIDO">Pacote perdido</option>
        </select>
      </label>
      <label className="filter-control">
        <span>Data inicial</span>
        <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
      </label>
      <label className="filter-control">
        <span>Data final</span>
        <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} />
      </label>
      {kind === "PNR" ? (
        <label className="filter-control">
          <span>Status PNR</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="TODOS">Todos</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        className="primary-button primary-button--small"
        style={{ alignSelf: "end", minHeight: 31, height: 31, whiteSpace: "nowrap" }}
        onClick={requestExport}
        title="Baixar relatório ALC"
      >
        <Download size={14} />
        Baixar relatório
      </button>
    </>
  );
}
