import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value || 0);
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0)}%`;
}

export function KpiCard({ label, value, detail, icon, tone = "neutral", delta }: { label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "red" | "green" | "amber"; delta?: number }) {
  const DeltaIcon = delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <article className={`kpi-card kpi-card--${tone}`}>
      <div className="kpi-card__head"><span>{label}</span><i>{icon}</i></div>
      <strong>{value}</strong>
      <div className="kpi-card__foot">
        {delta !== undefined && <span className={delta > 0 ? "delta delta--up" : delta < 0 ? "delta delta--down" : "delta"}><DeltaIcon size={13} />{Math.abs(delta).toFixed(1)}%</span>}
        <small>{detail}</small>
      </div>
    </article>
  );
}

export function Panel({ title, subtitle, action, className = "", children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel__head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "red" | "green" | "amber" | "blue" }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}

export function PageIntro({ description, chips = [] }: { description: string; chips?: string[] }) {
  return (
    <div className="page-intro">
      <p>{description}</p>
      <div>{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
    </div>
  );
}
