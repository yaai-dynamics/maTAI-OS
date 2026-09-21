import { NextResponse } from 'next/server';

import { prisma } from '@/server/data/client';
import { applyRefundStatus, settlePayment } from '@/server/bookings/ledger';
import { getGateway, type GatewayPayment } from '@/server/payments/gateway';

/**
 * Razorpay webhook.
 *
 * Configure it in the Razorpay dashboard with this URL, the events below and
 * RAZORPAY_WEBHOOK_SECRET. It is not required: the booking page reconciles
 * against the order itself, which is how payments settle on a laptop that
 * Razorpay cannot reach. With a public URL the webhook settles them sooner,
 * including for a traveller who closed the tab mid-payment.
 *
 * Handled: payment.authorized, payment.captured, payment.failed, order.paid,
 * refund.processed, refund.failed.
 */

export const dynamic = 'force-dynamic';

type Json = Record<string, unknown>;

const entityOf = (payload: Json, key: string): Json | undefined =>
  ((payload[key] as Json | undefined)?.entity as Json | undefined) ?? undefined;

const toPayment = (row: Json): GatewayPayment => ({
  id: String(row.id),
  orderId: row.order_id ? String(row.order_id) : null,
  amountPaise: Number(row.amount),
  currency: String(row.currency),
  status: String(row.status),
  method: row.method ? String(row.method) : null,
  errorDescription: row.error_description ? String(row.error_description) : null,
});

export async function POST(request: Request): Promise<Response> {
  const gateway = getGateway();
  if (!gateway) return NextResponse.json({ error: 'payments not configured' }, { status: 503 });

  // The signature covers the exact bytes sent, so read them before parsing.
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  if (!gateway.verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let body: Json;
  try {
    body = JSON.parse(raw) as Json;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const event = String(body.event ?? '');
  const eventId = request.headers.get('x-razorpay-event-id') ?? '';
  if (eventId && (await prisma.paymentWebhookEvent.findUnique({ where: { id: eventId } }))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const payload = (body.payload ?? {}) as Json;
  const payment = entityOf(payload, 'payment');
  const refund = entityOf(payload, 'refund');

  if (event.startsWith('payment.') || event === 'order.paid') {
    // The body is signed, but its status is still re-read from the API
    // before money is applied: a webhook describes, the gateway decides.
    if (payment?.order_id && payment.id) {
      const current = await gateway.fetchPayment(String(payment.id)).catch(() => toPayment(payment));
      await settlePayment(String(payment.order_id), current, gateway);
    }
  } else if (event.startsWith('refund.') && refund?.id) {
    await applyRefundStatus(String(refund.id), String(refund.status));
  }

  if (eventId) {
    // Recorded after handling, so a crash mid-way is retried by Razorpay.
    // Handling is idempotent, so a duplicate that slips past is harmless.
    await prisma.paymentWebhookEvent
      .create({ data: { id: eventId.slice(0, 64), event: event.slice(0, 64) } })
      .catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
