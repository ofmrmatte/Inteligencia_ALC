import Link from "next/link";
import { ArrowRight, BarChart3, Database, FileClock, ReceiptText, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { dashboardRoutes } from "@/lib/constants/routes";
import type { DashboardSummary } from "@/features/dashboard/data/summary";

export function DashboardOverview({ summary }: { summary: DashboardSummary }) {
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const goalPercent = summary.preFatura.monthlyGoal
    ? Math.min((summary.preFatura.totalValue / summary.preFatura.monthlyGoal) * 100, 999)
    : null;

  return (
    <div className="page-stack">
      {summary.error ? (
        <div className="inline-warning">
          Indicadores reais indisponiveis agora: {summary.error}
        </div>
      ) : null}

      <section className="metric-grid" aria-label="Indicadores operacionais">
        {summary.metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            trend={metric.trend}
            tone={index === 0 ? "accent" : "default"}
            icon={<Database size={18} aria-hidden="true" />}
          />
        ))}
      </section>

      <section className="dashboard-grid">
        <Card className="operation-panel">
          <div className="section-header">
            <div>
              <span>Pré-Fatura</span>
              <h2>Visao operacional</h2>
            </div>
            <ReceiptText size={20} aria-hidden="true" />
          </div>
          <div className="operation-panel__stats">
            <div>
              <span>Valor consolidado</span>
              <strong>{currency.format(summary.preFatura.totalValue)}</strong>
            </div>
            <div>
              <span>IDs de envio</span>
              <strong>{summary.preFatura.packageIds.toLocaleString("pt-BR")}</strong>
            </div>
            <div>
              <span>Bases</span>
              <strong>{summary.preFatura.bases.toLocaleString("pt-BR")}</strong>
            </div>
            <div>
              <span>Rotas</span>
              <strong>{summary.preFatura.routes.toLocaleString("pt-BR")}</strong>
            </div>
          </div>
          {goalPercent !== null ? (
            <div className="goal-line" aria-label={`Meta mensal utilizada em ${goalPercent.toFixed(1)}%`}>
              <div>
                <span>Meta mensal PNR</span>
                <strong>{goalPercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
              </div>
              <div className="goal-line__track">
                <span style={{ width: `${Math.min(goalPercent, 100)}%` }} />
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="ranking-card">
          <div className="section-header">
            <div>
              <span>Ranking</span>
              <h2>Bases com maior valor</h2>
            </div>
            <BarChart3 size={20} aria-hidden="true" />
          </div>
          <div className="ranking-list">
            {summary.preFatura.topBases.map((item) => (
              <div key={item.label} className="ranking-list__row">
                <span>{item.label}</span>
                <strong>{currency.format(item.value)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card className="ranking-card">
          <div className="section-header">
            <div>
              <span>Drivers</span>
              <h2>Maiores impactos</h2>
            </div>
            <Route size={20} aria-hidden="true" />
          </div>
          <div className="ranking-list">
            {summary.preFatura.topDrivers.map((item) => (
              <div key={item.label} className="ranking-list__row">
                <span>{item.label}</span>
                <strong>{currency.format(item.value)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card className="module-shortcuts">
          <div className="section-header">
            <div>
              <span>Módulos</span>
              <h2>Acesso operacional</h2>
            </div>
          </div>
          <div className="module-shortcuts__grid">
            {dashboardRoutes.map((route) => (
              <Link key={route.href} href={route.href} prefetch className="module-shortcut">
                <route.icon size={20} aria-hidden="true" />
                <span>{route.label}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="recent-activity">
          <div className="section-header">
            <div>
              <span>Atividade</span>
              <h2>Arquivos recentes</h2>
            </div>
            <FileClock size={20} aria-hidden="true" />
          </div>

          {summary.recentFiles.length ? (
            <div className="activity-list">
              {summary.recentFiles.map((file) => (
                <div key={file.id} className="activity-list__item">
                  <div>
                    <strong>{file.file_name || "Arquivo sem nome"}</strong>
                    <span>{file.file_type || "tipo não informado"}</span>
                  </div>
                  <Badge tone={file.status === "processed" ? "success" : "neutral"}>{file.status || "registrado"}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem atividade recente" description="Nenhum arquivo recente foi retornado pelo banco." />
          )}
        </Card>
      </section>
    </div>
  );
}
