import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight, CalendarDays, Clock } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPlanFor, formatPlannedOn, journeyPhase, PHASE_LABEL } from '@/lib/journey';
import { formatRupees } from '@/lib/money';
import { getDestination } from '@/server/data/repository';
import { costTrip } from '@/server/ai/trip-logistics';
import { getTripFor, listTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';
import { JourneyTimeline } from '@/components/shared/JourneyTimeline';
import { ReplanControls } from '@/components/shared/ReplanControls';
import { SearchOnlineButton, TripActions } from '@/components/shared/TripActions';
import { TripCostCard, TripIncludes } from '@/components/shared/TripIncludes';
import { TourismMap } from '@/components/shared/TourismMap';
import {
  askPlace,
  chooseJourney,
  endJourney,
  findPlacesOnline,
  replanJourney,
  startJourney,
} from '@/server/actions/tourist';

export const metadata: Metadata = { title: 'Your trip' };
export const dynamic = 'force-dynamic';

/** E2: one plan or journey, opened from the planner or the list beside it. */
export default async function JourneyPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { sessionId } = await readVisitor();
  // Read with the session, so a journey id from another browser finds nothing.
  const trip = await getTripFor(sessionId, id);

  const back = (
    <ButtonLink href="/explore" variant="ghost" size="sm" className="-ml-2">
      <ArrowLeft aria-hidden size={16} />
      Your trips
    </ButtonLink>
  );

  if (!trip) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState
          icon="⟿"
          title="This trip is not available"
          description="It may have been replaced by a newer plan, not chosen from its options, or deleted, or it was planned in another browser."
          action={
            <Link
              href="/explore"
              className="rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
            >
              Plan a trip
            </Link>
          }
        />
      </div>
    );
  }

  const phase = journeyPhase(trip, now());
  const siblings =
    trip.status === 'DRAFT' && trip.optionGroupId
      ? (await listTrips(sessionId)).filter((row) => row.optionGroupId === trip.optionGroupId && row.id !== trip.id)
      : [];
  const profile = trip.preferences;
  const planFor = formatPlanFor(trip);
  const stops = trip.items.filter((item) => item.kind === 'DESTINATION');
  const mapPoints = stops
    .map((item, index) => {
      const destination = getDestination(item.destinationId);
      if (!destination) return undefined;
      return {
        destination,
        demandIndex: 100 - index * 12,
        href: `/explore/destinations/${destination.id}`,
        caption: `Day ${item.day}, stop ${item.sequence}.`,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== undefined);

  return (
    <div className="space-y-5">
      {back}

      <Card className="overflow-hidden">
        <div className="immersive px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] uppercase tracking-[0.12em] text-white/55">
              {trip.status === 'DRAFT' ? `Option · ${trip.optionLabel ?? 'Plan'}` : 'Your trip'}
            </p>
            <span
              className={
                phase === 'IN_PROGRESS'
                  ? 'rounded-full bg-lake-500/35 px-2 py-0.5 text-[11px] font-medium text-lake-100'
                  : 'rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80'
              }
            >
              {phase === 'OPTION' ? 'Not chosen yet' : PHASE_LABEL[phase]}
            </span>
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-white">{trip.theme}</h1>
          <p className="mt-2 text-[13px] text-white/70">
            {profile.durationDays} {profile.durationDays === 1 ? 'day' : 'days'} · from {profile.startingPoint} ·{' '}
            {profile.travellers} {profile.travellers === 1 ? 'traveller' : 'travellers'}
            {profile.budgetAmount ? ` · budget ${formatRupees(profile.budgetAmount)}` : ''}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
            <div className="flex items-center gap-1.5">
              <CalendarDays aria-hidden size={14} className="text-white/50" />
              <dt className="text-white/55">Plan for</dt>
              <dd className="text-white">{planFor ?? 'Dates not set'}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock aria-hidden size={14} className="text-white/50" />
              <dt className="text-white/55">Planned on</dt>
              <dd className="text-white">{formatPlannedOn(trip.createdAt)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.interests.map((interest) => (
              <span
                key={interest}
                className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/85"
              >
                {interest}
              </span>
            ))}
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/85">
              {profile.crowdPreference === 'QUIET'
                ? 'quieter places'
                : profile.crowdPreference === 'POPULAR'
                  ? 'the highlights'
                  : 'a mix'}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/85">
              {profile.pace.toLowerCase()} pace
            </span>
          </div>
        </div>
      </Card>

      {trip.adaptedReason ? (
        <Card className="border-lake-200 bg-lake-50/60">
          <CardBody className="pt-4">
            <p className="text-[13px] font-medium text-lake-800">Plan updated</p>
            <p className="mt-0.5 text-[13px] text-ink-800">{trip.adaptedReason}</p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Day by day"
              subtitle="Each stop says why it is here, in terms of what you asked for."
              action={<Badge tone="neutral">{stops.length} places</Badge>}
            />
            <CardBody>
              <JourneyTimeline trip={trip} ask={askPlace} />
            </CardBody>
          </Card>

          <TripIncludes
            trip={trip}
            searchAction={
              <SearchOnlineButton
                tripId={trip.id}
                search={findPlacesOnline}
                label={trip.logistics?.online.status === 'NOT_RUN' ? 'Search online' : 'Search again'}
              />
            }
          />

          {trip.status === 'COMPLETED' ? null : (
            <Card>
              <CardHeader title="Something changed?" />
              <CardBody>
                <ReplanControls replan={replanJourney.bind(null, trip.id)} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={trip.status === 'DRAFT' ? 'Keep this plan?' : 'This trip'} />
            <CardBody>
              <TripActions
                tripId={trip.id}
                status={trip.status}
                phase={phase}
                choose={chooseJourney}
                start={startJourney}
                end={endJourney}
              />
              {siblings.length > 0 ? (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <p className="text-[12px] text-ink-500">
                    {siblings.length === 1 ? 'The other option:' : `The other ${siblings.length} options:`}
                  </p>
                  {siblings.map((row) => {
                    const rowCost = costTrip(row);
                    const stops = row.items.filter((item) => item.kind === 'DESTINATION').length;
                    return (
                      <Link
                        key={row.id}
                        href={`/explore/journey/${row.id}`}
                        className="flex items-center gap-3 rounded-lg border border-line-strong bg-surface px-3.5 py-3 transition-colors hover:border-lake-300 hover:bg-lake-50/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-lake-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-lake-700">
                              {row.optionLabel ?? 'Option'}
                            </span>
                            <span className="truncate text-[13px] font-semibold text-ink-900">{row.theme}</span>
                          </div>
                          <p className="mt-1 text-[12px] text-ink-600">
                            {row.preferences.durationDays} {row.preferences.durationDays === 1 ? 'day' : 'days'} ·{' '}
                            {stops} {stops === 1 ? 'place' : 'places'} · {formatRupees(rowCost.total)} estimated
                            {rowCost.budget ? (rowCost.budget.fits ? ' · within budget' : ' · over budget') : ''}
                          </p>
                        </div>
                        <ArrowRight aria-hidden size={16} className="shrink-0 text-ink-400" />
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <TripCostCard trip={trip} />

          <Card>
            <CardHeader title="The route" />
            <CardBody>
              <TourismMap points={mapPoints} showLabelsFor={mapPoints.length} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="How this was built" />
            <CardBody className="space-y-3">
              <dl className="space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Travel style</dt>
                  <dd className="text-right text-ink-900">{profile.travelStyle}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Stays</dt>
                  <dd className="text-ink-900">
                    {profile.budget === 'BUDGET' ? 'simple' : profile.budget === 'PREMIUM' ? 'premium' : 'comfortable'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Accessibility</dt>
                  <dd className="text-ink-900">
                    {profile.accessibility === 'NONE'
                      ? 'no constraints given'
                      : profile.accessibility.replace(/_/g, ' ').toLowerCase()}
                  </dd>
                </div>
              </dl>

              {profile.rawRequest ? (
                <Disclosure summary="What you told us">
                  <p className="italic text-ink-700">“{profile.rawRequest}”</p>
                </Disclosure>
              ) : null}

              <Disclosure summary="How the plan was put together">
                Destinations are scored on how many of your interests they match, then adjusted for your
                crowd preference using each destination&rsquo;s share of current platform activity, and
                for any accessibility constraint. Each day starts where the night before was spent and
                is anchored on the best remaining place that fits the day, with long drives counted
                against it; the last day leans back towards Imphal. A night is spent where the day ends
                when a verified partner can host you there, and otherwise back in Imphal when it is
                close enough. Stays, transport and guides come only from verified partners, at their
                own rates.
              </Disclosure>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <ProvenanceBadge provenance={trip.provenance} />
                <span className="text-[11px] text-ink-500">
                  Your plan is stored against an anonymous session, not an identity.
                </span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
