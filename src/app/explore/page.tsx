import Link from 'next/link';
import type { Metadata } from 'next';

import { currentWindow } from '@/server/analytics/windows';
import { computeDemand } from '@/server/analytics/demand';
import { getDestination } from '@/server/data/repository';
import { getCurrentTrip } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { Card, CardBody } from '@/components/ui/primitives';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { TripPlannerForm } from '@/components/shared/TripPlannerForm';
import { planTrip } from '@/server/actions/tourist';

// The home page of the product, so the tab reads as maTAI rather than as a section.
export const metadata: Metadata = { title: { absolute: 'maTAI — Plan your Manipur journey' } };
export const dynamic = 'force-dynamic';

export default async function ExploreHomePage() {
  const demand = computeDemand(currentWindow()).slice(0, 6);
  const trending = demand
    .map((row) => ({ row, destination: getDestination(row.destinationId) }))
    .filter((entry): entry is { row: (typeof demand)[number]; destination: NonNullable<ReturnType<typeof getDestination>> } =>
      entry.destination !== undefined,
    );
  const existingTrip = await getCurrentTrip((await readVisitor()).sessionId);

  return (
    <div className="space-y-6">
      <section className="immersive -mx-4 -mt-5 px-4 py-8 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:px-8 sm:py-10">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/55">Explore Manipur</p>
        <h1 className="mt-2 max-w-xl text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[34px]">
          Tell us what kind of trip you want. We will build the journey around it.
        </h1>
        <p className="mt-2 max-w-lg text-[14px] text-white/70">
          Not a list of attractions. A route built from your own words, with the reason attached to
          every stop.
        </p>

        <div className="mt-6 max-w-2xl">
          <TripPlannerForm plan={planTrip} />
        </div>
      </section>

      {existingTrip ? (
        <Card tone="muted">
          <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div>
              <p className="text-[13px] font-medium text-ink-900">
                You already have a journey: {existingTrip.theme}
              </p>
              <p className="text-[12px] text-ink-600">
                {existingTrip.items.filter((item) => item.kind === 'DESTINATION').length} stops over{' '}
                {existingTrip.preferences.durationDays} days
              </p>
            </div>
            <Link
              href="/explore/journey"
              className="rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
            >
              Open it
            </Link>
          </CardBody>
        </Card>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink-900">
              What people are looking at now
            </h2>
            <p className="text-[12px] text-ink-600">
              Ranked by interest on this platform over the last 30 days, not by how famous a place is.
            </p>
          </div>
          <Link href="/explore/destinations" className="text-[12px] font-medium text-brand-700 underline">
            All destinations
          </Link>
        </div>

        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {trending.map(({ row, destination }) => (
            <li key={destination.id} className="w-[230px] shrink-0 snap-start sm:w-auto">
              <Link href={`/explore/destinations/${destination.id}`} className="block h-full">
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-raised">
                  <div className="relative">
                    <DestinationVisual destination={destination} height="md" overlay />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="text-[15px] font-semibold text-white">{destination.name}</p>
                      <p className="text-[11px] text-white/75">{destination.district} district</p>
                    </div>
                  </div>
                  <CardBody className="pt-3">
                    <p className="line-clamp-2 text-[12px] text-ink-700">{destination.summary}</p>
                    <p className="mt-2 text-[11px] text-ink-500">
                      Interest index {row.demandIndex} of 100
                    </p>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: 'Ask the place',
            body: 'Every destination answers questions from a curated tourism knowledge base, with each fact labelled as documented, tradition or interpretation.',
          },
          {
            title: 'Local, not generic',
            body: 'Experiences are run by verified homestays, guides and artisans, so what you spend reaches the household hosting you.',
          },
          {
            title: 'Your trip helps',
            body: 'Check-ins and feedback become anonymised signals that show the Tourism Department where to fix things.',
          },
        ].map((item) => (
          <Card key={item.title} className="p-4">
            <p className="text-[13px] font-semibold text-ink-900">{item.title}</p>
            <p className="mt-1 text-[12px] text-ink-600">{item.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
