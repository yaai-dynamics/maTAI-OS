import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Clock } from 'lucide-react';

import { DISH_CATEGORY_LABEL } from '@/lib/types';
import { getDestination, getDestinationsByIds, getDish, getFoodTrail } from '@/server/data/repository';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { ProvenanceBadge } from '@/components/shared/badges';
import { BackLink } from '@/components/mobile/BackLink';
import { EdgeToEdge } from '@/components/mobile/EdgeToEdge';
import { photoFor } from '@/lib/mobile/photos';
import { PrimaryLink } from '@/components/mobile/ui';
import { Badge } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const trail = getFoodTrail(id);
  return trail ? { title: trail.name } : { title: 'Food trail' };
}

export const dynamic = 'force-dynamic';

const TIME_LABEL: Record<string, string> = {
  MORNING: 'Best in the morning',
  AFTERNOON: 'Best in the afternoon',
  EVENING: 'Best in the evening',
  ANY: 'Any time of day',
};

/** A trail on mobile: an ordered sequence of dishes, each keeping its own place. */
export default async function MobileFoodTrailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const trail = getFoodTrail(id);
  if (!trail) notFound();

  const destination = getDestination(trail.destinationId);
  const stops = trail.dishIds
    .map((dishId) => getDish(dishId))
    .filter((dish): dish is NonNullable<typeof dish> => dish !== undefined)
    .map((dish) => ({ dish, destination: getDestination(dish.destinationId) }));

  const otherDestinationIds = [
    ...new Set(stops.map((stop) => stop.dish.destinationId).filter((d) => d !== trail.destinationId)),
  ];
  const otherDestinations = getDestinationsByIds(otherDestinationIds);
  const photo = destination ? photoFor(destination.id) : undefined;

  return (
    <div>
      <section className="relative -mx-4">
        {destination ? (
          <PlacePhoto
            src={photo?.hd}
            alt={trail.name}
            eager
            overlay
            className="h-64"
            fallback={<DestinationVisual destination={destination} height="lg" overlay className="h-64!" />}
          />
        ) : (
          <div className="immersive h-56" />
        )}
        <EdgeToEdge />
        <BackLink fallbackHref="/m/food" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <Badge tone="lily">{stops.length} stops</Badge>
          <h1 className="mt-1.5 text-[24px] font-bold leading-tight text-white">{trail.name}</h1>
          {destination ? <p className="text-[13px] text-white/80">{destination.district} district</p> : null}
        </div>
      </section>

      <p className="mt-4 text-[15px] leading-relaxed text-ink-900">{trail.description}</p>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <Clock aria-hidden size={13} className="text-ink-400" />
          {trail.durationHint}
        </span>
        <span>{TIME_LABEL[trail.bestTimeOfDay]}</span>
      </p>

      {otherDestinations.length > 0 ? (
        <p className="mt-2 text-[12px] text-ink-500">
          Also takes in {otherDestinations.map((d) => d.name).join(', ')}.
        </p>
      ) : null}

      {destination ? (
        <div className="mt-4">
          <PrimaryLink href={`/m/plan?plan=${encodeURIComponent(`${trail.name} in ${destination.name}`)}`} className="w-full">
            Plan a trip around it
          </PrimaryLink>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl bg-surface p-3 shadow-card">
        <h2 className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
          The stops, in order
        </h2>
        <ol className="space-y-2">
          {stops.map(({ dish, destination: dishDestination }, index) => (
            <li key={dish.id}>
              <Link
                href={`/m/food/${dish.id}`}
                className="flex items-start gap-3 rounded-xl p-2.5 active:bg-surface-2"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-700">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-semibold text-ink-900">{dish.name}</span>
                    <Badge tone="neutral">{DISH_CATEGORY_LABEL[dish.category]}</Badge>
                  </span>
                  {dishDestination ? (
                    <span className="mt-0.5 block text-[12px] text-ink-500">{dishDestination.name}</span>
                  ) : null}
                  <span className="mt-1 block line-clamp-2 text-[13px] text-ink-700">{dish.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <ProvenanceBadge provenance={trail.provenance} />
        A curated order to try these in, not a guided tour with a fixed schedule.
      </p>
    </div>
  );
}
