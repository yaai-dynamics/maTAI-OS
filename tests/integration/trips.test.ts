import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/server/data/client';
import { getState, reloadState } from '@/server/data/store';
import { getCurrentTrip, getTripFor, listTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';

/**
 * Trips against MySQL, through the same Server Actions the pages call.
 *
 * Cookies come from an in-memory jar, so each "browser" is a jar. Every
 * session made here is recorded and its rows removed afterwards, and today's
 * intake counters are put back as they were. Nothing here reseeds.
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
  chooseJourney,
  deleteMyJourneys,
  findPlacesOnline,
  planTrip,
  replanJourney,
  startJourney,
  submitTouristFeedback,
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

  async function planned(input: Record<string, unknown> = {}) {
    const result = await planTrip({ request: REQUEST, ...input });
    if (!result.ok || !result.options || !result.trip) throw new Error(result.error ?? 'planning failed');
    sessions.add(result.trip.touristSessionId);
    return result;
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

  it('stores every option, with what it includes, and raises demand only when one is chosen', async () => {
    const result = await planned({ travellers: 2 });
    const sessionId = result.trip!.touristSessionId;

    const rows = await prisma.trip.findMany({ where: { touristSessionId: sessionId }, include: { items: true } });
    expect(rows).toHaveLength(result.options!.length);
    expect(rows.every((row) => row.status === 'DRAFT' && row.optionGroupId === result.groupId)).toBe(true);
    expect(rows.every((row) => row.logisticsJson !== null)).toBe(true);
    expect(await prisma.tourismInteraction.count({ where: { anonymousSessionId: sessionId, type: 'ITINERARY_ADD' } })).toBe(0);

    const chosen = result.options![0]!;
    expect(await chooseJourney(chosen.tripId)).toEqual({ ok: true });
    expect(await prisma.trip.count({ where: { touristSessionId: sessionId } })).toBe(1);
    // Before trips were stored, these signals referenced a trip the database
    // had never seen, and the foreign key refused them.
    expect(await prisma.tourismInteraction.count({ where: { tripId: chosen.tripId, type: 'ITINERARY_ADD' } })).toBe(
      chosen.stopNames.length,
    );
  });

  it('comes back identical after a restart, dates, times and logistics included', async () => {
    const result = await planned({
      window: { startDate: '2026-09-17', endDate: '2026-09-19', arriveTime: '10:30', departTime: '17:00' },
      budgetAmount: 25_000,
    });
    const before = result.trip!;
    await reloadState();
    const after = await getTripFor(before.touristSessionId, before.id);
    expect(after).toEqual(before);
    expect(after).toMatchObject({ startDate: '2026-09-17', arriveTime: '10:30', departTime: '17:00' });
    expect(after?.preferences.budgetAmount).toBe(25_000);
  });

  it('stores feedback sent during a started journey against it', async () => {
    const result = await planned();
    const id = result.options![0]!.tripId;
    await chooseJourney(id);
    await startJourney(id);

    const sent = await submitTouristFeedback({
      destinationId: result.trip!.items[0]!.destinationId,
      rating: 4,
      category: 'EXPERIENCE',
      text: 'Well organised, and the host explained everything.',
    });
    expect(sent.ok).toBe(true);
    feedbackIds.push(sent.feedback!.id);
    expect((await prisma.feedback.findUnique({ where: { id: sent.feedback!.id } }))?.tripId).toBe(id);
  });

  it('keeps a re-plan of the journey that is open', async () => {
    const result = await planned();
    const id = result.options![1]!.tripId;
    const replanned = await replanJourney(id, 'SHORT_ON_TIME');
    expect(replanned.ok).toBe(true);

    const row = await prisma.trip.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(row.adaptedReason).toBe(replanned.trip!.adaptedReason);
    expect(row.items).toHaveLength(replanned.trip!.items.length);
  });

  it('keeps a chosen journey past the next plan, and makes it current only when started', async () => {
    const first = await planned();
    const kept = first.options![0]!.tripId;
    await chooseJourney(kept);
    const second = await planned();

    const sessionId = second.trip!.touristSessionId;
    const ids = (await listTrips(sessionId)).map((trip) => trip.id);
    expect(ids).toContain(kept);
    expect(ids).toHaveLength(second.options!.length + 1);
    expect(await getCurrentTrip(sessionId)).toBeUndefined();

    expect(await startJourney(kept)).toEqual({ ok: true });
    expect((await getCurrentTrip(sessionId))?.id).toBe(kept);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: kept } })).startedAt).not.toBeNull();
  });

  it('gives another browser nothing for a trip id it did not plan', async () => {
    const result = await planned();
    const id = result.options![0]!.tripId;
    newBrowser();
    expect((await chooseJourney(id)).ok).toBe(false);
    expect((await startJourney(id)).ok).toBe(false);
    expect((await replanJourney(id, 'RAIN')).ok).toBe(false);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  it('records the online search on each option', async () => {
    const result = await planned();
    // The suite runs on the mock provider, so the search is off, and says so.
    expect((await findPlacesOnline(result.groupId)).status).toBe('OFF');
    const rows = await prisma.trip.findMany({ where: { optionGroupId: result.groupId } });
    expect(rows.every((row) => (row.logisticsJson as { online?: { status?: string } }).online?.status === 'OFF')).toBe(true);
  });

  it('still plans after a demo reset has emptied the visitor table', async () => {
    const first = await planned();
    // What a reset does to this visitor: the session row goes (and its trips
    // with it), and a freshly loaded state replaces the old one.
    await prisma.touristSession.delete({ where: { id: first.trip!.touristSessionId } });
    await reloadState();

    const again = await planned();
    expect(again.trip!.touristSessionId).toBe(first.trip!.touristSessionId);
    expect(await prisma.trip.count({ where: { id: again.trip!.id } })).toBe(1);
  });

  it('skips a stored trip it can no longer read, rather than breaking the page', async () => {
    const result = await planned();
    const id = result.options![0]!.tripId;
    await prisma.trip.update({ where: { id }, data: { preferencesJson: { durationDays: 'three' } } });
    expect(await getTripFor(result.trip!.touristSessionId, id)).toBeUndefined();
  });

  it('deletes every journey the browser has, and leaves the demand signals', async () => {
    const result = await planned();
    await chooseJourney(result.options![0]!.tripId);
    await planned();

    const { sessionId } = await readVisitor();
    const signals = await prisma.tourismInteraction.count({ where: { anonymousSessionId: sessionId! } });
    const stored = await prisma.trip.count({ where: { touristSessionId: sessionId! } });
    expect(await deleteMyJourneys()).toEqual({ ok: true, removed: stored });
    expect(await prisma.trip.count({ where: { touristSessionId: sessionId! } })).toBe(0);
    expect(await prisma.tourismInteraction.count({ where: { anonymousSessionId: sessionId! } })).toBe(signals);
  });
});
