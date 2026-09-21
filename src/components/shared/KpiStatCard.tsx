import Link from 'next/link';
import type { PulseKpi } from '@/server/analytics/pulse';
import { Card, cn } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfidenceBadge, ProvenanceBadge, TrendChip } from '@/components/shared/badges';
import { Sparkline } from '@/components/charts/Sparkline';

/**
 * Stat tile for the Tourism Pulse.
 *
 * Contract from the dataviz guidance: label, value, optional delta against a
 * named period, optional sparkline. The value uses proportional figures, not
 * tabular, because it is a standalone display number rather than a column.
 *
 * A tile whose source is not connected renders an explicit empty state instead
 * of a number. Substituting a synthetic figure for an official one is the
 * single thing this product must never do.
 */
export function KpiStatCard({
  kpi,
  sparkline,
  invertTrend = false,
  href,
}: {
  kpi: PulseKpi;
  sparkline?: number[];
  /** True where a rise is bad, such as complaint counts. */
  invertTrend?: boolean;
  href?: string;
}) {
  const notConnected = kpi.state === 'NOT_CONNECTED';

  const body = (
    <Card
      className={cn(
        'flex h-full flex-col p-4 transition-shadow',
        href && 'hover:shadow-raised',
        notConnected && 'border-dashed bg-surface-2/50',
      )}
      as="div"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-snug text-ink-600">{kpi.label}</p>
        <ProvenanceBadge provenance={kpi.provenance} />
      </div>

      {notConnected ? (
        <>
          <p className="mt-3 text-[15px] font-semibold text-ink-500">Not connected</p>
          <p className="mt-1 text-[12px] leading-snug text-ink-600">{kpi.connectionNote}</p>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[28px] font-semibold leading-none tracking-tight text-ink-900">
                {kpi.value}
              </p>
              {kpi.unit ? <p className="mt-1 text-[12px] text-ink-500">{kpi.unit}</p> : null}
            </div>
            {sparkline && sparkline.length > 3 ? (
              <Sparkline values={sparkline} ariaLabel={`${kpi.label} recent trend`} />
            ) : null}
          </div>

          <p className="mt-2 text-[12px] leading-snug text-ink-600">{kpi.caption}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {kpi.trend ? (
              <TrendChip
                percent={kpi.trend.percent}
                label={kpi.trend.label}
                invertPolarity={invertTrend}
              />
            ) : null}
            {kpi.confidence ? <ConfidenceBadge confidence={kpi.confidence} /> : null}
          </div>
        </>
      )}

      <div className="mt-auto pt-3">
        <Disclosure summary="Method and source">
          <p>{kpi.method}</p>
          <p className="mt-1 text-[12px] text-ink-500">Sources: {kpi.sourceIds.join(', ')}</p>
        </Disclosure>
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full rounded-lg focus-visible:outline-brand-500">
      {body}
    </Link>
  ) : (
    body
  );
}
