import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPlanFor, journeyPhase, PHASE_LABEL } from '@/lib/journey';
import { listTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { chooseJourney, findPlacesOnline, planTrip } from '@/server/actions/tourist';
import { MobilePlanner } from '@/components/mobile/MobilePlanner';
import { MobileHeader, Section } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Plan a trip' };
export const dynamic = 'force-dynamic';

/** E1 on mobile: the chat planner, and the visitor's kept journeys. */
export default async function MobilePlanPage(props: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await props.searchParams;
  const at = now();
  const kept = (await listTrips((await readVisitor()).sessionId)).filter((trip) => trip.status !== 'DRAFT');

  return (
    <div>
      <MobileHeader title="Plan a trip" subtitle="AI planner · verified places and partners" />

      {kept.length > 0 ? (
        <Section title="Your trips" className="mt-0 mb-6">
          <ul id="trips" className="space-y-2">
            {kept.map((trip) => (
              <li key={trip.id}>
                <Link
                  href={`/m/journey/${trip.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 shadow-card"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink-900">{trip.theme}</span>
                    <span className="block text-[12px] text-ink-500">
                      {PHASE_LABEL[journeyPhase(trip, at)]} ·{' '}
                      {formatPlanFor(trip) ?? `${trip.preferences.durationDays} days`}
                    </span>
                  </span>
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <MobilePlanner
        initialRequest={plan?.slice(0, 600)}
        plan={planTrip}
        choose={chooseJourney}
        findOnline={findPlacesOnline}
      />
    </div>
  );
}
