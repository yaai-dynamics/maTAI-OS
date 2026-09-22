import { beforeEach, describe, expect, it } from 'vitest';

import { now } from '@/lib/config';
import { formatPlanFor, journeyPhase, tripWindow } from '@/lib/journey';
import type { Trip } from '@/lib/types';
import { buildItinerary, extractTripProfile } from '@/server/ai/trip-planner';
import { resetState } from '@/server/data/store';
import {
  chooseOption,
  deleteTrip,
  deleteTripsForSession,
  discardUnchosenOptions,
  endTrip,
  getCurrentTrip,
  getTripFor,
  listTrips,
  MAX_SAVED_TRIPS,
  saveTrip,
  startTrip,
  TripOwnershipError,
} from '@/server/data/trips';

/**
 * Trip rules, on the in-memory store. The same rules against MySQL, through
 * the real actions, are in tests/integration/trips.test.ts.
 *
 * The demo clock stands at 16 September 2026, 15:30 in Manipur.
 */

const profile = extractTripProfile('3 days of nature and culture, less crowded please');
const plan = (sessionId: string, status: Trip['status'] = 'DRAFT', extra: Partial<Trip> = {}): Trip => ({
  ...buildItinerary(profile, sessionId).trip,
  status,
  ...extra,
});

beforeEach(() => resetState());

describe('a trip', () => {
  it('gets a fresh id per plan, so signals from one plan never describe another', () => {
    const first = plan('sess-a');
    const second = plan('sess-a');
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^trip-[A-Za-z0-9_-]{16}$/);
    expect(first.items.every((item) => item.tripId === first.id && item.id.startsWith(first.id))).toBe(true);
  });

  it('is reached only through the session that planned it', async () => {
    const mine = await saveTrip(plan('sess-mine', 'SAVED'));
    expect(await getTripFor('sess-mine', mine.id)).toEqual(mine);
    expect(await getTripFor('sess-other', mine.id)).toBeUndefined();
    expect(await getTripFor(null, mine.id)).toBeUndefined();
    expect(await deleteTrip('sess-other', mine.id)).toBe(false);
    expect((await startTrip('sess-other', mine.id)).outcome).toBe('NOT_FOUND');
    expect((await chooseOption('sess-other', mine.id)).outcome).toBe('NOT_FOUND');
    await expect(saveTrip({ ...mine, touristSessionId: 'sess-other' })).rejects.toBeInstanceOf(TripOwnershipError);
  });
});

describe('the current trip', () => {
  it('is not simply the latest plan', async () => {
    await saveTrip(plan('sess-a'));
    await saveTrip(plan('sess-a', 'SAVED'));
    expect(await getCurrentTrip('sess-a')).toBeUndefined();
  });

  it('is a chosen journey while today falls inside its dates', async () => {
    const past = await saveTrip(plan('sess-a', 'SAVED', { startDate: '2026-09-10', endDate: '2026-09-12' }));
    const upcoming = await saveTrip(plan('sess-a', 'SAVED', { startDate: '2026-09-18', endDate: '2026-09-20' }));
    const now = await saveTrip(plan('sess-a', 'SAVED', { startDate: '2026-09-15', endDate: '2026-09-17' }));
    // An option whose dates cover today is still only an option.
    await saveTrip(plan('sess-a', 'DRAFT', { startDate: '2026-09-16', endDate: '2026-09-16' }));

    expect((await getCurrentTrip('sess-a'))?.id).toBe(now.id);
    expect(past.id).not.toBe(upcoming.id);
  });

  it('respects arrival and departure times, in Manipur time', () => {
    const at = now(); // 15:30 IST on 16 September
    const trip = (arriveTime?: string, departTime?: string) =>
      ({ status: 'SAVED', startDate: '2026-09-16', endDate: '2026-09-16', arriveTime, departTime }) as Trip;
    expect(journeyPhase(trip('15:00', '18:00'), at)).toBe('IN_PROGRESS');
    expect(journeyPhase(trip('16:00'), at)).toBe('UPCOMING');
    expect(journeyPhase(trip(undefined, '15:00'), at)).toBe('PAST');
    expect(journeyPhase(trip(), at)).toBe('IN_PROGRESS');
    expect(tripWindow(trip('10:30'))!.start.toISOString()).toBe('2026-09-16T05:00:00.000Z');
  });

  it('is the journey the visitor started, whatever its dates, until they end it', async () => {
    const dated = await saveTrip(plan('sess-a', 'SAVED', { startDate: '2026-09-15', endDate: '2026-09-17' }));
    const undated = await saveTrip(plan('sess-a', 'SAVED'));

    expect((await startTrip('sess-a', undated.id)).outcome).toBe('STARTED');
    expect((await getCurrentTrip('sess-a'))?.id).toBe(undated.id);
    expect((await getTripFor('sess-a', undated.id))?.startedAt).toBe(now().toISOString());

    // Starting another ends the one under way: a visitor travels one at a time.
    const second = await saveTrip(plan('sess-a', 'SAVED'));
    expect((await startTrip('sess-a', second.id)).ended?.id).toBe(undated.id);
    expect((await getTripFor('sess-a', undated.id))?.status).toBe('COMPLETED');

    expect(await endTrip('sess-a', second.id)).toBe('ENDED');
    // With nothing started, the dated journey covering today is current again.
    expect((await getCurrentTrip('sess-a'))?.id).toBe(dated.id);
  });

  it('cannot be an option that was never chosen', async () => {
    const option = await saveTrip(plan('sess-a'));
    expect((await startTrip('sess-a', option.id)).outcome).toBe('NOT_CHOSEN');
    expect(await endTrip('sess-a', option.id)).toBe('NOT_STARTED');
  });
});

describe('options', () => {
  it('are discarded by the next request unless chosen, and never touch anyone else', async () => {
    const kept = await saveTrip(plan('sess-a', 'SAVED'));
    const oldOption = await saveTrip(plan('sess-a', 'DRAFT', { optionGroupId: 'plan-old' }));
    const legacyDraft = await saveTrip(plan('sess-a'));
    const someoneElses = await saveTrip(plan('sess-b', 'DRAFT', { optionGroupId: 'plan-theirs' }));
    const fresh = await saveTrip(plan('sess-a', 'DRAFT', { optionGroupId: 'plan-new' }));

    expect(await discardUnchosenOptions('sess-a', 'plan-new')).toBe(2);
    expect(await getTripFor('sess-a', oldOption.id)).toBeUndefined();
    expect(await getTripFor('sess-a', legacyDraft.id)).toBeUndefined();
    expect(await getTripFor('sess-a', kept.id)).toBeDefined();
    expect(await getTripFor('sess-a', fresh.id)).toBeDefined();
    expect(await getTripFor('sess-b', someoneElses.id)).toBeDefined();
  });

  it('become a kept journey when one is chosen, and the others go', async () => {
    const group = { optionGroupId: 'plan-1' };
    const a = await saveTrip(plan('sess-a', 'DRAFT', { ...group, optionLabel: 'Best match' }));
    const b = await saveTrip(plan('sess-a', 'DRAFT', { ...group, optionLabel: 'Another route' }));
    const c = await saveTrip(plan('sess-a', 'DRAFT', { ...group, optionLabel: 'Slower pace' }));

    const { outcome, trip } = await chooseOption('sess-a', b.id);
    expect(outcome).toBe('CHOSEN');
    expect(trip?.status).toBe('SAVED');
    expect((await listTrips('sess-a')).map((row) => row.id)).toEqual([b.id]);
    expect(await getTripFor('sess-a', a.id)).toBeUndefined();
    expect(await getTripFor('sess-a', c.id)).toBeUndefined();
    expect((await chooseOption('sess-a', b.id)).outcome).toBe('ALREADY_CHOSEN');
  });

  it(`stop at ${MAX_SAVED_TRIPS} kept journeys, and ask the visitor to choose one to delete`, async () => {
    for (let index = 0; index < MAX_SAVED_TRIPS; index += 1) await saveTrip(plan('sess-a', 'SAVED'));
    const extra = await saveTrip(plan('sess-a'));
    expect((await chooseOption('sess-a', extra.id)).outcome).toBe('LIMIT_REACHED');

    const oldest = (await listTrips('sess-a')).filter((row) => row.status === 'SAVED').at(-1)!;
    await deleteTrip('sess-a', oldest.id);
    expect((await chooseOption('sess-a', extra.id)).outcome).toBe('CHOSEN');
  });
});

describe('deleting', () => {
  it('removes every journey of one visitor and nobody else', async () => {
    await saveTrip(plan('sess-a', 'SAVED'));
    await saveTrip(plan('sess-a'));
    const theirs = await saveTrip(plan('sess-b', 'ACTIVE'));
    expect(await deleteTripsForSession('sess-a')).toBe(2);
    expect(await listTrips('sess-a')).toEqual([]);
    expect((await getCurrentTrip('sess-b'))?.id).toBe(theirs.id);
  });
});

describe('dates on screen', () => {
  it('reads plainly, and says nothing when no dates were given', () => {
    expect(formatPlanFor({ startDate: '2026-09-17', endDate: '2026-09-19', arriveTime: '10:30', departTime: '17:00' })).toBe(
      '17 Sep 10:30 → 19 Sep 2026 17:00',
    );
    expect(formatPlanFor({ startDate: '2026-09-17', endDate: '2026-09-17' })).toBe('17 Sep 2026');
    expect(formatPlanFor({})).toBeUndefined();
  });
});
