import { Flag, House, Landmark, Moon, Mountain, Store, Trees, Waves } from 'lucide-react';
import type { Destination } from '@/lib/types';
import { cn } from '@/components/ui/primitives';

/** Pin faces for the maps. Plain markup: MapCanvas puts them in its buttons. */

const PALETTE_ICON: Record<Destination['palette'], typeof Waves> = {
  lake: Waves,
  hill: Mountain,
  heritage: Landmark,
  market: Store,
  forest: Trees,
  border: Flag,
};

/** A numbered stop of a trip, in its day's colour. */
export function StopPin({
  number,
  color,
  selected,
  hovered,
  experience,
}: {
  number: number;
  color: string;
  selected: boolean;
  hovered: boolean;
  experience?: boolean;
}) {
  return (
    <span className={cn('matai-pin-face relative flex items-center justify-center', selected && 'is-selected')}>
      {selected ? <span aria-hidden className="matai-pin-pulse" style={{ background: color }} /> : null}
      <span
        className={cn(
          'num relative flex h-8 w-8 items-center justify-center border-[2.5px] border-white text-[13px] font-bold text-white shadow-[0_3px_10px_rgba(20,22,31,0.35)] transition-transform duration-200',
          experience ? 'rounded-[10px]' : 'rounded-full',
          (selected || hovered) && 'scale-[1.22]',
        )}
        style={{ background: color }}
      >
        {number}
      </span>
    </span>
  );
}

/** A destination on the Discover map, with its kind of place and a label. */
export function PlacePin({
  palette,
  color,
  name,
  selected,
  hovered,
  count,
  highlighted,
}: {
  palette: Destination['palette'];
  color: string;
  name: string;
  selected: boolean;
  hovered: boolean;
  /** Experiences here, shown as a badge. */
  count?: number;
  /** Named by the chat just now. */
  highlighted?: boolean;
}) {
  const Icon = PALETTE_ICON[palette];
  return (
    <span className="matai-pin-face relative flex flex-col items-center">
      {selected || highlighted ? <span aria-hidden className="matai-pin-pulse" style={{ background: color }} /> : null}
      <span
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] border-white text-white shadow-[0_3px_10px_rgba(20,22,31,0.35)] transition-transform duration-200',
          (selected || hovered) && 'scale-[1.2]',
        )}
        style={{ background: color }}
      >
        <Icon aria-hidden size={17} strokeWidth={2.2} />
        {count ? (
          <span className="num absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-brand-700 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          'matai-pin-label pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow-sm',
          selected ? 'bg-ink-900 text-white' : 'bg-surface/95 text-ink-900',
        )}
      >
        {name}
      </span>
    </span>
  );
}

/** Where the trip starts and ends. */
export function BasePin() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border-[2.5px] border-white bg-ink-900 text-white shadow-[0_3px_10px_rgba(20,22,31,0.35)]">
      <House aria-hidden size={15} />
    </span>
  );
}

/** Where a night is spent. */
export function NightPin({ partner }: { partner: boolean }) {
  return (
    <span
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-white shadow-[0_2px_8px_rgba(20,22,31,0.35)]',
        partner ? 'bg-lake-700' : 'bg-ink-500',
      )}
    >
      <Moon aria-hidden size={12} />
    </span>
  );
}

/** The tooltip body shared by every pin. */
export function PinTooltip({
  eyebrow,
  title,
  lines,
  hint,
  color,
}: {
  eyebrow?: string;
  title: string;
  lines?: (string | undefined)[];
  hint?: string;
  color?: string;
}) {
  return (
    <div className="w-[260px] overflow-hidden rounded-xl bg-surface text-left">
      <div className="h-1" style={{ background: color ?? 'var(--color-brand-500)' }} />
      <div className="px-3 py-2.5">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: color ?? 'var(--color-brand-700)' }}>
            {eyebrow}
          </p>
        ) : null}
        <p className="text-[14px] font-semibold leading-snug text-ink-900">{title}</p>
        {lines
          ?.filter((line): line is string => Boolean(line))
          .map((line) => (
            <p key={line} className="mt-1 line-clamp-3 text-[12px] leading-snug text-ink-600">
              {line}
            </p>
          ))}
        {hint ? <p className="mt-1.5 text-[11px] font-medium text-brand-700">{hint}</p> : null}
      </div>
    </div>
  );
}
