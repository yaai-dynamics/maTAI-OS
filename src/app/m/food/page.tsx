import Link from 'next/link';
import type { Metadata } from 'next';
import { Clock, UtensilsCrossed } from 'lucide-react';

import { DISH_CATEGORY_LABEL, type DishCategory } from '@/lib/types';
import { getDestination, getDishes, getFoodTrails } from '@/server/data/repository';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { photoFor } from '@/lib/mobile/photos';
import { MobileEmpty, MobileHeader, PillBar, Rail } from '@/components/mobile/ui';
import { Badge } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Taste of Manipur' };
export const dynamic = 'force-dynamic';

const CATEGORIES: DishCategory[] = ['MAIN', 'SNACK', 'DESSERT', 'CONDIMENT'];

/**
 * PS6 on mobile: dishes are knowledge first, bookable only where a partner
 * happens to serve them. Trails are a curated order to try a few of them in.
 */
export default async function MobileFoodPage(props: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await props.searchParams;
  const activeCategory = CATEGORIES.includes(category as DishCategory) ? (category as DishCategory) : undefined;

  const dishes = getDishes()
    .filter((dish) => !activeCategory || dish.category === activeCategory)
    .map((dish) => ({ dish, destination: getDestination(dish.destinationId) }));

  const trails = getFoodTrails().map((trail) => ({ trail, destination: getDestination(trail.destinationId) }));

  const href = (next?: DishCategory) => (next ? `/m/food?category=${next}` : '/m/food');

  return (
    <div>
      <MobileHeader
        title="Taste of Manipur"
        subtitle="Traditional dishes and food trails, and where to try each one."
        backHref="/m"
      />

      {trails.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-[17px] font-semibold tracking-tight text-ink-900">Food trails</h2>
          <Rail label="Food trails">
            {trails.map(({ trail, destination }) => (
              <li key={trail.id} className="w-[80%] max-w-[300px] shrink-0 snap-start">
                <Link
                  href={`/m/food/trails/${trail.id}`}
                  className="block overflow-hidden rounded-2xl bg-surface shadow-card active:scale-[0.98]"
                >
                  {destination ? (
                    <PlacePhoto
                      src={photoFor(destination.id)?.sm}
                      alt={destination.name}
                      overlay
                      className="h-32"
                      fallback={<DestinationVisual destination={destination} height="lg" overlay className="h-32!" />}
                    />
                  ) : (
                    <div className="immersive h-32" />
                  )}
                  <div className="p-3.5">
                    <p className="text-[14.5px] font-semibold leading-snug text-ink-900">{trail.name}</p>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {trail.dishIds.length} stops · {destination?.name ?? trail.destinationId}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </Rail>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight text-ink-900">Dishes</h2>
        </div>
        <PillBar
          label="Kind"
          active={activeCategory ?? 'all'}
          options={[
            { value: 'all', label: 'All', href: href() },
            ...CATEGORIES.map((value) => ({ value, label: DISH_CATEGORY_LABEL[value], href: href(value) })),
          ]}
        />

        {dishes.length === 0 ? (
          <div className="mt-4">
            <MobileEmpty icon={UtensilsCrossed} tone="orange" title="Nothing in this category" description="Try another kind of dish." />
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {dishes.map(({ dish, destination }) => (
              <li key={dish.id}>
                <Link
                  href={`/m/food/${dish.id}`}
                  className="block overflow-hidden rounded-2xl bg-surface shadow-card active:scale-[0.98]"
                >
                  {destination ? (
                    <PlacePhoto
                      src={photoFor(destination.id)?.sm}
                      alt={dish.name}
                      overlay
                      className="aspect-square"
                      fallback={<DestinationVisual destination={destination} height="lg" overlay className="h-full!" />}
                    />
                  ) : (
                    <div className="immersive aspect-square" />
                  )}
                  <div className="p-3">
                    <div className="flex items-center gap-1">
                      <Badge tone={dish.vegetarian ? 'good' : 'neutral'}>{dish.vegetarian ? 'Veg' : 'Non-veg'}</Badge>
                    </div>
                    <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-ink-900 line-clamp-1">{dish.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-500">{destination?.name ?? dish.destinationId}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 flex items-center gap-1.5 text-[12px] text-ink-500">
        <Clock aria-hidden size={12} />
        Prototype food guide. Ingredients vary by household; ask before eating if you have an allergy.
      </p>
    </div>
  );
}
