"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { filterOptions } from "@/lib/dashboard-scope";
import { formatFortnightLabel, latestPnrByShipment } from "@/lib/metrics";
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

  const options = filterOptions(data, filters);
  const [masterXpts, setMasterXpts] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void fetch("/api/report-xpts", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Falha ao carregar XPTs.")))
      .then((payload: { xpts?: string[] }) => {
        if (active) setMasterXpts(Array.isArray(payload.xpts) ? payload.xpts : []);
      })
      .catch(() => {
        if (active) setMasterXpts([]);
      });
    return () => { active = false; };
  }, []);

  // Estes filtros não fazem parte do fluxo de Relatórios de Pacotes.
  // Ao entrar na tela, neutralizamos qualquer recorte oculto herdado de outra página.
  useEffect(() => {
    if (filters.month !== "Todos") setFilter("month", "Todos");
    if (filters.coordinator !== "Todos") setFilter("coordinator", "Todos");
    if (filters.supervisor !== "Todos") setFilter("supervisor", "Todos");
    if (filters.driver !== "Todos") setFilter("driver", "Todos");
    if (filters.operation !== "Todas") setFilter("operation", "Todas");
  }, [filters.month, filters.coordinator, filters.supervisor, filters.driver, filters.operation, setFilter]);

  const baseOptions = useMemo(() => [...new Map(
    data.hierarchy
      .filter((row) => row.base && row.sigla)
      .filter((row) => row.sigla.toUpperCase() !== "AMAZON" && row.base.toUpperCase() !== "AMAZON")
      .map((row) => {
        const value = `BASE|||${row.sigla}|||${row.base}`;
        const label = `SVC · ${row.sigla} - ${row.base}`;
        return [value, { value, label, sigla: row.sigla, base: row.base }] as const;
      }),
  ).values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [data.hierarchy]);

  const xptOptions = useMemo(() => {
    const source = masterXpts.length ? masterXpts : options.xpts;
    return source
      .filter((xpt) => xpt.toUpperCase() !== "AMAZON")
      .map((xpt) => ({ value: `XPT|||${xpt}`, label: `XPT · ${xpt}`, xpt }));
  }, [masterXpts, options.xpts]);

  const selectedUnit = filters.xpt !== "Todos"
    ? `XPT|||${filters.xpt}`
    : filters.base !== "Todas" && filters.sigla !== "Todas"
      ? `BASE|||${filters.sigla}|||${filters.base}`
      : "Todos";

  const changeUnit = (value: string) => {
    if (value === "Todos") {
      setFilter("xpt", "Todos");
      setFilter("sigla", "Todas");
      setFilter("base", "Todas");
      return;
    }

    if (value.startsWith("XPT|||")) {
      const xpt = value.slice("XPT|||".length);
      setFilter("sigla", "Todas");
      setFilter("base", "Todas");
      setFilter("xpt", xpt);
      return;
    }

    const [, sigla, base] = value.split("|||");
    if (!sigla || !base) return;
    setFilter("xpt", "Todos");
    setFilter("sigla", sigla);
    setFilter("base", base);
  };

  const statusOptions = useMemo(() => {
    const statuses = latestPnrByShipment(data.pnr, data.imports).map((row) => row.status).filter(Boolean);
    return [...new Set(statuses)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data.pnr, data.imports]);

  const active = filters.fortnight !== "Todas"
    || filters.base !== "Todas"
    || filters.sigla !== "Todas"
    || filters.xpt !== "Todos"
    || Boolean(dateStart || dateEnd || statusFilter !== "TODOS");

  const resetAll = () => {
    resetFilters();
    resetLocal();
  };

  return (
    <section className="filters-bar filters-bar--reports filters-bar--reports-compact" aria-label="Filtros dos Relatórios de Pacotes">
      <label className="filter-control report-filter--kind">
        <span>Relatório</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as "PNR" | "PERDIDO")}>
          <option value="PNR">PNR</option>
          <option value="PERDIDO">Pacote perdido</option>
        </select>
      </label>

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

      <label className="filter-control report-filter--unit">
        <span>Base / XPT</span>
        <select value={selectedUnit} onChange={(event) => changeUnit(event.target.value)}>
          <option value="Todos">Todos</option>
          <optgroup label="Bases SVC">
            {baseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </optgroup>
          <optgroup label="XPTs">
            {xptOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </optgroup>
        </select>
      </label>

      <div className="report-filter-actions">
        <button className="reset-filter" onClick={resetAll} disabled={!active} title="Limpar filtros">
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
    </section>
  );
}
