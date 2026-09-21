import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { computePulse } from '@/server/analytics/pulse';
import { recommendCampaignTargets } from '@/server/analytics/recommend';
import { getDataSources, getDestination } from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, SectionHeading } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { DemoDataNote, ProvenanceBadge } from '@/components/shared/badges';
import { InsightCard } from '@/components/shared/AnswerCard';
import { KpiStatCard } from '@/components/shared/KpiStatCard';
import { TourismMap } from '@/components/shared/TourismMap';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { LineChart } from '@/components/charts/LineChart';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Tourism Pulse' };

// The store is mutated by live demo signals, so nothing here may be cached.
export const dynamic = 'force-dynamic';

export default async function TourismPulsePage() {
  await requireGovernment();
  const pulse = computePulse();
  const targets = recommendCampaignTargets({
    demand: pulse.demand,
    capacity: pulse.capacity,
    sentiment: pulse.sentiment,
    alerts: pulse.alerts,
    concentration: pulse.concentration,
  });

  const sparkline = pulse.activitySeries.slice(-14).map((point) => point.value);
  const topTarget = targets.recommended[0];
  const topIssue = pulse.issues.issues[0];
  const actionAlerts = pulse.alerts.filter((alert) => alert.severity === 'ACTION');

  const mapPoints = pulse.demand
    .map((row) => {
      const destination = getDestination(row.destinationId);
      if (!destination) return undefined;
      return {
        destination,
        demandIndex: row.demandIndex,
        href: `/gov/destinations?selected=${destination.id}`,
        caption: `${row.interactions} interactions in the window.`,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Tourism Pulse</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            State of tourism as this platform observes it, for the {pulse.window.days} days to{' '}
            {formatLongDate(pulse.window.to)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{pulse.window.label}</Badge>
          <Link
            href="/gov/ask"
            className="rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
          >
            Ask a question
          </Link>
        </div>
      </div>

      {/* 1. Six headline indicators (docs/02-mvp-spec.md, G1). */}
      <section aria-label="Headline indicators">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {pulse.headline.map((kpi) => (
            <KpiStatCard
              key={kpi.id}
              kpi={kpi}
              invertTrend={kpi.id === 'open-issues'}
              {...(kpi.id === 'platform-activity' ? { sparkline } : {})}
              {...(kpi.id === 'open-issues' ? { href: '/gov/issues' } : {})}
              {...(kpi.id === 'demand-index' ? { href: '/gov/destinations' } : {})}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* 2. Map. */}
        <Card>
          <CardHeader
            title="Where the activity is"
            subtitle="Marker size shows the demand index. Status is set by the deterministic alert rules."
            action={<ProvenanceBadge provenance="PLATFORM_OBSERVED" />}
          />
          <CardBody>
            <TourismMap points={mapPoints} />
          </CardBody>
        </Card>

        <div className="space-y-5">
          {/* 3. Trend. */}
          <Card>
            <CardBody className="pt-4">
              <ChartFrame
                title="Daily weighted activity"
                subtitle={`Across all destinations, ${pulse.window.label}`}
                provenance="PLATFORM_OBSERVED"
                method="Each interaction is weighted by intent before being summed per day: views and searches count once, navigation starts twice, itinerary additions three times, check-ins and enquiries four times."
                table={{
                  columns: ['Date', 'Weighted activity'],
                  rows: pulse.activitySeries
                    .slice(-10)
                    .map((point) => [point.date, point.value.toLocaleString('en-IN')]),
                }}
              >
                <LineChart
                  points={pulse.activitySeries.map((point) => ({
                    label: point.date,
                    value: point.value,
                  }))}
                  unit="weighted interactions"
                />
              </ChartFrame>
            </CardBody>
          </Card>

          {/* 4. AI insights. */}
          <Card>
            <CardHeader
              title="Insights"
              subtitle="Produced by the analytics engine, each linked to the screen that shows the workings."
            />
            <CardBody className="space-y-2.5">
              {topTarget ? (
                <InsightCard
                  title={`${topTarget.name} is the strongest promotion candidate`}
                  body={
                    <>
                      Interest{' '}
                      {topTarget.trendPercent === null
                        ? 'has no baseline'
                        : `is up ${topTarget.trendPercent.toFixed(1)} percent`}{' '}
                      while it holds {topTarget.sharePercent} percent of state activity, and partners
                      report {topTarget.spareCapacity} of {topTarget.totalCapacity} places free.
                      {topTarget.conditions[0] ? ` Condition: ${topTarget.conditions[0]}` : ''}
                    </>
                  }
                  action={
                    <Link href="/gov/ask?q=promote" className="text-[12px] font-medium text-brand-700 underline">
                      See the full reasoning
                    </Link>
                  }
                />
              ) : null}

              <InsightCard
                title={`The top three destinations hold ${pulse.concentration.topThreeSharePercent} percent of activity`}
                tone={pulse.concentration.topThreeSharePercent > 55 ? 'watch' : 'neutral'}
                body={
                  <>
                    {pulse.concentration.topThree.map((row) => row.name).join(', ')}. The distribution
                    score across {pulse.concentration.destinationsCovered} destinations is{' '}
                    {pulse.concentration.distributionScore} of 100.
                  </>
                }
                action={
                  <Link href="/gov/destinations" className="text-[12px] font-medium text-brand-700 underline">
                    Compare destinations
                  </Link>
                }
              />

              {topIssue ? (
                <InsightCard
                  title={`${topIssue.label} is the most reported issue`}
                  tone={actionAlerts.length > 0 ? 'action' : 'watch'}
                  body={
                    <>
                      {topIssue.count} reports in the window, {topIssue.sharePercent} percent of all
                      issue reports
                      {topIssue.hotspots[0]
                        ? `, most often at ${topIssue.hotspots[0].name} with ${topIssue.hotspots[0].count}`
                        : ''}
                      .
                    </>
                  }
                  action={
                    <Link href="/gov/issues" className="text-[12px] font-medium text-brand-700 underline">
                      Open issues and sentiment
                    </Link>
                  }
                />
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* 5. Alerts. */}
      <Card>
        <CardHeader
          title="Notable alerts"
          subtitle="Each alert names the deterministic rule that produced it, so the threshold can be argued with."
          eyebrow={`${pulse.alerts.length} open`}
        />
        <CardBody>
          {pulse.alerts.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-500">
              No rule fired in this window.
            </p>
          ) : (
            <ul className="grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
              {pulse.alerts.slice(0, 9).map((alert) => (
                <li key={alert.id}>
                  <InsightCard
                    title={alert.title}
                    tone={alert.severity === 'ACTION' ? 'action' : alert.severity === 'WATCH' ? 'watch' : 'neutral'}
                    body={
                      <>
                        <p>{alert.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge tone={alert.severity === 'ACTION' ? 'risk' : alert.severity === 'WATCH' ? 'warn' : 'neutral'}>
                            {alert.severity.toLowerCase()}
                          </Badge>
                          <ProvenanceBadge provenance={alert.provenance} />
                        </div>
                        <Disclosure summary="Rule" className="mt-2">
                          {alert.rule}
                        </Disclosure>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* 6. The wider indicator index. */}
      <Card>
        <CardHeader
          title="Indicator index"
          subtitle="The rest of the indicator set, including the official tier that is not connected in this prototype."
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {pulse.indicatorIndex.map((kpi) => (
              <KpiStatCard key={kpi.id} kpi={kpi} invertTrend={kpi.id === 'top-complaint'} />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* 7. Provenance. */}
      <Card>
        <CardHeader
          title="Where these numbers come from"
          subtitle="Every figure on this screen belongs to one of these categories."
        />
        <CardBody>
          <DemoDataNote />
          <ul className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {getDataSources().map((source) => (
              <li key={source.id} className="rounded-md border border-line bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] font-medium text-ink-900">{source.name}</p>
                  <ProvenanceBadge provenance={source.defaultProvenance} />
                </div>
                <p className="mt-1 text-[12px] text-ink-600">{source.description}</p>
                <p className="mt-1.5 text-[11px] text-ink-500">
                  Reliability {source.reliabilityLevel.toLowerCase()} · refresh {source.refreshFrequency.toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <SectionHeading
        title="Next"
        subtitle="The pulse is the starting point. The decision happens in the Decision Room."
        action={
          <Link
            href="/gov/ask?q=promote"
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
          >
            Which destination should we promote?
          </Link>
        }
      />
    </div>
  );
}
