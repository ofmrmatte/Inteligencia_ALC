export type GroupedBarsItem = {
  key: string;
  label: string;
  realized: number;
  planned: number | null;
};

type GroupedBarsChartProps = {
  items: GroupedBarsItem[];
  formatValue: (value: number) => string;
};

export function GroupedBarsChart({ items, formatValue }: GroupedBarsChartProps) {
  if (!items.length) return null;
  const max = Math.max(
    ...items.map((item) => Math.max(item.realized, item.planned ?? 0)),
  ) || 1;

  return (
    <div className="grouped-bars">
      <div className="grouped-bars__plot">
        {items.map((item) => {
          const delta = item.planned === null ? null : item.realized - item.planned;
          const deltaLabel = delta === null
            ? "sem meta definida"
            : `${delta >= 0 ? "acima" : "abaixo"} da meta em ${formatValue(Math.abs(delta))}`;
          return (
            <div key={item.key} className="grouped-bars__group">
              <div className="grouped-bars__columns">
                <span
                  className="grouped-bars__bar grouped-bars__bar--realized"
                  style={{ height: `${Math.max((item.realized / max) * 100, 2)}%` }}
                  title={`${item.label} realizado: ${formatValue(item.realized)} (${deltaLabel})`}
                />
                {item.planned === null ? null : (
                  <span
                    className="grouped-bars__bar grouped-bars__bar--planned"
                    style={{ height: `${Math.max((item.planned / max) * 100, 2)}%` }}
                    title={`${item.label} meta: ${formatValue(item.planned)}`}
                  />
                )}
              </div>
              <span className="grouped-bars__label">{item.label}</span>
            </div>
          );
        })}
      </div>
      <div className="chart-legend">
        <span className="chart-legend__item chart-legend__item--realized">Realizado</span>
        <span className="chart-legend__item chart-legend__item--planned">Meta</span>
      </div>
    </div>
  );
}
