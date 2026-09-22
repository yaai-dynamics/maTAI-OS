import Link from 'next/link';
import type { Metadata } from 'next';
import { Check, MapPin, MessageSquareHeart, Navigation } from 'lucide-react';

import { ISSUE_CATEGORY_LABEL, type Trip } from '@/lib/types';
import { formatDuration } from '@/lib/geo';
import { now } from '@/lib/config';
import { formatPlanFor, istDate, journeyPhase, PHASE_LABEL } from '@/lib/journey';
import { currentWindow } from '@/server/analytics/windows';
import { computeDestinationSentiment } from '@/server/analytics/sentiment';
import { getDestination, getFeedback, getInteractions } from '@/server/data/repository';
import { getCurrentTrip, listTrips } from '@/server/data/trips';
import { isSessionRecord } from '@/server/data/store';
import { readVisitor } from '@/server/telemetry/visitor';
import { buildTripMap } from '@/server/data/trip-map';
import { checkInForm, submitFeedbackForm } from '@/server/actions/forms';
import {
  askPlace,
  endJourney,
  getDestinationPreview,
  mapPlaceSnapshot,
  replanCurrentTrip,
  startJourney,
  tripRoutes,
} from '@/server/actions/tourist';
import { ProvenanceBadge } from '@/components/shared/badges';
import { FeedbackCard } from '@/components/shared/cards';
import { DestinationSwatch } from '@/components/shared/DestinationVisual';
import { ReplanControls } from '@/components/shared/ReplanControls';
import { TripButton } from '@/components/shared/TripActions';
import { TourismMap } from '@/components/shared/TourismMap';
import { TripMap } from '@/components/map/TripMap';
import { MobileField, MobileForm, StarRating, mobileInput } from '@/components/mobile/form';
import { MobileEmpty, MobileHeader, PrimaryLink, Section } from '@/components/mobile/ui';
import { cn } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Live trip' };
export const dynamic = 'force-dynamic';

const POSITIVE_THEMES = ['EXPERIENCE', 'NATURE', 'HERITAGE', 'CULTURE', 'FOOD', 'HOSPITALITY'] as const;
const POSITIVE_LABEL: Record<(typeof POSITIVE_THEMES)[number], string> = {
  EXPERIENCE: 'The experience',
  NATURE: 'Nature',
  HERITAGE: 'Heritage',
  CULTURE: 'Culture',
  FOOD: 'Food',
  HOSPITALITY: 'Hospitality',
};

/** E6 on mobile: today's stops, check-in and feedback while travelling. */
export default async function MobileTripPage(props: { searchParams: Promise<{ destination?: string }> }) {
  const { destination: destinationParam } = await props.searchParams;
  const { sessionId } = await readVisitor();
  const trip = await getCurrentTrip(sessionId);

  if (!trip) {
    const at = now();
    const startable = (await listTrips(sessionId))
      .map((row) => ({ row, phase: journeyPhase(row, at) }))
      .filter(({ phase }) => phase === 'UPCOMING' || phase === 'FINALISED');
    return (
      <div>
        <MobileHeader title="Live trip" />
        <MobileEmpty
          icon={<Navigation aria-hidden size={24} />}
          title="No trip in progress"
          description={
            startable.length > 0
              ? 'Start the trip you are on to check in and leave feedback as you travel.'
              : 'Plan a trip and keep one of its options. This is where you check in and leave feedback as you travel.'
          }
          action={startable.length > 0 ? undefined : <PrimaryLink href="/m/plan">Plan a trip</PrimaryLink>}
        />
        {startable.length > 0 ? (
          <Section title="Your trips">
            <ul className="space-y-2">
              {startable.map(({ row, phase }) => (
                <li key={row.id} className="rounded-2xl bg-surface p-4 shadow-card">
                  <Link href={`/m/journey/${row.id}`} className="block">
                    <p className="text-[15px] font-semibold text-ink-900">{row.theme}</p>
                    <p className="text-[12px] text-ink-500">
                      {PHASE_LABEL[phase]} · {formatPlanFor(row) ?? 'dates not set'}
                    </p>
                  </Link>
                  <div className="mt-3">
                    <TripButton tripId={row.id} action={startJourney} label="Start this trip" pendingLabel="Starting…" />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    );
  }

  const stops = trip.items.filter((item) => item.kind === 'DESTINATION');
  const today = dayOfTrip(trip);
  const todayStops = stops.filter((item) => item.day === today);
  const upcoming = stops.filter((item) => item.day > today);

  const focusId = destinationParam ?? todayStops[0]?.destinationId ?? stops[0]?.destinationId;
  const focus = focusId ? getDestination(focusId) : undefined;
  const focusSentiment = computeDestinationSentiment(currentWindow()).find((row) => row.destinationId === focusId);

  // What this session contributed, so the tourist-to-government loop is visible.
  const myCheckins = getInteractions({ types: ['QR_CHECKIN'] }).filter((row) => isSessionRecord(row.id));
  const myFeedback = getFeedback({}).filter((row) => isSessionRecord(row.id));
  const checkedIn = (id: string) => myCheckins.some((row) => row.destinationId === id);

  return (
    <div>
      <MobileHeader
        title="Live trip"
        subtitle={`${trip.theme} · Day ${today} of ${Math.max(trip.preferences.durationDays, 1)}`}
        action={
          trip.status === 'ACTIVE' ? (
            <TripButton tripId={trip.id} action={endJourney} label="End" pendingLabel="Ending…" variant="secondary" />
          ) : undefined
        }
      />

      {/* Today */}
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-500">Today</p>
      {todayStops.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-[13px] text-ink-600 shadow-card">Nothing planned for today.</p>
      ) : (
        <ul className="space-y-2">
          {todayStops.map((item) => {
            const destination = getDestination(item.destinationId);
            if (!destination) return null;
            const selected = destination.id === focusId;
            return (
              <li key={item.id}>
                <Link
                  href={`/m/trip?destination=${destination.id}`}
                  replace
                  scroll={false}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card',
                    selected && 'ring-2 ring-brand-500',
                  )}
                >
                  <DestinationSwatch destination={destination} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink-900">{destination.name}</span>
                    <span className="num block text-[12px] text-ink-500">
                      {item.startTime} · {formatDuration(item.durationMinutes)}
                    </span>
                  </span>
                  {checkedIn(destination.id) ? (
                    <span className="flex items-center gap-1 rounded-full bg-good-100 px-2 py-0.5 text-[11px] font-medium text-good-700">
                      <Check aria-hidden size={12} />
                      Checked in
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {upcoming.length > 0 ? (
        <details className="mt-3 rounded-2xl bg-surface p-4 shadow-card">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-700">
            Coming up · {upcoming.length} more {upcoming.length === 1 ? 'stop' : 'stops'}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {upcoming.map((item) => (
              <li key={item.id} className="flex items-center justify-between text-[13px]">
                <Link href={`/m/trip?destination=${item.destinationId}`} replace scroll={false} className="text-ink-800">
                  {getDestination(item.destinationId)?.name}
                </Link>
                <span className="text-[11px] text-ink-500">Day {item.day}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {focus ? (
        <>
          <Section title={`At ${focus.name}`} action={<Link href={`/m/place/${focus.id}`} className="text-[13px] font-medium text-brand-700">About</Link>}>
            {/* Check in */}
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
                <MapPin aria-hidden size={17} className="text-lake-600" />
                Check in
              </p>
              <p className="mb-3 mt-0.5 text-[12px] text-ink-500">Counts the visit. Records no identity, and you can decline.</p>
              {checkedIn(focus.id) ? (
                <p className="flex items-center gap-2 rounded-xl bg-good-100 px-3.5 py-3 text-[13px] font-medium text-good-700">
                  <Check aria-hidden size={16} />
                  You checked in here in this session.
                </p>
              ) : (
                <MobileForm
                  action={checkInForm}
                  submitLabel="Check in here"
                  pendingLabel="Checking in…"
                  hiddenFields={{ destinationId: focus.id }}
                  refreshOnSuccess
                >
                  <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-ink-800">
                    <input type="checkbox" name="consent" defaultChecked className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand-600)]" />
                    <span>
                      Record an anonymous check-in. It is stored against a random session identifier and only ever shown to
                      the Tourism Department as part of an aggregate.
                    </span>
                  </label>
                </MobileForm>
              )}
            </div>

            {/* Feedback */}
            <div className="mt-3 rounded-2xl bg-surface p-4 shadow-card">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
                <MessageSquareHeart aria-hidden size={17} className="text-lily-500" />
                How was {focus.name}?
              </p>
              <p className="mb-4 mt-0.5 text-[12px] text-ink-500">This turns a visit into a signal the department can act on.</p>
              <MobileForm
                action={submitFeedbackForm}
                submitLabel="Send feedback"
                pendingLabel="Sending…"
                hiddenFields={{ destinationId: focus.id }}
                refreshOnSuccess
                after={
                  <p className="text-[11px] text-ink-500">
                    Your text is anonymised before it reaches the Tourism Department. No contact details are stored.
                  </p>
                }
              >
                <StarRating name="rating" />
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium text-ink-700">
                    What is it about<span className="ml-0.5 text-risk-500">*</span>
                  </legend>
                  <p className="mb-1.5 text-[11px] text-ink-500">Something to fix</p>
                  <CategoryChips values={Object.keys(ISSUE_CATEGORY_LABEL) as (keyof typeof ISSUE_CATEGORY_LABEL)[]} labels={SHORT_ISSUE} defaultValue="TRANSPORT" />
                  <p className="mb-1.5 mt-3 text-[11px] text-ink-500">Something that worked</p>
                  <CategoryChips values={[...POSITIVE_THEMES]} labels={POSITIVE_LABEL} />
                </fieldset>
                <MobileField label="In your words" htmlFor="text" required>
                  <textarea
                    id="text"
                    name="text"
                    rows={3}
                    required
                    maxLength={600}
                    placeholder="Beautiful place, but transport information was confusing."
                    className={mobileInput}
                  />
                </MobileField>
              </MobileForm>
            </div>
          </Section>

          {focusSentiment && focusSentiment.responses > 0 ? (
            <Section title="What others said here">
              <p className="mb-2 text-[12px] text-ink-500">
                {focusSentiment.responses} responses in 30 days, averaging {focusSentiment.averageRating?.toFixed(1)} of 5.
              </p>
              {focusSentiment.topIssue ? (
                <p className="mb-3 rounded-xl border border-warn-500/25 bg-warn-100/60 px-3.5 py-2.5 text-[12px] text-warn-700">
                  Most reported here: {focusSentiment.topIssue.label} ({focusSentiment.topIssue.count} reports).
                </p>
              ) : null}
              <ul className="space-y-2">
                {getFeedback({ destinationId: focusId })
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 3)
                  .map((entry) => (
                    <li key={entry.id}>
                      <FeedbackCard feedback={entry} destinationName={focus.name} isNew={isSessionRecord(entry.id)} />
                    </li>
                  ))}
              </ul>
            </Section>
          ) : null}
        </>
      ) : null}

      <Section title="Route">
        <div className="-mx-4 overflow-hidden">
          <TripMap
            data={buildTripMap(trip)}
            routes={tripRoutes}
            snapshot={mapPlaceSnapshot}
            getPreview={getDestinationPreview}
            askPlace={askPlace}
            variant="card"
            initialDay={today}
            fullHref={`/m/journey/${trip.id}?view=map`}
            fallback={
              <TourismMap
                points={stops.flatMap((item, index) => {
                  const destination = getDestination(item.destinationId);
                  return destination ? [{ destination, demandIndex: 100 - index * 12 }] : [];
                })}
                showLabelsFor={stops.length}
              />
            }
          />
        </div>
      </Section>

      <Section title="Adapt the plan">
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <p className="mb-3 text-[12px] text-ink-500">One change, and the affected part of the route is rebuilt.</p>
          <ReplanControls replan={replanCurrentTrip} />
        </div>
      </Section>

      {myFeedback.length > 0 || myCheckins.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-lake-200 bg-lake-50 p-4">
          <p className="text-[15px] font-semibold text-ink-900">What you contributed</p>
          <p className="mt-0.5 text-[12px] text-ink-600">Already visible, anonymised and aggregated, to the Tourism Department.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded-full bg-lake-100 px-2.5 py-1 font-medium text-lake-700">{myCheckins.length} check-ins</span>
            <span className="rounded-full bg-lake-100 px-2.5 py-1 font-medium text-lake-700">{myFeedback.length} feedback</span>
            <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
          </div>
        </div>
      ) : null}

      <p className="mt-5 text-center">
        <Link href={`/m/journey/${trip.id}`} className="text-[13px] font-medium text-brand-700">
          Full trip details
        </Link>
      </p>
    </div>
  );
}

const SHORT_ISSUE: Record<keyof typeof ISSUE_CATEGORY_LABEL, string> = {
  TRANSPORT: 'Transport',
  CLEANLINESS: 'Cleanliness',
  SIGNAGE: 'Signage',
  SAFETY: 'Safety',
  CONNECTIVITY: 'Mobile signal',
  FACILITIES: 'Toilets & water',
  PRICING: 'Pricing',
  CROWDING: 'Crowding',
  ACCESSIBILITY: 'Accessibility',
  GUIDE_QUALITY: 'Guides & info',
};

/** Radio chips for the feedback category; one group across both lists. */
function CategoryChips<T extends string>({
  values,
  labels,
  defaultValue,
}: {
  values: readonly T[];
  labels: Record<T, string>;
  defaultValue?: T;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <label
          key={value}
          className="cursor-pointer rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-700 has-[:checked]:border-ink-900 has-[:checked]:bg-ink-900 has-[:checked]:text-white"
        >
          <input
            type="radio"
            name="category"
            value={value}
            required
            defaultChecked={value === defaultValue}
            className="sr-only"
          />
          {labels[value]}
        </label>
      ))}
    </div>
  );
}

/** Which day of the trip today is, as on the desktop live trip page. */
function dayOfTrip(trip: Trip): number {
  const days = Math.max(1, trip.preferences.durationDays);
  const from = trip.startDate ?? (trip.startedAt ? istDate(new Date(trip.startedAt)) : undefined);
  if (!from) return 1;
  const elapsed = Math.floor((Date.parse(istDate(now())) - Date.parse(from)) / 86_400_000);
  return Math.min(days, Math.max(1, elapsed + 1));
}
