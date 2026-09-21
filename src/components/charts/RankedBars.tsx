import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';

/**
 * Horizontal ranked bars.
 *
 * Nominal categories, so every bar takes the same hue: bar length already
 * encodes the value and spending the identity channel on it would re-encode
 * what the reader can see. One row may be emphasised when a view is about a
 * single destination; the rest recede rather than taking new hues.
 *
 * Mark spec: bars capped at 18px, 4px rounded data-end, square at the baseline,
 * hairline track, and a 2px surface gap between neighbours from the row gap.
 */

export interface RankedBarDatum {
  id: string;
  label: string;
  value: number;
  /** Shown to the right of the bar in place of the raw value. */
  valueLabel?: string;
  /** Secondary text under the label. */
  caption?: ReactNode;
  emphasis?: boolean;
  href?: string;
}

export function RankedBars({
  data,
  max,
  emptyLabel = 'No activity in this window',
  labelWidth = 'md',
}: {
  data: RankedBarDatum[];
  max?: number;
  emptyLabel?: string;
  labelWidth?: 'sm' | 'md' | 'lg';
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-500">{emptyLabel}</p>;
  }

  const ceiling = Math.max(1, max ?? Math.max(...data.map((row) => row.value)));
  const anyEmphasis = data.some((row) => row.emphasis);
  const labelClass = { sm: 'w-24', md: 'w-36', lg: 'w-48' }[labelWidth];

  return (
    <ul className="flex flex-col gap-[6px]">
      {data.map((row) => {
        const width = Math.max(row.value === 0 ? 0 : 1.5, (row.value / ceiling) * 100);
        const recede = anyEmphasis && !row.emphasis;

        const content = (
          <>
            <div className={cn('shrink-0 truncate text-[13px]', labelClass)}>
              <span className={cn('block truncate', recede ? 'text-ink-500' : 'text-ink-800')}>
                {row.label}
              </span>
              {row.caption ? (
                <span className="block truncate text-[11px] text-ink-500">{row.caption}</span>
              ) : null}
            </div>

            <div className="h-[18px] min-w-0 flex-1 rounded-r-[4px] bg-chart-grid/70">
              <div
                className={cn(
                  'h-full rounded-r-[4px] transition-[width] duration-500',
                  recede ? 'bg-chart-muted' : 'bg-chart-1',
                )}
                style={{ width: `${width}%` }}
                role="img"
                aria-label={`${row.label}: ${row.valueLabel ?? row.value}`}
              />
            </div>

            <span
              className={cn(
                'num w-16 shrink-0 text-right text-[13px] font-medium tabular-nums',
                recede ? 'text-ink-500' : 'text-ink-900',
              )}
            >
              {row.valueLabel ?? row.value.toLocaleString('en-IN')}
            </span>
          </>
        );

        return (
          <li key={row.id}>
            {row.href ? (
              <Link
                href={row.href}
                className="flex items-center gap-3 rounded-sm hover:bg-surface-2/60"
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-3">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
