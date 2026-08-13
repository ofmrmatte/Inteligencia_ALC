export type AreaLinePoint = {
  key: string;
  label: string;
  value: number;
};

type AreaLineChartProps = {
  points: AreaLinePoint[];
  formatValue: (value: number) => string;
  ariaLabel: string;
};

const WIDTH = 560;
const HEIGHT = 180;
const PADDING_X = 12;
const PADDING_Y = 16;

export function AreaLineChart({ points, formatValue, ariaLabel }: AreaLineChartProps) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const innerWidth = WIDTH - PADDING_X * 2;
  const innerHeight = HEIGHT - PADDING_Y * 2;

  const coordinates = points.map((point, index) => {
    const x = PADDING_X + (innerWidth * index) / (points.length - 1);
    const y = PADDING_Y + innerHeight - ((point.value - min) / span) * innerHeight;
    return { ...point, x, y };
  });

  const line = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${PADDING_X},${PADDING_Y + innerHeight} ${line} ${PADDING_X + innerWidth},${PADDING_Y + innerHeight}`;

  return (
    <figure className="chart">
      <svg
        className="chart__canvas"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <polygon className="chart__area" points={area} />
        <polyline className="chart__line" points={line} />
        {coordinates.map((point) => (
          <circle key={point.key} className="chart__dot" cx={point.x} cy={point.y} r={3}>
            <title>{`${point.label}: ${formatValue(point.value)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="chart__axis">
        {coordinates.map((point) => (
          <span key={point.key}>{point.label}</span>
        ))}
      </figcaption>
    </figure>
  );
}
