"use client";

import { RotateCcw } from "lucide-react";
import { filterOptions } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";

function SelectFilter({ label, value, options, allLabel, onChange }: { label: string; value: string; options: string[]; allLabel: string; onChange: (value: string) => void }) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option>{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
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
  const active = Object.entries(filters).some(([key, value]) => value !== (key === "base" || key === "sigla" || key === "operation" ? "Todas" : key.startsWith("date") ? "" : "Todos"));

  return (
    <section className="filters-bar" aria-label="Filtros globais">
      <div className="filter-period">
        <label className="filter-control"><span>De</span><input type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} /></label>
        <label className="filter-control"><span>Até</span><input type="date" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} /></label>
      </div>
      <SelectFilter label="Coordenador" value={filters.coordinator} options={options.coordinators} allLabel="Todos" onChange={(value) => setFilter("coordinator", value)} />
      <SelectFilter label="Sigla" value={filters.sigla} options={options.siglas} allLabel="Todas" onChange={(value) => setFilter("sigla", value)} />
      <SelectFilter label="Base" value={filters.base} options={options.bases} allLabel="Todas" onChange={(value) => setFilter("base", value)} />
      <SelectFilter label="Operação" value={filters.operation} options={["SVC", "XPT", "PNR"]} allLabel="Todas" onChange={(value) => setFilter("operation", value)} />
      <SelectFilter label="Supervisor" value={filters.supervisor} options={options.supervisors} allLabel="Todos" onChange={(value) => setFilter("supervisor", value)} />
      <SelectFilter label="Motorista" value={filters.driver} options={options.drivers} allLabel="Todos" onChange={(value) => setFilter("driver", value)} />
      <button className="reset-filter" onClick={resetFilters} disabled={!active} title="Limpar filtros"><RotateCcw size={17} /></button>
    </section>
  );
}
