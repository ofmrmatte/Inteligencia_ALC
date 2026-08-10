import { cn } from "@/lib/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function MetricCardSkeleton() {
  return (
    <div className="metric-card metric-card--skeleton">
      <Skeleton className="skeleton--label" />
      <Skeleton className="skeleton--value" />
      <Skeleton className="skeleton--line" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="table-skeleton" aria-hidden="true">
      <Skeleton className="table-skeleton__header" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="table-skeleton__row" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page-stack">
      <Skeleton className="skeleton--title" />
      <div className="metric-grid">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}
