import Link from 'next/link';
import type { Metadata } from 'next';

import { computePulse } from '@/server/analytics/pulse';
import { getBusinesses, getCreators, getDestinations, getInteractions } from '@/server/data/repository';
import { isSessionRecord } from '@/server/data/store';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { RoleSwitcher } from '@/components/shell/RoleNav';
import { EcosystemLoop } from '@/components/shared/EcosystemLoop';
import { DemoDataNote } from '@/components/shared/badges';

export const metadata: Metadata = { title: 'The ecosystem' };
export const dynamic = 'force-dynamic';

export default function EcosystemPage() {
  const pulse = computePulse();
  const sessionSignals = getInteractions({}).filter((row) => isSessionRecord(row.id));

  const promises = [
    {
      who: 'Tourists',
      accent: 'text-lake-700',
      lines: [
        'Discover Manipur in a way that fits me',
        'Understand the stories behind places',
        'Meet local people and businesses directly',
        'Adapt my trip as conditions change',
      ],
    },
    {
      who: 'Creators',
      accent: 'text-lily-600',
      lines: [
        'Find government campaigns without chasing them',
        'Produce faster on verified information',
        'Be measured on tourism outcomes, not impressions',
        'See exactly why I was shortlisted',
      ],
    },
    {
      who: 'Tourism Department',
      accent: 'text-brand-700',
      lines: [
        'See what is happening across destinations',
        'Know where demand is rising and where capacity is not',
        'Decide what to promote, with the evidence attached',
        'Test a scenario before committing to it',
      ],
    },
    {
      who: 'Local businesses',
      accent: 'text-ink-800',
      lines: [
        'Be discoverable by travellers already planning a trip',
        'Receive enquiries from people who chose the place first',
        'Report availability and be counted in capacity decisions',
        'Appear in creative briefs as the people who can host',
      ],
    },
  ];

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/" className="text-[14px] font-semibold text-ink-900">
            maTAI
          </Link>
          <RoleSwitcher compact />
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1200px] px-4 py-8">
        <section className="immersive -mx-4 px-5 py-9 sm:mx-0 sm:rounded-2xl sm:px-9">
          <h1 className="max-w-3xl text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[36px]">
            We are not building another tourism app. We are building the intelligence layer
            underneath one.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75">
            The Tourism Department can promote and manage tourism. Creators can create, reach an
            audience and earn. Tourists can discover, understand and experience Manipur. And every
            interaction improves what the next decision is based on.
          </p>
          <p className="mt-5 text-[15px] font-medium text-white">
            Explore Manipur. Create for Manipur. Improve Manipur Tourism.
          </p>
        </section>

        <section className="mt-8">
          <EcosystemLoop />
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader
              title="What the loop produced in this session"
              subtitle="Signals created by using the prototype just now, separate from the seeded dataset."
            />
            <CardBody>
              {sessionSignals.length === 0 ? (
                <p className="text-[13px] text-ink-600">
                  No live signals yet. Plan a journey, open a destination, check in and leave feedback,
                  then come back: the counts here and the figures in the department views move
                  together.
                </p>
              ) : (
                <>
                  <p className="text-[32px] font-semibold leading-none text-ink-900">
                    {sessionSignals.length}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-500">
                    platform observed interactions created during this session
                  </p>
                  <ul className="mt-3 space-y-1">
                    {Object.entries(
                      sessionSignals.reduce<Record<string, number>>((counts, row) => {
                        counts[row.type] = (counts[row.type] ?? 0) + 1;
                        return counts;
                      }, {}),
                    ).map(([type, count]) => (
                      <li key={type} className="flex justify-between gap-3 text-[13px]">
                        <span className="text-ink-700">{type.replace(/_/g, ' ').toLowerCase()}</span>
                        <span className="num font-medium text-ink-900">{count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What the platform holds"
              subtitle="The prototype dataset behind everything in this demonstration."
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <dt className="text-[12px] text-ink-500">Destinations</dt>
                  <dd className="num mt-0.5 text-[20px] font-semibold text-ink-900">
                    {getDestinations().length}
                  </dd>
                </div>
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <dt className="text-[12px] text-ink-500">Tourism businesses</dt>
                  <dd className="num mt-0.5 text-[20px] font-semibold text-ink-900">
                    {getBusinesses().length}
                  </dd>
                </div>
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <dt className="text-[12px] text-ink-500">Creators</dt>
                  <dd className="num mt-0.5 text-[20px] font-semibold text-ink-900">
                    {getCreators().length}
                  </dd>
                </div>
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <dt className="text-[12px] text-ink-500">Interactions, {pulse.window.days} days</dt>
                  <dd className="num mt-0.5 text-[20px] font-semibold text-ink-900">
                    {pulse.totals.interactions.toLocaleString('en-IN')}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                <DemoDataNote />
              </div>
            </CardBody>
          </Card>
        </section>

        <section className="mt-8">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">
            What each side gets
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {promises.map((promise) => (
              <li key={promise.who}>
                <Card className="h-full p-4">
                  <p className={`text-[14px] font-semibold ${promise.accent}`}>{promise.who}</p>
                  <ul className="mt-2 space-y-1.5">
                    {promise.lines.map((line) => (
                      <li key={line} className="flex gap-2 text-[12px] text-ink-700">
                        <span aria-hidden className="text-ink-300">
                          ·
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <Card tone="outline">
            <CardBody className="pt-4">
              <h2 className="text-[15px] font-semibold text-ink-900">What this prototype is not</h2>
              <ul className="mt-2 grid gap-1.5 text-[12px] text-ink-600 sm:grid-cols-2">
                <li>· It is not integrated with the Department of Tourism.</li>
                <li>· It is not a booking engine and takes no payment.</li>
                <li>· It has no live social platform integration.</li>
                <li>· It does not count visitors on the ground.</li>
                <li>· It is not a production AR platform.</li>
                <li>· It does not process creator payouts.</li>
              </ul>
              <p className="mt-3 text-[12px] text-ink-700">
                Each of those is a deliberate scope decision recorded in the roadmap, not an omission.
                What is built is the loop, end to end, with the data honesty that a government product
                would actually need.
              </p>
            </CardBody>
          </Card>
        </section>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/gov"
            className="rounded-md bg-brand-700 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-brand-600"
          >
            Decision Room
          </Link>
          <Link
            href="/creator"
            className="rounded-md bg-lily-500 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-lily-600"
          >
            Create for Manipur
          </Link>
          <Link
            href="/explore"
            className="rounded-md bg-lake-600 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-lake-700"
          >
            Explore Manipur
          </Link>
        </div>
      </main>
    </div>
  );
}
