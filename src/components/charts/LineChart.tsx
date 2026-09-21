'use client';

import { useMemo, useState } from 'react';
import { formatShortDate } from '@/lib/date';

/**
 * Single series trend line.
 *
 * One series, so no legend box: the chart title names what is plotted. Mark
 * spec is 2px line, ~10 percent area wash, hairline grid, an 8px end marker
 * with a 2px surface ring, and a direct label only at the end point.
 */

export interface LinePoint {
  /** ISO date or any short label. */
  label: string;
  value: number;
}

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 14, right: 56, bottom: 26, left: 40 };

/** Rounds a ceiling up to a clean tick value. */
function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

export function LineChart({
  points,
  unit = '',
  emptyLabel = 'No activity in this window',
}: {
  points: LinePoint[];
  unit?: string;
  emptyLabel?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const max = niceCeiling(Math.max(1, ...points.map((point) => point.value)));
    const innerWidth = WIDTH - PAD.left - PAD.right;
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;
    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    const coords = points.map((point, index) => ({
      x: PAD.left + index * stepX,
      y: PAD.top + innerHeight - (point.value / max) * innerHeight,
      ...point,
    }));

    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const area = `${line} L${(coords.at(-1)?.x ?? PAD.left).toFixed(1)},${PAD.top + innerHeight} L${PAD.left},${PAD.top + innerHeight} Z`;

    return { max, coords, line, area, innerHeight, innerWidth, stepX };
  }, [points]);

  if (!geometry) {
    return <p className="py-8 text-center text-[13px] text-ink-500">{emptyLabel}</p>;
  }

  const { max, coords, line, area, innerHeight, stepX } = geometry;
  const last = coords.at(-1);
  const active = hoverIndex !== null ? coords[hoverIndex] : undefined;
  const ticks = [0, max / 2, max];

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = WIDTH / rect.width;
    const x = (event.clientX - rect.left) * scale;
    const index = stepX === 0 ? 0 : Math.round((x - PAD.left) / stepX);
    setHoverIndex(Math.max(0, Math.min(points.length - 1, index)));
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        role="img"
        aria-label={`Trend line with ${points.length} points, peaking at ${Math.max(...points.map((p) => p.value))} ${unit}`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {ticks.map((tick) => {
          const y = PAD.top + innerHeight - (tick / max) * innerHeight;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--color-chart-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-ink-500"
                style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
              >
                {Math.round(tick).toLocaleString('en-IN')}
              </text>
            </g>
          );
        })}

        <path d={area} fill="var(--color-chart-1)" fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={PAD.top + innerHeight}
              stroke="var(--color-ink-400)"
              strokeWidth={1}
            />
            <circle cx={active.x} cy={active.y} r={5} fill="var(--color-chart-1)" stroke="#ffffff" strokeWidth={2} />
          </g>
        ) : null}

        {last ? (
          <g>
            <circle cx={last.x} cy={last.y} r={4.5} fill="var(--color-chart-1)" stroke="#ffffff" strokeWidth={2} />
            <text
              x={last.x + 10}
              y={last.y + 4}
              className="fill-ink-800"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              {last.value.toLocaleString('en-IN')}
            </text>
          </g>
        ) : null}

        {coords.length > 1 ? (
          <g style={{ fontSize: 11 }} className="fill-ink-500">
            <text x={PAD.left} y={HEIGHT - 6} textAnchor="start">
              {formatShortDate(coords[0]!.label)}
            </text>
            <text x={coords.at(-1)!.x} y={HEIGHT - 6} textAnchor="end">
              {formatShortDate(coords.at(-1)!.label)}
            </text>
          </g>
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-2 py-1 text-[12px] shadow-raised"
          style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${(active.y / HEIGHT) * 100}%` }}
        >
          <span className="block text-ink-600">{formatShortDate(active.label)}</span>
          <span className="num block font-semibold text-ink-900">
            {active.value.toLocaleString('en-IN')} {unit}
          </span>
        </div>
      ) : null}
    </div>
  );
}
