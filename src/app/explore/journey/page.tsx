import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { getDestination } from '@/server/data/repository';
import { getCurrentTrip, listSavedTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { deleteJourneyForm, switchJourneyForm } from '@/server/actions/forms';
import { ActionForm } from '@/components/shared/ActionForm';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';
import { JourneyTimeline } from '@/components/shared/JourneyTimeline';
import { ReplanControls, SaveTripButton } from '@/components/shared/ReplanControls';
import { TourismMap } from '@/components/shared/TourismMap';
import { replanCurrentTrip, saveCurrentTrip } from '@/server/actions/tourist';

export const metadata: Metadata = { title: 'Your journey' };
export const dynamic = 'force-dynamic';

export default async function JourneyPage() {
  const { sessionId } = await readVisitor();
  const [trip, saved] = await Promise.all([getCurrentTrip(sessionId), listSavedTrips(sessionId)]);
  const otherSaved = saved.filter((summary) => summary.id !== trip?.id);

  if (!trip) {
    return (
      <EmptyState
        icon="⟿"
        title="No journey yet"
        description="Tell the planner what kind of trip you want and it will build one around your own words."
        action={
          <Link
            href="/explore"
            className="rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
          >
            Plan a journey
          </Link>
        }
      />
    );
  }

  const profile = trip.preferences;
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
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="immersive px-5 py-6 sm:px-7">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/55">Your journey</p>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-white">
            {trip.theme}
          </h1>
          <p className="mt-2 text-[13px] text-white/70">
            {profile.durationDays} days · {formatLongDate(trip.startDate)} to{' '}
            {formatLongDate(trip.endDate)} · from {profile.startingPoint}
          </p>
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
              action={<Badge tone="neutral">{stops.length} stops</Badge>}
            />
            <CardBody>
              <JourneyTimeline trip={trip} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Something changed?" />
            <CardBody>
              <ReplanControls replan={replanCurrentTrip} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
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
                  <dt className="text-ink-500">Budget</dt>
                  <dd className="text-ink-900">{profile.budget.toLowerCase()}</dd>
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

              <Disclosure summary="How stops were ordered">
                Destinations are scored on how many of your interests they match, then adjusted for
                your crowd preference using each destination&rsquo;s share of current platform
                activity, and for any accessibility constraint. Each day is anchored on the best
                remaining destination and filled only with places within about 75 minutes of it, so a
                day is never a zig-zag. Travel times are estimates from straight-line distance with a
                hill-adjusted road factor, not routed times.
              </Disclosure>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <ProvenanceBadge provenance={trip.provenance} />
                <span className="text-[11px] text-ink-500">
                  Your plan is stored against an anonymous session, not an identity.
                </span>
              </div>

              <SaveTripButton
                key={trip.id}
                tripId={trip.id}
                save={saveCurrentTrip}
                saved={trip.status === 'SAVED'}
              />
            </CardBody>
          </Card>

          {otherSaved.length > 0 ? (
            <Card>
              <CardHeader
                title="Your other saved journeys"
                subtitle="Kept in this browser, under the same anonymous identifier as this plan."
              />
              <CardBody>
                <ul className="divide-y divide-line">
                  {otherSaved.map((summary) => (
                    <li key={summary.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-[13px] font-medium text-ink-900">{summary.theme}</p>
                        <p className="text-[12px] text-ink-500">
                          {summary.title} · {summary.stops} {summary.stops === 1 ? 'stop' : 'stops'} · from{' '}
                          {formatLongDate(summary.startDate)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActionForm
                          action={switchJourneyForm}
                          submitLabel="Open this journey"
                          pendingLabel="Opening…"
                          variant="secondary"
                          size="sm"
                          hiddenFields={{ tripId: summary.id }}
                        />
                        <ActionForm
                          action={deleteJourneyForm}
                          submitLabel="Delete"
                          pendingLabel="Deleting…"
                          variant="ghost"
                          size="sm"
                          hiddenFields={{ tripId: summary.id }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card tone="outline">
            <CardBody className="pt-4">
              <p className="text-[13px] text-ink-700">
                Ready to travel? The live trip view lets you check in and leave feedback as you go.
              </p>
              <Link
                href="/explore/trip"
                className="mt-2 inline-block text-[13px] font-medium text-brand-700 underline"
              >
                Open the live trip
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
