import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type { BookingStatus, Prisma } from '@prisma/client';

import { now } from '@/lib/config';
import { prisma } from '@/server/data/client';
import { ingest } from '@/server/telemetry/ingest';
import { analyticsAllowedFor } from '@/server/telemetry/visitor';
import { hashToken, newSessionToken } from '@/server/auth/tokens';
import {
  dateProblem,
  indiaDate,
  MAX_PARTY_SIZE,
  paymentDueAt,
  refundFor,
  type CancelledBy,
} from '@/server/bookings/policy';
import { GatewayError, getGateway, type GatewayPayment, type PaymentGateway } from '@/server/payments/gateway';

/**
 * The booking ledger.
 *
 * Reads and writes MySQL directly, never the in-memory cache: two processes,
 * or a browser callback and a webhook, can act on the same booking at the same
 * moment, and only the database can say which of them got there first.
 *
 * Every transition is a conditional update — "move to CONFIRMED where the
 * status is still AWAITING_PAYMENT" — and the caller acts only if its update
 * changed a row. That single rule is what stops a payment being applied twice
 * or a booking being refunded twice.
 */

export type { BookingStatus };

export interface RefundView {
  amountPaise: number;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  reason: string;
  createdAt: string;
}

/** A booking as its guest or its host may see it. Government views never get this. */
export interface BookingView {
  id: string;
  reference: string;
  experienceId: string;
  businessId: string;
  destinationId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  partySize: number;
  date: string;
  note: string | null;
  unitPricePaise: number;
  amountPaise: number;
  currency: string;
  status: BookingStatus;
  hostMessage: string | null;
  paymentDueAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  respondedAt: string | null;
  confirmedAt: string | null;
  closedAt: string | null;
  paidPaise: number;
  refundedPaise: number;
  refunds: RefundView[];
  /** An order exists that has not been paid: checkout can resume it. */
  hasOpenOrder: boolean;
}

export type Outcome<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const fail = (error: string): Outcome<never> => ({ ok: false, error });

/** One message for "missing" and "not yours", so a guess confirms nothing. */
export const BOOKING_NOT_FOUND = 'That booking could not be found.';
export const PAYMENTS_UNAVAILABLE = 'Online payment is not available right now. Please try again later.';

/** Open requests one browser may hold at once. Stops a script filling a host's inbox. */
export const MAX_OPEN_REQUESTS = 5;

const withPayments = {
  payments: { include: { refunds: true } },
} satisfies Prisma.BookingInclude;
type BookingRow = Prisma.BookingGetPayload<{ include: typeof withPayments }>;

const toDbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date): string => date.toISOString().slice(0, 10);
const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

function toView(row: BookingRow): BookingView {
  const captured = row.payments.filter((payment) => payment.status === 'CAPTURED');
  const refunds = row.payments.flatMap((payment) => payment.refunds);
  return {
    id: row.id,
    reference: row.reference,
    experienceId: row.experienceId,
    businessId: row.businessId,
    destinationId: row.destinationId,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    guestEmail: row.guestEmail,
    partySize: row.partySize,
    date: fromDbDate(row.date),
    note: row.note,
    unitPricePaise: row.unitPricePaise,
    amountPaise: row.amountPaise,
    currency: row.currency,
    status: row.status,
    hostMessage: row.hostMessage,
    paymentDueAt: iso(row.paymentDueAt),
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt.toISOString(),
    respondedAt: iso(row.respondedAt),
    confirmedAt: iso(row.confirmedAt),
    closedAt: iso(row.closedAt),
    paidPaise: captured.reduce((sum, payment) => sum + payment.amountPaise, 0),
    refundedPaise: captured.reduce((sum, payment) => sum + payment.refundedPaise, 0),
    refunds: refunds
      .map((refund) => ({
        amountPaise: refund.amountPaise,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    hasOpenOrder: row.payments.some((payment) => payment.status === 'CREATED' || payment.status === 'AUTHORIZED'),
  };
}

/* -------------------------------------------------------------------------- */
/* Expiry                                                                     */
/* -------------------------------------------------------------------------- */

/** Which bookings an expiry pass may touch: only the ones about to be read. */
export type ExpiryScope = { reference: string } | { id: string } | { ownerHash: string } | { businessId: string } | 'ALL';

/**
 * Closes requests nobody answered before the day, and acceptances nobody paid
 * for by the deadline. Run lazily before every read and transition, so there
 * is no scheduler to forget to start.
 *
 * Scoped to the rows being read. A pass over every booking would let one
 * caller's clock close another traveller's booking — and in a test, where the
 * clock is moved forward on purpose, it would close real ones.
 */
export async function expireStale(scope: ExpiryScope, at: Date = now()): Promise<void> {
  const where: Prisma.BookingWhereInput = scope === 'ALL' ? {} : scope;
  await prisma.booking.updateMany({
    where: { ...where, status: 'REQUESTED', date: { lte: toDbDate(indiaDate(at)) } },
    data: { status: 'EXPIRED', closedAt: at, cancellationReason: 'The host did not reply before the day.' },
  });
  await prisma.booking.updateMany({
    where: { ...where, status: 'AWAITING_PAYMENT', paymentDueAt: { lte: at } },
    data: { status: 'EXPIRED', closedAt: at, cancellationReason: 'Payment was not made by the deadline.' },
  });
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newReference(): string {
  const bytes = randomBytes(6);
  let out = 'MT-';
  for (const byte of bytes) out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return out;
}

export interface NewBookingRequest {
  experienceId: string;
  businessId: string;
  destinationId: string;
  campaignId?: string;
  anonymousSessionId: string;
  ownerHash: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  partySize: number;
  date: string;
  note?: string;
  unitPricePaise: number;
}

export async function createBookingRequest(
  input: NewBookingRequest,
  at: Date = now(),
): Promise<Outcome<{ booking: BookingView; accessKey: string }>> {
  const problem = dateProblem(input.date, at);
  if (problem) return fail(problem);
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > MAX_PARTY_SIZE) {
    return fail(`Choose between 1 and ${MAX_PARTY_SIZE} people.`);
  }
  if (!Number.isInteger(input.unitPricePaise) || input.unitPricePaise < 100) {
    return fail('This experience cannot be booked online.');
  }

  await expireStale({ ownerHash: input.ownerHash }, at);

  const open = await prisma.booking.findMany({
    where: { ownerHash: input.ownerHash, status: { in: ['REQUESTED', 'AWAITING_PAYMENT'] } },
    select: { experienceId: true, date: true, reference: true },
  });
  const duplicate = open.find(
    (row) => row.experienceId === input.experienceId && fromDbDate(row.date) === input.date,
  );
  if (duplicate) {
    return fail(`You already have a request open for that day (${duplicate.reference}).`);
  }
  if (open.length >= MAX_OPEN_REQUESTS) {
    return fail(`You have ${open.length} open requests. Wait for a reply, or cancel one, first.`);
  }

  const accessKey = newSessionToken();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const row = await prisma.booking.create({
        data: {
          id: `bkg-${randomUUID()}`,
          reference: newReference(),
          experienceId: input.experienceId,
          businessId: input.businessId,
          destinationId: input.destinationId,
          campaignId: input.campaignId ?? null,
          anonymousSessionId: input.anonymousSessionId,
          ownerHash: input.ownerHash,
          accessKeyHash: hashToken(accessKey),
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          guestEmail: input.guestEmail ?? null,
          partySize: input.partySize,
          date: toDbDate(input.date),
          note: input.note ?? null,
          unitPricePaise: input.unitPricePaise,
          amountPaise: input.unitPricePaise * input.partySize,
          currency: 'INR',
          status: 'REQUESTED',
          createdAt: at,
          provenance: 'PLATFORM_OBSERVED',
        },
        include: withPayments,
      });
      return ok({ booking: toView(row), accessKey });
    } catch (error) {
      // A reference collision (1 in ~900 million) is retried; anything else is real.
      if ((error as { code?: string }).code !== 'P2002') throw error;
    }
  }
  throw new Error('Could not allocate a booking reference.');
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface GuestAccess {
  ownerHash?: string | null;
  accessKey?: string | null;
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

const guestMayOpen = (row: { ownerHash: string; accessKeyHash: string }, access: GuestAccess): boolean =>
  (Boolean(access.ownerHash) && sameHash(row.ownerHash, access.ownerHash!)) ||
  (Boolean(access.accessKey) && sameHash(row.accessKeyHash, hashToken(access.accessKey!)));

async function findForGuest(reference: string, access: GuestAccess): Promise<BookingRow | null> {
  if (!/^MT-[A-Z0-9]{6}$/.test(reference)) return null;
  const row = await prisma.booking.findUnique({ where: { reference }, include: withPayments });
  return row && guestMayOpen(row, access) ? row : null;
}

export async function getBookingForGuest(
  reference: string,
  access: GuestAccess,
  at: Date = now(),
): Promise<BookingView | null> {
  await expireStale({ reference }, at);
  const row = await findForGuest(reference, access);
  return row ? toView(row) : null;
}

export async function listBookingsForOwner(ownerHash: string, at: Date = now()): Promise<BookingView[]> {
  await expireStale({ ownerHash }, at);
  const rows = await prisma.booking.findMany({
    where: { ownerHash },
    include: withPayments,
    orderBy: [{ createdAt: 'desc' }, { reference: 'asc' }],
    take: 50,
  });
  return rows.map(toView);
}

export async function listBookingsForBusiness(businessId: string, at: Date = now()): Promise<BookingView[]> {
  await expireStale({ businessId }, at);
  const rows = await prisma.booking.findMany({
    where: { businessId },
    include: withPayments,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });
  return rows.map(toView);
}

/* -------------------------------------------------------------------------- */
/* Host decisions                                                             */
/* -------------------------------------------------------------------------- */

export async function respondToBooking(
  businessId: string,
  bookingId: string,
  decision: 'ACCEPT' | 'DECLINE',
  message: string | undefined,
  at: Date = now(),
): Promise<Outcome<BookingView>> {
  await expireStale({ id: bookingId }, at);
  const row = await prisma.booking.findFirst({ where: { id: bookingId, businessId } });
  if (!row) return fail(BOOKING_NOT_FOUND);
  if (row.status !== 'REQUESTED') return fail('This request has already been answered or has closed.');

  let data: Prisma.BookingUpdateManyMutationInput;
  if (decision === 'DECLINE') {
    data = { status: 'DECLINED', respondedAt: at, closedAt: at, hostMessage: message ?? null };
  } else {
    const due = paymentDueAt(fromDbDate(row.date), at);
    if (!due) return fail('The day of this request has already begun.');
    data = { status: 'AWAITING_PAYMENT', respondedAt: at, paymentDueAt: due, hostMessage: message ?? null };
  }

  const changed = await prisma.booking.updateMany({
    where: { id: bookingId, businessId, status: 'REQUESTED' },
    data,
  });
  if (changed.count === 0) return fail('This request has already been answered or has closed.');

  const updated = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: withPayments });
  return ok(toView(updated));
}

export async function completeBooking(
  businessId: string,
  bookingId: string,
  at: Date = now(),
): Promise<Outcome<BookingView>> {
  const row = await prisma.booking.findFirst({ where: { id: bookingId, businessId } });
  if (!row) return fail(BOOKING_NOT_FOUND);
  if (row.status !== 'CONFIRMED') return fail('Only a paid booking can be marked as completed.');
  if (fromDbDate(row.date) > indiaDate(at)) return fail('A booking can be completed on or after its day.');

  const changed = await prisma.booking.updateMany({
    where: { id: bookingId, businessId, status: 'CONFIRMED' },
    data: { status: 'COMPLETED', closedAt: at },
  });
  if (changed.count === 0) return fail('This booking has changed. Reload and try again.');
  return ok(toView(await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: withPayments })));
}

/* -------------------------------------------------------------------------- */
/* Payment                                                                    */
/* -------------------------------------------------------------------------- */

export interface CheckoutSession {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  reference: string;
  testMode: boolean;
  prefill: { name: string; contact: string; email?: string };
}

/**
 * Opens (or reopens) payment for an accepted booking.
 *
 * An unpaid order is reused rather than a new one created on every click, so a
 * traveller who closes the checkout and comes back does not leave a trail of
 * orders, and a late payment against the first one still lands.
 */
export async function startPayment(
  reference: string,
  access: GuestAccess,
  at: Date = now(),
  gateway: PaymentGateway | null = getGateway(),
): Promise<Outcome<CheckoutSession>> {
  await expireStale({ reference }, at);
  const row = await findForGuest(reference, access);
  if (!row) return fail(BOOKING_NOT_FOUND);
  if (row.status !== 'AWAITING_PAYMENT' || !row.paymentDueAt || row.paymentDueAt <= at) {
    return fail(row.status === 'CONFIRMED' ? 'This booking is already paid.' : 'This booking is not waiting for payment.');
  }
  if (!gateway) return fail(PAYMENTS_UNAVAILABLE);

  const session = (orderId: string): CheckoutSession => ({
    keyId: gateway.publicKeyId,
    orderId,
    amountPaise: row.amountPaise,
    currency: row.currency,
    reference: row.reference,
    testMode: gateway.testMode,
    prefill: { name: row.guestName, contact: row.guestPhone, ...(row.guestEmail ? { email: row.guestEmail } : {}) },
  });

  const reusable = row.payments.find(
    (payment) =>
      payment.status === 'CREATED' && payment.amountPaise === row.amountPaise && payment.currency === row.currency,
  );
  if (reusable) return ok(session(reusable.providerOrderId));

  let order;
  try {
    order = await gateway.createOrder({
      amountPaise: row.amountPaise,
      currency: row.currency,
      receipt: row.reference,
      notes: { booking: row.reference },
    });
  } catch (error) {
    console.error('[payments] order creation failed', (error as Error).message);
    return fail(PAYMENTS_UNAVAILABLE);
  }
  if (order.amountPaise !== row.amountPaise || order.currency !== row.currency) {
    console.error('[payments] order amount mismatch', order.id);
    return fail(PAYMENTS_UNAVAILABLE);
  }

  await prisma.payment.create({
    data: {
      id: `pay-${randomUUID()}`,
      bookingId: row.id,
      provider: gateway.name,
      providerOrderId: order.id,
      amountPaise: order.amountPaise,
      currency: order.currency,
      status: 'CREATED',
      createdAt: at,
    },
  });
  return ok(session(order.id));
}

export type SettleResult =
  | 'CONFIRMED'
  | 'ALREADY_APPLIED'
  | 'PENDING'
  | 'FAILED'
  | 'REFUNDED_NOT_PAYABLE'
  | 'IGNORED';

/**
 * Applies what the gateway says about a payment. Safe to call any number of
 * times, from the checkout callback, a webhook or a reconciliation, in any
 * order: each step only happens once.
 */
export async function settlePayment(
  orderId: string,
  reported: GatewayPayment,
  gateway: PaymentGateway,
  at: Date = now(),
): Promise<SettleResult> {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment) return 'IGNORED';

  // Never trust the amount or order a caller claims: both must be the
  // gateway's own record, and must match what this booking was charged.
  if (reported.orderId !== orderId || reported.amountPaise !== payment.amountPaise || reported.currency !== payment.currency) {
    console.error('[payments] payment does not match its order', { orderId, payment: reported.id });
    return 'IGNORED';
  }

  let current = reported;
  if (current.status === 'authorized') {
    try {
      current = await gateway.capturePayment(current.id, payment.amountPaise, payment.currency);
    } catch (error) {
      // Another caller may have captured it first; the gateway's record decides.
      current = await gateway.fetchPayment(current.id).catch(() => current);
      if (current.status !== 'captured') {
        console.error('[payments] capture failed', (error as Error).message);
        return 'PENDING';
      }
    }
  }

  if (current.status === 'failed') {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'AUTHORIZED'] } },
      data: { failureReason: current.errorDescription ?? 'The payment did not go through.' },
    });
    return 'FAILED';
  }
  // "refunded" still means the money was captured first.
  if (current.status !== 'captured' && current.status !== 'refunded') return 'PENDING';

  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } },
    data: {
      status: 'CAPTURED',
      providerPaymentId: current.id,
      method: current.method,
      capturedAt: at,
      failureReason: null,
    },
  });
  if (claimed.count === 0) return 'ALREADY_APPLIED';

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: payment.bookingId } });
  const date = fromDbDate(booking.date);

  // A traveller who opened the checkout just before the deadline and paid
  // just after it is still honoured, as long as the day has not begun.
  const confirmed = await prisma.booking.updateMany({
    where: {
      id: booking.id,
      OR: [
        { status: 'AWAITING_PAYMENT' },
        { status: 'EXPIRED', respondedAt: { not: null }, date: { gt: toDbDate(indiaDate(at)) } },
      ],
    },
    data: { status: 'CONFIRMED', confirmedAt: at, closedAt: null, cancellationReason: null },
  });

  if (confirmed.count === 0) {
    // Cancelled, declined or already paid by another order: nothing was bought.
    await issueRefund(payment.id, payment.amountPaise, 'Paid after the booking was no longer payable.', gateway, at);
    return 'REFUNDED_NOT_PAYABLE';
  }

  // Often raised by a webhook, with no browser present: the visitor's stored
  // analytics choice decides whether the sale becomes a signal. The ledger
  // row is kept either way — it is a transaction, not analytics.
  await ingest(
    { sessionId: booking.anonymousSessionId, analyticsAllowed: await analyticsAllowedFor(booking.anonymousSessionId) },
    {
      type: 'BOOKING_CONFIRMED',
      destinationId: booking.destinationId,
      experienceId: booking.experienceId,
      metadata: { partySize: booking.partySize, date },
      attribution: 'none',
      ...(booking.campaignId ? { campaignId: booking.campaignId } : {}),
    },
  );
  return 'CONFIRMED';
}

/**
 * Checks a checkout callback and applies it.
 *
 * The signature proves Razorpay issued this payment id for this order; the
 * gateway's own record of the payment then decides what happened. The browser
 * is never believed about the amount or the status.
 */
export async function confirmCheckout(
  reference: string,
  access: GuestAccess,
  callback: { orderId: string; paymentId: string; signature: string },
  at: Date = now(),
  gateway: PaymentGateway | null = getGateway(),
): Promise<Outcome<SettleResult>> {
  if (!gateway) return fail(PAYMENTS_UNAVAILABLE);
  const row = await findForGuest(reference, access);
  if (!row || !row.payments.some((payment) => payment.providerOrderId === callback.orderId)) {
    return fail(BOOKING_NOT_FOUND);
  }
  if (!gateway.verifyCheckoutSignature(callback.orderId, callback.paymentId, callback.signature)) {
    return fail('The payment could not be verified. If money left your account, it will be refunded.');
  }

  let reported: GatewayPayment;
  try {
    reported = await gateway.fetchPayment(callback.paymentId);
  } catch (error) {
    console.error('[payments] fetch after checkout failed', (error as Error).message);
    // Not lost: the booking page reconciles against the order on its next load.
    return ok('PENDING');
  }
  return ok(await settlePayment(callback.orderId, reported, gateway, at));
}

/* -------------------------------------------------------------------------- */
/* Refunds and cancellation                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Records the intent to refund before asking the gateway, so a failure leaves
 * a FAILED row to retry rather than nothing at all. Retrying is safe: the
 * gateway refuses to refund more than was captured.
 */
async function issueRefund(
  paymentId: string,
  amountPaise: number,
  reason: string,
  gateway: PaymentGateway,
  at: Date,
): Promise<void> {
  if (amountPaise <= 0) return;
  const refund = await prisma.refund.create({
    data: { id: `rfd-${randomUUID()}`, paymentId, amountPaise, status: 'PENDING', reason, createdAt: at },
  });
  await attemptRefund(refund.id, gateway);
}

/** A refund with no provider id this old was interrupted, not in flight. */
const STALE_REFUND_MS = 10 * 60 * 1000;

async function attemptRefund(refundId: string, gateway: PaymentGateway): Promise<void> {
  const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (!refund.payment.providerPaymentId || refund.providerRefundId) return;

  try {
    const issued = await gateway.refundPayment(refund.payment.providerPaymentId, refund.amountPaise, {
      refund: refund.id,
    });
    await prisma.$transaction([
      prisma.refund.update({
        where: { id: refund.id },
        data: { providerRefundId: issued.id, status: issued.status === 'processed' ? 'PROCESSED' : 'PENDING' },
      }),
      prisma.payment.update({
        where: { id: refund.paymentId },
        data: { refundedPaise: { increment: refund.amountPaise } },
      }),
    ]);
  } catch (error) {
    console.error('[payments] refund failed', (error as Error).message);
    await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
  }
}

const OPEN_STATUSES: BookingStatus[] = ['REQUESTED', 'AWAITING_PAYMENT'];

async function cancel(
  row: BookingRow,
  by: CancelledBy,
  reason: string | undefined,
  at: Date,
  gateway: PaymentGateway | null,
): Promise<Outcome<BookingView>> {
  const status: BookingStatus = by === 'GUEST' ? 'CANCELLED_BY_GUEST' : 'CANCELLED_BY_HOST';
  const wasPaid = row.status === 'CONFIRMED';
  if (!wasPaid && !OPEN_STATUSES.includes(row.status)) return fail('This booking can no longer be cancelled.');

  const captured = row.payments.filter((payment) => payment.status === 'CAPTURED');
  const paid = captured.reduce((sum, payment) => sum + payment.amountPaise - payment.refundedPaise, 0);
  const { refundPaise, rule } = refundFor(by, paid, fromDbDate(row.date), at);
  if (refundPaise > 0 && !gateway) return fail(PAYMENTS_UNAVAILABLE);

  const changed = await prisma.booking.updateMany({
    where: { id: row.id, status: row.status },
    data: {
      status,
      closedAt: at,
      cancellationReason: [reason?.trim(), wasPaid ? rule : null].filter(Boolean).join(' ') || null,
    },
  });
  if (changed.count === 0) return fail('This booking has changed. Reload and try again.');

  if (refundPaise > 0 && gateway) {
    let remaining = refundPaise;
    for (const payment of captured) {
      const share = Math.min(remaining, payment.amountPaise - payment.refundedPaise);
      if (share <= 0) continue;
      await issueRefund(payment.id, share, rule, gateway, at);
      remaining -= share;
    }
  }

  if (wasPaid) {
    await ingest(
      { sessionId: row.anonymousSessionId, analyticsAllowed: await analyticsAllowedFor(row.anonymousSessionId) },
      {
        type: 'BOOKING_CANCELLED',
        destinationId: row.destinationId,
        experienceId: row.experienceId,
        metadata: { by, refunded: refundPaise > 0 },
        attribution: 'none',
        ...(row.campaignId ? { campaignId: row.campaignId } : {}),
      },
    );
  }

  return ok(toView(await prisma.booking.findUniqueOrThrow({ where: { id: row.id }, include: withPayments })));
}

export async function cancelByGuest(
  reference: string,
  access: GuestAccess,
  at: Date = now(),
  gateway: PaymentGateway | null = getGateway(),
): Promise<Outcome<BookingView>> {
  await expireStale({ reference }, at);
  const row = await findForGuest(reference, access);
  if (!row) return fail(BOOKING_NOT_FOUND);
  return cancel(row, 'GUEST', undefined, at, gateway);
}

export async function cancelByHost(
  businessId: string,
  bookingId: string,
  reason: string,
  at: Date = now(),
  gateway: PaymentGateway | null = getGateway(),
): Promise<Outcome<BookingView>> {
  await expireStale({ id: bookingId }, at);
  const row = await prisma.booking.findFirst({ where: { id: bookingId, businessId }, include: withPayments });
  if (!row) return fail(BOOKING_NOT_FOUND);
  if (row.status === 'REQUESTED') return fail('Decline the request instead.');
  return cancel(row, 'HOST', reason, at, gateway);
}

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Brings a booking up to date with the gateway: payments made while the tab
 * was closed, refunds that failed to start, refunds still in flight.
 *
 * This is what makes the platform correct on a laptop, where Razorpay's
 * webhooks cannot reach localhost. With a public URL the webhook usually gets
 * there first and this finds nothing to do.
 */
export async function reconcileBooking(
  bookingId: string,
  at: Date = now(),
  gateway: PaymentGateway | null = getGateway(),
): Promise<void> {
  if (!gateway) return;
  const row = await prisma.booking.findUnique({ where: { id: bookingId }, include: withPayments });
  if (!row) return;

  try {
    for (const payment of row.payments) {
      if (payment.status !== 'CREATED' && payment.status !== 'AUTHORIZED') continue;
      const attempts = await gateway.listOrderPayments(payment.providerOrderId);
      // A captured attempt wins over earlier failures on the same order.
      const best =
        attempts.find((attempt) => attempt.status === 'captured' || attempt.status === 'refunded') ??
        attempts.find((attempt) => attempt.status === 'authorized') ??
        attempts.find((attempt) => attempt.status === 'failed');
      if (best) await settlePayment(payment.providerOrderId, best, gateway, at);
    }

    for (const payment of row.payments) {
      for (const refund of payment.refunds) {
        if (refund.status === 'FAILED' || (refund.status === 'PENDING' && !refund.providerRefundId)) {
          // Claim the retry first, so two reconciliations cannot both send it.
          // A PENDING row without a provider id may still be in flight in
          // another request; it is only retried once it is clearly stale.
          const claimed = await prisma.refund.updateMany({
            where: {
              id: refund.id,
              providerRefundId: null,
              OR: [
                { status: 'FAILED', createdAt: refund.createdAt },
                { status: 'PENDING', createdAt: { lte: new Date(at.getTime() - STALE_REFUND_MS) } },
              ],
            },
            data: { status: 'PENDING', createdAt: at },
          });
          if (claimed.count > 0) await attemptRefund(refund.id, gateway);
        } else if (refund.status === 'PENDING' && refund.providerRefundId && payment.providerPaymentId) {
          await syncRefund(payment.providerPaymentId, refund.providerRefundId, gateway);
        }
      }
    }
  } catch (error) {
    // The gateway being down must not break the page; the next load retries.
    if (!(error instanceof GatewayError)) throw error;
    console.error('[payments] reconciliation deferred', error.message);
  }
}

async function syncRefund(providerPaymentId: string, providerRefundId: string, gateway: PaymentGateway) {
  const remote = await gateway.fetchRefund(providerPaymentId, providerRefundId);
  await applyRefundStatus(providerRefundId, remote.status);
}

/** Maps a gateway refund status onto the ledger. A failure gives the money back to the refundable pool. */
export async function applyRefundStatus(providerRefundId: string, remoteStatus: string): Promise<void> {
  const refund = await prisma.refund.findUnique({ where: { providerRefundId } });
  if (!refund) return;
  if (remoteStatus === 'processed') {
    await prisma.refund.updateMany({
      where: { id: refund.id, status: 'PENDING' },
      data: { status: 'PROCESSED' },
    });
  } else if (remoteStatus === 'failed') {
    const changed = await prisma.refund.updateMany({
      where: { id: refund.id, status: { in: ['PENDING', 'PROCESSED'] } },
      data: { status: 'FAILED', providerRefundId: null },
    });
    if (changed.count > 0) {
      await prisma.payment.update({
        where: { id: refund.paymentId },
        data: { refundedPaise: { decrement: refund.amountPaise } },
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregates                                                                 */
/* -------------------------------------------------------------------------- */

export interface DestinationBookingSummary {
  destinationId: string;
  requests: number;
  paid: number;
  completed: number;
  cancelled: number;
  expiredOrDeclined: number;
  capturedPaise: number;
  refundedPaise: number;
}

/**
 * Counts and sums per destination, for the government view. No names, phone
 * numbers, references or individual amounts leave this function.
 */
export async function bookingSummaryByDestination(at: Date = now()): Promise<DestinationBookingSummary[]> {
  await expireStale('ALL', at);
  const rows = await prisma.booking.findMany({
    select: {
      destinationId: true,
      status: true,
      confirmedAt: true,
      payments: { where: { status: 'CAPTURED' }, select: { amountPaise: true, refundedPaise: true } },
    },
  });

  const byDestination = new Map<string, DestinationBookingSummary>();
  for (const row of rows) {
    const entry =
      byDestination.get(row.destinationId) ??
      ({
        destinationId: row.destinationId,
        requests: 0,
        paid: 0,
        completed: 0,
        cancelled: 0,
        expiredOrDeclined: 0,
        capturedPaise: 0,
        refundedPaise: 0,
      } satisfies DestinationBookingSummary);
    entry.requests += 1;
    if (row.confirmedAt) entry.paid += 1;
    if (row.status === 'COMPLETED') entry.completed += 1;
    if (row.status === 'CANCELLED_BY_GUEST' || row.status === 'CANCELLED_BY_HOST') entry.cancelled += 1;
    if (row.status === 'EXPIRED' || row.status === 'DECLINED') entry.expiredOrDeclined += 1;
    for (const payment of row.payments) {
      entry.capturedPaise += payment.amountPaise;
      entry.refundedPaise += payment.refundedPaise;
    }
    byDestination.set(row.destinationId, entry);
  }
  return [...byDestination.values()].sort((a, b) => b.requests - a.requests);
}

/** Businesses that can answer a request on the platform: they have a partner account. */
export async function businessesAcceptingBookings(): Promise<Set<string>> {
  const rows = await prisma.userAccount.findMany({
    where: { kind: 'PARTNER', disabled: false, businessId: { not: null } },
    select: { businessId: true },
  });
  return new Set(rows.map((row) => row.businessId!));
}
