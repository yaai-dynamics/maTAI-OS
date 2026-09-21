/**
 * 12 to 30 point sparkline for stat tiles.
 *
 * The line sits in a de-emphasised step and the final point takes the accent,
 * so the tile reads as "value + where it has been" without competing with the
 * number above it.
 */
export function Sparkline({
  values,
  ariaLabel,
  width = 96,
  height = 28,
}: {
  values: number[];
  ariaLabel: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 3;
  const usable = height - pad * 2;

  const coords = values.map((value, index) => ({
    x: index * stepX,
    y: pad + usable - ((value - min) / span) * usable,
  }));

  const path = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const last = coords.at(-1)!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      <path d={path} fill="none" stroke="var(--color-chart-muted)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={3} fill="var(--color-chart-1)" stroke="#ffffff" strokeWidth={1.5} />
    </svg>
  );
}
