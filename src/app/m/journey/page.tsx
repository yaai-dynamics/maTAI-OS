import { redirect } from 'next/navigation';

import { getCurrentTrip, getLatestTrip } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';

export const dynamic = 'force-dynamic';

/** The current journey, else the latest plan, else the planner. */
export default async function MobileCurrentJourneyPage() {
  const { sessionId } = await readVisitor();
  const trip = (await getCurrentTrip(sessionId)) ?? (await getLatestTrip(sessionId));
  redirect(trip ? `/m/journey/${trip.id}` : '/m/plan');
}
