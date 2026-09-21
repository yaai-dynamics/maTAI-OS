import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashToken, newSessionToken } from '@/server/auth/tokens';
import {
  confirmCheckout,
  createBookingRequest,
  respondToBooking,
  startPayment,
} from '@/server/bookings/ledger';
import { prisma } from '@/server/data/client';
import { getState } from '@/server/data/store';
import { setGatewayForTests } from '@/server/payments/gateway';
import { ingestBatch, resetIntakeForTests } from '@/server/telemetry/ingest';
import { analyticsAllowedFor } from '@/server/telemetry/visitor';
import { FakeGateway } from '../support/fake-gateway';

/**
 * The intake against MySQL.
 *
 * The store is switched to write-through for this file, so signals reach the
 * database as they do in the running app. Everything written uses the
 * sess-int-telemetry prefix or evt-int- event ids and is removed afterwards,
 * and today's intake counters are put back as they were.
 */

const configured = Boolean(process.env.DATABASE_URL);
const PREFIX = 'sess-int-telemetry';
const AT = new Date('2026-09-16T10:00:00.000Z');

describe.skipIf(!configured)('telemetry intake against MySQL', () => {
  let counters: { day: Date; outcome: string; count: number }[] = [];
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

  const cleanup = async () => {
    await prisma.booking.deleteMany({ where: { anonymousSessionId: { startsWith: PREFIX } } });
    await prisma.tourismInteraction.deleteMany({
      where: { OR: [{ anonymousSessionId: { startsWith: PREFIX } }, { clientEventId: { startsWith: 'evt-int-' } }] },
    });
    await prisma.touristSession.deleteMany({ where: { anonymousId: { startsWith: PREFIX } } });
  };

  beforeAll(async () => {
    await cleanup();
    counters = await prisma.telemetryCounter.findMany({ where: { day: today } });
    getState().persistent = true;
  });

  afterAll(async () => {
    getState().persistent = false;
    setGatewayForTests(undefined);
    await cleanup();
    await prisma.telemetryCounter.deleteMany({ where: { day: today } });
    if (counters.length > 0) await prisma.telemetryCounter.createMany({ data: counters });
    await prisma.$disconnect();
  });

  it('records a retried beacon once, even when it lands in another process', async () => {
    const visitor = { sessionId: `${PREFIX}-retry`, analyticsAllowed: true };
    const event = { type: 'DESTINATION_VIEW' as const, destinationId: 'dest-loktak', clientEventId: 'evt-int-retry-0001' };

    const [first] = await ingestBatch(visitor, [event]);
    // A second process has none of this one's memory: only the database's
    // unique key stands between the retry and a second row.
    resetIntakeForTests();
    const [retry] = await ingestBatch(visitor, [event]);

    expect([first!.outcome, retry!.outcome]).toEqual(['ACCEPTED', 'DUPLICATE']);
    expect(await prisma.tourismInteraction.count({ where: { clientEventId: 'evt-int-retry-0001' } })).toBe(1);
    expect(getState().interactions.filter((row) => row.clientEventId === 'evt-int-retry-0001')).toHaveLength(1);
  });

  it('counts outcomes per day', async () => {
    const before = await prisma.telemetryCounter.findUnique({
      where: { day_outcome: { day: today, outcome: 'UNKNOWN_REFERENCE' } },
    });
    await ingestBatch({ sessionId: `${PREFIX}-counter`, analyticsAllowed: true }, [
      { type: 'DESTINATION_VIEW', destinationId: 'dest-nowhere' },
      { type: 'DESTINATION_VIEW', destinationId: 'dest-nowhere-else' },
    ]);
    const after = await prisma.telemetryCounter.findUnique({
      where: { day_outcome: { day: today, outcome: 'UNKNOWN_REFERENCE' } },
    });
    expect((after?.count ?? 0) - (before?.count ?? 0)).toBe(2);
  });

  it('reads a visitor’s stored choice, treating an unknown session as not having chosen', async () => {
    await prisma.touristSession.create({
      data: { id: `${PREFIX}-no`, anonymousId: `${PREFIX}-no`, consentAnalytics: false, analyticsChoiceAt: AT },
    });
    expect(await analyticsAllowedFor(`${PREFIX}-no`)).toBe(false);
    expect(await analyticsAllowedFor(`${PREFIX}-never-seen`)).toBe(true);
  });

  it('keeps an opted-out traveller’s paid booking out of the analytics, but in the ledger', async () => {
    const gateway = new FakeGateway();
    setGatewayForTests(gateway);
    const sessionId = `${PREFIX}-no`;
    const ownerHash = hashToken(newSessionToken());

    const made = await createBookingRequest(
      {
        experienceId: 'exp-012',
        businessId: 'biz-013',
        destinationId: 'dest-ukhrul',
        anonymousSessionId: sessionId,
        ownerHash,
        guestName: 'Integration Test',
        guestPhone: '+919800000000',
        partySize: 1,
        date: '2026-09-26',
        unitPricePaise: 140_000,
      },
      AT,
    );
    if (!made.ok) throw new Error(made.error);
    await respondToBooking('biz-013', made.value.booking.id, 'ACCEPT', undefined, AT);
    const checkout = await startPayment(made.value.booking.reference, { ownerHash }, AT, gateway);
    if (!checkout.ok) throw new Error(checkout.error);

    const paid = await confirmCheckout(
      made.value.booking.reference,
      { ownerHash },
      gateway.pay(checkout.value.orderId),
      AT,
      gateway,
    );
    expect(paid).toEqual({ ok: true, value: 'CONFIRMED' });
    expect(await prisma.booking.count({ where: { id: made.value.booking.id, status: 'CONFIRMED' } })).toBe(1);
    expect(
      await prisma.tourismInteraction.count({ where: { anonymousSessionId: sessionId, type: 'BOOKING_CONFIRMED' } }),
    ).toBe(0);
  });
});
