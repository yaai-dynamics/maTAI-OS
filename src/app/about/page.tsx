import Link from 'next/link';
import type { Metadata } from 'next';

import { PROVENANCE, PROVENANCE_VALUES } from '@/lib/provenance';
import { computePulse } from '@/server/analytics/pulse';
import { getBusinesses, getCreators, getDestinations } from '@/server/data/repository';
import { Card, CardBody } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import { EcosystemLoop } from '@/components/shared/EcosystemLoop';
import { AppShell } from '@/components/shell/AppShell';

/**
 * About maTAI: the whole product on one page — the three interfaces, the
 * closed loop and the provenance rules. The tourist home at /explore is the
 * front door; this is the page to present from.
 */

export const metadata: Metadata = {
  title: { absolute: 'About maTAI' },
  description:
    'maTAI connects the Tourism Department, creators and tourists through a shared tourism intelligence layer.',
};

export const dynamic = 'force-dynamic';

const ROLES = [
  {
    href: '/gov',
    name: 'Decision Room',
    who: 'Tourism Department',
    promise: 'Understand what is happening, decide what to promote, and test it before acting.',
    accent: 'bg-brand-700',
    letter: 'D',
    points: [
      'Six headline indicators with their method and source attached',
      'Natural-language questions routed to authorised analytical tools',
      'Creator matching you can argue with, because every factor is shown',
    ],
  },
  {
    href: '/creator',
    name: 'Create for Manipur',
    who: 'Creators',
    promise: 'Find government campaigns, get a grounded brief, and be paid on tourism outcomes.',
    accent: 'bg-lily-500',
    letter: 'C',
    points: [
      'Campaigns with the objective, audience, deadline and reward stated up front',
      'Briefs built from verified facts, so you are not inventing claims',
      'Rewards tied to itinerary additions and check-ins, not to impressions',
    ],
  },
  {
    href: '/explore',
    name: 'Explore Manipur',
    who: 'Tourists',
    promise: 'A journey built from your own words, and places explained rather than just listed.',
    accent: 'bg-lake-600',
    letter: 'E',
    points: [
      'A route with the reason attached to every stop',
      'Ask any destination a question and see which facts answered it',
      'Local experiences run by verified homestays, guides and artisans',
    ],
  },
] as const;

export default function AboutPage() {
  const pulse = computePulse();
  const stats = [
    { value: getDestinations().length, label: 'destinations' },
    { value: getBusinesses().length, label: 'tourism businesses' },
    { value: getCreators().length, label: 'creators' },
    {
      value: pulse.totals.interactions.toLocaleString('en-IN'),
      label: `interactions in ${pulse.window.days} days`,
    },
  ];

  return (
    <AppShell>
      <div className="py-3 sm:py-6">
        <section className="immersive -mx-4 px-5 py-10 sm:mx-0 sm:rounded-2xl sm:px-10 sm:py-14">
          <p className="text-[12px] uppercase tracking-[0.14em] text-white/55">About</p>
          <h1 className="mt-2 max-w-3xl text-[32px] font-semibold leading-tight tracking-tight text-white sm:text-[44px]">
            maTAI
          </h1>
          <p className="mt-2 text-[12px] uppercase tracking-[0.14em] text-white/55">
            Manipur Tourism Intelligence Platform
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75 sm:text-[17px]">
            One platform, three interfaces, one shared tourism intelligence layer. The Tourism
            Department can promote and manage tourism, creators can create and earn, and tourists can
            discover and understand Manipur — and every interaction improves what the next decision is
            based on.
          </p>

          <div className="mt-7 flex flex-wrap gap-2.5">
            {ROLES.map((role) => (
              <Link
                key={role.href}
                href={role.href}
                className="rounded-md bg-white px-4 py-2.5 text-[14px] font-medium text-brand-800 hover:bg-white/90"
              >
                {role.name}
              </Link>
            ))}
            <Link
              href="/ecosystem"
              className="rounded-md border border-white/25 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-white/10"
            >
              See the loop
            </Link>
          </div>

          <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="block text-[24px] font-semibold leading-none text-white">
                    {stat.value}
                  </span>
                  <span className="mt-1 block text-[11px] text-white/55">{stat.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">
            Three interfaces, one product
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            They are not three apps that share a logo. A destination, a campaign and a feedback item
            are the same record in all three.
          </p>

          <ul className="mt-4 grid gap-4 lg:grid-cols-3">
            {ROLES.map((role) => (
              <li key={role.href}>
                <Link href={role.href} className="block h-full rounded-lg">
                  <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-raised">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={`flex h-9 w-9 items-center justify-center rounded-md text-[15px] font-semibold text-white ${role.accent}`}
                      >
                        {role.letter}
                      </span>
                      <div>
                        <p className="text-[15px] font-semibold text-ink-900">{role.name}</p>
                        <p className="text-[11px] text-ink-500">{role.who}</p>
                      </div>
                    </div>

                    <p className="mt-3 text-[13px] text-ink-700">{role.promise}</p>

                    <ul className="mt-3 space-y-1.5">
                      {role.points.map((point) => (
                        <li key={point} className="flex gap-2 text-[12px] text-ink-600">
                          <span aria-hidden className="text-brand-400">
                            ·
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>

                    <span className="mt-auto pt-4 text-[13px] font-medium text-brand-700 underline">
                      Open {role.name}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">The closed loop</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Promote, discover, plan, experience, feed back, learn, improve, promote again.
          </p>
          <div className="mt-4">
            <EcosystemLoop compact />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">
            Every number says where it came from
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            A tourism platform that mixes measured figures with modelled ones is worse than no
            platform. These categories are enforced in code, and the weakest input decides how a
            combined figure is labelled.
          </p>

          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {PROVENANCE_VALUES.map((provenance) => (
              <li key={provenance}>
                <Card className="h-full p-3.5">
                  <ProvenanceBadge provenance={provenance} />
                  <p className="mt-2 text-[12px] leading-snug text-ink-600">
                    {PROVENANCE[provenance].description}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-10 border-t border-line pt-6">
          <Card tone="outline">
            <CardBody className="pt-4">
              <p className="text-[13px] font-medium text-ink-900">This is a prototype</p>
              <p className="mt-1 max-w-3xl text-[12px] text-ink-600">
                The figures in this demonstration are synthetic and are labelled as such throughout.
                There is no integration with the Department of Tourism, and the official data tier is
                shown as explicitly not connected rather than filled with a generated number. Nothing
                here should be quoted as a tourism statistic.
              </p>
            </CardBody>
          </Card>
        </footer>
      </div>
    </AppShell>
  );
}
