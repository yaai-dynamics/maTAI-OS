import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/server/data/client';
import { getState, reloadState } from '@/server/data/store';
import { getCurrentTrip, listSavedTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';

/**
 * Trips against MySQL, through the same Server Actions the pages call.
 *
 * Cookies come from an in-memory jar, so each "browser" is a jar. Every
 * session made here is recorded and its rows removed afterwards, and today's
 * intake counters are put back as they were.
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

import {
  deleteMyJourneys,
  planTrip,
  replanCurrentTrip,
  saveCurrentTrip,
  submitTouristFeedback,
  switchJourney,
} from '@/server/actions/tourist';

const configured = Boolean(process.env.DATABASE_URL);
const REQUEST = 'I have 3 days, love nature, culture and local food, and prefer less crowded places.';

describe.skipIf(!configured)('trips against MySQL', () => {
  const sessions = new Set<string>();
  const feedbackIds: string[] = [];
  let counters: { day: Date; outcome: string; count: number }[] = [];
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

  /** A new browser: an empty cookie jar. */
  const newBrowser = () => jar.clear();

  async function planned() {
    const result = await planTrip({ request: REQUEST });
    if (!result.ok || !result.trip) throw new Error(result.error ?? 'planning failed');
    sessions.add(result.trip.touristSessionId);
    return result.trip;
  }

  const cleanup = async () => {
    const ids = [...sessions];
    if (feedbackIds.length > 0) await prisma.feedback.deleteMany({ where: { id: { in: feedbackIds } } });
    await prisma.tourismInteraction.deleteMany({ where: { anonymousSessionId: { in: ids } } });
    // Trips and their items cascade from the session.
    await prisma.touristSession.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    counters = await prisma.telemetryCounter.findMany({ where: { day: today } });
    await reloadState();
  });

  beforeEach(() => newBrowser());

  // Any action creates a visitor, whether or not it plans, so each browser's
  // visitor is noted for cleanup before the next test clears the jar.
  afterEach(async () => {
    const { sessionId } = await readVisitor();
    if (sessionId) sessions.add(sessionId);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.telemetryCounter.deleteMany({ where: { day: today } });
    if (counters.length > 0) await prisma.telemetryCounter.createMany({ data: counters });
    getState().persistent = false;
    await prisma.$disconnect();
  });

  it('plans a journey whose signals point at a stored trip', async () => {
    // This failed before trips were stored: the itinerary signals referenced a
    // trip the database had never seen, and the foreign key refused them.
    const trip = await planned();

    const row = await prisma.trip.findUnique({ where: { id: trip.id }, include: { items: true } });
    expect(row?.status).toBe('DRAFT');
    expect(row?.items).toHaveLength(trip.items.length);

    const stops = trip.items.filter((item) => item.kind === 'DESTINATION').length;
    expect(await prisma.tourismInteraction.count({ where: { tripId: trip.id, type: 'ITINERARY_ADD' } })).toBe(stops);
  });

  it('comes back identical after a restart', async () => {
    const trip = await planned();
    await reloadState();
    expect(await getCurrentTrip(trip.touristSessionId)).toEqual(trip);
  });

  it('stores feedback sent during the trip against it', async () => {
    const trip = await planned();
    const sent = await submitTouristFeedback({
      destinationId: trip.items[0]!.destinationId,
      rating: 4,
      category: 'EXPERIENCE',
      text: 'Well organised, and the host explained everything.',
    });
    expect(sent.ok).toBe(true);
    feedbackIds.push(sent.feedback!.id);
    expect((await prisma.feedback.findUnique({ where: { id: sent.feedback!.id } }))?.tripId).toBe(trip.id);
  });

  it('keeps a re-plan', async () => {
    const trip = await planned();
    const result = await replanCurrentTrip('SHORT_ON_TIME');
    expect(result.ok).toBe(true);

    const row = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { items: true } });
    expect(row.adaptedReason).toBe(result.trip!.adaptedReason);
    expect(row.items).toHaveLength(result.trip!.items.length);
  });

  it('replaces the draft on the next plan, keeps a saved journey, and can switch back to it', async () => {
    const kept = await planned();
    expect(await saveCurrentTrip(kept.id)).toEqual({ ok: true });

    const draft = await planned();
    const latest = await planned();

    expect(await prisma.trip.findUnique({ where: { id: draft.id } })).toBeNull();
    expect(await prisma.trip.findUnique({ where: { id: kept.id } })).not.toBeNull();
    expect((await getCurrentTrip(latest.touristSessionId))?.id).toBe(latest.id);
    expect((await listSavedTrips(latest.touristSessionId)).map((summary) => summary.id)).toEqual([kept.id]);

    // The discarded draft's demand signals still count; only the link to it goes.
    const orphaned = await prisma.tourismInteraction.findMany({
      where: { anonymousSessionId: draft.touristSessionId, type: 'ITINERARY_ADD', tripId: null },
    });
    expect(orphaned.length).toBeGreaterThan(0);

    expect(await switchJourney(kept.id)).toEqual({ ok: true });
    expect((await getCurrentTrip(kept.touristSessionId))?.id).toBe(kept.id);
  });

  it("gives another browser nothing for a trip id it did not plan", async () => {
    const trip = await planned();
    newBrowser();
    expect((await saveCurrentTrip(trip.id)).ok).toBe(false);
    expect((await switchJourney(trip.id)).ok).toBe(false);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('DRAFT');
  });

  it('still plans after a demo reset has emptied the visitor table', async () => {
    const first = await planned();
    // What a reset does to this visitor: the session row goes (and its trips
    // with it), and a freshly loaded state replaces the old one.
    await prisma.touristSession.delete({ where: { id: first.touristSessionId } });
    await reloadState();

    const again = await planned();
    expect(again.touristSessionId).toBe(first.touristSessionId);
    expect(await prisma.trip.count({ where: { id: again.id } })).toBe(1);
  });

  it('skips a stored trip it can no longer read, rather than breaking the page', async () => {
    const trip = await planned();
    await prisma.trip.update({ where: { id: trip.id }, data: { preferencesJson: { durationDays: 'three' } } });
    expect(await getCurrentTrip(trip.touristSessionId)).toBeUndefined();
  });

  it('deletes every journey the browser has, and leaves the demand signals', async () => {
    const trip = await planned();
    await saveCurrentTrip(trip.id);
    await planned();

    const { sessionId } = await readVisitor();
    const signals = await prisma.tourismInteraction.count({ where: { anonymousSessionId: sessionId! } });
    expect(await deleteMyJourneys()).toEqual({ ok: true, removed: 2 });
    expect(await prisma.trip.count({ where: { touristSessionId: sessionId! } })).toBe(0);
    expect(await prisma.tourismInteraction.count({ where: { anonymousSessionId: sessionId! } })).toBe(signals);
  });
});
