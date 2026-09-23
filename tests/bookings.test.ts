import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkOutProblem,
  dateProblem,
  formatRupees,
  freeCancellationUntil,
  indiaDate,
  nightsBetween,
  paymentDueAt,
  priceFor,
  refundFor,
  stayPriceFor,
} from '@/server/bookings/policy';
import { gatewayStatus, hmacMatches, setGatewayForTests } from '@/server/payments/gateway';

/**
 * Booking rules and payment signatures. No database: the ledger that applies
 * these rules is exercised against MySQL in tests/integration/bookings.test.ts.
 */

// 16 September 2026, 15:30 in India.
const AT = new Date('2026-09-16T10:00:00.000Z');

describe('which days can be requested', () => {
  it('uses the date in India, not UTC', () => {
    // 20:00 UTC on the 16th is already 01:30 on the 17th in Manipur.
    expect(indiaDate(new Date('2026-09-16T20:00:00.000Z'))).toBe('2026-09-17');
    expect(indiaDate(AT)).toBe('2026-09-16');
  });

  it('refuses today and the past, and dates too far ahead', () => {
    expect(dateProblem('2026-09-16', AT)).toMatch(/tomorrow/);
    expect(dateProblem('2026-09-01', AT)).toMatch(/tomorrow/);
    expect(dateProblem('2026-09-17', AT)).toBeNull();
    expect(dateProblem('2027-03-15', AT)).toBeNull();
    expect(dateProblem('2027-03-16', AT)).toMatch(/180 days/);
  });

  it('refuses anything that is not a real date', () => {
    expect(dateProblem('next friday', AT)).toBe('Choose a date.');
    expect(dateProblem('2026-02-30T00:00', AT)).toBe('Choose a date.');
    // Well formed but impossible: JavaScript would silently read these as March and December.
    expect(dateProblem('2027-02-30', AT)).toBe('Choose a date.');
    expect(dateProblem('2026-11-31', AT)).toBe('Choose a date.');
  });
});

describe('a stay, which spans nights rather than falling on one day', () => {
  it('counts nights from arrival to departure, not days touched', () => {
    expect(nightsBetween('2026-09-17', '2026-09-18')).toBe(1);
    expect(nightsBetween('2026-09-17', '2026-09-20')).toBe(3);
    // Across a month end, and across the end of October, when India has no
    // daylight saving but the UTC offset arithmetic could still slip.
    expect(nightsBetween('2026-10-30', '2026-11-02')).toBe(3);
  });

  it('refuses a departure that is not after the arrival', () => {
    expect(checkOutProblem('2026-09-17', '2026-09-17')).toMatch(/at least one night/);
    expect(checkOutProblem('2026-09-17', '2026-09-16')).toMatch(/at least one night/);
    expect(checkOutProblem('2026-09-17', '2026-09-18')).toBeNull();
  });

  it('refuses a stay longer than a month, and anything that is not a date', () => {
    expect(checkOutProblem('2026-09-17', '2026-10-17')).toBeNull();
    expect(checkOutProblem('2026-09-17', '2026-10-18')).toMatch(/30 nights/);
    expect(checkOutProblem('2026-09-17', 'next week')).toBe('Choose a day to leave.');
    expect(checkOutProblem('2026-09-17', '2027-02-30')).toBe('Choose a day to leave.');
  });

  it('is priced per room per night, so both multiply', () => {
    expect(stayPriceFor(1500, 3, 2)).toEqual({ unitPricePaise: 150_000, amountPaise: 900_000 });
    expect(stayPriceFor(1500, 1, 1)).toEqual({ unitPricePaise: 150_000, amountPaise: 150_000 });
  });
});

describe('price', () => {
  it('is integer paise per person, times the party', () => {
    expect(priceFor(1400, 3)).toEqual({ unitPricePaise: 140_000, amountPaise: 420_000 });
  });

  it('formats rupees the Indian way, showing paise only when there are some', () => {
    expect(formatRupees(420_000)).toBe('₹4,200');
    expect(formatRupees(12_345_678)).toBe('₹1,23,456.78');
  });
});

describe('payment deadline after the host accepts', () => {
  it('is 24 hours later', () => {
    expect(paymentDueAt('2026-09-25', AT)?.toISOString()).toBe('2026-09-17T10:00:00.000Z');
  });

  it('never runs past the start of the day itself', () => {
    // Accepted at 15:30 IST for tomorrow: due at midnight IST, not 15:30 tomorrow.
    expect(paymentDueAt('2026-09-17', AT)?.toISOString()).toBe('2026-09-16T18:30:00.000Z');
  });

  it('cannot be set once the day has begun', () => {
    expect(paymentDueAt('2026-09-16', AT)).toBeNull();
  });
});

describe('cancellation refunds', () => {
  const paid = 280_000;

  it('refunds a host cancellation in full, whenever it happens', () => {
    const lastMinute = new Date('2026-09-24T17:00:00.000Z');
    expect(refundFor('HOST', paid, '2026-09-25', lastMinute).refundPaise).toBe(paid);
  });

  it('refunds a guest in full up to exactly 48 hours before the day', () => {
    const boundary = freeCancellationUntil('2026-09-25');
    expect(boundary.toISOString()).toBe('2026-09-22T18:30:00.000Z');
    expect(refundFor('GUEST', paid, '2026-09-25', boundary).refundPaise).toBe(paid);
    expect(refundFor('GUEST', paid, '2026-09-25', new Date(boundary.getTime() + 1)).refundPaise).toBe(0);
  });

  it('refunds nothing when nothing was paid', () => {
    expect(refundFor('HOST', 0, '2026-09-25', AT)).toEqual({ refundPaise: 0, rule: 'Nothing was paid.' });
  });
});

describe('signatures', () => {
  const secret = 'test_secret';
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

  it('accepts the HMAC Razorpay computes over order|payment', () => {
    expect(hmacMatches(secret, 'order_1|pay_1', sign('order_1|pay_1'))).toBe(true);
  });

  it('refuses a signature for a different payment on the same order', () => {
    expect(hmacMatches(secret, 'order_1|pay_2', sign('order_1|pay_1'))).toBe(false);
  });

  it('refuses malformed signatures without throwing', () => {
    for (const bad of ['', 'zz', sign('x').slice(0, 63), `${sign('x')}00`, undefined as unknown as string]) {
      expect(hmacMatches(secret, 'x', bad)).toBe(false);
    }
  });
});

describe('gateway configuration', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    setGatewayForTests(undefined);
  });

  it('is off without keys, and says so', () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const status = gatewayStatus();
    expect(status.configured).toBe(false);
    if (!status.configured) expect(status.reason).toMatch(/RAZORPAY_KEY_ID/);
  });

  it('runs on a test key and reports test mode', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    const status = gatewayStatus();
    expect(status.configured && status.gateway.testMode).toBe(true);
  });

  it('refuses a live key unless live payments are explicitly enabled', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_abc';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    delete process.env.PAYMENTS_ALLOW_LIVE;
    expect(gatewayStatus().configured).toBe(false);

    process.env.PAYMENTS_ALLOW_LIVE = 'true';
    const status = gatewayStatus();
    expect(status.configured && status.gateway.testMode).toBe(false);
  });

  it('never exposes the secret on the gateway object', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    process.env.RAZORPAY_KEY_SECRET = 'very-secret-value';
    const status = gatewayStatus();
    if (!status.configured) throw new Error('expected a gateway');
    expect(JSON.stringify(status.gateway)).not.toContain('very-secret-value');
    expect(Object.values(status.gateway)).not.toContain('very-secret-value');
  });

  it('does not verify webhooks without a webhook secret', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const status = gatewayStatus();
    if (!status.configured) throw new Error('expected a gateway');
    const body = '{"event":"payment.captured"}';
    expect(status.gateway.verifyWebhookSignature(body, createHmac('sha256', '').update(body).digest('hex'))).toBe(false);
  });
});
