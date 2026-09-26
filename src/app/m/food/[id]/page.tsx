import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';

import { DISH_CATEGORY_LABEL } from '@/lib/types';
import { getBusiness, getDestination, getDish, getFoodTrailsFor } from '@/server/data/repository';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { ProvenanceBadge } from '@/components/shared/badges';
import { BackLink } from '@/components/mobile/BackLink';
import { EdgeToEdge } from '@/components/mobile/EdgeToEdge';
import { photoFor } from '@/lib/mobile/photos';
import { PhotoCredit, PrimaryLink, Section } from '@/components/mobile/ui';
import { Badge } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const dish = getDish(id);
  return dish ? { title: dish.name } : { title: 'Dish' };
}

export const dynamic = 'force-dynamic';

/** One dish on mobile: what it is, what's in it, and where to find it. */
export default async function MobileDishPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const dish = getDish(id);
  if (!dish) notFound();

  const destination = getDestination(dish.destinationId);
  const business = dish.businessId ? getBusiness(dish.businessId) : undefined;
  const trails = getFoodTrailsFor(dish.id);
  const photo = destination ? photoFor(destination.id) : undefined;

  return (
    <div>
      <section className="relative -mx-4">
        {destination ? (
          <PlacePhoto
            src={photo?.hd}
            alt={dish.name}
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
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="lily">{DISH_CATEGORY_LABEL[dish.category]}</Badge>
            <Badge tone={dish.vegetarian ? 'good' : 'neutral'}>{dish.vegetarian ? 'Vegetarian' : 'Non-vegetarian'}</Badge>
          </div>
          <h1 className="mt-1.5 text-[24px] font-bold leading-tight text-white">{dish.name}</h1>
          {dish.localName && dish.localName !== dish.name ? (
            <p className="text-[13px] text-white/80">{dish.localName}</p>
          ) : null}
        </div>
      </section>

      <p className="mt-4 text-[15px] leading-relaxed text-ink-900">{dish.description}</p>
      {dish.story ? <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{dish.story}</p> : null}
      {destination ? (
        <div className="mt-2">
          <PhotoCredit photo={photo} />
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">Ingredients</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dish.ingredients.map((item) => (
            <Badge key={item} tone="neutral">
              {item}
            </Badge>
          ))}
        </div>
        {dish.spiceLevel ? (
          <p className="mt-3 text-[13px] text-ink-700">
            <span className="text-ink-500">Spice:</span> {dish.spiceLevel.toLowerCase()}
          </p>
        ) : null}
        <p className="mt-3 text-[13px] text-ink-700">
          <span className="text-ink-500">Serving it:</span>{' '}
          {business ? business.name : 'No partner serves this here yet — ask locally.'}
        </p>
      </div>

      {destination ? (
        <Link
          href={`/m/place/${destination.id}`}
          className="mt-3 flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-card active:scale-[0.99]"
        >
          <PlacePhoto
            src={photo?.sm}
            alt={destination.name}
            className="h-16 w-16 shrink-0 rounded-xl"
            fallback={<DestinationVisual destination={destination} height="sm" className="h-16!" />}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-500">Where</p>
            <p className="truncate text-[14px] font-semibold text-ink-900">{destination.name}</p>
          </div>
          <ChevronRight aria-hidden size={18} className="text-ink-400" />
        </Link>
      ) : null}

      {destination ? (
        <div className="mt-4">
          <PrimaryLink href={`/m/plan?plan=${encodeURIComponent(`${dish.name} in ${destination.name}`)}`} className="w-full">
            Plan a trip around it
          </PrimaryLink>
        </div>
      ) : null}

      {trails.length > 0 ? (
        <Section title="Part of a trail">
          <div className="space-y-2 rounded-2xl bg-surface p-3 shadow-card">
            {trails.map((trail) => (
              <Link
                key={trail.id}
                href={`/m/food/trails/${trail.id}`}
                className="flex items-center justify-between gap-3 rounded-xl p-2.5 active:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink-900">{trail.name}</span>
                  <span className="block text-[12px] text-ink-500">
                    {trail.dishIds.length} stop{trail.dishIds.length === 1 ? '' : 's'}
                  </span>
                </span>
                <ChevronRight aria-hidden size={16} className="shrink-0 text-ink-400" />
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <p className="mt-6 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <ProvenanceBadge provenance={dish.provenance} />
        Ingredients and preparation vary by household — a starting point, not a recipe.
      </p>
    </div>
  );
}
