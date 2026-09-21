import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashToken, newSessionToken } from '@/server/auth/tokens';
import {
  BOOKING_NOT_FOUND,
  cancelByGuest,
  cancelByHost,
  confirmCheckout,
  createBookingRequest,
  getBookingForGuest,
  listBookingsForBusiness,
  MAX_OPEN_REQUESTS,
  reconcileBooking,
  respondToBooking,
  settlePayment,
  startPayment,
  type GuestAccess,
} from '@/server/bookings/ledger';
import { getInteractions } from '@/server/data/repository';
import { prisma } from '@/server/data/client';
import { setGatewayForTests } from '@/server/payments/gateway';
import { POST as webhook } from '@/app/api/payments/razorpay/route';
import { FakeGateway } from '../support/fake-gateway';

/**
 * The booking ledger against MySQL, with Razorpay replaced by a fake that
 * behaves like it (tests/support/fake-gateway.ts).
 *
 * Every booking made here carries the guest name "Integration Test" and is
 * deleted afterwards. Expiry is scoped to the booking being read, so moving
 * the clock forward here never touches a real booking.
 */

const configured = Boolean(process.env.DATABASE_URL);

const HOST = 'biz-013';
const OTHER_HOST = 'biz-001';
const AT = new Date('2026-09-16T10:00:00.000Z');
const DAY = '2026-09-25';
const HOURS = (n: number) => new Date(AT.getTime() + n * 60 * 60 * 1000);

describe.skipIf(!configured)('booking ledger', () => {
  let gateway: FakeGateway;

  const newOwner = () => hashToken(newSessionToken());

  async function request(ownerHash = newOwner(), overrides: Partial<{ date: string; partySize: number }> = {}) {
    const created = await createBookingRequest(
      {
        experienceId: 'exp-012',
        businessId: HOST,
        destinationId: 'dest-ukhrul',
        anonymousSessionId: 'sess-integration',
        ownerHash,
        guestName: 'Integration Test',
        guestPhone: '+919800000000',
        partySize: overrides.partySize ?? 2,
        date: overrides.date ?? DAY,
        unitPricePaise: 140_000,
      },
      AT,
    );
    if (!created.ok) throw new Error(created.error);
    return { ...created.value, access: { ownerHash } satisfies GuestAccess };
  }

  /** Request, accept and open checkout: the state a traveller is in when they pay. */
  async function readyToPay() {
    const made = await request();
    const accepted = await respondToBooking(HOST, made.booking.id, 'ACCEPT', undefined, AT);
    if (!accepted.ok) throw new Error(accepted.error);
    const checkout = await startPayment(made.booking.reference, made.access, AT, gateway);
    if (!checkout.ok) throw new Error(checkout.error);
    return { ...made, orderId: checkout.value.orderId };
  }

  const cleanup = () => prisma.booking.deleteMany({ where: { guestName: 'Integration Test' } });

  beforeAll(cleanup);
  beforeEach(() => {
    gateway = new FakeGateway();
    setGatewayForTests(gateway);
  });
  afterAll(async () => {
    setGatewayForTests(undefined);
    await cleanup();
    await prisma.paymentWebhookEvent.deleteMany({ where: { id: { startsWith: 'evt_integration_' } } });
    await prisma.$disconnect();
  });

  it('takes a booking from request to paid, and records the sale once', async () => {
    const { booking, access, orderId } = await readyToPay();
    expect(booking.status).toBe('REQUESTED');
    expect(booking.amountPaise).toBe(280_000);

    const paid = gateway.pay(orderId);
    const result = await confirmCheckout(booking.reference, access, paid, HOURS(1), gateway);
    expect(result).toEqual({ ok: true, value: 'CONFIRMED' });

    const after = await getBookingForGuest(booking.reference, access, HOURS(1));
    expect(after?.status).toBe('CONFIRMED');
    expect(after?.paidPaise).toBe(280_000);

    const sales = getInteractions({ types: ['BOOKING_CONFIRMED'] }).filter(
      (row) => row.anonymousSessionId === 'sess-integration' && row.metadata?.date === DAY,
    );
    expect(sales.length).toBeGreaterThanOrEqual(1);
  });

  it('applies the same payment once, however many times it is reported', async () => {
    const { booking, access, orderId } = await readyToPay();
    const paid = gateway.pay(orderId);
    const before = getInteractions({ types: ['BOOKING_CONFIRMED'] }).length;

    // Browser callback, a webhook, and a reconciliation, all for one payment.
    const results = await Promise.all([
      confirmCheckout(booking.reference, access, paid, HOURS(1), gateway),
      settlePayment(orderId, paid.payment, gateway, HOURS(1)),
      reconcileBooking(booking.id, HOURS(1), gateway).then(() => null),
    ]);

    const applied = results.filter(
      (result) => result === 'CONFIRMED' || (typeof result === 'object' && result?.ok && result.value === 'CONFIRMED'),
    );
    expect(applied).toHaveLength(1);
    expect(getInteractions({ types: ['BOOKING_CONFIRMED'] }).length - before).toBe(1);
    expect(await prisma.payment.count({ where: { bookingId: booking.id, status: 'CAPTURED' } })).toBe(1);
  });

  it('refuses a forged checkout signature and confirms nothing', async () => {
    const { booking, access, orderId } = await readyToPay();
    const paid = gateway.pay(orderId);

    const forged = await confirmCheckout(
      booking.reference,
      access,
      { ...paid, signature: '0'.repeat(64) },
      HOURS(1),
      gateway,
    );
    expect(forged.ok).toBe(false);
    expect((await getBookingForGuest(booking.reference, access, HOURS(1)))?.status).toBe('AWAITING_PAYMENT');
  });

  it('ignores a payment whose amount does not match the order', async () => {
    const { orderId, booking, access } = await readyToPay();
    const paid = gateway.pay(orderId);
    const tampered = { ...paid.payment, amountPaise: 100 };

    expect(await settlePayment(orderId, tampered, gateway, HOURS(1))).toBe('IGNORED');
    expect((await getBookingForGuest(booking.reference, access, HOURS(1)))?.status).toBe('AWAITING_PAYMENT');
  });

  it('captures a payment that was only authorised', async () => {
    gateway.autoCapture = false;
    const { booking, access, orderId } = await readyToPay();
    const paid = gateway.pay(orderId);
    expect(paid.payment.status).toBe('authorized');

    expect(await confirmCheckout(booking.reference, access, paid, HOURS(1), gateway)).toEqual({
      ok: true,
      value: 'CONFIRMED',
    });
    expect(gateway.payments.get(paid.paymentId)?.status).toBe('captured');
  });

  it('settles a payment made after the tab was closed, on the next page load', async () => {
    const { booking, access, orderId } = await readyToPay();
    gateway.pay(orderId); // The callback never arrives.

    await reconcileBooking(booking.id, HOURS(2), gateway);
    expect((await getBookingForGuest(booking.reference, access, HOURS(2)))?.status).toBe('CONFIRMED');
  });

  it('keeps a failed attempt payable, and confirms the retry', async () => {
    const { booking, access, orderId } = await readyToPay();
    const failed = gateway.pay(orderId, 'failure');
    expect(await settlePayment(orderId, failed.payment, gateway, HOURS(1))).toBe('FAILED');

    const again = await startPayment(booking.reference, access, HOURS(1), gateway);
    expect(again.ok && again.value.orderId).toBe(orderId);

    const paid = gateway.pay(orderId);
    expect(await confirmCheckout(booking.reference, access, paid, HOURS(1), gateway)).toEqual({
      ok: true,
      value: 'CONFIRMED',
    });
  });

  it('reuses an unpaid order rather than opening a new one on every click', async () => {
    const { booking, access, orderId } = await readyToPay();
    const second = await startPayment(booking.reference, access, AT, gateway);
    expect(second.ok && second.value.orderId).toBe(orderId);
    expect(gateway.calls.filter((call) => call === 'createOrder')).toHaveLength(1);
  });

  it('refunds a payment that arrives after the traveller cancelled', async () => {
    const { booking, access, orderId } = await readyToPay();
    const cancelled = await cancelByGuest(booking.reference, access, HOURS(1), gateway);
    expect(cancelled.ok && cancelled.value.status).toBe('CANCELLED_BY_GUEST');

    const paid = gateway.pay(orderId);
    expect(await settlePayment(orderId, paid.payment, gateway, HOURS(2))).toBe('REFUNDED_NOT_PAYABLE');
    expect(gateway.refundedFor(paid.paymentId)).toBe(280_000);

    const after = await getBookingForGuest(booking.reference, access, HOURS(2));
    expect(after?.status).toBe('CANCELLED_BY_GUEST');
    expect(after?.refundedPaise).toBe(280_000);
  });

  it('honours a payment started before the deadline and finished just after it', async () => {
    const { booking, access, orderId } = await readyToPay();
    // Deadline is AT + 24h. The page load at +25h expires the acceptance...
    expect((await getBookingForGuest(booking.reference, access, HOURS(25)))?.status).toBe('EXPIRED');

    // ...but the checkout opened in time, and the day is still a week away.
    const paid = gateway.pay(orderId);
    expect(await confirmCheckout(booking.reference, access, paid, HOURS(25), gateway)).toEqual({
      ok: true,
      value: 'CONFIRMED',
    });
  });

  it('does not open checkout after the deadline', async () => {
    const made = await request();
    await respondToBooking(HOST, made.booking.id, 'ACCEPT', undefined, AT);
    const late = await startPayment(made.booking.reference, made.access, HOURS(25), gateway);
    expect(late.ok).toBe(false);
  });

  it('closes a request the host never answered once the day begins', async () => {
    const made = await request(newOwner(), { date: '2026-09-18' });
    const onTheDay = new Date('2026-09-17T18:30:00.000Z'); // midnight IST on the 18th
    const after = await getBookingForGuest(made.booking.reference, made.access, onTheDay);
    expect(after?.status).toBe('EXPIRED');
    expect(after?.cancellationReason).toMatch(/did not reply/);
  });

  describe('cancellation', () => {
    async function paidBooking() {
      const ready = await readyToPay();
      await confirmCheckout(ready.booking.reference, ready.access, gateway.pay(ready.orderId), HOURS(1), gateway);
      return ready;
    }

    it('refunds a guest in full well ahead of the day', async () => {
      const { booking, access } = await paidBooking();
      const cancelled = await cancelByGuest(booking.reference, access, HOURS(2), gateway);
      expect(cancelled.ok && cancelled.value.refundedPaise).toBe(280_000);
    });

    it('refunds nothing to a guest inside 48 hours', async () => {
      const { booking, access } = await paidBooking();
      const lateCancel = new Date('2026-09-23T12:00:00.000Z');
      const cancelled = await cancelByGuest(booking.reference, access, lateCancel, gateway);
      expect(cancelled.ok && cancelled.value.status).toBe('CANCELLED_BY_GUEST');
      expect(cancelled.ok && cancelled.value.refundedPaise).toBe(0);
      expect(gateway.calls).not.toContain('refundPayment');
    });

    it('refunds in full when the host cancels, and records the cancellation signal', async () => {
      const { booking } = await paidBooking();
      const before = getInteractions({ types: ['BOOKING_CANCELLED'] }).length;
      const cancelled = await cancelByHost(HOST, booking.id, 'Flooded road to the village', new Date('2026-09-24T12:00:00.000Z'), gateway);
      expect(cancelled.ok && cancelled.value.refundedPaise).toBe(280_000);
      expect(getInteractions({ types: ['BOOKING_CANCELLED'] }).length - before).toBe(1);
    });

    it('cannot cancel twice or refund twice', async () => {
      const { booking, access } = await paidBooking();
      const [first, second] = await Promise.all([
        cancelByGuest(booking.reference, access, HOURS(2), gateway),
        cancelByGuest(booking.reference, access, HOURS(2), gateway),
      ]);
      expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
      expect(gateway.calls.filter((call) => call === 'refundPayment')).toHaveLength(1);
    });

    it('keeps a refund Razorpay refused, and retries it', async () => {
      const { booking, access } = await paidBooking();
      gateway.failRefunds = 1;

      const cancelled = await cancelByGuest(booking.reference, access, HOURS(2), gateway);
      expect(cancelled.ok && cancelled.value.refunds.map((refund) => refund.status)).toEqual(['FAILED']);
      expect(cancelled.ok && cancelled.value.refundedPaise).toBe(0);

      await reconcileBooking(booking.id, HOURS(3), gateway);
      const after = await getBookingForGuest(booking.reference, access, HOURS(3));
      expect(after?.refunds.map((refund) => refund.status)).toEqual(['PROCESSED']);
      expect(after?.refundedPaise).toBe(280_000);

      // A second reconciliation finds nothing left to do.
      await reconcileBooking(booking.id, HOURS(4), gateway);
      expect(gateway.calls.filter((call) => call === 'refundPayment')).toHaveLength(2);
    });
  });

  describe('who can see and act on a booking', () => {
    it('opens for the browser that made it, or the private link — not the reference alone', async () => {
      const { booking, accessKey, access } = await request();

      expect(await getBookingForGuest(booking.reference, access, AT)).not.toBeNull();
      expect(await getBookingForGuest(booking.reference, { accessKey }, AT)).not.toBeNull();
      expect(await getBookingForGuest(booking.reference, {}, AT)).toBeNull();
      expect(await getBookingForGuest(booking.reference, { ownerHash: newOwner() }, AT)).toBeNull();
      expect(await getBookingForGuest(booking.reference, { accessKey: newSessionToken() }, AT)).toBeNull();
    });

    it('lets only its own host answer it, with the same answer as a missing booking', async () => {
      const { booking } = await request();
      expect(await respondToBooking(OTHER_HOST, booking.id, 'ACCEPT', undefined, AT)).toEqual({
        ok: false,
        error: BOOKING_NOT_FOUND,
      });
      expect(await respondToBooking(OTHER_HOST, 'bkg-does-not-exist', 'ACCEPT', undefined, AT)).toEqual({
        ok: false,
        error: BOOKING_NOT_FOUND,
      });
      expect((await listBookingsForBusiness(OTHER_HOST, AT)).some((row) => row.id === booking.id)).toBe(false);
    });

    it('refuses a duplicate request and caps open requests per browser', async () => {
      const owner = newOwner();
      await request(owner, { date: '2026-10-01' });
      await expect(request(owner, { date: '2026-10-01' })).rejects.toThrow(/already have a request/);

      for (let day = 2; day <= MAX_OPEN_REQUESTS; day += 1) {
        await request(owner, { date: `2026-10-0${day}` });
      }
      await expect(request(owner, { date: '2026-10-09' })).rejects.toThrow(/open requests/);
    });
  });

  describe('webhook', () => {
    const post = (body: string, signature: string, eventId: string) =>
      webhook(
        new Request('http://localhost/api/payments/razorpay', {
          method: 'POST',
          body,
          headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
        }),
      );

    it('confirms a booking from a signed payment.captured event, once', async () => {
      const { booking, access, orderId } = await readyToPay();
      const paid = gateway.pay(orderId);
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paid.paymentId,
              order_id: orderId,
              amount: 280_000,
              currency: 'INR',
              status: 'captured',
              method: 'upi',
            },
          },
        },
      });
      const eventId = `evt_integration_${booking.id.slice(-8)}`;

      const first = await post(body, gateway.signWebhook(body), eventId);
      expect(first.status).toBe(200);
      const repeat = await post(body, gateway.signWebhook(body), eventId);
      expect(await repeat.json()).toEqual({ ok: true, duplicate: true });

      expect((await getBookingForGuest(booking.reference, access))?.status).toBe('CONFIRMED');
    });

    it('rejects an unsigned or wrongly signed event', async () => {
      const body = JSON.stringify({ event: 'payment.captured', payload: {} });
      expect((await post(body, '', 'evt_integration_nosig')).status).toBe(401);
      expect((await post(body, gateway.signWebhook(`${body} `), 'evt_integration_badsig')).status).toBe(401);
    });
  });
});
