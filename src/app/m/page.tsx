import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, CalendarDays, Layers, Navigation, Sparkles } from 'lucide-react';

import { DEMO_MODE, now } from '@/lib/config';
import { formatShortDate } from '@/lib/date';
import { formatPlanFor, journeyPhase, PHASE_LABEL } from '@/lib/journey';
import { currentWindow } from '@/server/analytics/windows';
import { computeDemand } from '@/server/analytics/demand';
import {
  getBusiness,
  getDestination,
  getDestinations,
  getEvents,
  getExperiences,
  getHeritageExperiences,
} from '@/server/data/repository';
import { getCurrentTrip, listTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { photoFor } from '@/lib/mobile/photos';
import { DemoChip, ExperienceRow, PlaceTile, Rail, SeeAll, Section } from '@/components/mobile/ui';

export const metadata: Metadata = { title: { absolute: 'maTAI — Explore Manipur' } };
export const dynamic = 'force-dynamic';

const PROMPTS = [
  '3 days of nature and local food, less crowded',
  'Heritage around Imphal with my parents',
  'Sunrise on Loktak and photography',
];

/** Mobile home: the planner up front, then places, heritage and experiences. */
export default async function MobileHome() {
  const { sessionId } = await readVisitor();
  const at = now();
  const [current, trips] = await Promise.all([getCurrentTrip(sessionId), listTrips(sessionId)]);
  const kept = trips.filter((trip) => trip.status !== 'DRAFT' && trip.id !== current?.id).slice(0, 3);

  const demand = computeDemand(currentWindow());
  const byDemand = new Map(demand.map((row) => [row.destinationId, row]));
  const destinations = getDestinations();
  const popular = [...destinations]
    .sort((a, b) => (byDemand.get(b.id)?.weightedScore ?? 0) - (byDemand.get(a.id)?.weightedScore ?? 0))
    .slice(0, 6);
  // Places with room to grow and little attention yet: where the department
  // would like visitors to spread.
  const quiet = destinations
    .filter((destination) => destination.capacitySignal !== 'LOW' && !popular.slice(0, 3).includes(destination))
    .sort((a, b) => (byDemand.get(a.id)?.weightedScore ?? 0) - (byDemand.get(b.id)?.weightedScore ?? 0))
    .slice(0, 5);

  const heritage = getHeritageExperiences()
    .map((experience) => ({ experience, destination: getDestination(experience.destinationId) }))
    .filter((entry) => entry.destination);

  const experiences = getExperiences()
    .filter((experience) => experience.availabilityStatus === 'AVAILABLE' && experience.verified)
    .slice(0, 3);

  const events = getEvents()
    .filter((event) => new Date(event.endAt) >= at)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 3);

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium text-ink-500">Welcome to</p>
          <p className="text-[22px] font-bold tracking-tight text-ink-900">Manipur</p>
        </div>
        <div className="flex items-center gap-2">
          {DEMO_MODE ? <DemoChip /> : null}
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-700 text-[15px] font-bold text-white">
            m
          </span>
        </div>
      </header>

      {/* Planner entry */}
      <section className="immersive mt-4 overflow-hidden rounded-3xl p-5">
        <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em] text-lake-200">
          <Sparkles aria-hidden size={14} />
          AI trip planner
        </p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight text-white">
          Where would you like to go in Manipur?
        </h1>
        <Link
          href="/m/plan"
          className="mt-4 flex h-12 items-center gap-2 rounded-2xl bg-white/95 px-4 text-[14px] text-ink-500 active:scale-[0.99]"
        >
          <Sparkles aria-hidden size={16} className="text-brand-600" />
          Describe your trip…
        </Link>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PROMPTS.map((prompt) => (
            <Link
              key={prompt}
              href={`/m/plan?plan=${encodeURIComponent(prompt)}`}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] text-white/90 active:bg-white/20"
            >
              {prompt}
            </Link>
          ))}
        </div>
      </section>

      {current ? (
        <Link
          href="/m/trip"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-lake-200 bg-lake-50 p-4 active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lake-600 text-white">
            <Navigation aria-hidden size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-lake-700">
              Trip in progress
            </span>
            <span className="block truncate text-[15px] font-semibold text-ink-900">{current.theme}</span>
          </span>
          <ArrowRight aria-hidden size={18} className="text-lake-700" />
        </Link>
      ) : null}

      {kept.length > 0 ? (
        <Section title="Your trips" action={<SeeAll href="/m/plan#trips" />}>
          <ul className="space-y-2">
            {kept.map((trip) => (
              <li key={trip.id}>
                <Link
                  href={`/m/journey/${trip.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-card"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink-900">{trip.theme}</span>
                    <span className="block text-[12px] text-ink-500">
                      {PHASE_LABEL[journeyPhase(trip, at)]} · {formatPlanFor(trip) ?? `${trip.preferences.durationDays} days`}
                    </span>
                  </span>
                  <ArrowRight aria-hidden size={16} className="shrink-0 text-ink-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Popular right now" action={<SeeAll href="/m/discover" />}>
        <Rail label="Popular destinations">
          {popular.map((destination) => (
            <PlaceTile key={destination.id} destination={destination} href={`/m/place/${destination.id}`} />
          ))}
        </Rail>
        <p className="mt-1 text-[11px] text-ink-500">
          Ranked by attention on this platform over 30 days, not visitor counts.
        </p>
      </Section>

      {heritage.length > 0 ? (
        <Section title="Living heritage">
          <ul className="space-y-3">
            {heritage.map(({ experience, destination }) => (
              <li key={experience.id}>
                <Link
                  href={`/m/place/${destination!.id}/heritage`}
                  className="relative block overflow-hidden rounded-3xl active:scale-[0.99]"
                >
                  <PlacePhoto
                    src={photoFor(destination!.id)?.sm}
                    alt={destination!.name}
                    overlay
                    className="h-44"
                    fallback={<DestinationVisual destination={destination!} height="lg" overlay />}
                  />
                  <div className="absolute inset-0 flex flex-col justify-end p-4">
                    <span className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                      <Layers aria-hidden size={12} />
                      {experience.layers.length} story layers
                    </span>
                    <p className="text-[17px] font-semibold leading-tight text-white">{experience.title}</p>
                    <p className="text-[12px] text-white/80">{experience.subtitle}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {quiet.length > 0 ? (
        <Section title="Quieter gems">
          <Rail label="Less crowded destinations">
            {quiet.map((destination) => (
              <PlaceTile
                key={destination.id}
                destination={destination}
                href={`/m/place/${destination.id}`}
                badge={
                  <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-lake-700">
                    Less crowded
                  </span>
                }
              />
            ))}
          </Rail>
        </Section>
      ) : null}

      {experiences.length > 0 ? (
        <Section title="With local hosts" action={<SeeAll href="/m/discover?mode=experiences" />}>
          <ul className="space-y-2.5">
            {experiences.map((experience) => (
              <li key={experience.id}>
                <ExperienceRow
                  experience={experience}
                  businessName={getBusiness(experience.businessId)?.name ?? 'Local host'}
                  destinationName={getDestination(experience.destinationId)?.name ?? ''}
                  href={`/m/experience/${experience.id}`}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {events.length > 0 ? (
        <Section title="Coming up">
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/m/place/${event.destinationId}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-card"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lily-100 text-lily-600">
                    <CalendarDays aria-hidden size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink-900">{event.name}</span>
                    <span className="block text-[12px] text-ink-500">
                      {formatShortDate(event.startAt)} · {getDestination(event.destinationId)?.name}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
