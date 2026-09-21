import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The telemetry intake, without a database: the seed-built in-memory state
 * stands in for the store, and the visitor cookie layer is replaced so the
 * route handler can be called directly.
 */

const visitorState = vi.hoisted(() => ({ sessionId: 'sess-unit-visitor', analyticsAllowed: true }));

vi.mock('@/server/telemetry/visitor', () => ({
  ensureVisitor: async () => ({ ...visitorState, choice: 'unset', gpc: false }),
  readVisitor: async () => ({ ...visitorState, choice: 'unset', gpc: false }),
  analyticsAllowedFor: async () => true,
  setAnalyticsChoice: async () => ({ ...visitorState, choice: 'no', gpc: false, analyticsAllowed: false }),
}));

import {
  hasCheckedInToday,
  ingest,
  ingestBatch,
  PASSIVE_TYPES,
  resetIntakeForTests,
  type IngestVisitor,
} from '@/server/telemetry/ingest';
import { forgetSessionSignals, resetState } from '@/server/data/store';
import { getInteractions } from '@/server/data/repository';
import { getCurrentTrip, getTripFor, saveTrip } from '@/server/data/trips';
import { POST as intake } from '@/app/api/telemetry/route';

const visitor = (sessionId: string, allowed = true): IngestVisitor => ({ sessionId, analyticsAllowed: allowed });
const ofSession = (sessionId: string) => getInteractions().filter((row) => row.anonymousSessionId === sessionId);

beforeEach(() => {
  resetState();
  resetIntakeForTests();
  visitorState.sessionId = 'sess-unit-visitor';
  visitorState.analyticsAllowed = true;
});

describe('consent', () => {
  it('reads Global Privacy Control as a no until the visitor says yes', async () => {
    const { analyticsAllowed: real } = await vi.importActual<typeof import('@/server/telemetry/visitor')>(
      '@/server/telemetry/visitor',
    );
    expect(real('unset', false)).toBe(true);
    expect(real('unset', true)).toBe(false);
    expect(real('yes', true)).toBe(true);
    expect(real('no', false)).toBe(false);
  });

  it('records nothing passive for a visitor who opted out', async () => {
    const out = visitor('sess-opted-out', false);
    for (const type of ['DESTINATION_VIEW', 'SEARCH', 'ITINERARY_ADD', 'BOOKING'] as const) {
      expect((await ingest(out, { type, destinationId: 'dest-loktak' })).outcome).toBe('NO_CONSENT');
    }
    expect(ofSession('sess-opted-out')).toHaveLength(0);
  });

  it('still records a check-in or feedback the visitor chose to send', async () => {
    const out = visitor('sess-opted-out', false);
    expect((await ingest(out, { type: 'QR_CHECKIN', destinationId: 'dest-loktak' })).outcome).toBe('ACCEPTED');
    expect((await ingest(out, { type: 'FEEDBACK', destinationId: 'dest-loktak' })).outcome).toBe('ACCEPTED');
  });
});

describe('what a browser may report', () => {
  it('accepts views and navigation starts, and nothing the server records itself', async () => {
    const [view, nav, search, sale, checkin] = await ingestBatch(visitor('sess-browser'), [
      { type: 'DESTINATION_VIEW', destinationId: 'dest-loktak' },
      { type: 'NAVIGATION_START', destinationId: 'dest-loktak' },
      { type: 'SEARCH', destinationId: 'dest-loktak' },
      { type: 'BOOKING_CONFIRMED', destinationId: 'dest-loktak' },
      { type: 'QR_CHECKIN', destinationId: 'dest-loktak' },
    ]);
    expect([view!.outcome, nav!.outcome]).toEqual(['ACCEPTED', 'ACCEPTED']);
    expect([search!.outcome, sale!.outcome, checkin!.outcome]).toEqual([
      'NOT_ALLOWED_FROM_CLIENT',
      'NOT_ALLOWED_FROM_CLIENT',
      'NOT_ALLOWED_FROM_CLIENT',
    ]);
  });

  it('refuses a place that does not exist', async () => {
    const [result] = await ingestBatch(visitor('sess-browser'), [{ type: 'DESTINATION_VIEW', destinationId: 'dest-atlantis' }]);
    expect(result!.outcome).toBe('UNKNOWN_REFERENCE');
  });

  it('keeps only the surface label from browser metadata', async () => {
    const [result] = await ingestBatch(visitor('sess-browser'), [
      {
        type: 'DESTINATION_VIEW',
        destinationId: 'dest-loktak',
        metadata: { surface: 'destination-page', email: 'someone@example.com', lat: 24.5 },
      },
    ]);
    expect(result!.interaction?.metadata).toEqual({ surface: 'destination-page' });
  });

  it('credits the campaign running for the destination, unless told not to', async () => {
    // camp-002 runs at Kangla from 8 September to 5 October, around the demo date.
    const auto = await ingest(visitor('sess-attr'), { type: 'ITINERARY_ADD', destinationId: 'dest-kangla' });
    const none = await ingest(visitor('sess-attr'), {
      type: 'SEARCH',
      destinationId: 'dest-kangla',
      attribution: 'none',
    });
    expect(auto.interaction?.campaignId).toBe('camp-002');
    expect(none.interaction?.campaignId).toBeUndefined();
  });
});

describe('repeats and floods', () => {
  it('counts a reload inside half an hour as one view, per visitor and place', async () => {
    const results = await ingestBatch(visitor('sess-reloader'), [
      { type: 'DESTINATION_VIEW', destinationId: 'dest-loktak' },
      { type: 'DESTINATION_VIEW', destinationId: 'dest-loktak' },
      { type: 'DESTINATION_VIEW', destinationId: 'dest-kangla' },
    ]);
    expect(results.map((row) => row.outcome)).toEqual(['ACCEPTED', 'DUPLICATE', 'ACCEPTED']);

    const [other] = await ingestBatch(visitor('sess-someone-else'), [{ type: 'DESTINATION_VIEW', destinationId: 'dest-loktak' }]);
    expect(other!.outcome).toBe('ACCEPTED');
  });

  it('counts a retried beacon once, by its event id, even outside the repeat window', async () => {
    // Different places, so only the event id can catch the repeat. The same id
    // arriving in another process is caught by the database's unique key,
    // which tests/integration/telemetry.test.ts covers.
    const [first, retry] = await ingestBatch(visitor('sess-retry'), [
      { type: 'NAVIGATION_START', destinationId: 'dest-loktak', clientEventId: 'evt-retry-0001' },
      { type: 'NAVIGATION_START', destinationId: 'dest-kangla', clientEventId: 'evt-retry-0001' },
    ]);
    expect([first!.outcome, retry!.outcome]).toEqual(['ACCEPTED', 'DUPLICATE']);
  });

  it('refuses a malformed event id', async () => {
    const [result] = await ingestBatch(visitor('sess-browser'), [
      { type: 'DESTINATION_VIEW', destinationId: 'dest-loktak', clientEventId: "x'; drop table" },
    ]);
    expect(result!.outcome).toBe('INVALID');
  });

  it('throttles one visitor sending a burst, repeats included', async () => {
    const burst = Array.from({ length: 40 }, () => ({ type: 'DESTINATION_VIEW' as const, destinationId: 'dest-loktak' }));
    const outcomes = (await ingestBatch(visitor('sess-flood'), burst)).map((row) => row.outcome);
    expect(outcomes.filter((outcome) => outcome === 'ACCEPTED')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'RATE_LIMITED')).toHaveLength(10);
    expect(ofSession('sess-flood')).toHaveLength(1);
  });

  it('does not throttle server-side signals, which a visitor cannot send at will', async () => {
    for (let index = 0; index < 40; index += 1) {
      const result = await ingest(visitor('sess-planner'), { type: 'ITINERARY_ADD', destinationId: 'dest-loktak' });
      expect(result.outcome).toBe('ACCEPTED');
    }
  });
});

describe('check-ins', () => {
  it('counts one check-in per visitor, place and day — and each visitor separately', async () => {
    expect((await ingest(visitor('sess-a'), { type: 'QR_CHECKIN', destinationId: 'dest-kangla' })).outcome).toBe('ACCEPTED');
    expect((await ingest(visitor('sess-a'), { type: 'QR_CHECKIN', destinationId: 'dest-kangla' })).outcome).toBe('DUPLICATE');
    expect((await ingest(visitor('sess-b'), { type: 'QR_CHECKIN', destinationId: 'dest-kangla' })).outcome).toBe('ACCEPTED');

    expect(hasCheckedInToday('sess-a', 'dest-kangla')).toBe(true);
    expect(hasCheckedInToday('sess-c', 'dest-kangla')).toBe(false);
  });
});

describe('forgetting a visitor', () => {
  it('removes their passive signals and keeps what they sent deliberately', async () => {
    const me = visitor('sess-forget-me');
    await ingest(me, { type: 'SEARCH', destinationId: 'dest-loktak' });
    await ingest(me, { type: 'ITINERARY_ADD', destinationId: 'dest-loktak' });
    await ingest(me, { type: 'QR_CHECKIN', destinationId: 'dest-loktak' });
    await ingest(visitor('sess-keep-me'), { type: 'SEARCH', destinationId: 'dest-loktak' });

    const removed = await forgetSessionSignals('sess-forget-me', PASSIVE_TYPES);
    expect(removed).toBe(2);
    expect(ofSession('sess-forget-me').map((row) => row.type)).toEqual(['QR_CHECKIN']);
    expect(ofSession('sess-keep-me')).toHaveLength(1);
  });
});

describe('trips belong to the visitor who planned them', () => {
  it("never shows one visitor another's trip", async () => {
    const base = {
      title: 'A trip',
      theme: 'nature',
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      preferences: {} as never,
      items: [],
      alternatives: [],
      status: 'SAVED' as const,
      createdAt: '2026-09-16T10:00:00.000Z',
      provenance: 'PLATFORM_OBSERVED' as const,
    };
    await saveTrip({ ...base, id: 'trip-mine', touristSessionId: 'sess-me' });
    await saveTrip({ ...base, id: 'trip-theirs', touristSessionId: 'sess-them' });

    expect((await getCurrentTrip('sess-me'))?.id).toBe('trip-mine');
    expect((await getCurrentTrip('sess-them'))?.id).toBe('trip-theirs');
    expect(await getCurrentTrip('sess-nobody')).toBeUndefined();
    expect(await getCurrentTrip(null)).toBeUndefined();
    // Knowing the id is not enough.
    expect(await getTripFor('sess-me', 'trip-theirs')).toBeUndefined();
    await expect(saveTrip({ ...base, id: 'trip-theirs', touristSessionId: 'sess-me' })).rejects.toThrow(/another visitor/);
  });
});

describe('the intake endpoint', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    intake(
      new Request('http://localhost:3000/api/telemetry', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'sec-fetch-site': 'same-origin', 'user-agent': 'Mozilla/5.0', ...headers },
      }),
    );
  const view = { type: 'DESTINATION_VIEW', destinationId: 'dest-loktak', clientEventId: 'evt-endpoint-01' };

  it('records a same-site beacon and answers 204', async () => {
    const response = await post({ events: [view] });
    expect(response.status).toBe(204);
    expect(ofSession('sess-unit-visitor').map((row) => row.type)).toEqual(['DESTINATION_VIEW']);
  });

  it('refuses a post from another site', async () => {
    expect((await post({ events: [view] }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ events: [view] }, { 'sec-fetch-site': '', origin: 'https://evil.example' })).status).toBe(403);
    expect(ofSession('sess-unit-visitor')).toHaveLength(0);
  });

  it('drops automated clients without telling them', async () => {
    const response = await post({ events: [view] }, { 'user-agent': 'curl/8.4.0' });
    expect(response.status).toBe(204);
    expect(ofSession('sess-unit-visitor')).toHaveLength(0);
  });

  it('refuses malformed and oversized batches', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post({ events: [] })).status).toBe(400);
    expect((await post({ events: Array.from({ length: 26 }, () => view) })).status).toBe(413);
    expect((await post({ events: [{ ...view, destinationId: 'x'.repeat(20_000) }] })).status).toBe(413);
  });

  it('answers the same whether or not anything was kept', async () => {
    visitorState.analyticsAllowed = false;
    const response = await post({ events: [view] });
    expect(response.status).toBe(204);
    expect(ofSession('sess-unit-visitor')).toHaveLength(0);
  });
});
