"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { fortnightFromDate, halfFromFortnight, monthFromFortnight, normalizeFortnight, yearFromFortnight } from "@/lib/competence";
import { cleanText, normalizeText } from "@/lib/normalize";
import { usePnrInboxFiltersStore } from "@/lib/pnr-inbox-filters-store";
import { useDashboardStore } from "@/lib/store";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function rowFortnight(row: { billingPeriod: string; caseDate: string | null }) {
  return normalizeFortnight(row.billingPeriod) || fortnightFromDate(row.caseDate);
}

function baseLabel(row: { originStation: string; sigla: string; baseKey: string }) {
  return row.originStation || row.sigla || row.baseKey || "Sem base";
}

export function PnrInboxFiltersBar() {
  const data = useDashboardStore((state) => state.data);
  const year = usePnrInboxFiltersStore((state) => state.year);
  const month = usePnrInboxFiltersStore((state) => state.month);
  const fortnight = usePnrInboxFiltersStore((state) => state.fortnight);
  const base = usePnrInboxFiltersStore((state) => state.base);
  const status = usePnrInboxFiltersStore((state) => state.status);
  const search = usePnrInboxFiltersStore((state) => state.search);
  const setYear = usePnrInboxFiltersStore((state) => state.setYear);
  const setMonth = usePnrInboxFiltersStore((state) => state.setMonth);
  const setFortnight = usePnrInboxFiltersStore((state) => state.setFortnight);
  const setBase = usePnrInboxFiltersStore((state) => state.setBase);
  const setStatus = usePnrInboxFiltersStore((state) => state.setStatus);
  const setSearch = usePnrInboxFiltersStore((state) => state.setSearch);
  const [searchOpen, setSearchOpen] = useState(false);

  const rows = useMemo(() => data.pnr.filter((row) => row.sourceSystem === "case_center"), [data.pnr]);
  const temporalRows = useMemo(() => rows.filter((row) => {
    const value = rowFortnight(row);
    if (year !== "Todos" && yearFromFortnight(value) !== year) return false;
    if (month !== "Todos" && monthFromFortnight(value) !== `${year !== "Todos" ? year : yearFromFortnight(value)}-${month}`) return false;
    return true;
  }), [rows, year, month]);

  const years = useMemo(() => [...new Set(rows.map((row) => yearFromFortnight(rowFortnight(row))).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [rows]);
  const months = useMemo(() => {
    const values = rows
      .filter((row) => year === "Todos" || yearFromFortnight(rowFortnight(row)) === year)
      .map((row) => monthFromFortnight(rowFortnight(row)).slice(-2))
      .filter(Boolean);
    return [...new Set(values)].sort();
  }, [rows, year]);
  const halves = useMemo(() => {
    const values = temporalRows.map((row) => halfFromFortnight(rowFortnight(row))).filter((value): value is 1 | 2 => value !== null);
    return [...new Set(values)].sort();
  }, [temporalRows]);
  const bases = useMemo(() => [...new Set(temporalRows.map(baseLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [temporalRows]);
  const statuses = useMemo(() => [...new Set(temporalRows.map((row) => cleanText(row.status)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [temporalRows]);

  return (
    <section className="filters-bar pnr-data-filters" aria-label="Filtros dos dados PNR">
      <label className="filter-control">
        <span>Ano</span>
        <select value={year} onChange={(event) => setYear(event.target.value)}>
          <option value="Todos">Todos</option>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="filter-control">
        <span>Mês</span>
        <select value={month} onChange={(event) => setMonth(event.target.value)}>
          <option value="Todos">Todos</option>
          {months.map((value) => <option key={value} value={value}>{MONTHS[Number(value) - 1] || value}</option>)}
        </select>
      </label>
      <label className="filter-control">
        <span>Quinzena</span>
        <select value={fortnight} onChange={(event) => setFortnight(event.target.value)}>
          <option value="Todas">Todas</option>
          {halves.includes(1) ? <option value="Q1">Quinzena 1 / Q1</option> : null}
          {halves.includes(2) ? <option value="Q2">Quinzena 2 / Q2</option> : null}
        </select>
      </label>
      <label className="filter-control pnr-data-filter--base">
        <span>Base</span>
        <select value={base} onChange={(event) => setBase(event.target.value)}>
          <option value="Todas">Todas</option>
          {bases.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="filter-control pnr-data-filter--status">
        <span>Status</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="Todos">Todos</option>
          {statuses.map((value) => <option key={value} value={normalizeText(value)}>{value}</option>)}
        </select>
      </label>
      <div className={searchOpen || search ? "pnr-data-search is-open" : "pnr-data-search"}>
        <div className="pnr-data-search__input">
          <Search size={13} />
          <input
            aria-label="Pesquisar nos dados PNR"
            placeholder="Caso, envio, rota, motorista..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <button
          className="pnr-data-search__toggle"
          type="button"
          aria-label={searchOpen || search ? "Fechar pesquisa" : "Pesquisar"}
          title={searchOpen || search ? "Fechar pesquisa" : "Pesquisar"}
          onClick={() => {
            if (searchOpen || search) {
              setSearch("");
              setSearchOpen(false);
            } else {
              setSearchOpen(true);
            }
          }}
        >
          {searchOpen || search ? <X size={15} /> : <Search size={15} />}
        </button>
      </div>
    </section>
  );
}
