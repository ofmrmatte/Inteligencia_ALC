import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { ImportPreFaturaButton } from "@/features/pre-fatura/components/import-pre-fatura-button";
import { toNumber, type PreFaturaPageData, type PreFaturaRecord, type PreFaturaSortKey } from "@/features/pre-fatura/domain";

function currency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(toNumber(value));
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function withPage(data: PreFaturaPageData, page: number) {
  const params = new URLSearchParams();
  Object.entries(data.filters).forEach(([key, value]) => {
    if (key === "page") return;
    if (value) params.set(key, String(value));
  });
  params.set("page", String(page));
  return `/pre-fatura?${params.toString()}`;
}

function sortHref(data: PreFaturaPageData, sort: PreFaturaSortKey) {
  const params = new URLSearchParams();
  Object.entries(data.filters).forEach(([key, value]) => {
    if (key === "page" || !value) return;
    params.set(key, String(value));
  });
  params.set("sort", sort);
  params.set("dir", data.filters.sort === sort && data.filters.dir === "desc" ? "asc" : "desc");
  params.set("page", "1");
  return `/pre-fatura?${params.toString()}`;
}

function SortLink({ data, sort, children }: { data: PreFaturaPageData; sort: PreFaturaSortKey; children: ReactNode }) {
  return (
    <Link href={sortHref(data, sort)} prefetch className="table-sort">
      {children}
      <ArrowDownUp size={13} aria-hidden="true" />
    </Link>
  );
}

function PreFaturaFilters({ data }: { data: PreFaturaPageData }) {
  const filters = data.filters;

  return (
    <Card className="filter-panel">
      <form action="/pre-fatura" className="filter-form">
        <label>
          <span>Busca</span>
          <input name="q" defaultValue={filters.q} placeholder="Driver, ID, rota, base ou placa" />
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
          <Link href="/pre-fatura" prefetch className="button button--ghost button--md">
            <span>Limpar</span>
          </Link>
          <Button type="submit" variant="primary">Atualizar</Button>
        </div>
      </form>
    </Card>
  );
}

function PreFaturaTable({ data }: { data: PreFaturaPageData }) {
  if (!data.rows.length) {
    return <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros ou importe uma planilha valida de Pre-Fatura." />;
  }

  return (
    <div className="data-table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th><SortLink data={data} sort="base">Base</SortLink></th>
            <th><SortLink data={data} sort="driver">Driver</SortLink></th>
            <th>Placa</th>
            <th>Tipo</th>
            <th>Aba</th>
            <th><SortLink data={data} sort="data">Data</SortLink></th>
            <th><SortLink data={data} sort="id_envio">ID do pacote</SortLink></th>
            <th><SortLink data={data} sort="rota">N rota</SortLink></th>
            <th className="is-right"><SortLink data={data} sort="valor">Desconto</SortLink></th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: PreFaturaRecord) => (
            <tr key={row.id}>
              <td>
                <strong>{row.base || "-"}</strong>
                <span>{row.codigo_base || ""}</span>
              </td>
              <td>{row.driver || "-"}</td>
              <td>{row.placa || "-"}</td>
              <td>{row.tipo || "-"}</td>
              <td>{row.aba_origem || "-"}</td>
              <td>{formatDate(row.data)}</td>
              <td>{row.id_envio || "-"}</td>
              <td>{row.rota || "-"}</td>
              <td className="is-right"><strong>{currency(row.valor)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ data }: { data: PreFaturaPageData }) {
  const current = data.filters.page;
  return (
    <nav className="pagination" aria-label="Paginacao da Pre-Fatura">
      <span>
        Pagina {current.toLocaleString("pt-BR")} de {data.totalPages.toLocaleString("pt-BR")} · {data.totalRows.toLocaleString("pt-BR")} registros
      </span>
      <div>
        <Link className="icon-button" href={withPage(data, Math.max(1, current - 1))} aria-disabled={current <= 1} prefetch>
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
        <Link className="icon-button" href={withPage(data, Math.min(data.totalPages, current + 1))} aria-disabled={current >= data.totalPages} prefetch>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}

export function PreFaturaWorkspace({ data }: { data: PreFaturaPageData }) {
  return (
    <div className="page-stack">
      {data.error ? <div className="inline-warning">Pre-Fatura indisponivel agora: {data.error}</div> : null}

      <section className="metric-grid" aria-label="Resumo da Pre-Fatura">
        <MetricCard label="Valor filtrado" value={currency(data.summary.totalValue)} detail="soma dos registros validos" tone="accent" />
        <MetricCard label="Registros" value={data.summary.totalRows.toLocaleString("pt-BR")} detail="linhas persistidas" />
        <MetricCard label="IDs de envio" value={data.summary.packageIds.toLocaleString("pt-BR")} detail="identidades unicas" />
        <MetricCard label="Ticket medio" value={currency(data.summary.averageValue)} detail={`${data.summary.bases.toLocaleString("pt-BR")} bases`} />
      </section>

      <div className="toolbar-row">
        <ImportPreFaturaButton />
        <Button type="button" variant="secondary" icon={<Download size={16} aria-hidden="true" />} disabled>
          Exportar
        </Button>
        <span className="toolbar-row__note">Upload valida identidade, remove totais e grava somente registros validos.</span>
      </div>

      <PreFaturaFilters data={data} />
      <Card className="table-card">
        <div className="section-header">
          <div>
            <span>Registros</span>
            <h2>Pre-Fatura persistida</h2>
          </div>
          <Upload size={20} aria-hidden="true" />
        </div>
        <PreFaturaTable data={data} />
        <Pagination data={data} />
      </Card>
    </div>
  );
}
