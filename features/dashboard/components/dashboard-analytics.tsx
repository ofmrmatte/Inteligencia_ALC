import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, PieChart, Target, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { AreaLineChart } from "@/features/dashboard/components/charts/area-line-chart";
import { BarListChart } from "@/features/dashboard/components/charts/bar-list-chart";
import { GroupedBarsChart } from "@/features/dashboard/components/charts/grouped-bars-chart";
import type { DashboardAnalytics } from "@/features/dashboard/data/analytics";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function formatCurrency(value: number) {
  return currency.format(value);
}

function formatCount(value: number) {
  return integer.format(value);
}

export function DashboardAnalyticsSection({ analytics }: { analytics: DashboardAnalytics }) {
  const hasMonthly = analytics.monthlyValues.length > 1;
  const hasPnrTrend = analytics.pnrTrend.length > 1;

  return (
    <section className="analytics-grid" aria-label="Graficos e rankings">
      {analytics.error ? (
        <div className="inline-warning analytics-grid__full">
          Graficos indisponiveis agora: {analytics.error}
        </div>
      ) : null}

      <Card className="chart-card analytics-grid__wide">
        <div className="section-header">
          <div>
            <span>Evolucao</span>
            <h2>Valor por competencia</h2>
          </div>
          <Activity size={20} aria-hidden="true" />
        </div>
        {hasMonthly ? (
          <AreaLineChart
            points={analytics.monthlyValues}
            formatValue={formatCurrency}
            ariaLabel="Evolucao mensal do valor consolidado da pre-fatura"
          />
        ) : (
          <EmptyState
            title="Sem historico suficiente"
            description="E preciso ter pelo menos duas competencias importadas para desenhar a evolucao."
          />
        )}
      </Card>

      <Card className="chart-card">
        <div className="section-header">
          <div>
            <span>Composicao</span>
            <h2>Valor por tipo</h2>
          </div>
          <PieChart size={20} aria-hidden="true" />
        </div>
        {analytics.categoryMix.length ? (
          <BarListChart
            items={analytics.categoryMix.map((slice) => ({
              label: slice.label,
              value: slice.value,
              hint: `${slice.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`,
            }))}
            formatValue={formatCurrency}
          />
        ) : (
          <EmptyState title="Sem dados de tipo" description="Nenhum registro classificado foi encontrado." />
        )}
      </Card>

      <Card className="chart-card analytics-grid__wide">
        <div className="section-header">
          <div>
            <span>Meta</span>
            <h2>Previsto x realizado</h2>
          </div>
          <Target size={20} aria-hidden="true" />
        </div>
        {analytics.goalComparison.length ? (
          <GroupedBarsChart items={analytics.goalComparison} formatValue={formatCurrency} />
        ) : (
          <EmptyState
            title="Sem comparativo"
            description="Defina a meta mensal em Configuracoes para comparar com o realizado."
          />
        )}
      </Card>

      <Card className="chart-card">
        <div className="section-header">
          <div>
            <span>Desvios PNR</span>
            <h2>Tendencia de casos</h2>
          </div>
          <TriangleAlert size={20} aria-hidden="true" />
        </div>
        {hasPnrTrend ? (
          <AreaLineChart
            points={analytics.pnrTrend.map((point) => ({ key: point.key, label: point.label, value: point.count }))}
            formatValue={formatCount}
            ariaLabel="Tendencia mensal de desvios PNR"
          />
        ) : (
          <EmptyState title="Sem tendencia" description="Importe mais de um periodo de desvios PNR." />
        )}
      </Card>

      <Card className="chart-card">
        <div className="section-header">
          <div>
            <span>Ranking</span>
            <h2>Maior variacao vs mes anterior</h2>
          </div>
          <BarChart3 size={20} aria-hidden="true" />
        </div>
        {analytics.variation.length ? (
          <ul className="variation-list">
            {analytics.variation.map((row) => {
              const positive = row.delta >= 0;
              return (
                <li key={row.label} className="variation-list__row">
                  <div className="variation-list__meta">
                    <strong>{row.label}</strong>
                    <span>
                      {analytics.previousPeriodLabel ? `${analytics.previousPeriodLabel} ` : ""}
                      {formatCurrency(row.previous)}
                      {" -> "}
                      {analytics.currentPeriodLabel ? `${analytics.currentPeriodLabel} ` : ""}
                      {formatCurrency(row.current)}
                    </span>
                  </div>
                  <span className={`delta-chip ${positive ? "delta-chip--up" : "delta-chip--down"}`}>
                    {positive ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
                    {row.deltaPercent === null
                      ? formatCurrency(row.delta)
                      : `${positive ? "+" : ""}${row.deltaPercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Sem variacao" description="Duas competencias sao necessarias para comparar." />
        )}
      </Card>

      <Card className="chart-card">
        <div className="section-header">
          <div>
            <span>Ranking</span>
            <h2>Motoristas mais ofensores</h2>
          </div>
          <TriangleAlert size={20} aria-hidden="true" />
        </div>
        {analytics.offenders.length ? (
          <BarListChart
            items={analytics.offenders.map((row) => ({
              label: row.label,
              value: row.count,
              hint: `${row.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos desvios`,
            }))}
            formatValue={(value) => `${formatCount(value)} casos`}
          />
        ) : (
          <EmptyState title="Sem ofensores" description="Nenhum desvio PNR atribuido a motorista foi encontrado." />
        )}
      </Card>
    </section>
  );
}
