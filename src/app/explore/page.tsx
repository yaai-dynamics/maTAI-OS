import type { Metadata } from 'next';

import { now } from '@/lib/config';
import { istDate } from '@/lib/journey';
import { listTrips, MAX_SAVED_TRIPS } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { getCampaigns, getDestinations } from '@/server/data/repository';
import { seed } from '@/server/data/seed';
import { JourneyList } from '@/components/shared/JourneyList';
import { JourneyPlanner } from '@/components/shared/JourneyPlanner';
import { TripPlannerDiscovery } from '@/components/shared/TripPlannerDiscovery';
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

  // ── Discovery data ─────────────────────────────────────────────────────────
  const allCampaigns = getCampaigns();
  const activeCampaigns = allCampaigns
    .filter((c) => c.status === 'IN_PROGRESS' || c.status === 'OPEN' || c.status === 'DRAFT')
    .slice(0, 4);

  const allDestinations = getDestinations();
  const PRIORITY_IDS = [
    'dest-loktak', 'dest-kangla', 'dest-ukhrul', 'dest-keibul',
    'dest-ima-keithel', 'dest-shirui', 'dest-bishnupur-temple',
    'dest-moirang', 'dest-andro', 'dest-imphal-war-cemetery',
  ];
  const destinations = [
    ...allDestinations.filter((d) => PRIORITY_IDS.includes(d.id)),
    ...allDestinations.filter((d) => !PRIORITY_IDS.includes(d.id)),
  ].slice(0, 8);

  const allExperiences = seed.experiences;
  const featuredExperiences = allExperiences
    .filter((e) => e.verified && e.availabilityStatus !== 'UNAVAILABLE' && e.category !== 'homestay')
    .slice(0, 6);

  const stays = allExperiences
    .filter((e) => e.category === 'homestay' && e.verified)
    .slice(0, 5);

  const destinationMap = new Map(allDestinations.map((d) => [d.id, d.name]));

  return (
    <div>
      {/* Planner + saved journeys */}
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

      {/* Discovery — campaigns, destinations, experiences, stays */}
      <TripPlannerDiscovery
        activeCampaigns={activeCampaigns}
        destinations={destinations}
        featuredExperiences={featuredExperiences}
        stays={stays}
        destinationMap={destinationMap}
      />
    </div>
  );
}
