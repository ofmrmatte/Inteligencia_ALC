export type BarListItem = {
  label: string;
  value: number;
  hint?: string;
};

type BarListChartProps = {
  items: BarListItem[];
  formatValue: (value: number) => string;
};

export function BarListChart({ items, formatValue }: BarListChartProps) {
  if (!items.length) return null;
  const max = Math.max(...items.map((item) => item.value)) || 1;

  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.label} className="bar-list__item">
          <div className="bar-list__meta">
            <span className="bar-list__label">{item.label}</span>
            <strong className="bar-list__value">{formatValue(item.value)}</strong>
          </div>
          <div className="bar-list__track" aria-hidden="true">
            <span style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }} />
          </div>
          {item.hint ? <span className="bar-list__hint">{item.hint}</span> : null}
        </li>
      ))}
    </ul>
  );
}
