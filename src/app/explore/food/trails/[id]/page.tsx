import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Clock, MapPin } from 'lucide-react';

import { planHref } from '@/lib/map';
import { DISH_CATEGORY_LABEL } from '@/lib/types';
import { getDestination, getDestinationsByIds, getDish, getFoodTrail } from '@/server/data/repository';
import { ProvenanceBadge } from '@/components/shared/badges';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { Badge, ButtonLink, Card, CardBody } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const trail = getFoodTrail(id);
  return trail ? { title: trail.name, description: trail.description } : { title: 'Food trail' };
}

export const dynamic = 'force-dynamic';

const TIME_LABEL: Record<string, string> = {
  MORNING: 'Best in the morning',
  AFTERNOON: 'Best in the afternoon',
  EVENING: 'Best in the evening',
  ANY: 'Any time of day',
};

/** A trail: an ordered sequence of dishes, each keeping its own place. */
export default async function FoodTrailPage(props: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/explore/food"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-brand-700"
      >
        <ArrowLeft aria-hidden size={15} />
        Taste of Manipur
      </Link>

      {destination ? (
        <div className="relative overflow-hidden rounded-2xl">
          <DestinationVisual destination={destination} height="lg" overlay />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <Badge tone="lily">{stops.length} stops</Badge>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-white">{trail.name}</h1>
            <p className="mt-1 text-[13px] text-white/80">{destination.name} district</p>
          </div>
        </div>
      ) : (
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900">{trail.name}</h1>
      )}

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="text-[14px] leading-relaxed text-ink-800">{trail.description}</p>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden size={13} className="text-ink-400" />
              {trail.durationHint}
            </span>
            <span>{TIME_LABEL[trail.bestTimeOfDay]}</span>
          </p>

          {otherDestinations.length > 0 ? (
            <p className="text-[12px] text-ink-500">
              Also takes in {otherDestinations.map((d) => d.name).join(', ')}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {destination ? (
              <ButtonLink href={planHref(`${trail.name} in ${destination.name}`)} size="sm">
                Plan a trip around it
              </ButtonLink>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3 p-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-500">The stops, in order</h2>
          <ol className="space-y-2.5">
            {stops.map(({ dish, destination: dishDestination }, index) => (
              <li key={dish.id}>
                <Link
                  href={`/explore/food/${dish.id}`}
                  className="flex items-start gap-3 rounded-md border border-line bg-surface p-3 hover:border-line-strong hover:bg-surface-2"
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
                      <span className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-500">
                        <MapPin aria-hidden size={11} />
                        {dishDestination.name}
                      </span>
                    ) : null}
                    <span className="mt-1 block line-clamp-2 text-[13px] text-ink-700">{dish.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <ProvenanceBadge provenance={trail.provenance} />
        A curated order to try these in, not a guided tour with a fixed schedule.
      </p>
    </div>
  );
}
