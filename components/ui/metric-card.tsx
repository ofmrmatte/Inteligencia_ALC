import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "default" | "accent";
};

export function MetricCard({ label, value, detail, icon, tone = "default" }: MetricCardProps) {
  return (
    <article className={cn("metric-card", tone === "accent" && "metric-card--accent")}>
      <div className="metric-card__top">
        <span>{label}</span>
        {icon ? <div className="metric-card__icon">{icon}</div> : null}
      </div>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}
