import type { Metadata } from 'next';

import { HISTORY_DAYS } from '@/lib/config';
import { formatLongDate } from '@/lib/date';
import { computeHistory, HISTORY_COVERAGE_NOTE } from '@/server/analytics/districts';
import { percentChange, roundTo } from '@/server/analytics/windows';
import { Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { DemoDataNote, ProvenanceBadge, TrendChip } from '@/components/shared/badges';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { LineChart } from '@/components/charts/LineChart';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Historical dashboards' };
export const dynamic = 'force-dynamic';

const PERIODS = [
  { value: 7, label: 'Weekly' },
  { value: 14, label: 'Fortnightly' },
  { value: 30, label: 'Monthly' },
] as const;

export default async function HistoryPage(props: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireGovernment();
  const { period } = await props.searchParams;
  const periodDays = PERIODS.some((entry) => String(entry.value) === period)
    ? Number(period)
    : 7;

  const points = computeHistory({ days: HISTORY_DAYS, periodDays });
  const latest = points.at(-1);
  const previous = points.at(-2);

  const change = (key: 'interactions' | 'checkins' | 'itineraryAdds' | 'feedback') =>
    latest && previous ? percentChange(latest[key], previous[key]) : null;

  const ratingChange =
    latest?.averageRating != null && previous?.averageRating != null
      ? roundTo(latest.averageRating - previous.averageRating, 2)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            Historical dashboards
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
            A single 30-day window says what is happening now. It cannot say whether that is normal.
            This is the second series, across all {HISTORY_DAYS} days the platform retains.
          </p>
        </div>
        <nav aria-label="Period length" className="flex gap-1.5">
          {PERIODS.map((entry) => (
            <a
              key={entry.value}
              href={`/gov/history?period=${entry.value}`}
              className={cn(
                'rounded-md border px-3 py-1.5 text-[12px] font-medium',
                periodDays === entry.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
              )}
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </div>

      {points.length < 2 ? (
        <EmptyState
          title="Not enough history"
          description="At least two complete periods are needed before a comparison means anything."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Interactions', value: latest?.interactions ?? 0, delta: change('interactions') },
              { label: 'Itinerary additions', value: latest?.itineraryAdds ?? 0, delta: change('itineraryAdds') },
              { label: 'Check-ins', value: latest?.checkins ?? 0, delta: change('checkins') },
              { label: 'Feedback items', value: latest?.feedback ?? 0, delta: change('feedback') },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] text-ink-600">{stat.label}</p>
                  <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
                </div>
                <p className="mt-1.5 text-[28px] font-semibold leading-none text-ink-900">
                  {stat.value.toLocaleString('en-IN')}
                </p>
                <div className="mt-1.5">
                  <TrendChip
                    percent={stat.delta === null ? null : roundTo(stat.delta, 1)}
                    label="against the previous period"
                  />
                </div>
                <p className="mt-1 text-[11px] text-ink-500">in the latest period</p>
              </Card>
            ))}

            <Card className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] text-ink-600">Average rating</p>
                <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
              </div>
              <p className="mt-1.5 text-[28px] font-semibold leading-none text-ink-900">
                {latest?.averageRating?.toFixed(2) ?? '—'}
              </p>
              <p className="mt-1.5 text-[12px] text-ink-600">
                {ratingChange === null
                  ? 'No comparable previous period'
                  : `${ratingChange > 0 ? '+' : ''}${ratingChange.toFixed(2)} against the previous period`}
              </p>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardBody className="pt-4">
                <ChartFrame
                  title="Platform activity by period"
                  subtitle={`${points.length} periods of ${periodDays} days`}
                  provenance="PLATFORM_OBSERVED"
                  method="Count of platform interactions falling inside each period, from the retained history."
                  table={{
                    columns: ['Period beginning', 'Interactions', 'Weighted'],
                    rows: points.map((point) => [
                      point.periodStart,
                      point.interactions.toLocaleString('en-IN'),
                      point.weightedScore.toLocaleString('en-IN'),
                    ]),
                  }}
                >
                  <LineChart
                    points={points.map((point) => ({
                      label: point.periodStart,
                      value: point.interactions,
                    }))}
                    unit="interactions"
                  />
                </ChartFrame>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="pt-4">
                <ChartFrame
                  title="Intent signals by period"
                  subtitle="Itinerary additions, the earliest point at which someone has decided to go"
                  provenance="PLATFORM_OBSERVED"
                  method="Count of itinerary additions in each period. Views and searches are excluded: they measure attention, not intent."
                  table={{
                    columns: ['Period beginning', 'Itinerary additions', 'Check-ins'],
                    rows: points.map((point) => [
                      point.periodStart,
                      point.itineraryAdds,
                      point.checkins,
                    ]),
                  }}
                >
                  <LineChart
                    points={points.map((point) => ({
                      label: point.periodStart,
                      value: point.itineraryAdds,
                    }))}
                    unit="itinerary additions"
                  />
                </ChartFrame>
              </CardBody>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title="Every retained period"
              subtitle="The full series, so a single window can be read against the rest."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] uppercase tracking-[0.06em] text-ink-500">
                    <th className="px-4 py-2 font-semibold">Period beginning</th>
                    <th className="px-3 py-2 text-right font-semibold">Interactions</th>
                    <th className="px-3 py-2 text-right font-semibold">Weighted</th>
                    <th className="px-3 py-2 text-right font-semibold">Itinerary adds</th>
                    <th className="px-3 py-2 text-right font-semibold">Check-ins</th>
                    <th className="px-3 py-2 text-right font-semibold">Feedback</th>
                    <th className="px-3 py-2 text-right font-semibold">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((point) => (
                    <tr key={point.periodStart} className="border-b border-line/70">
                      <td className="px-4 py-2">{formatLongDate(point.periodStart)}</td>
                      <td className="num px-3 py-2 text-right">
                        {point.interactions.toLocaleString('en-IN')}
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {point.weightedScore.toLocaleString('en-IN')}
                      </td>
                      <td className="num px-3 py-2 text-right">{point.itineraryAdds}</td>
                      <td className="num px-3 py-2 text-right">{point.checkins}</td>
                      <td className="num px-3 py-2 text-right">{point.feedback}</td>
                      <td className="num px-3 py-2 text-right">
                        {point.averageRating?.toFixed(2) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className="text-[13px] font-medium text-ink-900">What this series cannot tell you</p>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-700">{HISTORY_COVERAGE_NOTE}</p>
          <Disclosure summary="Why that matters" className="mt-2">
            Tourism is strongly seasonal. Ninety days spans one season, so a rise here cannot be
            separated from the season it sits in. Treating it as a year-on-year comparison would be
            the single easiest way for this platform to mislead a department, so it is not offered
            and will not be until the series is long enough to support it.
          </Disclosure>
          <div className="mt-3">
            <DemoDataNote />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
