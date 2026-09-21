import Link from 'next/link';
import type { Metadata } from 'next';

import { BUSINESS_TYPE_LABEL, type BusinessType } from '@/lib/types';
import { computePulse } from '@/server/analytics/pulse';
import { recommendCampaignTargets } from '@/server/analytics/recommend';
import { getBusinessesFor, getDestination, getEventsFor, getExperiencesFor } from '@/server/data/repository';
import { currentWindow } from '@/server/analytics/windows';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfidenceBadge, ProvenanceBadge, StatusBadge, TrendChip } from '@/components/shared/badges';
import { TourismMap } from '@/components/shared/TourismMap';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { LineChart } from '@/components/charts/LineChart';
import { QrCode } from '@/components/shared/QrCode';
import { computeActivitySeries } from '@/server/analytics/demand';
import { BASE_URL } from '@/lib/config';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Destination Intelligence' };
export const dynamic = 'force-dynamic';

export default async function DestinationIntelligencePage(props: {
  searchParams: Promise<{ selected?: string }>;
}) {
  await requireGovernment();
  const { selected } = await props.searchParams;
  const pulse = computePulse();
  const targets = recommendCampaignTargets({
    demand: pulse.demand,
    capacity: pulse.capacity,
    sentiment: pulse.sentiment,
    alerts: pulse.alerts,
    concentration: pulse.concentration,
    limit: 14,
  });

  const sentimentById = new Map(pulse.sentiment.map((row) => [row.destinationId, row]));
  const capacityById = new Map(pulse.capacity.map((row) => [row.destinationId, row]));
  const actionById = new Map<string, string>();
  for (const target of targets.recommended) {
    actionById.set(
      target.destinationId,
      `Promotion candidate, score ${target.score}${target.conditions.length > 0 ? ` (conditions apply)` : ''}`,
    );
  }
  for (const target of targets.excluded) {
    actionById.set(target.destinationId, target.exclusionReason ?? 'No action');
  }

  const selectedDestination = selected ? getDestination(selected) : undefined;

  const mapPoints = pulse.demand
    .map((row) => {
      const destination = getDestination(row.destinationId);
      if (!destination) return undefined;
      return {
        destination,
        demandIndex: row.demandIndex,
        href: `/gov/destinations?selected=${destination.id}`,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
          Destination Intelligence
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Demand, trend, reported capacity, sentiment and a recommended action for every destination
          on the platform. {pulse.window.label}.
        </p>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="All destinations"
            subtitle="Sorted by weighted activity. Select a row for the detail panel."
            action={<ProvenanceBadge provenance="PLATFORM_OBSERVED" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
              <thead>
                <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] uppercase tracking-[0.06em] text-ink-500">
                  <th className="px-4 py-2 font-semibold">Destination</th>
                  <th className="px-3 py-2 text-right font-semibold">Demand</th>
                  <th className="px-3 py-2 text-right font-semibold">Trend</th>
                  <th className="px-3 py-2 text-right font-semibold">Partner capacity</th>
                  <th className="px-3 py-2 text-right font-semibold">Satisfaction</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Recommended action</th>
                </tr>
              </thead>
              <tbody>
                {pulse.demand.map((row) => {
                  const destination = getDestination(row.destinationId);
                  if (!destination) return null;
                  const feeling = sentimentById.get(row.destinationId);
                  const supply = capacityById.get(row.destinationId);
                  const isSelected = selected === row.destinationId;

                  return (
                    <tr
                      key={row.destinationId}
                      className={cn(
                        'border-b border-line/70 align-top transition-colors hover:bg-surface-2/60',
                        isSelected && 'bg-brand-50',
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/gov/destinations?selected=${row.destinationId}`}
                          className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <span className="block text-[11px] text-ink-500">{row.district}</span>
                      </td>
                      <td className="num px-3 py-2.5 text-right font-semibold">{row.demandIndex}</td>
                      <td className="px-3 py-2.5 text-right">
                        <TrendChip percent={row.trendPercent} label="vs previous window" />
                      </td>
                      <td className="num px-3 py-2.5 text-right">
                        {supply && supply.totalCapacity > 0 ? (
                          <>
                            {supply.availableCapacity}
                            <span className="text-ink-500">/{supply.totalCapacity}</span>
                          </>
                        ) : (
                          <span className="text-[12px] text-ink-500">No reports</span>
                        )}
                      </td>
                      <td className="num px-3 py-2.5 text-right">
                        {feeling?.averageRating !== null && feeling?.averageRating !== undefined ? (
                          <>
                            {feeling.averageRating.toFixed(2)}
                            <span className="text-ink-500"> ({feeling.responses})</span>
                          </>
                        ) : (
                          <span className="text-[12px] text-ink-500">No responses</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={destination.status} />
                      </td>
                      <td className="max-w-[280px] px-4 py-2.5 text-[12px] text-ink-700">
                        {actionById.get(row.destinationId) ?? 'No action'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CardBody className="pt-3">
            <Disclosure summary="How the recommended action is decided">
              {targets.method}
            </Disclosure>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Map" subtitle="Select a marker to open its detail." />
            <CardBody>
              <TourismMap points={mapPoints} {...(selected ? { selectedId: selected } : {})} />
            </CardBody>
          </Card>

          {selectedDestination ? (
            <DestinationDetail destinationId={selectedDestination.id} pulse={pulse} />
          ) : (
            <Card>
              <CardBody className="pt-4">
                <EmptyState
                  icon="◎"
                  title="No destination selected"
                  description="Choose a row in the table or a marker on the map to see its signals, supply base and events."
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DestinationDetail({
  destinationId,
  pulse,
}: {
  destinationId: string;
  pulse: ReturnType<typeof computePulse>;
}) {
  const destination = getDestination(destinationId);
  if (!destination) return null;

  const demand = pulse.demand.find((row) => row.destinationId === destinationId);
  const feeling = pulse.sentiment.find((row) => row.destinationId === destinationId);
  const supply = pulse.capacity.find((row) => row.destinationId === destinationId);
  const window = currentWindow();
  const series = computeActivitySeries(window, destinationId);
  const businesses = getBusinessesFor(destinationId);
  const experiences = getExperiencesFor(destinationId);
  const events = getEventsFor(destinationId);

  const mix = Object.entries(supply?.businessMix ?? {}) as [BusinessType, number][];

  return (
    <Card className="overflow-hidden">
      <DestinationVisual destination={destination} height="sm" />
      <CardHeader
        title={destination.name}
        subtitle={`${destination.district} district`}
        action={<StatusBadge status={destination.status} />}
      />
      <CardBody className="space-y-4">
        <p className="text-[13px] text-ink-700">{destination.summary}</p>

        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-md border border-line bg-surface-2/50 p-2.5">
            <dt className="text-ink-500">Demand index</dt>
            <dd className="num mt-0.5 text-[18px] font-semibold text-ink-900">
              {demand?.demandIndex ?? 0}
            </dd>
            <dd className="mt-1">
              <TrendChip percent={demand?.trendPercent ?? null} label="vs previous window" />
            </dd>
          </div>
          <div className="rounded-md border border-line bg-surface-2/50 p-2.5">
            <dt className="text-ink-500">Satisfaction</dt>
            <dd className="num mt-0.5 text-[18px] font-semibold text-ink-900">
              {feeling?.averageRating?.toFixed(2) ?? '—'}
            </dd>
            <dd className="mt-1 text-[11px] text-ink-500">
              {feeling?.responses ?? 0} responses in the window
            </dd>
          </div>
        </dl>

        <ChartFrame
          title="Daily weighted activity"
          provenance="PLATFORM_OBSERVED"
          table={{
            columns: ['Date', 'Weighted activity'],
            rows: series.slice(-8).map((point) => [point.date, point.value.toLocaleString('en-IN')]),
          }}
        >
          <LineChart
            points={series.map((point) => ({ label: point.date, value: point.value }))}
            unit="weighted interactions"
          />
        </ChartFrame>

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Supply base
          </h3>
          {businesses.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-strong bg-surface-2/50 px-3 py-3 text-[12px] text-ink-600">
              No participating tourism business here yet. Onboarding is the action, not promotion.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-2 text-[12px]">
                <div>
                  <dt className="text-ink-500">Businesses</dt>
                  <dd className="num font-semibold text-ink-900">
                    {businesses.filter((b) => b.status === 'PARTICIPATING').length}/{businesses.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Places free</dt>
                  <dd className="num font-semibold text-ink-900">
                    {supply?.availableCapacity ?? 0}/{supply?.totalCapacity ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Experiences</dt>
                  <dd className="num font-semibold text-ink-900">
                    {supply?.availableExperiences ?? 0}/{experiences.length}
                  </dd>
                </div>
              </dl>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mix.map(([type, count]) => (
                  <Badge key={type} tone="neutral">
                    {BUSINESS_TYPE_LABEL[type]} × {count}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-500">{supply?.coverageNote}</p>
            </>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Sensitivity and access
          </h3>
          <ul className="space-y-1 text-[12px] text-ink-700">
            <li>
              Ecological sensitivity: <strong>{destination.ecoSensitivity.toLowerCase()}</strong>
            </li>
            {destination.accessibilityNotes ? <li>{destination.accessibilityNotes}</li> : null}
            {destination.bestSeason ? <li>Best season: {destination.bestSeason}</li> : null}
          </ul>
        </section>

        {events.length > 0 ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Events on the calendar
            </h3>
            <ul className="space-y-1.5">
              {events.map((event) => (
                <li key={event.id} className="rounded-md border border-line bg-surface p-2.5 text-[12px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-ink-900">{event.name}</span>
                    <ProvenanceBadge provenance={event.provenance} />
                  </div>
                  <p className="mt-0.5 text-ink-600">{event.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Check-in code
          </h3>
          <div className="flex flex-wrap items-start gap-3 rounded-md border border-line bg-surface p-3">
            <QrCode
              value={`${BASE_URL}/explore/checkin/${destination.id}`}
              label={`QR code for checking in at ${destination.name}`}
              size={132}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-ink-700">
                Print and display at the site entrance. Scanning it opens a consent screen, and a
                visitor who declines is recorded as nothing at all.
              </p>
              <p className="mt-1.5 break-all font-mono text-[10px] text-ink-500">
                {`${BASE_URL}/explore/checkin/${destination.id}`}
              </p>
              <Link
                href={`/explore/checkin/${destination.id}`}
                className="mt-1.5 inline-block text-[12px] font-medium text-brand-700 underline"
              >
                Open what the visitor sees
              </Link>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {demand ? <ConfidenceBadge confidence={demand.confidence} /> : null}
          <Link
            href={`/gov/issues?destination=${destination.id}`}
            className="text-[12px] font-medium text-brand-700 underline"
          >
            Issues at {destination.name}
          </Link>
          <Link
            href={`/explore/destinations/${destination.id}`}
            className="text-[12px] font-medium text-brand-700 underline"
          >
            See the tourist view
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
