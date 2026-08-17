"use client";

import { RotateCcw } from "lucide-react";
import { filterOptions, formatFortnightLabel, formatMonthLabel } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";

function SelectFilter({ label, value, options, allLabel, onChange, formatOption }: { label: string; value: string; options: string[]; allLabel: string; onChange: (value: string) => void; formatOption?: (value: string) => string }) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option>{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{formatOption ? formatOption(option) : option}</option>)}
      </select>
    </label>
  );
}

export function GlobalFilters() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const setFilter = useDashboardStore((state) => state.setFilter);
  const resetFilters = useDashboardStore((state) => state.resetFilters);
  const options = filterOptions(data, filters);
  const active = Object.entries(filters).some(([key, value]) => value !== (key === "base" || key === "sigla" || key === "operation" || key === "fortnight" ? "Todas" : "Todos"));

  const baseOptions = [...new Map(
    data.hierarchy
      .filter((row) => filters.xpt === "Todos" || row.xptCode === filters.xpt)
      .filter((row) => filters.coordinator === "Todos" || row.coordinator === filters.coordinator)
      .filter((row) => row.base && row.sigla)
      .map((row) => {
        const value = `${row.sigla}|||${row.base}`;
        const label = `${row.sigla} - ${row.base}`;
        return [value, { value, label, sigla: row.sigla, base: row.base }] as const;
      }),
  ).values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

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

  return (
    <section className="filters-bar" aria-label="Filtros globais">
      <SelectFilter label="Mês" value={filters.month} options={options.months} allLabel="Todos" onChange={(value) => setFilter("month", value)} formatOption={formatMonthLabel} />
      <SelectFilter label="Quinzena" value={filters.fortnight} options={options.fortnights} allLabel="Todas" onChange={(value) => setFilter("fortnight", value)} formatOption={formatFortnightLabel} />
      <SelectFilter label="Filial XPT" value={filters.xpt} options={options.xpts} allLabel="Todos" onChange={(value) => setFilter("xpt", value)} />
      <SelectFilter label="Coordenador" value={filters.coordinator} options={options.coordinators} allLabel="Todos" onChange={(value) => setFilter("coordinator", value)} />
      <label className="filter-control">
        <span>Base (SVC)</span>
        <select value={selectedBase} onChange={(event) => changeBase(event.target.value)}>
          <option value="Todas">Todas</option>
          {baseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <SelectFilter label="Operação" value={filters.operation} options={["SVC", "XPT", "PNR"]} allLabel="Todas" onChange={(value) => setFilter("operation", value)} />
      <SelectFilter label="Supervisor" value={filters.supervisor} options={options.supervisors} allLabel="Todos" onChange={(value) => setFilter("supervisor", value)} />
      <SelectFilter label="Motorista" value={filters.driver} options={options.drivers} allLabel="Todos" onChange={(value) => setFilter("driver", value)} />
      <button className="reset-filter" onClick={resetFilters} disabled={!active} title="Limpar filtros"><RotateCcw size={17} /></button>
    </section>
  );
}
