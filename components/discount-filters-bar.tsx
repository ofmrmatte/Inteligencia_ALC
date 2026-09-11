"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  DISCOUNT_DIRECTIONS,
  DISCOUNT_DIRECTION_LABELS,
  type DiscountDirection,
} from "@/lib/discount-management";
import {
  DISCOUNT_FILTER_ALL,
  useDiscountFiltersStore,
} from "@/lib/discount-filters-store";

type FilterRow = {
  discount_month: string | null;
  month: string | null;
  fortnight: string | null;
  base_key: string | null;
  base_name: string | null;
  sigla: string | null;
  xpt_code: string | null;
  driver_id: string | null;
  driver_name: string | null;
  direction: DiscountDirection;
  pnr_status: string | null;
};

const API = "/api/discount-management-v2";
const ALL = DISCOUNT_FILTER_ALL;

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => (value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function formatMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatFortnight(value: string) {
  const match = /^(0?[12])Q(\d{2})(\d{4})$/i.exec(value);
  if (!match) return value;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(Number(match[3]), Number(match[2]) - 1, 1));
  return `${Number(match[1])}Q · ${month}/${match[3]}`;
}

function SelectFilter({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value={ALL}>{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function DiscountFiltersBar() {
  const filters = useDiscountFiltersStore((state) => state.filters);
  const setFilter = useDiscountFiltersStore((state) => state.setFilter);
  const resetFilters = useDiscountFiltersStore((state) => state.resetFilters);
  const [rows, setRows] = useState<FilterRow[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(API, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { rows?: FilterRow[] };
        if (active && response.ok) setRows(body.rows ?? []);
      } catch {
        // A barra mantém os filtros atuais mesmo se a atualização das opções falhar.
      }
    };

    void load();
    const refresh = () => void load();
    window.addEventListener("alc-inteligencia:global-data-sync", refresh);
    return () => {
      active = false;
      window.removeEventListener("alc-inteligencia:global-data-sync", refresh);
    };
  }, []);

  const options = useMemo(() => {
    const bases = new Map<string, string>();
    rows.forEach((row) => {
      const value = row.base_name || row.base_key || row.sigla || "";
      if (!value) return;
      const label = row.sigla && row.base_name ? `${row.sigla} - ${row.base_name}` : value;
      if (!bases.has(value)) bases.set(value, label);
    });

    return {
      months: unique(rows.map((row) => row.discount_month || row.month))
        .map((value) => ({ value, label: formatMonth(value) })),
      fortnights: unique(rows.map((row) => row.fortnight))
        .map((value) => ({ value, label: formatFortnight(value) })),
      bases: [...bases.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      xpts: unique(rows.map((row) => row.xpt_code))
        .map((value) => ({ value, label: value })),
      drivers: unique(rows.map((row) => row.driver_name || row.driver_id))
        .map((value) => ({ value, label: value })),
      statuses: unique(rows.map((row) => row.pnr_status))
        .map((value) => ({ value, label: value })),
    };
  }, [rows]);

  const active = Object.values(filters).some((value) => value !== "" && value !== ALL);

  return (
    <section className="filters-bar" aria-label="Filtros da Gestão de Descontos">
      <SelectFilter label="Mês do desconto" value={filters.month} options={options.months} allLabel="Todos" onChange={(value) => setFilter("month", value)} />
      <SelectFilter label="Quinzena" value={filters.fortnight} options={options.fortnights} allLabel="Todas" onChange={(value) => setFilter("fortnight", value)} />
      <SelectFilter label="Base" value={filters.base} options={options.bases} allLabel="Todas" onChange={(value) => setFilter("base", value)} />
      <SelectFilter label="XPT" value={filters.xpt} options={options.xpts} allLabel="Todos" onChange={(value) => setFilter("xpt", value)} />
      <SelectFilter label="Motorista" value={filters.driver} options={options.drivers} allLabel="Todos" onChange={(value) => setFilter("driver", value)} />
      <SelectFilter
        label="Direcionamento"
        value={filters.direction}
        options={DISCOUNT_DIRECTIONS.map((value) => ({ value, label: DISCOUNT_DIRECTION_LABELS[value] }))}
        allLabel="Todos"
        onChange={(value) => setFilter("direction", value)}
      />
      <SelectFilter label="Status PNR" value={filters.pnrStatus} options={options.statuses} allLabel="Todos" onChange={(value) => setFilter("pnrStatus", value)} />
      <button className="reset-filter" onClick={resetFilters} disabled={!active} title="Limpar filtros">
        <RotateCcw size={17} />
      </button>
    </section>
  );
}
