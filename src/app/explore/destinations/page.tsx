import type { Metadata } from 'next';

import { currentWindow } from '@/server/analytics/windows';
import { computeDemand } from '@/server/analytics/demand';
import { getDestinations } from '@/server/data/repository';
import { Card, CardBody, EmptyState } from '@/components/ui/primitives';
import { DestinationCard } from '@/components/shared/cards';

export const metadata: Metadata = { title: 'Destinations' };
export const dynamic = 'force-dynamic';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'nature', label: 'Nature' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'culture', label: 'Culture' },
  { value: 'food', label: 'Food' },
  { value: 'craft', label: 'Craft' },
  { value: 'adventure', label: 'Adventure' },
] as const;

export default async function DestinationsPage(props: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await props.searchParams;
  const active = category ?? 'all';

  const demand = new Map(
    computeDemand(currentWindow()).map((row) => [row.destinationId, row]),
  );

  const destinations = getDestinations()
    .filter((destination) => active === 'all' || destination.category.includes(active as never))
    .sort(
      (a, b) =>
        (demand.get(b.id)?.weightedScore ?? 0) - (demand.get(a.id)?.weightedScore ?? 0),
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Destinations</h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Every destination carries curated, verified information you can question directly.
        </p>
      </div>

      <nav aria-label="Filter by interest" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((filter) => (
          <a
            key={filter.value}
            href={filter.value === 'all' ? '/explore/destinations' : `/explore/destinations?category=${filter.value}`}
            className={
              active === filter.value
                ? 'shrink-0 rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700'
                : 'shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2'
            }
          >
            {filter.label}
          </a>
        ))}
      </nav>

      {destinations.length === 0 ? (
        <EmptyState
          title="Nothing matches that filter"
          description="Try a different interest, or clear the filter."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((destination) => {
            const row = demand.get(destination.id);
            return (
              <li key={destination.id}>
                <DestinationCard
                  destination={destination}
                  href={`/explore/destinations/${destination.id}`}
                  meta={
                    row ? (
                      <span className="shrink-0 text-right">
                        <span className="num block text-[15px] font-semibold text-ink-900">
                          {row.demandIndex}
                        </span>
                        <span className="block text-[10px] text-ink-500">interest</span>
                      </span>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className="text-[12px] text-ink-600">
            The interest index is a relative measure of attention on this platform over the last 30
            days. It is not a visitor count, and a low number does not mean a place is not worth
            going to. Often it means the opposite.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
