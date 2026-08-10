import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toNumber, type GestaoPacotesPageData, type GestaoPacotesRecord, type GestaoPacotesSortKey } from "@/features/gestao-pacotes/domain";
import { ImportGestaoPacotesButton } from "@/features/gestao-pacotes/components/import-gestao-pacotes-button";

function currency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(toNumber(value));
}

function number(value: number) {
  return value.toLocaleString("pt-BR");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function badgeTone(value: string | null): "neutral" | "success" | "warning" | "danger" {
  if (value === "DISPATCHER") return "warning";
  if (value === "DRIVER") return "danger";
  if (value === "ALC") return "success";
  return "neutral";
}

function paramsFromFilters(data: GestaoPacotesPageData, overrides: Record<string, string | number>) {
  const params = new URLSearchParams();
  Object.entries(data.filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === "") params.delete(key);
    else params.set(key, String(value));
  });
  return `/gestao-pacotes?${params.toString()}`;
}

function SortLink({ data, sort, children }: { data: GestaoPacotesPageData; sort: GestaoPacotesSortKey; children: ReactNode }) {
  const dir = data.filters.sort === sort && data.filters.dir === "desc" ? "asc" : "desc";
  return (
    <Link href={paramsFromFilters(data, { sort, dir, page: 1 })} prefetch className="table-sort">
      {children}
      <ArrowDownUp size={13} aria-hidden="true" />
    </Link>
  );
}

function GestaoPacotesFilters({ data }: { data: GestaoPacotesPageData }) {
  const filters = data.filters;
  return (
    <Card className="filter-panel">
      <form action="/gestao-pacotes" className="filter-form filter-form--wide">
        <label>
          <span>Busca</span>
          <input name="q" defaultValue={filters.q} placeholder="ID, rota, driver, base ou decisao" />
        </label>
        <label>
          <span>Competencia</span>
          <select name="competencia" defaultValue={filters.competencia}>
            <option value="">Todas</option>
            {data.options.competencias.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Quinzena</span>
          <select name="quinzena" defaultValue={filters.quinzena}>
            <option value="">Todas</option>
            {data.options.quinzenas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Tipo</span>
          <select name="tipo" defaultValue={filters.tipo}>
            <option value="">Todos</option>
            {data.options.tipos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Desconto</span>
          <select name="desconto" defaultValue={filters.desconto}>
            <option value="">Todos</option>
            {data.options.descontos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Base</span>
          <select name="base" defaultValue={filters.base}>
            <option value="">Todas</option>
            {data.options.bases.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <input type="hidden" name="pageSize" value={filters.pageSize} />
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <div className="filter-form__actions">
          <Link href="/gestao-pacotes" prefetch className="button button--ghost button--md">
            <span>Limpar</span>
          </Link>
          <Button type="submit" variant="primary">Atualizar</Button>
        </div>
      </form>
    </Card>
  );
}

function DecisionMix({ data }: { data: GestaoPacotesPageData }) {
  if (!data.summary.decisionRows.length) {
    return <EmptyState title="Sem mix para exibir" description="Nenhuma decisao encontrada no recorte atual." />;
  }

  return (
    <Card className="ranking-card">
      <div className="section-header">
        <div>
          <span>Resumo operacional</span>
          <h2>Decisoes e bases</h2>
        </div>
        <PackageCheck size={20} aria-hidden="true" />
      </div>
      <div className="split-grid">
        <div className="bar-list">
          {data.summary.decisionRows.map((row) => (
            <div className="bar-row" key={row.label}>
              <div>
                <span>{row.label}</span>
                <strong>{currency(row.value)}</strong>
              </div>
              <div className="bar-row__track">
                <span style={{ width: `${Math.min(100, row.share)}%` }} />
              </div>
              <small>{number(row.count)} registros</small>
            </div>
          ))}
        </div>
        <div className="ranking-list">
          {data.summary.topBases.map((row) => (
            <div className="ranking-list__row" key={row.label}>
              <span>{row.label}</span>
              <strong>{currency(row.value)}</strong>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function GestaoPacotesTable({ data }: { data: GestaoPacotesPageData }) {
  if (!data.rows.length) {
    return <EmptyState title="Nenhum pacote encontrado" description="Ajuste os filtros ou importe arquivos validos de Gestao de Pacotes." />;
  }

  return (
    <div className="data-table-shell">
      <table className="data-table data-table--wide">
        <thead>
          <tr>
            <th><SortLink data={data} sort="base">Base</SortLink></th>
            <th><SortLink data={data} sort="driver">Driver</SortLink></th>
            <th><SortLink data={data} sort="id_envio">ID pacote</SortLink></th>
            <th><SortLink data={data} sort="rota">Rota</SortLink></th>
            <th><SortLink data={data} sort="data">Data</SortLink></th>
            <th>Tipo</th>
            <th><SortLink data={data} sort="desconto">Decisao</SortLink></th>
            <th>Observacao</th>
            <th className="is-right"><SortLink data={data} sort="valor">Valor</SortLink></th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: GestaoPacotesRecord) => (
            <tr key={row.id}>
              <td>
                <strong>{row.base || row.codigo_base || "-"}</strong>
                <span>{row.codigo_base || ""}</span>
              </td>
              <td>{row.driver || "Nao identificado"}</td>
              <td>
                <strong>{row.id_envio || "-"}</strong>
                <span>{row.aba_origem || ""}</span>
              </td>
              <td>{row.rota || "-"}</td>
              <td>{formatDate(row.data)}</td>
              <td>{row.tipo || "-"}</td>
              <td>
                <Badge tone={badgeTone(row.desconto)}>{row.desconto || "Indefinido"}</Badge>
                <span>{row.decisao_adm || ""}</span>
              </td>
              <td>{row.observacao || "-"}</td>
              <td className="is-right"><strong>{currency(row.valor)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ data }: { data: GestaoPacotesPageData }) {
  const current = data.filters.page;
  return (
    <nav className="pagination" aria-label="Paginacao da Gestao de Pacotes">
      <span>
        Pagina {number(current)} de {number(data.totalPages)} · {number(data.totalRows)} registros
      </span>
      <div>
        <Link className="icon-button" href={paramsFromFilters(data, { page: Math.max(1, current - 1) })} aria-disabled={current <= 1} prefetch>
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
        <Link className="icon-button" href={paramsFromFilters(data, { page: Math.min(data.totalPages, current + 1) })} aria-disabled={current >= data.totalPages} prefetch>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}

export function GestaoPacotesWorkspace({ data }: { data: GestaoPacotesPageData }) {
  return (
    <div className="page-stack">
      {data.error ? <div className="inline-warning">Gestao de Pacotes indisponivel agora: {data.error}</div> : null}

      <section className="metric-grid" aria-label="Resumo de Gestao de Pacotes">
        <MetricCard label="Valor filtrado" value={currency(data.summary.totalValue)} detail="soma dos registros persistidos" tone="accent" />
        <MetricCard label="Registros" value={number(data.summary.totalRows)} detail={`${number(data.summary.packageIds)} IDs de pacote`} />
        <MetricCard label="Dispatcher" value={currency(data.summary.dispatcherValue)} detail="direcionado ao dispatcher" />
        <MetricCard label="Driver / ALC" value={`${currency(data.summary.driverValue)} / ${currency(data.summary.alcValue)}`} detail={`${number(data.summary.bases)} bases no recorte`} />
      </section>

      <div className="toolbar-row">
        <ImportGestaoPacotesButton />
        <Button type="button" variant="secondary" icon={<Download size={16} aria-hidden="true" />} disabled>
          Exportar
        </Button>
        <span className="toolbar-row__note">Registros validados por identidade do pacote e evento operacional.</span>
      </div>

      <GestaoPacotesFilters data={data} />
      <DecisionMix data={data} />
      <Card className="table-card">
        <div className="section-header">
          <div>
            <span>Pacotes</span>
            <h2>Eventos persistidos</h2>
          </div>
          <PackageCheck size={20} aria-hidden="true" />
        </div>
        <GestaoPacotesTable data={data} />
        <Pagination data={data} />
      </Card>
    </div>
  );
}
