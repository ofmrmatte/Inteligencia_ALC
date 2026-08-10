import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  trend?: string;
  icon?: ReactNode;
  tone?: "default" | "accent";
};

export function MetricCard({ label, value, detail, trend, icon, tone = "default" }: MetricCardProps) {
  return (
    <article className={cn("metric-card", tone === "accent" && "metric-card--accent")}>
      <div className="metric-card__top">
        <span>{label}</span>
        {icon ? <div className="metric-card__icon">{icon}</div> : null}
      </div>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
      {trend ? <small>{trend}</small> : null}
    </article>
  );
}
