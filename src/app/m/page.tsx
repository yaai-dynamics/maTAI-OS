import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, CalendarDays, Layers, Navigation, Route, Sparkles, Store } from 'lucide-react';

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
import { IconTile } from '@/components/mobile/IconTile';
import { CategoryTile } from '@/components/mobile/CategoryIcon';
import { photoFor } from '@/lib/mobile/photos';
import {
  DemoChip,
  ExperienceLine,
  Panel,
  PanelRows,
  PhotoCredit,
  PlaceTile,
  Rail,
  SeeAll,
  Section,
} from '@/components/mobile/ui';

export const metadata: Metadata = { title: { absolute: 'OneStop Manipur — Explore Manipur' } };
export const dynamic = 'force-dynamic';

/** The cover photograph on Home. */
const COVER = 'dest-loktak';

/**
 * Interest tiles on Home, each opening Discover filtered to it, each shown
 * with a destination that carries that category (and its photograph).
 */
const INTERESTS = [
  { value: 'nature', label: 'Nature', destinationId: 'dest-keibul' },
  { value: 'heritage', label: 'Heritage', destinationId: 'dest-bishnupur-temple' },
  { value: 'culture', label: 'Culture', destinationId: 'dest-kangla' },
  { value: 'food', label: 'Food', destinationId: 'dest-ima-keithel' },
  { value: 'craft', label: 'Craft', destinationId: 'dest-andro' },
  { value: 'adventure', label: 'Adventure', destinationId: 'dest-dzukou' },
];

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

  const cover = getDestination(COVER);
  const coverPhoto = photoFor(COVER);
  const hosts = getExperiences().filter((experience) => experience.availabilityStatus !== 'UNAVAILABLE').length;

  return (
    <div>
      {/* Cover: a full-bleed photograph under the Dynamic Island, with the
          planner and the headline figures as glass cards on it (iOS Weather). */}
      <section className="relative -mx-4 overflow-hidden">
        <div className="absolute inset-0">
          {cover ? (
            <PlacePhoto
              src={coverPhoto?.hd}
              alt={`${cover.name}, ${cover.district}`}
              eager
              className="h-full"
              fallback={<DestinationVisual destination={cover} height="hero" className="h-full!" />}
            />
          ) : null}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/35" />
          {/* The foot dissolves into the page as frosted fog. */}
          <div aria-hidden className="cover-fade absolute inset-x-0 bottom-0 h-40" />
        </div>

        <div className="relative px-4 pb-24 pt-[calc(env(safe-area-inset-top)+3.25rem)] text-white">
          {DEMO_MODE ? (
            <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)]">
              <DemoChip />
            </div>
          ) : null}

          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/80">Welcome to</p>
            <h1 className="mt-1 text-[52px] font-light leading-none tracking-tight">Manipur</h1>
            <p className="mt-2 text-[15px] text-white/85">Lakes, hills and living heritage</p>
          </div>

          {/* Headline figures, counted from the platform's own records. */}
          <dl className="glass-dark mt-6 grid grid-cols-3 divide-x divide-white/15 rounded-2xl py-3 text-center">
            <div>
              <dt className="text-[11px] text-white/70">Places</dt>
              <dd className="num text-[22px] font-semibold">{destinations.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-white/70">Local hosts</dt>
              <dd className="num text-[22px] font-semibold">{hosts}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-white/70">Heritage stories</dt>
              <dd className="num text-[22px] font-semibold">{heritage.length}</dd>
            </div>
          </dl>

          {/* Planner */}
          <div className="glass-dark mt-3 rounded-3xl p-4">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80">
              <IconTile icon={Sparkles} tone="purple" size="sm" />
              AI trip planner
            </p>
            <p className="mt-2.5 text-[20px] font-semibold leading-snug">Where would you like to go?</p>
            <Link
              href="/m/plan"
              className="mt-3 flex h-12 items-center gap-2 rounded-2xl bg-white/95 px-4 text-[14px] text-ink-500 active:scale-[0.99]"
            >
              <Sparkles aria-hidden size={16} className="text-ink-900" />
              Describe your trip…
            </Link>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PROMPTS.map((prompt) => (
                <Link
                  key={prompt}
                  href={`/m/plan?plan=${encodeURIComponent(prompt)}`}
                  className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] text-white active:bg-white/20"
                >
                  {prompt}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The rest of Home sits on a blurred wash of the cover photograph, the
          way iOS Weather tints its screen with the current scene. */}
      <div className="relative">
        <div aria-hidden className="absolute inset-x-[-1rem] -top-16 bottom-[-8rem] -z-10 overflow-hidden">
          {coverPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- a static file, drawn only as a blur
            <img src={coverPhoto.sm} alt="" className="h-full w-full scale-125 object-cover opacity-60 blur-2xl" />
          ) : null}
          <div className="absolute inset-0 bg-paper/55" />
        </div>

        {/* Interests: photograph tiles with a frosted label, as iOS Photos and the App Store do. */}
        <section className="-mt-12 relative">
          <h2 className="mb-3 text-[20px] font-bold tracking-tight text-ink-900">Explore by interest</h2>
          <ul className="grid grid-cols-2 gap-3">
            {INTERESTS.map((interest) => {
              const place = getDestination(interest.destinationId);
              return (
                <li key={interest.value}>
                  <Link
                    href={`/m/discover?category=${interest.value}`}
                    className="relative block overflow-hidden rounded-[22px] shadow-raised active:scale-[0.97] transition-transform"
                  >
                    {place ? (
                      <PlacePhoto
                        src={photoFor(place.id)?.sm}
                        alt={`${interest.label}: ${place.name}`}
                        overlay
                        className="aspect-[4/5]"
                        fallback={<DestinationVisual destination={place} height="lg" overlay className="h-full!" />}
                      />
                    ) : (
                      <div className="immersive aspect-[4/5]" />
                    )}
                    <div className="absolute inset-x-2 bottom-2">
                      <span className="glass-dark flex items-center gap-2 rounded-2xl px-2.5 py-2">
                        <CategoryTile category={interest.value} size="sm" />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold leading-tight text-white">{interest.label}</span>
                          {place ? <span className="block truncate text-[11px] text-white/75">{place.name}</span> : null}
                        </span>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {current ? (
          <Link
            href="/m/trip"
            className="mt-4 flex items-center gap-3 rounded-2xl border border-lake-200 bg-lake-50 p-4 active:scale-[0.99]"
          >
            <IconTile icon={Navigation} tone="green" />
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
          <Panel icon={<Route aria-hidden size={13} />} title="Your trips" action={<SeeAll href="/m/plan#trips" />}>
            <PanelRows label="Your trips">
              {kept.map((trip) => (
                <li key={trip.id}>
                  <Link href={`/m/journey/${trip.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold text-ink-900">{trip.theme}</span>
                      <span className="block text-[12px] text-ink-500">
                        {PHASE_LABEL[journeyPhase(trip, at)]} · {formatPlanFor(trip) ?? `${trip.preferences.durationDays} days`}
                      </span>
                    </span>
                    <ArrowRight aria-hidden size={16} className="shrink-0 text-ink-400" />
                  </Link>
                </li>
              ))}
            </PanelRows>
          </Panel>
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
          <Panel
            icon={<Store aria-hidden size={13} />}
            title="With local hosts"
            action={<SeeAll href="/m/discover?mode=experiences" />}
          >
            <PanelRows label="Experiences with local hosts">
              {experiences.map((experience) => (
                <ExperienceLine
                  key={experience.id}
                  experience={experience}
                  businessName={getBusiness(experience.businessId)?.name ?? 'Local host'}
                  destinationName={getDestination(experience.destinationId)?.name ?? ''}
                  href={`/m/experience/${experience.id}`}
                />
              ))}
            </PanelRows>
          </Panel>
        ) : null}

        {events.length > 0 ? (
          <Panel icon={<CalendarDays aria-hidden size={13} />} title="Coming up">
            <PanelRows label="Upcoming events">
              {events.map((event) => (
                <li key={event.id}>
                  <Link href={`/m/place/${event.destinationId}`} className="flex items-center gap-3.5 px-4 py-3 active:bg-surface-2">
                    <span className="w-11 shrink-0 text-center">
                      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-red-500">
                        {formatShortDate(event.startAt).replace(/^\d+ /, '')}
                      </span>
                      <span className="num block text-[20px] font-semibold leading-none text-ink-900">
                        {new Date(event.startAt).getUTCDate()}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-ink-900">{event.name}</span>
                      <span className="block truncate text-[12px] text-ink-500">
                        {getDestination(event.destinationId)?.name} · {event.category.toLowerCase()}
                      </span>
                    </span>
                    <ArrowRight aria-hidden size={16} className="shrink-0 text-ink-400" />
                  </Link>
                </li>
              ))}
            </PanelRows>
          </Panel>
        ) : null}
      </div>

      <div className="mt-8">
        <PhotoCredit photo={coverPhoto} />
      </div>
    </div>
  );
}
