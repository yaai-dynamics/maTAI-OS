import Link from 'next/link';
import type { Metadata } from 'next';

import { BASE_URL, now } from '@/lib/config';
import { formatIndiaDateTime, formatLongDate } from '@/lib/date';
import { getBusiness, getDestination, getExperience } from '@/server/data/repository';
import { readGuestOwner } from '@/server/bookings/guest';
import { getBookingForGuest, reconcileBooking, type BookingView } from '@/server/bookings/ledger';
import {
  CANCELLATION_POLICY,
  formatRupees,
  freeCancellationUntil,
  refundFor,
} from '@/server/bookings/policy';
import { gatewayStatus } from '@/server/payments/gateway';
import { cancelMyBookingForm } from '@/server/actions/forms';
import { ActionForm } from '@/components/shared/ActionForm';
import { PayButton } from '@/components/bookings/PayButton';
import { BOOKING_STATUS } from '@/components/bookings/status';
import { Badge, Card, CardBody, CardHeader, DefinitionRow, EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };
export const dynamic = 'force-dynamic';

const WHAT_NEXT: Record<BookingView['status'], string> = {
  REQUESTED: 'The host has been asked. Nothing is charged until they accept and you choose to pay.',
  AWAITING_PAYMENT: 'The host has accepted. Pay before the deadline to confirm your place.',
  CONFIRMED: 'You are booked. The host has your name and phone number and will be in touch.',
  COMPLETED: 'This experience has taken place. Thank you for travelling with a local host.',
  DECLINED: 'The host could not take this booking. Nothing was charged.',
  EXPIRED: 'This request closed without a booking. Nothing was charged.',
  CANCELLED_BY_GUEST: 'You cancelled this booking.',
  CANCELLED_BY_HOST: 'The host cancelled this booking. Anything you paid is refunded in full.',
};

export default async function BookingPage(props: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ key?: string; new?: string }>;
}) {
  const { reference } = await props.params;
  const { key, new: isNew } = await props.searchParams;
  const access = { ownerHash: await readGuestOwner(), accessKey: key ?? null };

  let booking = await getBookingForGuest(reference, access);
  if (!booking) {
    return (
      <EmptyState
        title="Booking not found"
        description="Open the private link you were given when you made the request, from the device you used or any other."
        action={
          <Link href="/explore/bookings" className="text-[13px] font-medium text-brand-700 hover:underline">
            Your bookings on this device
          </Link>
        }
      />
    );
  }

  // Settle anything Razorpay knows that the ledger does not yet: a payment
  // made in a tab that was then closed, or a refund still in flight.
  const pendingRefund = booking.refunds.some((refund) => refund.status !== 'PROCESSED');
  if (booking.hasOpenOrder || pendingRefund) {
    await reconcileBooking(booking.id);
    booking = (await getBookingForGuest(reference, access)) ?? booking;
  }

  const experience = getExperience(booking.experienceId);
  const business = getBusiness(booking.businessId);
  const destination = getDestination(booking.destinationId);
  const status = BOOKING_STATUS[booking.status];
  const payments = gatewayStatus();
  const at = now();

  const cancellable = ['REQUESTED', 'AWAITING_PAYMENT', 'CONFIRMED'].includes(booking.status);
  const preview =
    booking.status === 'CONFIRMED'
      ? refundFor('GUEST', booking.paidPaise - booking.refundedPaise, booking.date, at)
      : null;
  const privateLink = key ? `${BASE_URL}/explore/bookings/${booking.reference}?key=${encodeURIComponent(key)}` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/explore/bookings" className="text-[12px] font-medium text-brand-700 hover:underline">
          ← Your bookings
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">{experience?.title ?? 'Booking'}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
          {payments.configured && payments.gateway.testMode ? (
            <Badge tone="warn" title="Razorpay test mode: no real money moves.">
              Test payments
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] text-ink-600">{WHAT_NEXT[booking.status]}</p>
      </div>

      {isNew && privateLink ? (
        <Card tone="outline">
          <CardHeader
            title="Keep this link"
            subtitle="It opens this booking on any device. There is no account to sign in to, so without it you can only reach the booking from this browser."
          />
          <CardBody>
            <p className="break-all rounded-md bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink-800">
              {privateLink}
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={`Reference ${booking.reference}`} subtitle="Quote this to the host." />
        <CardBody>
          <dl className="divide-y divide-line">
            <DefinitionRow term="Host">{business?.name ?? 'Local host'}</DefinitionRow>
            <DefinitionRow term="Where">{destination?.name ?? booking.destinationId}</DefinitionRow>
            <DefinitionRow term="Day">{formatLongDate(booking.date)}</DefinitionRow>
            <DefinitionRow term="People">{String(booking.partySize)}</DefinitionRow>
            <DefinitionRow term="Price">{`${formatRupees(booking.amountPaise)} (${formatRupees(booking.unitPricePaise)} × ${booking.partySize})`}</DefinitionRow>
            {booking.paidPaise > 0 ? <DefinitionRow term="Paid">{formatRupees(booking.paidPaise)}</DefinitionRow> : null}
            {booking.refundedPaise > 0 ? (
              <DefinitionRow term="Refunded">{formatRupees(booking.refundedPaise)}</DefinitionRow>
            ) : null}
            <DefinitionRow term="Requested">{formatIndiaDateTime(booking.createdAt)}</DefinitionRow>
          </dl>
          {booking.hostMessage ? (
            <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-700">
              <span className="font-medium">From the host:</span> {booking.hostMessage}
            </p>
          ) : null}
          {booking.cancellationReason ? (
            <p className="mt-3 text-[12px] text-ink-600">{booking.cancellationReason}</p>
          ) : null}
        </CardBody>
      </Card>

      {booking.status === 'AWAITING_PAYMENT' && booking.paymentDueAt ? (
        <Card>
          <CardHeader
            title={`Pay ${formatRupees(booking.amountPaise)} to confirm`}
            subtitle={`Pay by ${formatIndiaDateTime(booking.paymentDueAt)}, or the host's acceptance lapses.`}
          />
          <CardBody className="space-y-3">
            {payments.configured ? (
              <>
                <PayButton
                  reference={booking.reference}
                  {...(key ? { accessKey: key } : {})}
                  label={`Pay ${formatRupees(booking.amountPaise)}`}
                  description={`${experience?.title ?? 'Experience'} · ${booking.reference}`}
                />
                <p className="text-[12px] text-ink-600">
                  Paid through Razorpay. Card, UPI and bank details go to Razorpay and never to this platform.
                </p>
                {payments.gateway.testMode ? (
                  <p className="rounded-md border border-warn-500/30 bg-warn-100 px-3 py-2 text-[12px] text-warn-700">
                    Test mode: no real money moves. Pay with UPI ID <code className="font-mono">success@razorpay</code>{' '}
                    or card <code className="font-mono">4111 1111 1111 1111</code>, any future expiry, any CVV.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="rounded-md border border-warn-500/30 bg-warn-100 px-3 py-2 text-[13px] text-warn-700">
                {payments.reason}
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {booking.refunds.length > 0 ? (
        <Card>
          <CardHeader title="Refunds" subtitle="Razorpay returns refunds to the original payment method, usually within 5 to 7 working days." />
          <CardBody>
            <ul className="space-y-2">
              {booking.refunds.map((refund) => (
                <li key={refund.createdAt} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-ink-800">
                    {formatRupees(refund.amountPaise)} · {refund.reason}
                  </span>
                  <Badge tone={refund.status === 'PROCESSED' ? 'good' : refund.status === 'FAILED' ? 'warn' : 'info'}>
                    {refund.status === 'PROCESSED'
                      ? 'Refunded'
                      : refund.status === 'FAILED'
                        ? 'Retrying'
                        : 'In progress'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {cancellable ? (
        <Card tone="outline">
          <CardHeader
            title="Cancel"
            subtitle={
              preview
                ? preview.refundPaise > 0
                  ? `Cancelling now refunds ${formatRupees(preview.refundPaise)} in full. Free cancellation ends ${formatIndiaDateTime(freeCancellationUntil(booking.date))}.`
                  : 'Cancelling now is not refundable: the day is less than 48 hours away.'
                : 'Nothing has been paid, so cancelling costs nothing.'
            }
          />
          <CardBody>
            <ActionForm
              action={cancelMyBookingForm}
              submitLabel={booking.status === 'CONFIRMED' ? 'Cancel booking' : 'Cancel request'}
              pendingLabel="Cancelling…"
              variant="secondary"
              hiddenFields={{ reference: booking.reference, ...(key ? { key } : {}) }}
            />
            <p className="mt-3 text-[12px] text-ink-500">{CANCELLATION_POLICY}</p>
          </CardBody>
        </Card>
      ) : null}

      <p className="text-[12px] text-ink-500">
        Your name and phone number are shared only with {business?.name ?? 'the host'}. The Tourism Department sees
        booking counts per destination, never who booked.
      </p>
    </div>
  );
}
