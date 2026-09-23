import Link from 'next/link';
import type { Metadata } from 'next';

import { DISH_CATEGORY_LABEL, type DishCategory } from '@/lib/types';
import { getBusiness, getDestination, getDishes, getFoodTrails } from '@/server/data/repository';
import { DishCard, FoodTrailCard } from '@/components/shared/cards';
import { EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Taste of Manipur',
  description: 'Traditional dishes and food trails across Manipur, with where to try each one.',
};
export const dynamic = 'force-dynamic';

const CATEGORIES: DishCategory[] = ['MAIN', 'SNACK', 'DESSERT', 'CONDIMENT'];

/**
 * PS6: Taste of Manipur. Dishes are knowledge first — real food, with real
 * ingredients and a story — and bookable only where a partner happens to
 * serve them. Trails are a curated order to try a few of them in.
 */
export default async function FoodPage(props: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await props.searchParams;
  const activeCategory = CATEGORIES.includes(category as DishCategory) ? (category as DishCategory) : undefined;

  const dishes = getDishes()
    .filter((dish) => !activeCategory || dish.category === activeCategory)
    .map((dish) => ({
      dish,
      destination: getDestination(dish.destinationId),
      business: dish.businessId ? getBusiness(dish.businessId) : undefined,
    }));

  const trails = getFoodTrails().map((trail) => ({ trail, destination: getDestination(trail.destinationId) }));

  const href = (next?: DishCategory) => (next ? `/explore/food?category=${next}` : '/explore/food');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Taste of Manipur</h1>
        <p className="mt-1 max-w-prose text-[13px] text-ink-600">
          Traditional dishes from across the state, and a few trails that string several of them together. Most
          dishes are real food you can ask for whether or not a partner here serves it yet — that is shown
          honestly.
        </p>
      </div>

      {trails.length > 0 ? (
        <section>
          <h2 className="text-[15px] font-semibold text-ink-900">Food trails</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {trails.map(({ trail, destination }) => (
              <li key={trail.id}>
                <Link href={`/explore/food/trails/${trail.id}`} className="block h-full">
                  <FoodTrailCard
                    trail={trail}
                    destinationName={destination?.name ?? trail.destinationId}
                    stopCount={trail.dishIds.length}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink-900">Dishes</h2>
          <nav aria-label="Kind" className="flex flex-wrap items-center gap-1.5">
            <Chip href={href()} active={!activeCategory}>
              All
            </Chip>
            {CATEGORIES.map((value) => (
              <Chip key={value} href={href(value)} active={activeCategory === value}>
                {DISH_CATEGORY_LABEL[value]}
              </Chip>
            ))}
          </nav>
        </div>

        {dishes.length === 0 ? (
          <EmptyState title="Nothing in this category" description="Try another kind of dish." />
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dishes.map(({ dish, destination, business }) => (
              <li key={dish.id}>
                <Link href={`/explore/food/${dish.id}`} className="block h-full">
                  <DishCard
                    dish={dish}
                    destinationName={destination?.name ?? dish.destinationId}
                    businessName={business?.name}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[12px] text-ink-500">
        Prototype food guide. Ingredients and preparation vary by household; ask before eating if you have an
        allergy.
      </p>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700'
          : 'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2'
      }
    >
      {children}
    </Link>
  );
}
