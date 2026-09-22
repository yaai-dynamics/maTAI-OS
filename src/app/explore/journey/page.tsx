import { redirect } from 'next/navigation';

import { getCurrentTrip, getLatestTrip } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';

export const dynamic = 'force-dynamic';

/**
 * Kept so existing links still land somewhere useful: the current journey if
 * there is one, otherwise the most recent plan (the best match, after a new
 * request), otherwise the planner. Journeys live at /explore/journey/[id].
 */
export default async function CurrentJourneyPage() {
  const { sessionId } = await readVisitor();
  const trip = (await getCurrentTrip(sessionId)) ?? (await getLatestTrip(sessionId));
  redirect(trip ? `/explore/journey/${trip.id}` : '/explore');
}
