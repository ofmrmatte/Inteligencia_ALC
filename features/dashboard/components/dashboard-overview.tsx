import Link from "next/link";
import { ArrowRight, Database, FileClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { dashboardRoutes } from "@/lib/constants/routes";
import type { DashboardSummary } from "@/features/dashboard/data/summary";

export function DashboardOverview({ summary }: { summary: DashboardSummary }) {
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
            tone={index === 0 ? "accent" : "default"}
            icon={<Database size={18} aria-hidden="true" />}
          />
        ))}
      </section>

      <section className="dashboard-grid">
        <Card className="module-shortcuts">
          <div className="section-header">
            <div>
              <span>Modulos</span>
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
                    <span>{file.file_type || "tipo nao informado"}</span>
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
