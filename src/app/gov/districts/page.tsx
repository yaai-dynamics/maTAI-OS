import Link from 'next/link';
import type { Metadata } from 'next';

import { computePulse } from '@/server/analytics/pulse';
import { computeDistrictIntelligence, DISTRICT_METHOD } from '@/server/analytics/districts';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge, TrendChip } from '@/components/shared/badges';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { RankedBars } from '@/components/charts/RankedBars';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'District analytics' };
export const dynamic = 'force-dynamic';

export default async function DistrictsPage() {
  await requireGovernment();
  const pulse = computePulse();
  const districts = computeDistrictIntelligence(pulse.window, {
    demand: pulse.demand,
    capacity: pulse.capacity,
    alerts: pulse.alerts,
  });

  const covered = districts.filter((row) => !row.notCovered);
  const uncovered = districts.filter((row) => row.notCovered);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">District analytics</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          The same picture at the unit a department is organised around. {pulse.window.label}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Districts covered', value: covered.length, note: `of ${districts.length} in the state` },
          {
            label: 'Districts with no destination',
            value: uncovered.length,
            note: 'a coverage gap, not an absence of tourism',
          },
          {
            label: 'Districts with an open alert',
            value: covered.filter((row) => row.openAlerts > 0).length,
            note: 'at watch or action severity',
          },
          {
            label: 'Districts with reporting supply',
            value: covered.filter((row) => row.totalCapacity > 0).length,
            note: 'verified partners reporting availability',
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-[12px] text-ink-600">{stat.label}</p>
            <p className="mt-1 text-[28px] font-semibold leading-none text-ink-900">{stat.value}</p>
            <p className="mt-1 text-[12px] leading-snug text-ink-500">{stat.note}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Districts with destinations on the platform"
          subtitle="Sorted by weighted activity."
          action={<ProvenanceBadge provenance="PLATFORM_OBSERVED" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] uppercase tracking-[0.06em] text-ink-500">
                <th className="px-4 py-2 font-semibold">District</th>
                <th className="px-3 py-2 text-right font-semibold">Share</th>
                <th className="px-3 py-2 text-right font-semibold">Trend</th>
                <th className="px-3 py-2 text-right font-semibold">Interactions</th>
                <th className="px-3 py-2 text-right font-semibold">Businesses</th>
                <th className="px-3 py-2 text-right font-semibold">Places free</th>
                <th className="px-3 py-2 text-right font-semibold">Rating</th>
                <th className="px-4 py-2 font-semibold">Most reported issue</th>
              </tr>
            </thead>
            <tbody>
              {covered.map((row) => (
                <tr key={row.districtId} className="border-b border-line/70 align-top">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-ink-900">{row.district}</span>
                    <span className="block text-[11px] text-ink-500">
                      {row.destinationNames.join(', ')}
                    </span>
                    {row.openAlerts > 0 ? (
                      <span className="mt-1 inline-block">
                        <Badge tone="warn">
                          {row.openAlerts} open alert{row.openAlerts === 1 ? '' : 's'}
                        </Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="num px-3 py-2.5 text-right font-semibold">{row.sharePercent}%</td>
                  <td className="px-3 py-2.5 text-right">
                    <TrendChip percent={row.trendPercent} label="vs previous window" />
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {row.interactions.toLocaleString('en-IN')}
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {row.verifiedBusinesses}
                    <span className="text-ink-500">/{row.businesses}</span>
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {row.totalCapacity > 0 ? (
                      <>
                        {row.availableCapacity}
                        <span className="text-ink-500">/{row.totalCapacity}</span>
                      </>
                    ) : (
                      <span className="text-[12px] text-ink-500">No reports</span>
                    )}
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {row.averageRating?.toFixed(2) ?? '—'}
                    {row.responses > 0 ? (
                      <span className="text-ink-500"> ({row.responses})</span>
                    ) : null}
                  </td>
                  <td className="max-w-[240px] px-4 py-2.5 text-[12px] text-ink-700">
                    {row.topIssue ? `${row.topIssue.label} (${row.topIssue.count})` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="pt-3">
          <Disclosure summary="How district figures are produced">{DISTRICT_METHOD}</Disclosure>
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardBody className="pt-4">
            <ChartFrame
              title="Share of state activity by district"
              provenance="PLATFORM_OBSERVED"
              method={DISTRICT_METHOD}
              table={{
                columns: ['District', 'Share'],
                rows: covered.map((row) => [row.district, `${row.sharePercent}%`]),
              }}
            >
              <RankedBars
                labelWidth="md"
                data={covered.map((row, index) => ({
                  id: row.districtId,
                  label: row.district,
                  value: row.sharePercent,
                  valueLabel: `${row.sharePercent}%`,
                  emphasis: index === 0,
                }))}
              />
            </ChartFrame>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Districts not on the platform"
            subtitle="No destination has been curated here yet. That is a coverage gap in this prototype, not a statement about tourism in the district."
            eyebrow={`${uncovered.length} of ${districts.length}`}
          />
          <CardBody>
            {uncovered.length === 0 ? (
              <EmptyState icon="✓" title="Every district has at least one destination" />
            ) : (
              <>
                <ul className="flex flex-wrap gap-1.5">
                  {uncovered.map((row) => (
                    <li key={row.districtId}>
                      <span
                        className={cn(
                          'rounded-full border border-dashed border-line-strong bg-surface-2/50 px-2.5 py-1 text-[12px] text-ink-600',
                        )}
                      >
                        {row.district}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-ink-600">
                  Curating destinations for these districts is the first step to district-level
                  deployment, and it comes before any analytics about them can mean anything.
                </p>
                <Link
                  href="/gov/partners"
                  className="mt-2 inline-block text-[12px] font-medium text-brand-700 underline"
                >
                  See where supply is missing too
                </Link>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
