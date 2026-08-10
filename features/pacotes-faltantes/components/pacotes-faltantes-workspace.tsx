import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, PackageX, Search } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { MissingPackageStatusControl } from "@/features/pacotes-faltantes/components/missing-package-status-control";
import {
  deadlineStatus,
  type MissingPackagePageData,
  type MissingPackageRecord,
  type MissingPackageSortKey,
} from "@/features/pacotes-faltantes/domain";

function number(value: number) {
  return value.toLocaleString("pt-BR");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function statusTone(value: string | null): "neutral" | "success" | "warning" | "danger" {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("conclu")) return "success";
  if (normalized.includes("venc")) return "danger";
  if (normalized.includes("aguard") || normalized.includes("proximo") || normalized.includes("próximo")) return "warning";
  return "neutral";
}

function paramsFromFilters(data: MissingPackagePageData, overrides: Record<string, string | number>) {
  const params = new URLSearchParams();
  Object.entries(data.filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === "") params.delete(key);
    else params.set(key, String(value));
  });
  return `/pacotes-faltantes?${params.toString()}`;
}

function exportHref(data: MissingPackagePageData) {
  const params = new URLSearchParams();
  Object.entries(data.filters).forEach(([key, value]) => {
    if (key !== "page" && value) params.set(key, String(value));
  });
  return `/api/exports/pacotes-faltantes?${params.toString()}`;
}

function SortLink({ data, sort, children }: { data: MissingPackagePageData; sort: MissingPackageSortKey; children: ReactNode }) {
  const dir = data.filters.sort === sort && data.filters.dir === "desc" ? "asc" : "desc";
  return (
    <Link href={paramsFromFilters(data, { sort, dir, page: 1 })} prefetch className="table-sort">
      {children}
      <ArrowDownUp size={13} aria-hidden="true" />
    </Link>
  );
}

function MissingPackageFilters({ data }: { data: MissingPackagePageData }) {
  const filters = data.filters;
  return (
    <Card className="filter-panel">
      <form action="/pacotes-faltantes" className="filter-form filter-form--wide">
        <label>
          <span>Busca</span>
          <input name="q" defaultValue={filters.q} placeholder="ID, driver, base, caso ou arquivo" />
        </label>
        <label>
          <span>Base</span>
          <select name="base" defaultValue={filters.base}>
            <option value="">Todas</option>
            {data.options.bases.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Status caso</span>
          <select name="statusCaso" defaultValue={filters.statusCaso}>
            <option value="">Todos</option>
            {data.options.statusCasos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Status MELI</span>
          <select name="statusContato" defaultValue={filters.statusContato}>
            <option value="">Todos</option>
            {data.options.statusContatos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Prazo</span>
          <select name="prazo" defaultValue={filters.prazo}>
            <option value="">Todos</option>
            {data.options.prazos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <input type="hidden" name="pageSize" value={filters.pageSize} />
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <div className="filter-form__actions">
          <Link href="/pacotes-faltantes" prefetch className="button button--ghost button--md">
            <span>Limpar</span>
          </Link>
          <Button type="submit" variant="primary" icon={<Search size={16} aria-hidden="true" />}>Atualizar</Button>
        </div>
      </form>
    </Card>
  );
}

function MissingPackagesTable({ data, canManage }: { data: MissingPackagePageData; canManage: boolean }) {
  if (!data.rows.length) {
    return <EmptyState title="Nenhum pacote faltante encontrado" description="A tabela persistida ainda nao tem registros para este recorte." />;
  }

  return (
    <div className="data-table-shell">
      <table className="data-table data-table--wide">
        <thead>
          <tr>
            <th><SortLink data={data} sort="data_fechamento">Fechamento</SortLink></th>
            <th><SortLink data={data} sort="base">Base</SortLink></th>
            <th><SortLink data={data} sort="driver_nome">Driver</SortLink></th>
            <th><SortLink data={data} sort="id_envio">ID envio</SortLink></th>
            <th>Caso</th>
            <th>Status</th>
            <th><SortLink data={data} sort="prazo_tratativa">Prazo</SortLink></th>
            <th>Arquivo</th>
            {canManage ? <th>Acoes</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: MissingPackageRecord) => {
            const prazo = deadlineStatus(row);
            return (
              <tr key={row.id}>
                <td>{formatDate(row.data_fechamento)}</td>
                <td>
                  <strong>{row.base || "-"}</strong>
                  <span>{row.tipo_base || ""}</span>
                </td>
                <td>{row.driver_nome || "Nao identificado"}</td>
                <td><strong>{row.id_envio || "-"}</strong></td>
                <td>
                  <strong>{row.caso || "Pacote faltante"}</strong>
                  <span>{row.motivo_original || ""}</span>
                </td>
                <td>
                  <Badge tone={statusTone(row.status_caso)}>{row.status_caso || "Pendente"}</Badge>
                  <span>{row.status_contato_meli || "E-mail Enviado"}</span>
                </td>
                <td>
                  <Badge tone={statusTone(prazo)}>{prazo}</Badge>
                  <span>{formatDate(row.prazo_tratativa)}</span>
                </td>
                <td>{row.file_name || "-"}</td>
                {canManage ? (
                  <td>
                    <MissingPackageStatusControl id={row.id} statusCaso={row.status_caso} statusContato={row.status_contato_meli} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ data }: { data: MissingPackagePageData }) {
  const current = data.filters.page;
  return (
    <nav className="pagination" aria-label="Paginacao de Pacotes Faltantes">
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

export function PacotesFaltantesWorkspace({ data, canManage }: { data: MissingPackagePageData; canManage: boolean }) {
  return (
    <div className="page-stack">
      {data.error ? <div className="inline-warning">Pacotes Faltantes indisponivel agora: {data.error}</div> : null}

      <section className="metric-grid" aria-label="Resumo de Pacotes Faltantes">
        <MetricCard label="Registros" value={number(data.summary.totalRows)} detail="linhas persistidas" tone="accent" />
        <MetricCard label="Pendentes" value={number(data.summary.pending)} detail={`${number(data.summary.completed)} concluidos`} />
        <MetricCard label="Vencidos" value={number(data.summary.expired)} detail={`${number(data.summary.nearDeadline)} proximos do vencimento`} />
        <MetricCard label="Bases / drivers" value={`${number(data.summary.bases)} / ${number(data.summary.drivers)}`} detail="escopo operacional" />
      </section>

      <div className="toolbar-row">
        <Link href={exportHref(data)} className="button button--secondary button--md">
          <Download size={16} aria-hidden="true" />
          <span>Exportar XLSX</span>
        </Link>
        <span className="toolbar-row__note">Usuarios autenticados consultam e exportam; alteracoes sao restritas a admin.</span>
      </div>

      <MissingPackageFilters data={data} />

      <Card className="ranking-card">
        <div className="section-header">
          <div>
            <span>Operacao</span>
            <h2>Status e bases</h2>
          </div>
          <PackageX size={20} aria-hidden="true" />
        </div>
        <div className="split-grid">
          <div className="ranking-list">
            {data.summary.statusRows.length ? data.summary.statusRows.map((row) => (
              <div className="ranking-list__row" key={row.label}>
                <span>{row.label}</span>
                <strong>{number(row.count)}</strong>
              </div>
            )) : <EmptyState title="Sem status" description="Sem registros para agregar." />}
          </div>
          <div className="ranking-list">
            {data.summary.topBases.length ? data.summary.topBases.map((row) => (
              <div className="ranking-list__row" key={row.label}>
                <span>{row.label}</span>
                <strong>{number(row.count)}</strong>
              </div>
            )) : <EmptyState title="Sem bases" description="Sem bases para o recorte." />}
          </div>
        </div>
      </Card>

      <Card className="table-card">
        <div className="section-header">
          <div>
            <span>Pacotes</span>
            <h2>Tratativas persistidas</h2>
          </div>
          <PackageX size={20} aria-hidden="true" />
        </div>
        <MissingPackagesTable data={data} canManage={canManage} />
        <Pagination data={data} />
      </Card>
    </div>
  );
}
