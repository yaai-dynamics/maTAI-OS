import { createHmac, randomBytes } from 'node:crypto';

import {
  GatewayError,
  hmacMatches,
  type GatewayOrder,
  type GatewayPayment,
  type GatewayRefund,
  type PaymentGateway,
} from '@/server/payments/gateway';

/**
 * An in-memory Razorpay.
 *
 * Behaves like the real API where the ledger depends on it: signatures are
 * real HMACs, an order can be paid once, a refund cannot exceed what was
 * captured, and any call can be made to fail on demand.
 */
export class FakeGateway implements PaymentGateway {
  readonly name = 'RAZORPAY' as const;
  readonly publicKeyId = 'rzp_test_fake';
  readonly testMode = true;
  static readonly keySecret = 'fake_key_secret';
  static readonly webhookSecret = 'fake_webhook_secret';

  orders = new Map<string, GatewayOrder>();
  payments = new Map<string, GatewayPayment>();
  refunds = new Map<string, GatewayRefund>();
  /** Captures unless false: models an account with manual capture. */
  autoCapture = true;
  /** Number of upcoming refund calls that will be refused. */
  failRefunds = 0;
  calls: string[] = [];

  #id = (prefix: string) => `${prefix}_${randomBytes(7).toString('hex')}`;

  async createOrder(input: { amountPaise: number; currency: string; receipt: string }): Promise<GatewayOrder> {
    this.calls.push('createOrder');
    const order = { id: this.#id('order'), amountPaise: input.amountPaise, currency: input.currency, status: 'created' };
    this.orders.set(order.id, order);
    return { ...order };
  }

  /**
   * What the Checkout does: takes money against an order and hands the browser
   * a signed response. Returns what the browser would post back.
   */
  pay(orderId: string, outcome: 'success' | 'failure' = 'success') {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`no order ${orderId}`);
    if (order.status === 'paid') throw new GatewayError('Order already paid', 400);

    const payment: GatewayPayment = {
      id: this.#id('pay'),
      orderId,
      amountPaise: order.amountPaise,
      currency: order.currency,
      status: outcome === 'failure' ? 'failed' : this.autoCapture ? 'captured' : 'authorized',
      method: 'upi',
      errorDescription: outcome === 'failure' ? 'Payment declined by the bank' : null,
    };
    this.payments.set(payment.id, payment);
    if (payment.status === 'captured') order.status = 'paid';

    return {
      orderId,
      paymentId: payment.id,
      signature: createHmac('sha256', FakeGateway.keySecret).update(`${orderId}|${payment.id}`).digest('hex'),
      payment: { ...payment },
    };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    this.calls.push('fetchPayment');
    const payment = this.payments.get(paymentId);
    if (!payment) throw new GatewayError('no such payment', 404);
    return { ...payment };
  }

  async listOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    this.calls.push('listOrderPayments');
    return [...this.payments.values()].filter((payment) => payment.orderId === orderId).map((p) => ({ ...p }));
  }

  async capturePayment(paymentId: string, amountPaise: number): Promise<GatewayPayment> {
    this.calls.push('capturePayment');
    const payment = this.payments.get(paymentId);
    if (!payment) throw new GatewayError('no such payment', 404);
    if (payment.status !== 'authorized') throw new GatewayError('This payment has already been captured', 400);
    if (payment.amountPaise !== amountPaise) throw new GatewayError('amount mismatch', 400);
    payment.status = 'captured';
    this.orders.get(payment.orderId!)!.status = 'paid';
    return { ...payment };
  }

  refundedFor(paymentId: string): number {
    return [...this.refunds.values()]
      .filter((refund) => refund.paymentId === paymentId && refund.status !== 'failed')
      .reduce((sum, refund) => sum + refund.amountPaise, 0);
  }

  async refundPayment(paymentId: string, amountPaise: number): Promise<GatewayRefund> {
    this.calls.push('refundPayment');
    if (this.failRefunds > 0) {
      this.failRefunds -= 1;
      throw new GatewayError('Refund could not be initiated', 502);
    }
    const payment = this.payments.get(paymentId);
    if (!payment || (payment.status !== 'captured' && payment.status !== 'refunded')) {
      throw new GatewayError('Only captured payments can be refunded', 400);
    }
    if (this.refundedFor(paymentId) + amountPaise > payment.amountPaise) {
      throw new GatewayError('The total refund amount is greater than the refund payment amount', 400);
    }
    const refund = { id: this.#id('rfnd'), paymentId, amountPaise, status: 'processed' };
    this.refunds.set(refund.id, refund);
    return { ...refund };
  }

  async fetchRefund(_paymentId: string, refundId: string): Promise<GatewayRefund> {
    const refund = this.refunds.get(refundId);
    if (!refund) throw new GatewayError('no such refund', 404);
    return { ...refund };
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    return hmacMatches(FakeGateway.keySecret, `${orderId}|${paymentId}`, signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return hmacMatches(FakeGateway.webhookSecret, rawBody, signature);
  }

  signWebhook(rawBody: string): string {
    return createHmac('sha256', FakeGateway.webhookSecret).update(rawBody).digest('hex');
  }
}
