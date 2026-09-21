import { beforeEach, describe, expect, it } from 'vitest';

import type { Trip } from '@/lib/types';
import { buildItinerary, extractTripProfile } from '@/server/ai/trip-planner';
import { resetState } from '@/server/data/store';
import {
  deleteTrip,
  deleteTripsForSession,
  discardOtherDrafts,
  getCurrentTrip,
  getTripFor,
  listSavedTrips,
  markTripSaved,
  MAX_SAVED_TRIPS,
  saveTrip,
  switchToTrip,
  TripOwnershipError,
} from '@/server/data/trips';

/**
 * Trip rules, on the in-memory store. The same rules against MySQL, through
 * the real actions, are in tests/integration/trips.test.ts.
 */

const profile = extractTripProfile('3 days of nature and culture, less crowded please');
const plan = (sessionId: string, status: Trip['status'] = 'DRAFT'): Trip => ({
  ...buildItinerary(profile, sessionId).trip,
  status,
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
    const mine = await saveTrip(plan('sess-mine'));
    expect(await getTripFor('sess-mine', mine.id)).toEqual(mine);
    expect(await getTripFor('sess-other', mine.id)).toBeUndefined();
    expect(await getTripFor(null, mine.id)).toBeUndefined();
    expect(await deleteTrip('sess-other', mine.id)).toBe(false);
    expect(await switchToTrip('sess-other', mine.id)).toBeUndefined();
    await expect(saveTrip({ ...mine, touristSessionId: 'sess-other' })).rejects.toBeInstanceOf(TripOwnershipError);
    expect(await getCurrentTrip('sess-mine')).toEqual(mine);
  });
});

describe('the current trip', () => {
  it('is the one most recently planned, changed or switched to', async () => {
    const older = await saveTrip(plan('sess-a', 'SAVED'));
    const newer = await saveTrip(plan('sess-a', 'SAVED'));
    expect((await getCurrentTrip('sess-a'))?.id).toBe(newer.id);

    await switchToTrip('sess-a', older.id);
    expect((await getCurrentTrip('sess-a'))?.id).toBe(older.id);

    await saveTrip({ ...newer, adaptedReason: 'Heavy rain forecast.' });
    expect((await getCurrentTrip('sess-a'))?.id).toBe(newer.id);
  });
});

describe('planning again', () => {
  it('discards other drafts and keeps saved journeys', async () => {
    const kept = await saveTrip(plan('sess-a', 'SAVED'));
    const abandoned = await saveTrip(plan('sess-a'));
    const someoneElses = await saveTrip(plan('sess-b'));
    const fresh = await saveTrip(plan('sess-a'));

    expect(await discardOtherDrafts('sess-a', fresh.id)).toBe(1);
    expect(await getTripFor('sess-a', abandoned.id)).toBeUndefined();
    expect(await getTripFor('sess-a', kept.id)).toBeDefined();
    expect(await getTripFor('sess-a', fresh.id)).toBeDefined();
    expect(await getTripFor('sess-b', someoneElses.id)).toBeDefined();
  });
});

describe('saving a journey', () => {
  it('keeps it, once, and lists saved journeys most recently used first', async () => {
    const first = await saveTrip(plan('sess-a'));
    expect(await markTripSaved('sess-a', first.id)).toBe('SAVED');
    expect(await markTripSaved('sess-a', first.id)).toBe('ALREADY_SAVED');
    expect(await markTripSaved('sess-b', first.id)).toBe('NOT_FOUND');

    const second = await saveTrip(plan('sess-a', 'SAVED'));
    expect((await listSavedTrips('sess-a')).map((summary) => summary.id)).toEqual([second.id, first.id]);
  });

  it(`stops at ${MAX_SAVED_TRIPS}, and asks the visitor to choose one to delete`, async () => {
    for (let index = 0; index < MAX_SAVED_TRIPS; index += 1) await saveTrip(plan('sess-a', 'SAVED'));
    const extra = await saveTrip(plan('sess-a'));
    expect(await markTripSaved('sess-a', extra.id)).toBe('LIMIT_REACHED');

    const [oldest] = (await listSavedTrips('sess-a')).slice(-1);
    await deleteTrip('sess-a', oldest!.id);
    expect(await markTripSaved('sess-a', extra.id)).toBe('SAVED');
  });

  it('deletes every journey of one visitor and nobody else', async () => {
    await saveTrip(plan('sess-a', 'SAVED'));
    await saveTrip(plan('sess-a'));
    const theirs = await saveTrip(plan('sess-b'));
    expect(await deleteTripsForSession('sess-a')).toBe(2);
    expect(await getCurrentTrip('sess-a')).toBeUndefined();
    expect((await getCurrentTrip('sess-b'))?.id).toBe(theirs.id);
  });
});
