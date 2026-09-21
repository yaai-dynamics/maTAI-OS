import { cn } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import type { Provenance } from '@/lib/provenance';

/**
 * Funnel stages.
 *
 * Stages are ordinal, so they take one hue in monotone lightness steps rather
 * than categorical colours: swapping two stages would change the meaning, and
 * the reader should see that order in the colour. The ramp is validated for
 * monotone lightness, step separation and light-end contrast.
 */

const RAMP = [
  'bg-ramp-1',
  'bg-ramp-2',
  'bg-ramp-3',
  'bg-ramp-4',
  'bg-ramp-5',
  'bg-ramp-6',
] as const;

/** Steps 1-3 are light enough for ink text; the rest need white. */
const INK_ON_FILL = 3;

export interface FunnelStage {
  id: string;
  label: string;
  value: number;
  valueLabel?: string;
  note?: string;
  provenance?: Provenance;
  /** Highlighted as captured during this session. */
  liveCount?: number;
}

export function FunnelBars({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-500">No funnel data yet</p>;
  }

  const ceiling = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <ol className="flex flex-col gap-[6px]">
      {stages.map((stage, index) => {
        const width = Math.max(stage.value === 0 ? 0 : 6, (stage.value / ceiling) * 100);
        const fill = RAMP[Math.min(index, RAMP.length - 1)]!;
        const labelInside = width > 42;
        const useInk = index < INK_ON_FILL;

        return (
          <li key={stage.id}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="text-[13px] text-ink-800">{stage.label}</span>
              <span className="flex items-center gap-2">
                {stage.liveCount ? (
                  <span className="rounded-full border border-lake-200 bg-lake-50 px-1.5 py-0.5 text-[10px] font-medium text-lake-700">
                    {stage.liveCount} this session
                  </span>
                ) : null}
                {stage.provenance ? <ProvenanceBadge provenance={stage.provenance} /> : null}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-[22px] min-w-0 flex-1 rounded-r-[4px] bg-chart-grid/60">
                <div
                  className={cn(
                    'flex h-full items-center justify-end rounded-r-[4px] px-2 transition-[width] duration-500',
                    fill,
                  )}
                  style={{ width: `${width}%` }}
                  role="img"
                  aria-label={`${stage.label}: ${stage.valueLabel ?? stage.value}`}
                >
                  {labelInside ? (
                    <span
                      className={cn(
                        'num text-[12px] font-semibold tabular-nums',
                        useInk ? 'text-ink-900' : 'text-white',
                      )}
                    >
                      {stage.valueLabel ?? stage.value.toLocaleString('en-IN')}
                    </span>
                  ) : null}
                </div>
              </div>
              {labelInside ? null : (
                <span className="num w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums text-ink-900">
                  {stage.valueLabel ?? stage.value.toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {stage.note ? <p className="mt-1 text-[11px] text-ink-500">{stage.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
