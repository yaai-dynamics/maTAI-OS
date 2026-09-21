import Link from 'next/link';
import { projectToBox } from '@/lib/geo';
import type { Destination, DestinationStatus } from '@/lib/types';
import { cn } from '@/components/ui/primitives';

/**
 * Schematic state map.
 *
 * Deliberately not a tiled map: the prototype has to run with no network
 * (CLAUDE.md section 3), and a tile layer would make the demo dependent on an
 * external service. The outline is an approximation for orientation, labelled
 * as such, and no boundary here should be read as authoritative.
 *
 * Status is carried by shape and label as well as colour, so the map is not
 * colour-only (docs/06-design-system.md, accessibility).
 */

const BOUNDS = { minLat: 23.7, maxLat: 25.8, minLon: 92.9, maxLon: 94.9 };

/** Approximate outline, for orientation only. */
const OUTLINE: [number, number][] = [
  [93.03, 24.78], [93.18, 25.07], [93.42, 25.3], [93.62, 25.42], [93.88, 25.68],
  [94.2, 25.6], [94.4, 25.35], [94.6, 25.1], [94.72, 24.72], [94.6, 24.32],
  [94.4, 24.05], [94.15, 23.9], [93.9, 23.83], [93.62, 23.95], [93.4, 24.14],
  [93.2, 24.36], [93.05, 24.55],
];

/** The Imphal valley floor, drawn so hill and valley destinations read differently. */
const VALLEY: [number, number][] = [
  [93.72, 25.02], [93.98, 25.05], [94.1, 24.82], [94.06, 24.48],
  [93.9, 24.28], [93.72, 24.36], [93.64, 24.66],
];

const VIEW = { width: 460, height: 500 };

const toPoint = (lon: number, lat: number) => {
  const { x, y } = projectToBox({ latitude: lat, longitude: lon }, BOUNDS);
  return { x: 20 + x * (VIEW.width - 40), y: 20 + y * (VIEW.height - 40) };
};

const polygon = (points: [number, number][]): string =>
  points
    .map(([lon, lat]) => {
      const point = toPoint(lon, lat);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(' ');

const STATUS_STYLE: Record<DestinationStatus, { fill: string; label: string }> = {
  HEALTHY: { fill: 'var(--color-good-500)', label: 'Healthy' },
  WATCH: { fill: 'var(--color-warn-500)', label: 'Watch' },
  ATTENTION: { fill: 'var(--color-risk-500)', label: 'Attention' },
};

export interface MapPoint {
  destination: Destination;
  /** 0 to 100. Drives marker size. */
  demandIndex: number;
  href?: string;
  caption?: string;
}

export function TourismMap({
  points,
  selectedId,
  className,
  showLabelsFor = 5,
}: {
  points: MapPoint[];
  selectedId?: string;
  className?: string;
  /** How many of the busiest destinations get a permanent text label. */
  showLabelsFor?: number;
}) {
  const labelled = new Set(
    [...points]
      .sort((a, b) => b.demandIndex - a.demandIndex)
      .slice(0, showLabelsFor)
      .map((point) => point.destination.id),
  );

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Schematic map of Manipur with ${points.length} destinations marked by status and demand.`}
      >
        <polygon
          points={polygon(OUTLINE)}
          fill="var(--color-surface-2)"
          stroke="var(--color-line-strong)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <polygon points={polygon(VALLEY)} fill="var(--color-lake-50)" stroke="var(--color-lake-200)" strokeWidth={1} />

        <text
          x={VIEW.width - 22}
          y={VIEW.height - 12}
          textAnchor="end"
          className="fill-ink-400"
          style={{ fontSize: 10 }}
        >
          Schematic outline, for orientation only
        </text>

        {points.map((point) => {
          const { x, y } = toPoint(point.destination.longitude, point.destination.latitude);
          const style = STATUS_STYLE[point.destination.status];
          const radius = 5 + (point.demandIndex / 100) * 9;
          const selected = selectedId === point.destination.id;
          const showLabel = labelled.has(point.destination.id) || selected;

          const marker = (
            <g>
              {selected ? (
                <circle cx={x} cy={y} r={radius + 7} fill="var(--color-brand-500)" opacity={0.18} />
              ) : null}
              <circle cx={x} cy={y} r={radius} fill={style.fill} stroke="#ffffff" strokeWidth={2} />
              {point.destination.status !== 'HEALTHY' ? (
                // Second ring so status is not carried by colour alone.
                <circle
                  cx={x}
                  cy={y}
                  r={radius + 3.5}
                  fill="none"
                  stroke={style.fill}
                  strokeWidth={1.5}
                  strokeDasharray={point.destination.status === 'WATCH' ? '3 3' : undefined}
                />
              ) : null}
              {showLabel ? (
                <text
                  x={x + radius + 6}
                  y={y + 4}
                  className={cn(selected ? 'fill-brand-700' : 'fill-ink-700')}
                  style={{ fontSize: 11, fontWeight: selected ? 600 : 500 }}
                >
                  {point.destination.name}
                </text>
              ) : null}
              <title>
                {`${point.destination.name}, ${point.destination.district}. Status ${style.label}. Demand index ${point.demandIndex}.${point.caption ? ` ${point.caption}` : ''}`}
              </title>
            </g>
          );

          return point.href ? (
            <Link key={point.destination.id} href={point.href}>
              {marker}
            </Link>
          ) : (
            <g key={point.destination.id}>{marker}</g>
          );
        })}
      </svg>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-600">
        {(Object.keys(STATUS_STYLE) as DestinationStatus[]).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: STATUS_STYLE[status].fill }}
            />
            {STATUS_STYLE[status].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-ink-400" />
          <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-ink-400" />
          Marker size shows demand index
        </li>
      </ul>
    </div>
  );
}
