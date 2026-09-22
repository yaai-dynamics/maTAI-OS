import type { Metadata } from 'next';
import { CalendarDays, Route, Users } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPlanFor, journeyPhase, PHASE_LABEL } from '@/lib/journey';
import { formatRupees } from '@/lib/money';
import { getDestination } from '@/server/data/repository';
import { getTripFor } from '@/server/data/trips';
import { buildTripMap } from '@/server/data/trip-map';
import { readVisitor } from '@/server/telemetry/visitor';
import {
  askPlace,
  chooseJourney,
  endJourney,
  findPlacesOnline,
  getDestinationPreview,
  mapPlaceSnapshot,
  replanJourney,
  startJourney,
  tripRoutes,
} from '@/server/actions/tourist';
import { ProvenanceBadge } from '@/components/shared/badges';
import { JourneyTimeline } from '@/components/shared/JourneyTimeline';
import { ReplanControls } from '@/components/shared/ReplanControls';
import { SearchOnlineButton } from '@/components/shared/TripActions';
import { TripCostCard, TripIncludes } from '@/components/shared/TripIncludes';
import { TourismMap } from '@/components/shared/TourismMap';
import { TripMap } from '@/components/map/TripMap';
import { BackLink } from '@/components/mobile/BackLink';
import { MobileTripActions } from '@/components/mobile/MobileTripActions';
import { MobileEmpty, MobileHeader, PrimaryLink, Segmented, StickyActions, StickySpacer } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Your trip' };
export const dynamic = 'force-dynamic';

type View = 'plan' | 'map' | 'costs';

/** E2 on mobile: one plan or journey, in three tabs. */
export default async function MobileJourneyPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await props.params;
  const requested = (await props.searchParams).view;
  const view: View = requested === 'map' || requested === 'costs' ? requested : 'plan';
  const { sessionId } = await readVisitor();
  const trip = await getTripFor(sessionId, id);

  if (!trip) {
    return (
      <div>
        <MobileHeader title="Trip" backHref="/m/plan" />
        <MobileEmpty
          icon={<Route aria-hidden size={24} />}
          title="This trip is not available"
          description="It may have been replaced by a newer plan, deleted, or planned in another browser."
          action={<PrimaryLink href="/m/plan">Plan a trip</PrimaryLink>}
        />
      </div>
    );
  }

  const phase = journeyPhase(trip, now());
  const profile = trip.preferences;
  const stops = trip.items.filter((item) => item.kind === 'DESTINATION');
  const base = `/m/journey/${trip.id}`;

  return (
    <div>
      {/* Hero */}
      <section className="immersive -mx-4 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <BackLink fallbackHref="/m/plan" tone="glass" className="-ml-1" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.12em] text-white/60">
            {trip.status === 'DRAFT' ? `Option · ${trip.optionLabel ?? 'Plan'}` : 'Your trip'}
          </span>
          <span
            className={
              phase === 'IN_PROGRESS'
                ? 'rounded-full bg-lake-500/40 px-2 py-0.5 text-[11px] font-medium text-lake-50'
                : 'rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/85'
            }
          >
            {phase === 'OPTION' ? 'Not kept yet' : PHASE_LABEL[phase]}
          </span>
        </div>
        <h1 className="mt-1.5 text-[24px] font-semibold leading-tight text-white">{trip.theme}</h1>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-white/75">
          <span className="flex items-center gap-1.5">
            <CalendarDays aria-hidden size={14} />
            {formatPlanFor(trip) ?? `${profile.durationDays} ${profile.durationDays === 1 ? 'day' : 'days'}`}
          </span>
          <span className="flex items-center gap-1.5">
            <Users aria-hidden size={14} />
            {profile.travellers} {profile.travellers === 1 ? 'traveller' : 'travellers'}
          </span>
          <span className="flex items-center gap-1.5">
            <Route aria-hidden size={14} />
            {stops.length} places from {profile.startingPoint}
          </span>
        </div>
        {profile.budgetAmount ? (
          <p className="mt-1.5 text-[12px] text-white/75">Budget {formatRupees(profile.budgetAmount)}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.interests.map((interest) => (
            <span key={interest} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/85">
              {interest}
            </span>
          ))}
        </div>
      </section>

      {trip.adaptedReason ? (
        <p className="mt-4 rounded-2xl border border-lake-200 bg-lake-50 p-3.5 text-[13px] text-ink-800">
          <span className="font-semibold text-lake-800">Plan updated. </span>
          {trip.adaptedReason}
        </p>
      ) : null}

      <div className="sticky top-0 z-20 -mx-4 bg-paper/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
        <Segmented
          label="Trip view"
          active={view}
          options={[
            { value: 'plan', label: 'Day by day', href: base },
            { value: 'map', label: 'Map', href: `${base}?view=map` },
            { value: 'costs', label: 'Costs', href: `${base}?view=costs` },
          ]}
        />
      </div>

      {view === 'plan' ? (
        <div className="space-y-5">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <JourneyTimeline trip={trip} ask={askPlace} />
          </div>
          {trip.status === 'COMPLETED' ? null : (
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="text-[15px] font-semibold text-ink-900">Something changed?</p>
              <p className="mb-3 mt-0.5 text-[12px] text-ink-500">Rain, a closed road, less energy. The affected part is rebuilt.</p>
              <ReplanControls replan={replanJourney.bind(null, trip.id)} />
            </div>
          )}
        </div>
      ) : view === 'map' ? (
        <div className="-mx-4 overflow-hidden">
          <TripMap
            data={buildTripMap(trip)}
            routes={tripRoutes}
            snapshot={mapPlaceSnapshot}
            getPreview={getDestinationPreview}
            askPlace={askPlace}
            variant="full"
            fullHref={`${base}?view=map`}
            fallback={
              <TourismMap
                points={stops.flatMap((item, index) => {
                  const destination = getDestination(item.destinationId);
                  return destination
                    ? [{ destination, demandIndex: 100 - index * 12, href: `/m/place/${destination.id}` }]
                    : [];
                })}
                showLabelsFor={stops.length}
              />
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <TripCostCard trip={trip} />
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
          <div className="flex flex-wrap items-center gap-2 px-1">
            <ProvenanceBadge provenance={trip.provenance} />
            <span className="text-[11px] text-ink-500">Stored against an anonymous session, not an identity.</span>
          </div>
        </div>
      )}

      <StickySpacer />
      <StickyActions>
        <MobileTripActions
          tripId={trip.id}
          status={trip.status}
          phase={phase}
          choose={chooseJourney}
          start={startJourney}
          end={endJourney}
        />
      </StickyActions>
    </div>
  );
}
