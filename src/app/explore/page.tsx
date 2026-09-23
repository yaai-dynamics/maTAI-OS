import type { Metadata } from 'next';

import { now } from '@/lib/config';
import { istDate } from '@/lib/journey';
import { listTrips, MAX_SAVED_TRIPS } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { JourneyList } from '@/components/shared/JourneyList';
import { JourneyPlanner } from '@/components/shared/JourneyPlanner';
import { chooseJourney, findPlacesOnline, planTrip } from '@/server/actions/tourist';

// The home page of the product, so the tab reads as OneStop Manipur rather than as a section.
export const metadata: Metadata = { title: { absolute: 'OneStop Manipur — Plan your Manipur journey' } };
export const dynamic = 'force-dynamic';

/**
 * E1 and the visitor's journeys on one screen: the planner as a conversation,
 * and every option and journey it has produced beside it. A plan opens on its
 * own page (/explore/journey/[id]), which leads back here.
 */
export default async function ExplorePage(props: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await props.searchParams;
  const trips = await listTrips((await readVisitor()).sessionId);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      <JourneyPlanner
        // Handed over from Discover ("Plan a trip with Loktak Lake"): filled in, not sent.
        initialRequest={plan?.slice(0, 600)}
        plan={planTrip}
        choose={chooseJourney}
        findOnline={findPlacesOnline}
        journeys={trips.map(({ id, status }) => ({ id, status }))}
        today={istDate(now())}
      />
      <JourneyList trips={trips} limit={MAX_SAVED_TRIPS} />
    </div>
  );
}
