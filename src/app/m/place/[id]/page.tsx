import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CalendarDays, Clock, Layers, Leaf, MapPin, Navigation, Sparkles, Sun, Accessibility } from 'lucide-react';

import { formatDuration } from '@/lib/geo';
import { formatLongDate } from '@/lib/date';
import { FACT_TYPE_LABEL, FACT_TYPE_NOTE } from '@/lib/fact-types';
import { getDestination } from '@/server/data/repository';
import { buildDestinationPreview } from '@/server/data/destination-preview';
import { askPlace } from '@/server/actions/tourist';
import { ProvenanceBadge } from '@/components/shared/badges';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { AskPlacePanel } from '@/components/shared/AskPlacePanel';
import { NavigationLink, ViewSignal } from '@/components/telemetry/Signals';
import { BackLink } from '@/components/mobile/BackLink';
import { PlacePhoto } from '@/components/mobile/PlacePhoto';
import { creditLine, photoFor } from '@/lib/mobile/photos';
import { ExperienceRow, PlaceTile, Rail, Section } from '@/components/mobile/ui';
import { cn } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  return { title: getDestination(id)?.name ?? 'Destination' };
}

/** E3 on mobile: a destination, top to bottom. */
export default async function MobilePlacePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const destination = getDestination(id);
  if (!destination) notFound();

  const { narrative, practical, source, heritage, experiences, events, nearby, prompts } =
    buildDestinationPreview(destination);
  const verified = [...narrative, ...practical].some((fact) => fact.verified);
  const photo = photoFor(destination.id);

  return (
    <div>
      <ViewSignal destinationId={id} surface="mobile-destination-page" />

      {/* Hero */}
      <section className="relative -mx-4">
        <PlacePhoto
          src={photo?.hd}
          alt={`${destination.name}, ${destination.district}`}
          eager
          overlay
          credit={photo ? { label: creditLine(photo.credit), href: photo.credit.source || undefined } : undefined}
          className="h-[380px]"
          fallback={<DestinationVisual destination={destination} height="hero" overlay className="h-[380px]!" />}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <BackLink fallbackHref="/m/discover" tone="glass" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 pb-5">
          <div className="flex flex-wrap gap-1.5">
            {destination.category.slice(0, 3).map((category) => (
              <span key={category} className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/90 backdrop-blur">
                {category}
              </span>
            ))}
            {verified ? (
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                ✓ Verified knowledge
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-white">{destination.name}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-white/80">
            <MapPin aria-hidden size={13} />
            {destination.district} district
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <div className="relative z-10 -mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-surface p-2 shadow-raised">
        <NavigationLink
          destinationId={destination.id}
          href={`https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`}
          signal="mobile-directions"
          className="flex flex-col items-center gap-1 rounded-xl py-2.5 text-[12px] font-medium text-ink-800 active:bg-surface-2"
        >
          <Navigation aria-hidden size={20} className="text-lake-600" />
          Directions
        </NavigationLink>
        <Link
          href={`/m/plan?plan=${encodeURIComponent(`A trip that includes ${destination.name}`)}`}
          className="flex flex-col items-center gap-1 rounded-xl py-2.5 text-[12px] font-medium text-ink-800 active:bg-surface-2"
        >
          <Sparkles aria-hidden size={20} className="text-brand-600" />
          Plan a trip
        </Link>
        {heritage ? (
          <Link
            href={`/m/place/${destination.id}/heritage`}
            className="flex flex-col items-center gap-1 rounded-xl py-2.5 text-[12px] font-medium text-ink-800 active:bg-surface-2"
          >
            <Layers aria-hidden size={20} className="text-lily-500" />
            Heritage
          </Link>
        ) : (
          <Link
            href={`/m/discover?mode=experiences&destination=${destination.id}`}
            className="flex flex-col items-center gap-1 rounded-xl py-2.5 text-[12px] font-medium text-ink-800 active:bg-surface-2"
          >
            <Leaf aria-hidden size={20} className="text-good-500" />
            Experiences
          </Link>
        )}
      </div>

      <p className="mt-5 text-[15px] leading-relaxed text-ink-900">{destination.overview ?? destination.summary}</p>

      {/* Facts at a glance */}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Fact icon={<Clock aria-hidden size={16} />} label="Typical visit" value={formatDuration(destination.typicalVisitMinutes)} />
        {destination.bestSeason ? <Fact icon={<Sun aria-hidden size={16} />} label="Best season" value={destination.bestSeason} /> : null}
        <Fact icon={<Leaf aria-hidden size={16} />} label="Eco sensitivity" value={destination.ecoSensitivity.toLowerCase()} />
        {destination.accessibilityNotes ? (
          <Fact icon={<Accessibility aria-hidden size={16} />} label="Access" value={destination.accessibilityNotes} wide />
        ) : null}
      </dl>
      {destination.ecoSensitivity === 'HIGH' ? (
        <p className="mt-3 rounded-2xl border border-good-500/25 bg-good-100/60 px-3.5 py-2.5 text-[12px] text-good-700">
          A sensitive site. Stay on marked routes, take your waste out, and go with a local guide where one is available.
        </p>
      ) : null}

      {heritage ? (
        <Link href={`/m/place/${destination.id}/heritage`} className="immersive mt-6 block rounded-3xl p-5 active:scale-[0.99]">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-white/60">
            <Layers aria-hidden size={13} />
            Living heritage · {heritage.layers.length} layers
          </p>
          <p className="mt-1.5 text-[18px] font-semibold text-white">{heritage.title}</p>
          <p className="mt-1 text-[13px] text-white/70">{heritage.subtitle}</p>
          <span className="mt-4 inline-flex h-10 items-center rounded-xl bg-white px-4 text-[14px] font-semibold text-brand-800">
            Open the experience
          </span>
        </Link>
      ) : null}

      <Section title="Ask the place">
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <p className="mb-3 text-[12px] text-ink-500">Answers come from the curated knowledge base, not general model memory.</p>
          <AskPlacePanel destinationId={destination.id} destinationName={destination.name} prompts={prompts} ask={askPlace} />
        </div>
      </Section>

      {narrative.length > 0 ? (
        <Section title="The story" action={source ? <ProvenanceBadge provenance={source.defaultProvenance} /> : undefined}>
          <ul className="space-y-2.5">
            {narrative.map((fact) => (
              <li key={fact.id} className="rounded-2xl bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-ink-900">{fact.title}</h3>
                  <span
                    title={FACT_TYPE_NOTE[fact.factType]}
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      fact.factType === 'DOCUMENTED' ? 'bg-lake-50 text-lake-700' : 'bg-surface-2 text-ink-600',
                    )}
                  >
                    {FACT_TYPE_LABEL[fact.factType]}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-800">{fact.text}</p>
                <p className="mt-2 text-[11px] text-ink-500">
                  Verified {formatLongDate(fact.verifiedAt)}
                  {source ? ` · ${source.name}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {practical.length > 0 ? (
        <Section title="Good to know">
          <ul className="space-y-2 rounded-2xl bg-surface p-4 shadow-card">
            {practical.map((fact) => (
              <li key={fact.id} className="text-[13px] leading-relaxed text-ink-700">
                <span className="font-semibold text-ink-900">{fact.title}. </span>
                {fact.text}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {experiences.length > 0 ? (
        <Section title="Local experiences here">
          <ul className="space-y-2.5">
            {experiences.slice(0, 4).map(({ experience, businessName }) => (
              <li key={experience.id}>
                <ExperienceRow
                  experience={experience}
                  businessName={businessName}
                  destinationName={destination.name}
                  href={`/m/experience/${experience.id}`}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {events.length > 0 ? (
        <Section title="What is on">
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3 rounded-2xl bg-surface p-3.5 shadow-card">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lily-100 text-lily-600">
                  <CalendarDays aria-hidden size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink-900">{event.name}</span>
                  <span className="block text-[11px] text-ink-500">
                    {formatLongDate(event.startAt)} to {formatLongDate(event.endAt)}
                  </span>
                  <span className="mt-1 block text-[12px] text-ink-700">{event.description}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-500">Festival dates follow the traditional calendar. Confirm before travelling.</p>
        </Section>
      ) : null}

      {nearby.length > 0 ? (
        <Section title={`Also in ${destination.district}`}>
          <Rail label={`Also in ${destination.district}`}>
            {nearby.map((entry) => (
              <PlaceTile key={entry.id} destination={entry} href={`/m/place/${entry.id}`} />
            ))}
          </Rail>
        </Section>
      ) : null}

      <p className="mt-6 text-[11px] leading-relaxed text-ink-500">
        Destination records are curated from public official material and reviewed before publication. {photo
          ? photo.credit.source
            ? `The photograph is from Wikimedia Commons (${creditLine(photo.credit)}); tap the credit for the file page.`
            : `${creditLine(photo.credit)}.`
          : 'No suitable photograph yet, so the artwork is generated, not photographed.'}
        {source ? ` Source: ${source.name}, reliability ${source.reliabilityLevel.toLowerCase()}.` : ''}
      </p>
    </div>
  );
}

function Fact({ icon, label, value, wide }: { icon: React.ReactNode; label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('rounded-2xl bg-surface p-3 shadow-card', wide && 'col-span-2')}>
      <dt className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-[13px] font-medium leading-snug text-ink-900">{value}</dd>
    </div>
  );
}
