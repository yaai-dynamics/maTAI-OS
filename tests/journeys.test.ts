import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The journeys screen, through the same Server Actions the pages call, on the
 * in-memory store: options per request, choosing one, starting it, and what
 * each step records.
 *
 * Cookies come from an in-memory jar, so each "browser" is a jar.
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
  findPlacesOnline,
  planTrip,
  replanJourney,
  startJourney,
} from '@/server/actions/tourist';
import { getInteractions } from '@/server/data/repository';
import { resetState } from '@/server/data/store';
import { getCurrentTrip, getTripFor, listTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';

const NATURE = 'I have 3 days, love nature, culture and local food, and prefer less crowded places.';
const HERITAGE = 'Two days of history and heritage around Imphal, travelling with my parents.';

async function planned(input: string | Record<string, unknown>) {
  const result = await planTrip(typeof input === 'string' ? { request: input } : input);
  if (!result.ok || !result.options) throw new Error(result.error ?? 'planning failed');
  return result;
}

const session = async () => (await readVisitor()).sessionId!;

beforeEach(() => {
  resetState();
  jar.clear();
});

describe('planning', () => {
  it('offers two or three different options for one request, none of them kept yet', async () => {
    const result = await planned(NATURE);
    expect(result.options!.length).toBeGreaterThanOrEqual(2);
    expect(result.options!.length).toBeLessThanOrEqual(3);
    expect(new Set(result.options!.map((option) => option.label)).size).toBe(result.options!.length);
    expect(new Set(result.options!.map((option) => option.stopNames.join())).size).toBe(result.options!.length);

    const trips = await listTrips(await session());
    expect(trips.map((trip) => trip.status)).toEqual(result.options!.map(() => 'DRAFT'));
    expect(new Set(trips.map((trip) => trip.optionGroupId))).toEqual(new Set([result.groupId]));
    // The best match lists first, and is what a link to "the latest plan" opens.
    expect(trips[0]!.optionLabel).toBe('Best match');
  });

  it('includes stays, transport and guides from verified partners, and costs them', async () => {
    const result = await planned({ request: NATURE, travellers: 2, budgetAmount: 30_000 });
    const trip = (await getTripFor(await session(), result.options![0]!.tripId))!;
    expect(trip.preferences.travellers).toBe(2);
    expect(trip.logistics?.stays).toHaveLength(2);
    expect(trip.logistics?.transport?.vehicles).toBe(1);
    expect(result.options![0]!.cost).toBeGreaterThan(0);
    expect(result.options![0]!.fitsBudget).toBeDefined();
  });

  it('fits the dates given, and refuses dates it cannot use', async () => {
    const result = await planned({
      request: NATURE,
      window: { startDate: '2026-09-17', endDate: '2026-09-20', arriveTime: '10:30', departTime: '16:00' },
    });
    const trip = (await getTripFor(await session(), result.options![0]!.tripId))!;
    expect(trip.preferences.durationDays).toBe(4);
    expect(trip).toMatchObject({ startDate: '2026-09-17', endDate: '2026-09-20', arriveTime: '10:30' });
    expect(result.planFor).toBe('17 Sep 10:30 → 20 Sep 2026 16:00');
    // Nothing starts before arrival and an hour to get going.
    expect(trip.items.filter((item) => item.day === 1).every((item) => item.startTime >= '11:30')).toBe(true);

    const refuse = async (window: object) => (await planTrip({ request: NATURE, window })).error;
    expect(await refuse({ startDate: '2026-09-10', endDate: '2026-09-12' })).toMatch(/before today/);
    expect(await refuse({ startDate: '2026-09-20', endDate: '2026-09-18' })).toMatch(/ends before it starts/);
    expect(await refuse({ startDate: '2026-09-17', endDate: '2026-09-30' })).toMatch(/up to 10 days/);
  });

  it('raises no demand signal until an option is chosen, then one per place', async () => {
    const result = await planned(NATURE);
    const sessionId = await session();
    const mine = () => getInteractions({ types: ['ITINERARY_ADD'] }).filter((row) => row.anonymousSessionId === sessionId);
    expect(mine()).toHaveLength(0);

    const chosen = result.options![1]!;
    expect(await chooseJourney(chosen.tripId)).toEqual({ ok: true });
    expect(mine()).toHaveLength(chosen.stopNames.length);
    expect(mine().every((row) => row.tripId === chosen.tripId)).toBe(true);
  });
});

describe('choosing', () => {
  it('keeps the chosen option and removes the others; the next request leaves it alone', async () => {
    const first = await planned(NATURE);
    await chooseJourney(first.options![0]!.tripId);
    const sessionId = await session();
    expect((await listTrips(sessionId)).map((trip) => trip.id)).toEqual([first.options![0]!.tripId]);

    const second = await planned(HERITAGE);
    const ids = (await listTrips(sessionId)).map((trip) => trip.id);
    expect(ids).toContain(first.options![0]!.tripId);
    expect(ids).toHaveLength(second.options!.length + 1);
  });

  it('does not make a journey current: starting it, or its dates, do', async () => {
    const result = await planned(NATURE);
    const id = result.options![0]!.tripId;
    await chooseJourney(id);
    expect(await getCurrentTrip(await session())).toBeUndefined();

    expect(await startJourney(id)).toEqual({ ok: true });
    expect((await getCurrentTrip(await session()))?.id).toBe(id);
  });

  it('refuses to start an option that was never chosen', async () => {
    const result = await planned(NATURE);
    expect((await startJourney(result.options![0]!.tripId)).error).toMatch(/Choose this plan first/);
  });
});

describe('re-planning from a journey page', () => {
  it('changes the plan that is open and keeps what it includes in step', async () => {
    const result = await planned(NATURE);
    const id = result.options![1]!.tripId;
    const replanned = await replanJourney(id, 'SHORT_ON_TIME');
    expect(replanned.ok).toBe(true);
    expect(replanned.trip?.id).toBe(id);

    const stored = (await getTripFor(await session(), id))!;
    expect(stored.adaptedReason).toBe(replanned.trip?.adaptedReason);
    expect(stored.logistics?.stays.length).toBe(stored.preferences.durationDays - 1);
    const untouched = (await getTripFor(await session(), result.options![0]!.tripId))!;
    expect(untouched.adaptedReason).toBeUndefined();
  });

  it("refuses an unknown condition, and another browser's plan", async () => {
    const result = await planned(NATURE);
    const id = result.options![0]!.tripId;
    expect((await replanJourney(id, 'EARTHQUAKE')).ok).toBe(false);

    jar.clear();
    expect(await replanJourney(id, 'RAIN')).toEqual({ ok: false, error: 'That trip could not be found.' });
    expect((await chooseJourney(id)).ok).toBe(false);
  });
});

describe('looking online', () => {
  it('says it is off when no Gemini key is configured, and records that on each option', async () => {
    const result = await planned(NATURE);
    expect(result.searchOnline).toBe(false);
    expect(await findPlacesOnline(result.groupId)).toMatchObject({ status: 'OFF', found: 0 });
    for (const option of result.options!) {
      expect((await getTripFor(await session(), option.tripId))?.logistics?.online.status).toBe('OFF');
    }
  });
});
