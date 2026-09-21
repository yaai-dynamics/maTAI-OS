import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate, formatShortDate } from '@/lib/date';
import { computeCampaignFunnel } from '@/server/analytics/campaign';
import {
  findInfrastructureOpportunities,
  forecastDemand,
  MAX_HORIZON_DAYS,
  OPPORTUNITY_METHOD,
  optimiseCampaign,
  WEIGHTED_ACTIVITY_NOTE,
} from '@/server/analytics/forecast';
import { computePulse } from '@/server/analytics/pulse';
import { getApplications, getCampaigns, getDestination, getDestinations } from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfidenceBadge, ProvenanceBadge, TrendChip } from '@/components/shared/badges';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { LineChart } from '@/components/charts/LineChart';
import { RankedBars } from '@/components/charts/RankedBars';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Intelligence' };
export const dynamic = 'force-dynamic';

/**
 * Forecasting, opportunity analysis and campaign optimisation — roadmap Phase 4.
 *
 * Every projection on this page states its method and, more importantly, what it
 * cannot see. Ninety days of history is one season, and presenting a trend line
 * as a seasonal forecast would be the most damaging thing this platform could do
 * to a department that trusted it.
 */
export default async function IntelligencePage(props: {
  searchParams: Promise<{ destination?: string; horizon?: string; campaign?: string }>;
}) {
  await requireGovernment();
  const { destination, horizon, campaign: campaignParam } = await props.searchParams;
  const horizonDays = Math.min(MAX_HORIZON_DAYS, Math.max(3, Number(horizon) || 14));

  const pulse = computePulse();
  const forecast = forecastDemand({
    ...(destination ? { destinationId: destination } : {}),
    horizonDays,
  });

  const opportunities = findInfrastructureOpportunities({
    demand: pulse.demand,
    capacity: pulse.capacity,
  });

  const campaigns = getCampaigns().filter((entry) => entry.status !== 'DRAFT');
  const selectedCampaign =
    campaigns.find((entry) => entry.id === campaignParam) ??
    campaigns.find((entry) => entry.status === 'IN_PROGRESS') ??
    campaigns[0];

  const optimisation = selectedCampaign
    ? (() => {
        const funnel = computeCampaignFunnel(selectedCampaign.id);
        const capacity = pulse.capacity.find(
          (row) => row.destinationId === selectedCampaign.destinationId,
        );
        const openIssue = pulse.alerts.find(
          (alert) =>
            alert.severity === 'ACTION' && alert.entityId === selectedCampaign.destinationId,
        );
        const platformSignals =
          funnel?.steps
            .filter((step) => step.block === 'PLATFORM')
            .reduce((sum, step) => sum + step.value, 0) ?? 0;
        const reachViews =
          funnel?.steps.find((step) => step.metric === 'VIEWS')?.value ?? 0;

        return optimiseCampaign({
          campaignId: selectedCampaign.id,
          campaignName: selectedCampaign.name,
          destinationName:
            getDestination(selectedCampaign.destinationId)?.name ?? selectedCampaign.destinationId,
          publishedContent: funnel?.publishedContent ?? 0,
          shortlistedCreators: getApplications({ campaignId: selectedCampaign.id }).length,
          daysRemaining: Math.max(0, (funnel?.daysTotal ?? 0) - (funnel?.daysElapsed ?? 0)),
          spareCapacity: capacity?.availableCapacity ?? 0,
          openIssue: openIssue ? openIssue.title : null,
          platformSignals,
          reachViews,
        });
      })()
    : undefined;

  const combined = [
    ...forecast.history.slice(-21).map((point) => ({ label: point.date, value: point.value })),
    ...forecast.points.map((point) => ({ label: point.date, value: point.value })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Intelligence</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
            Forecasting, where supply is missing, and what is actually limiting a campaign. Each of
            these states its method and what it cannot see.
          </p>
        </div>
        <ConfidenceBadge confidence={forecast.confidence} reason={forecast.confidenceReason} />
      </div>

      {/* Forecast */}
      <Card>
        <CardHeader
          title={`Demand projection: ${forecast.scope}`}
          subtitle={`${forecast.horizonDays} days ahead. A projection of a ninety day trend, not a seasonal model.`}
          action={<ProvenanceBadge provenance="FORECAST" />}
        />
        <CardBody className="space-y-4">
          <nav aria-label="Forecast scope" className="flex flex-wrap gap-1.5">
            <Link
              href={`/gov/intelligence?horizon=${horizonDays}`}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] font-medium',
                !destination
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
              )}
            >
              Statewide
            </Link>
            {getDestinations()
              .slice(0, 8)
              .map((entry) => (
                <Link
                  key={entry.id}
                  href={`/gov/intelligence?destination=${entry.id}&horizon=${horizonDays}`}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[12px] font-medium',
                    destination === entry.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
                  )}
                >
                  {entry.name}
                </Link>
              ))}
          </nav>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-3.5">
              <p className="text-[12px] text-ink-600">Projected change</p>
              <p className="mt-1 text-[24px] font-semibold leading-none text-ink-900">
                {forecast.projectedChangePercent === null
                  ? 'No baseline'
                  : `${forecast.projectedChangePercent > 0 ? '+' : ''}${forecast.projectedChangePercent}%`}
              </p>
              <p className="mt-1 text-[11px] text-ink-500">final week against the last observed week</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-[12px] text-ink-600">Trend</p>
              <p className="num mt-1 text-[24px] font-semibold leading-none text-ink-900">
                {forecast.trendPerDay > 0 ? '+' : ''}
                {forecast.trendPerDay}
              </p>
              <p className="mt-1 text-[11px] text-ink-500">weighted activity per day</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-[12px] text-ink-600">Fit quality</p>
              <p className="num mt-1 text-[24px] font-semibold leading-none text-ink-900">
                {Math.round(forecast.fitQuality * 100)}%
              </p>
              <p className="mt-1 text-[11px] leading-snug text-ink-500">
                of the variation explained by the trend
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-[12px] text-ink-600">Interval width</p>
              <p className="num mt-1 text-[24px] font-semibold leading-none text-ink-900">
                ±{forecast.residualStdDev * 2}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-ink-500">
                at day one, widening with the horizon
              </p>
            </Card>
          </div>

          <ChartFrame
            title="Observed, then projected"
            subtitle="The last three weeks observed, followed by the projection. The interval is in the table."
            provenance="FORECAST"
            method={`${forecast.method} ${WEIGHTED_ACTIVITY_NOTE}`}
            table={{
              columns: ['Date', 'Projection', 'Lower', 'Upper'],
              rows: forecast.points.map((point) => [
                point.date,
                point.value,
                point.lower,
                point.upper,
              ]),
            }}
          >
            <LineChart points={combined} unit="weighted activity" />
          </ChartFrame>

          {forecast.eventsInHorizon.length > 0 ? (
            <div className="rounded-md border border-warn-500/30 bg-warn-100/40 p-3">
              <p className="text-[12px] font-medium text-warn-700">
                Events fall inside this horizon and are not modelled
              </p>
              <ul className="mt-1 space-y-0.5">
                {forecast.eventsInHorizon.map((event) => (
                  <li key={event.name} className="text-[12px] text-ink-700">
                    {event.name}, from {formatLongDate(event.startAt)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-md border border-line bg-surface-2/50 p-3">
            <p className="text-[12px] font-medium text-ink-900">What this forecast cannot see</p>
            <ul className="mt-1.5 space-y-1">
              {forecast.limits.map((limit) => (
                <li key={limit} className="flex gap-2 text-[12px] text-ink-600">
                  <span aria-hidden className="text-ink-400">
                    ·
                  </span>
                  {limit}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-700">{forecast.confidenceReason}</p>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Infrastructure opportunity */}
        <Card>
          <CardHeader
            title="Where supply is missing"
            subtitle="Interest set against what could actually serve it. A development priority, not a promotion target."
            action={<ProvenanceBadge provenance="ESTIMATED" />}
          />
          <CardBody>
            <ChartFrame
              title="Supply gap score"
              provenance="ESTIMATED"
              method={OPPORTUNITY_METHOD}
              table={{
                columns: ['Destination', 'Gap score', 'Interest', 'Places free', 'Businesses'],
                rows: opportunities
                  .slice(0, 10)
                  .map((row) => [
                    row.name,
                    row.gapScore,
                    row.demandIndex,
                    row.spareCapacity,
                    row.participatingBusinesses,
                  ]),
              }}
            >
              <RankedBars
                labelWidth="md"
                data={opportunities.slice(0, 8).map((row, index) => ({
                  id: row.destinationId,
                  label: row.name,
                  value: row.gapScore,
                  caption: row.missing[0],
                  emphasis: index === 0,
                }))}
              />
            </ChartFrame>

            <ul className="mt-4 space-y-2">
              {opportunities.slice(0, 4).map((row) => (
                <li key={row.destinationId} className="rounded-md border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink-900">{row.name}</p>
                      <p className="text-[11px] text-ink-500">{row.district} district</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendChip percent={row.trendPercent} label="interest trend" />
                      <span className="num text-[15px] font-semibold text-ink-900">
                        {row.gapScore}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12px] text-ink-700">{row.recommendation}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* Campaign optimisation */}
        <Card>
          <CardHeader
            title="What is limiting a campaign"
            subtitle="Ranked constraints, not predicted uplifts."
            action={
              optimisation ? <Badge tone="brand">{optimisation.levers.length} levers</Badge> : undefined
            }
          />
          <CardBody>
            <nav aria-label="Choose a campaign" className="mb-3 flex flex-wrap gap-1.5">
              {campaigns.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/gov/intelligence?campaign=${entry.id}${destination ? `&destination=${destination}` : ''}`}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[12px] font-medium',
                    selectedCampaign?.id === entry.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
                  )}
                >
                  {entry.name}
                </Link>
              ))}
            </nav>

            {!optimisation ? (
              <EmptyState
                title="No launched campaign"
                description="Launch a campaign to see what would be limiting it."
              />
            ) : (
              <>
                <ol className="space-y-2.5">
                  {optimisation.levers.map((lever, index) => (
                    <li
                      key={lever.lever}
                      className={cn(
                        'rounded-md border p-3',
                        index === 0 ? 'border-brand-200 bg-brand-50' : 'border-line bg-surface',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-ink-900">{lever.lever}</p>
                        <span className="num text-[11px] text-ink-500">priority {lever.priority}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-ink-600">Now: {lever.currentState}</p>
                      <p className="mt-1 text-[13px] text-ink-800">{lever.expectedEffect}</p>
                      <p className="mt-1 text-[11px] text-ink-500">{lever.rationale}</p>
                    </li>
                  ))}
                </ol>

                <Disclosure summary="How these are ranked" className="mt-3">
                  {optimisation.method}
                </Disclosure>
                <p className="mt-2 rounded-md border border-line bg-surface-2/50 px-3 py-2 text-[12px] text-ink-700">
                  {optimisation.caveat}
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card tone="outline">
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <p className="max-w-3xl text-[12px] text-ink-600">
            Capacity modelling and scenario simulation live with the question that needs them: ask
            what happens if visitors are added to a destination, and the simulation runs against the
            same reported capacity these projections use. Last observed day:{' '}
            {formatShortDate(forecast.history.at(-1)?.date ?? '')}.
          </p>
          <Link
            href="/gov/ask?q=simulate"
            className="rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
          >
            Run a capacity scenario
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
