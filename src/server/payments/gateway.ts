import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The payment gateway: Razorpay, over its REST API.
 *
 * Server side only. The key secret never leaves this module, and the only
 * value the browser receives is the key id, which Razorpay publishes to the
 * checkout by design.
 *
 * The rest of the application sees the PaymentGateway interface, not
 * Razorpay's shapes, so the booking ledger can be tested against a fake and
 * the provider could be replaced without touching the ledger.
 */

export interface GatewayOrder {
  id: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amountPaise: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string | null;
  errorDescription: string | null;
}

export interface GatewayRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  /** pending | processed | failed */
  status: string;
}

export interface PaymentGateway {
  readonly name: 'RAZORPAY';
  /** Published to the browser for the checkout. Never the secret. */
  readonly publicKeyId: string;
  /** True for rzp_test_ keys: no real money moves. */
  readonly testMode: boolean;
  createOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  listOrderPayments(orderId: string): Promise<GatewayPayment[]>;
  capturePayment(paymentId: string, amountPaise: number, currency: string): Promise<GatewayPayment>;
  refundPayment(
    paymentId: string,
    amountPaise: number,
    notes: Record<string, string>,
  ): Promise<GatewayRefund>;
  fetchRefund(paymentId: string, refundId: string): Promise<GatewayRefund>;
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

/** A provider error. `message` is safe to log; show users a generic line. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

const API = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 15_000;

/** HMAC-SHA256 hex, compared in constant time. */
export function hmacMatches(secret: string, payload: string, signature: string): boolean {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Json = Record<string, unknown>;

const toPayment = (row: Json): GatewayPayment => ({
  id: String(row.id),
  orderId: row.order_id ? String(row.order_id) : null,
  amountPaise: Number(row.amount),
  currency: String(row.currency),
  status: String(row.status),
  method: row.method ? String(row.method) : null,
  errorDescription: row.error_description ? String(row.error_description) : null,
});

const toRefund = (row: Json): GatewayRefund => ({
  id: String(row.id),
  paymentId: String(row.payment_id),
  amountPaise: Number(row.amount),
  status: String(row.status),
});

class RazorpayGateway implements PaymentGateway {
  readonly name = 'RAZORPAY' as const;
  readonly testMode: boolean;
  readonly #authorization: string;
  readonly #keySecret: string;
  readonly #webhookSecret: string | undefined;

  constructor(
    readonly publicKeyId: string,
    keySecret: string,
    webhookSecret: string | undefined,
  ) {
    this.testMode = publicKeyId.startsWith('rzp_test_');
    this.#keySecret = keySecret;
    this.#webhookSecret = webhookSecret;
    this.#authorization = `Basic ${Buffer.from(`${publicKeyId}:${keySecret}`).toString('base64')}`;
  }

  async #call(method: 'GET' | 'POST', path: string, body?: Json): Promise<Json> {
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        method,
        headers: {
          authorization: this.#authorization,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (error) {
      throw new GatewayError(`Razorpay unreachable: ${(error as Error).message}`, 0);
    }

    const json = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok) {
      const detail = (json.error ?? {}) as Json;
      throw new GatewayError(
        `Razorpay ${method} ${path} failed: ${String(detail.description ?? response.statusText)}`,
        response.status,
        detail.code ? String(detail.code) : undefined,
      );
    }
    return json;
  }

  async createOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrder> {
    const row = await this.#call('POST', '/orders', {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return {
      id: String(row.id),
      amountPaise: Number(row.amount),
      currency: String(row.currency),
      status: String(row.status),
    };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    return toPayment(await this.#call('GET', `/payments/${encodeURIComponent(paymentId)}`));
  }

  async listOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    const row = await this.#call('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
    return ((row.items as Json[] | undefined) ?? []).map(toPayment);
  }

  async capturePayment(paymentId: string, amountPaise: number, currency: string): Promise<GatewayPayment> {
    return toPayment(
      await this.#call('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, {
        amount: amountPaise,
        currency,
      }),
    );
  }

  async refundPayment(
    paymentId: string,
    amountPaise: number,
    notes: Record<string, string>,
  ): Promise<GatewayRefund> {
    return toRefund(
      await this.#call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountPaise,
        speed: 'normal',
        notes,
      }),
    );
  }

  async fetchRefund(paymentId: string, refundId: string): Promise<GatewayRefund> {
    return toRefund(
      await this.#call(
        'GET',
        `/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`,
      ),
    );
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    return hmacMatches(this.#keySecret, `${orderId}|${paymentId}`, signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    // Without a webhook secret nothing can be verified, so nothing is trusted.
    if (!this.#webhookSecret) return false;
    return hmacMatches(this.#webhookSecret, rawBody, signature);
  }
}

export type GatewayStatus =
  | { configured: true; gateway: PaymentGateway }
  | { configured: false; reason: string };

let override: PaymentGateway | null | undefined;

/** Tests install a fake here; `undefined` restores the real configuration. */
export function setGatewayForTests(gateway: PaymentGateway | null | undefined): void {
  override = gateway;
}

/**
 * Resolves the gateway from the environment.
 *
 * Live keys are refused unless PAYMENTS_ALLOW_LIVE=true. The platform was
 * built and tested against Razorpay test mode only, and a live key pasted
 * into .env by mistake must not start taking real money.
 */
export function gatewayStatus(): GatewayStatus {
  if (override !== undefined) {
    return override
      ? { configured: true, gateway: override }
      : { configured: false, reason: 'Payments are switched off for this test.' };
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    return {
      configured: false,
      reason: 'Online payment is not set up on this server. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    };
  }
  if (!keyId.startsWith('rzp_test_') && process.env.PAYMENTS_ALLOW_LIVE !== 'true') {
    return {
      configured: false,
      reason: 'A live Razorpay key is configured but live payments are not enabled. Use a rzp_test_ key.',
    };
  }
  return {
    configured: true,
    gateway: new RazorpayGateway(keyId, keySecret, process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined),
  };
}

export function getGateway(): PaymentGateway | null {
  const status = gatewayStatus();
  return status.configured ? status.gateway : null;
}
