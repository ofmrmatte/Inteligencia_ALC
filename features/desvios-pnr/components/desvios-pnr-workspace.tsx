import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownUp, ChevronLeft, ChevronRight, RefreshCw, Route, Search } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { toNumber, type PnrMetricRow, type PnrPageData, type PnrRecord, type PnrSortKey } from "@/features/desvios-pnr/domain";

function currency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(toNumber(value));
}

function compactCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
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

function statusTone(status: string | null): "neutral" | "success" | "warning" | "danger" {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("anulad") || normalized.includes("cancel")) return "success";
  if (normalized.includes("fatur") || normalized.includes("cobr")) return "danger";
  if (normalized.includes("aguard")) return "warning";
  return "neutral";
}

function paramsFromFilters(data: PnrPageData, overrides: Record<string, string | number>) {
  const params = new URLSearchParams();
  Object.entries(data.filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === "") params.delete(key);
    else params.set(key, String(value));
  });
  return `/desvios-pnr?${params.toString()}`;
}

function SortLink({ data, sort, children }: { data: PnrPageData; sort: PnrSortKey; children: ReactNode }) {
  const dir = data.filters.sort === sort && data.filters.dir === "desc" ? "asc" : "desc";
  return (
    <Link href={paramsFromFilters(data, { sort, dir, page: 1 })} prefetch className="table-sort">
      {children}
      <ArrowDownUp size={13} aria-hidden="true" />
    </Link>
  );
}

function PnrFilters({ data }: { data: PnrPageData }) {
  const filters = data.filters;
  const options = data.summary.filterOptions;
  return (
    <Card className="filter-panel">
      <form action="/desvios-pnr" className="filter-form filter-form--pnr">
        <label>
          <span>Busca</span>
          <input name="q" defaultValue={filters.q} placeholder="ID, rota, motorista, reclamacao ou status" />
        </label>
        <label>
          <span>Mes</span>
          <select name="mes" defaultValue={filters.mes}>
            <option value="">Todos</option>
            {data.summary.monthOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>Quinzena</span>
          <select name="quinzena" defaultValue={filters.quinzena}>
            <option value="">Todas</option>
            <option value="q1">1Q</option>
            <option value="q2">2Q</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={filters.status}>
            <option value="">Todos</option>
            {options.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Tipo operacional</span>
          <select name="tipo" defaultValue={filters.tipo}>
            <option value="">Todos</option>
            {options.tipos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Estacao</span>
          <select name="estacao" defaultValue={filters.estacao}>
            <option value="">Todas</option>
            {options.estacoes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Status motorista</span>
          <select name="statusMotorista" defaultValue={filters.statusMotorista}>
            <option value="">Todos</option>
            {options.statusMotoristas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Fonte</span>
          <select name="fonte" defaultValue={filters.fonte}>
            <option value="">Todas</option>
            {options.fontesCruzamento.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Motorista</span>
          <select name="motorista" defaultValue={filters.motorista}>
            <option value="">Todos</option>
            {options.motoristas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Rota</span>
          <select name="rota" defaultValue={filters.rota}>
            <option value="">Todas</option>
            {options.rotas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <input type="hidden" name="pageSize" value={filters.pageSize} />
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <div className="filter-form__actions">
          <Link href="/desvios-pnr" prefetch className="button button--ghost button--md">
            <span>Limpar</span>
          </Link>
          <Button type="submit" variant="primary" icon={<Search size={16} aria-hidden="true" />}>Atualizar</Button>
        </div>
      </form>
    </Card>
  );
}

function BarList({ title, rows, valueMode = "count" }: { title: string; rows: PnrMetricRow[]; valueMode?: "count" | "value" }) {
  if (!rows.length) {
    return <EmptyState title={title} description="Sem dados para o recorte atual." />;
  }
  const max = Math.max(...rows.map((row) => valueMode === "value" ? toNumber(row.totalValue) : row.count), 1);
  return (
    <Card className="ranking-card">
      <div className="section-header">
        <div>
          <span>Analise</span>
          <h2>{title}</h2>
        </div>
        <Route size={20} aria-hidden="true" />
      </div>
      <div className="bar-list">
        {rows.slice(0, 8).map((row) => {
          const rawValue = valueMode === "value" ? toNumber(row.totalValue) : row.count;
          return (
            <div className="bar-row" key={row.label}>
              <div>
                <span>{row.label || "Nao identificado"}</span>
                <strong>{valueMode === "value" ? compactCurrency(row.totalValue) : number(row.count)}</strong>
              </div>
              <div className="bar-row__track">
                <span style={{ width: `${Math.max(4, (rawValue / max) * 100)}%` }} />
              </div>
              <small>{row.share ? `${row.share.toFixed(1).replace(".", ",")}%` : row.detail || ""}</small>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Evolution({ data }: { data: PnrPageData }) {
  const rows = data.summary.evolutionRows.slice(-12);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <Card className="chart-panel chart-panel--wide">
      <div className="section-header">
        <div>
          <span>Evolucao</span>
          <h2>Volume por periodo</h2>
        </div>
      </div>
      <div className="chart-bars" aria-label="Volume PNR por periodo">
        {rows.map((row) => (
          <div className="chart-bars__item" key={row.key}>
            <span style={{ height: `${Math.max(8, (row.count / max) * 100)}%` }} />
            <strong>{number(row.count)}</strong>
            <small>{row.label}</small>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PnrTable({ data }: { data: PnrPageData }) {
  if (!data.rows.length) {
    return <EmptyState title="Nenhum PNR encontrado" description="Ajuste os filtros para consultar a base persistida." />;
  }

  return (
    <div className="data-table-shell">
      <table className="data-table data-table--pnr">
        <thead>
          <tr>
            <th>ID envio</th>
            <th>Produto / reclamacao</th>
            <th><SortLink data={data} sort="estacaoOrigem">Estacao</SortLink></th>
            <th>Rota</th>
            <th>Motorista</th>
            <th><SortLink data={data} sort="statusNormalizado">Status</SortLink></th>
            <th>Fonte</th>
            <th>Periodo</th>
            <th>Datas</th>
            <th className="is-right"><SortLink data={data} sort="valorCompraNumerico">Valor</SortLink></th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: PnrRecord) => (
            <tr key={row.id}>
              <td>
                <strong>{row.id_envio || "-"}</strong>
                <span>{row.dedupe_key || ""}</span>
              </td>
              <td>
                <strong>{row.produtos || "Produto nao informado"}</strong>
                <span>{row.id_reclamacao || ""}</span>
              </td>
              <td>{row.estacao_origem || row.tipo_base || "-"}</td>
              <td>{row.id_rota || "-"}</td>
              <td>
                <strong>{row.motorista_display || row.nome_motorista || row.id_motorista || "Sem motorista"}</strong>
                <span>{row.status_motorista || ""}</span>
              </td>
              <td><Badge tone={statusTone(row.status_normalizado)}>{row.status_normalizado || row.status_original || "Indefinido"}</Badge></td>
              <td>{row.fonte_cruzamento || "-"}</td>
              <td>
                <strong>{row.periodo_label || row.competencia || "-"}</strong>
                <span>{row.month_key || ""} {row.quinzena_key || ""}</span>
              </td>
              <td>
                <strong>{formatDate(row.data_caso)}</strong>
                <span>Entrega {formatDate(row.data_entrega)}</span>
              </td>
              <td className="is-right"><strong>{currency(row.valor_compra)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ data }: { data: PnrPageData }) {
  const current = data.filters.page;
  return (
    <nav className="pagination" aria-label="Paginacao de Desvios PNR">
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

export function DesviosPnrWorkspace({ data }: { data: PnrPageData }) {
  const summary = data.summary.summary;
  return (
    <div className="page-stack">
      {data.error ? <div className="inline-warning">Desvios PNR indisponivel agora: {data.error}</div> : null}

      <section className="metric-grid" aria-label="Resumo de Desvios PNR">
        <MetricCard label="PNRs filtrados" value={number(summary.count)} detail="total no recorte das RPCs" tone="accent" />
        <MetricCard label="Valor total" value={compactCurrency(summary.totalValue)} detail={`ticket medio ${currency(summary.ticketMedioGeral)}`} />
        <MetricCard label="Anulados" value={number(summary.anulado)} detail={compactCurrency(summary.valorAnulado)} />
        <MetricCard label="Faturamento" value={number(summary.faturamento)} detail={compactCurrency(summary.valorFaturado)} />
      </section>

      <div className="toolbar-row">
        <Link href={paramsFromFilters(data, { page: data.filters.page })} prefetch className="button button--secondary button--md">
          <RefreshCw size={16} aria-hidden="true" />
          <span>Atualizar</span>
        </Link>
        <span className="toolbar-row__note">Resumo, graficos e tabela respeitam os filtros atuais.</span>
      </div>

      <PnrFilters data={data} />

      <div className="dashboard-grid">
        <BarList title="Status PNR" rows={data.summary.statusRows} valueMode="value" />
        <BarList title="Estações com maior impacto" rows={data.summary.stationRows} valueMode="value" />
      </div>
      <div className="dashboard-grid">
        <BarList title="Drivers com maior volume" rows={data.summary.driverRows} />
        <BarList title="Tipo operacional" rows={data.summary.operationRows} />
      </div>
      <Evolution data={data} />

      <Card className="table-card">
        <div className="section-header">
          <div>
            <span>Tabela detalhada</span>
            <h2>Registros PNR persistidos</h2>
          </div>
          <Route size={20} aria-hidden="true" />
        </div>
        <PnrTable data={data} />
        <Pagination data={data} />
      </Card>
    </div>
  );
}
