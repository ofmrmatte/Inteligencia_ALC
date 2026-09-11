"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RotateCcw, SlidersHorizontal } from "lucide-react";
import { filterOptions } from "@/lib/dashboard-scope";
import { formatFortnightLabel, formatMonthLabel, latestPnrByShipment } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { useReportFiltersStore } from "@/lib/report-filters-store";

function SelectFilter({
  label,
  value,
  options,
  allLabel,
  onChange,
  formatOption,
  className,
}: {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  onChange: (value: string) => void;
  formatOption?: (value: string) => string;
  className?: string;
}) {
  return (
    <label className={`filter-control ${className || ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option>{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{formatOption ? formatOption(option) : option}</option>)}
      </select>
    </label>
  );
}

export function ReportFiltersBar() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const setFilter = useDashboardStore((state) => state.setFilter);
  const resetFilters = useDashboardStore((state) => state.resetFilters);

  const kind = useReportFiltersStore((state) => state.kind);
  const dateStart = useReportFiltersStore((state) => state.dateStart);
  const dateEnd = useReportFiltersStore((state) => state.dateEnd);
  const statusFilter = useReportFiltersStore((state) => state.statusFilter);
  const exporting = useReportFiltersStore((state) => state.exporting);
  const setKind = useReportFiltersStore((state) => state.setKind);
  const setDateStart = useReportFiltersStore((state) => state.setDateStart);
  const setDateEnd = useReportFiltersStore((state) => state.setDateEnd);
  const setStatusFilter = useReportFiltersStore((state) => state.setStatusFilter);
  const resetLocal = useReportFiltersStore((state) => state.resetLocal);
  const requestExport = useReportFiltersStore((state) => state.requestExport);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const options = filterOptions(data, filters);

  // Operação é redundante nesta tela: o próprio seletor Relatório define PNR x Pacote Perdido.
  useEffect(() => {
    if (filters.operation !== "Todas") setFilter("operation", "Todas");
  }, [filters.operation, setFilter]);

  const baseOptions = useMemo(() => [...new Map(
    data.hierarchy
      .filter((row) => filters.coordinator === "Todos" || row.coordinator === filters.coordinator)
      .filter((row) => row.base && row.sigla)
      .map((row) => {
        const value = `${row.sigla}|||${row.base}`;
        const label = `${row.sigla} - ${row.base}`;
        return [value, { value, label, sigla: row.sigla, base: row.base }] as const;
      }),
  ).values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [data.hierarchy, filters.coordinator]);

  const selectedBase = filters.base !== "Todas" && filters.sigla !== "Todas"
    ? `${filters.sigla}|||${filters.base}`
    : "Todas";

  const changeBase = (value: string) => {
    if (value === "Todas") {
      setFilter("sigla", "Todas");
      setFilter("base", "Todas");
      return;
    }
    const option = baseOptions.find((item) => item.value === value);
    if (!option) return;
    setFilter("sigla", option.sigla);
    setFilter("base", option.base);
  };

  const statusOptions = useMemo(() => {
    const statuses = latestPnrByShipment(data.pnr, data.imports).map((row) => row.status).filter(Boolean);
    return [...new Set(statuses)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data.pnr, data.imports]);

  const globalActive = Object.entries(filters).some(([key, value]) => {
    const defaultValue = key === "base" || key === "sigla" || key === "operation" || key === "fortnight" ? "Todas" : "Todos";
    return value !== defaultValue;
  });
  const localActive = Boolean(dateStart || dateEnd || statusFilter !== "TODOS");
  const advancedActive = filters.coordinator !== "Todos" || filters.supervisor !== "Todos" || filters.xpt !== "Todos";

  const resetAll = () => {
    resetFilters();
    resetLocal();
    setAdvancedOpen(false);
  };

  return (
    <section className="filters-bar filters-bar--reports" aria-label="Filtros dos Relatórios de Pacotes">
      <label className="filter-control report-filter--kind">
        <span>Relatório</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as "PNR" | "PERDIDO")}>
          <option value="PNR">PNR</option>
          <option value="PERDIDO">Pacote perdido</option>
        </select>
      </label>

      <SelectFilter label="Mês" value={filters.month} options={options.months} allLabel="Todos" onChange={(value) => setFilter("month", value)} formatOption={formatMonthLabel} />
      <SelectFilter label="Quinzena" value={filters.fortnight} options={options.fortnights} allLabel="Todas" onChange={(value) => setFilter("fortnight", value)} formatOption={formatFortnightLabel} />

      <label className="filter-control">
        <span>Data inicial</span>
        <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
      </label>
      <label className="filter-control">
        <span>Data final</span>
        <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} />
      </label>

      {kind === "PNR" ? (
        <label className="filter-control report-filter--status">
          <span>Status PNR</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="TODOS">Todos</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
      ) : null}

      <label className="filter-control report-filter--base">
        <span>Base</span>
        <select value={selectedBase} onChange={(event) => changeBase(event.target.value)}>
          <option value="Todas">Todas</option>
          {baseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <SelectFilter label="Motorista" value={filters.driver} options={options.drivers} allLabel="Todos" onChange={(value) => setFilter("driver", value)} className="report-filter--driver" />

      <button
        type="button"
        className={`report-more-filters ${advancedOpen || advancedActive ? "is-active" : ""}`}
        onClick={() => setAdvancedOpen((current) => !current)}
        title="Filtros avançados"
      >
        <SlidersHorizontal size={14} />
        <span>Mais filtros</span>
        {advancedActive ? <b /> : null}
        <ChevronDown size={12} className={advancedOpen ? "is-open" : ""} />
      </button>

      <div className="report-filter-actions">
        <button className="reset-filter" onClick={resetAll} disabled={!globalActive && !localActive} title="Limpar filtros">
          <RotateCcw size={17} />
        </button>
        <button
          type="button"
          className="primary-button primary-button--small report-download-button"
          onClick={requestExport}
          disabled={exporting}
          title="Baixar relatório ALC"
        >
          <Download size={14} />
          {exporting ? "Gerando..." : "Baixar relatório"}
        </button>
      </div>

      {advancedOpen ? (
        <div className="report-advanced-filters">
          <SelectFilter label="Coordenador" value={filters.coordinator} options={options.coordinators} allLabel="Todos" onChange={(value) => setFilter("coordinator", value)} />
          <SelectFilter label="Supervisor" value={filters.supervisor} options={options.supervisors} allLabel="Todos" onChange={(value) => setFilter("supervisor", value)} />
          <SelectFilter label="XPT" value={filters.xpt} options={options.xpts} allLabel="Todos" onChange={(value) => setFilter("xpt", value)} />
        </div>
      ) : null}
    </section>
  );
}
