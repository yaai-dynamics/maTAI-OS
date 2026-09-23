import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, MapPin } from 'lucide-react';

import { planHref } from '@/lib/map';
import { DISH_CATEGORY_LABEL } from '@/lib/types';
import { getBusiness, getDestination, getDish, getFoodTrailsFor } from '@/server/data/repository';
import { ProvenanceBadge } from '@/components/shared/badges';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { Badge, ButtonLink, Card, CardBody, CardHeader, DefinitionRow } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const dish = getDish(id);
  return dish ? { title: dish.name, description: dish.description } : { title: 'Dish' };
}

export const dynamic = 'force-dynamic';

/** One dish: what it is, what's in it, and where to actually find it. */
export default async function DishPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const dish = getDish(id);
  if (!dish) notFound();

  const destination = getDestination(dish.destinationId);
  const business = dish.businessId ? getBusiness(dish.businessId) : undefined;
  const trails = getFoodTrailsFor(dish.id);

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
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="lily">{DISH_CATEGORY_LABEL[dish.category]}</Badge>
              <Badge tone={dish.vegetarian ? 'good' : 'neutral'}>
                {dish.vegetarian ? 'Vegetarian' : 'Non-vegetarian'}
              </Badge>
            </div>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-white">{dish.name}</h1>
            {dish.localName && dish.localName !== dish.name ? (
              <p className="mt-1 text-[13px] text-white/80">{dish.localName}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900">{dish.name}</h1>
      )}

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="text-[14px] leading-relaxed text-ink-800">{dish.description}</p>
          {dish.story ? <p className="text-[13px] leading-relaxed text-ink-600">{dish.story}</p> : null}

          <dl className="divide-y divide-line border-t border-line">
            <DefinitionRow term="Ingredients">
              <div className="flex flex-wrap gap-1.5">
                {dish.ingredients.map((item) => (
                  <Badge key={item} tone="neutral">
                    {item}
                  </Badge>
                ))}
              </div>
            </DefinitionRow>

            {dish.spiceLevel ? (
              <DefinitionRow term="Spice">{dish.spiceLevel.toLowerCase()}</DefinitionRow>
            ) : null}

            {destination ? (
              <DefinitionRow term="Where">
                <span className="inline-flex items-center gap-2">
                  <MapPin aria-hidden size={13} className="text-ink-400" />
                  {destination.name}, {destination.district} district
                </span>
              </DefinitionRow>
            ) : null}

            <DefinitionRow term="Serving it">
              {business ? (
                <span className="text-ink-800">{business.name}</span>
              ) : (
                <span className="text-ink-600">No partner serves this here yet — ask locally.</span>
              )}
            </DefinitionRow>
          </dl>

          <div className="flex flex-wrap gap-2 pt-1">
            {destination ? (
              <>
                <ButtonLink href={`/explore/destinations/${destination.id}`} variant="secondary" size="sm">
                  About {destination.name}
                </ButtonLink>
                <ButtonLink href={planHref(`${dish.name} in ${destination.name}`)} size="sm">
                  Plan a trip around it
                </ButtonLink>
              </>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {trails.length > 0 ? (
        <Card>
          <CardHeader title="Part of a trail" />
          <CardBody className="space-y-2">
            {trails.map((trail) => (
              <Link
                key={trail.id}
                href={`/explore/food/trails/${trail.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-2.5 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{trail.name}</span>
                  <span className="block text-[12px] text-ink-500">
                    {trail.dishIds.length} stop{trail.dishIds.length === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <ProvenanceBadge provenance={dish.provenance} />
        Ingredients and preparation vary by household — treat this as a starting point, not a recipe.
      </p>
    </div>
  );
}
