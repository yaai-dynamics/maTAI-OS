import type { Metadata } from 'next';
import { Ticket } from 'lucide-react';

import { BASE_URL, now } from '@/lib/config';
import { formatIndiaDateTime, formatLongDate } from '@/lib/date';
import { getBusiness, getDestination } from '@/server/data/repository';
import { readGuestOwner } from '@/server/bookings/guest';
import { bookingSubject } from '@/server/bookings/subject';
import { getBookingForGuest, reconcileBooking, type BookingView } from '@/server/bookings/ledger';
import { CANCELLATION_POLICY, formatRupees, freeCancellationUntil, refundFor } from '@/server/bookings/policy';
import { gatewayStatus } from '@/server/payments/gateway';
import { cancelMyBookingForm } from '@/server/actions/forms';
import { PayButton } from '@/components/bookings/PayButton';
import { BOOKING_STATUS } from '@/components/bookings/status';
import { Badge } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/interactive';
import { MobileForm } from '@/components/mobile/form';
import { MobileEmpty, MobileHeader, PrimaryLink, Section } from '@/components/mobile/ui';

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

/** One booking on mobile: status, payment and cancellation. Same ledger as desktop. */
export default async function MobileBookingPage(props: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ key?: string; new?: string }>;
}) {
  const { reference } = await props.params;
  const { key, new: isNew } = await props.searchParams;
  const access = { ownerHash: await readGuestOwner(), accessKey: key ?? null };

  let booking = await getBookingForGuest(reference, access);
  if (!booking) {
    return (
      <div>
        <MobileHeader title="Booking" backHref="/m/bookings" />
        <MobileEmpty
          icon={Ticket}
          tone="blue"
          title="Booking not found"
          description="Open the private link you were given when you made the request."
          action={<PrimaryLink href="/m/bookings">Bookings on this device</PrimaryLink>}
        />
      </div>
    );
  }

  const pendingRefund = booking.refunds.some((refund) => refund.status !== 'PROCESSED');
  if (booking.hasOpenOrder || pendingRefund) {
    await reconcileBooking(booking.id);
    booking = (await getBookingForGuest(reference, access)) ?? booking;
  }

  const subject = bookingSubject(booking);
  const business = getBusiness(booking.businessId);
  const destination = getDestination(booking.destinationId);
  const status = BOOKING_STATUS[booking.status];
  const payments = gatewayStatus();
  const cancellable = ['REQUESTED', 'AWAITING_PAYMENT', 'CONFIRMED'].includes(booking.status);
  const preview =
    booking.status === 'CONFIRMED'
      ? refundFor('GUEST', booking.paidPaise - booking.refundedPaise, booking.date, now())
      : null;
  // The desktop page opens on any device; the link is shared from there.
  const privateLink = key ? `${BASE_URL}/explore/bookings/${booking.reference}?key=${encodeURIComponent(key)}` : null;

  const rows: [string, string][] = [
    ['Host', business?.name ?? 'Local host'],
    ['Where', destination?.name ?? booking.destinationId],
    ['Day', formatLongDate(booking.date)],
    ['People', String(booking.partySize)],
    ['Price', `${formatRupees(booking.amountPaise)} (${formatRupees(booking.unitPricePaise)} × ${booking.partySize})`],
    ...(booking.paidPaise > 0 ? ([['Paid', formatRupees(booking.paidPaise)]] as [string, string][]) : []),
    ...(booking.refundedPaise > 0 ? ([['Refunded', formatRupees(booking.refundedPaise)]] as [string, string][]) : []),
    ['Requested', formatIndiaDateTime(booking.createdAt)],
  ];

  return (
    <div>
      <MobileHeader title={subject.title} subtitle={booking.reference} backHref="/m/bookings" />

      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {payments.configured && payments.gateway.testMode ? <Badge tone="warn">Test payments</Badge> : null}
        </div>
        <p className="mt-2 text-[14px] text-ink-800">{WHAT_NEXT[booking.status]}</p>
      </div>

      {isNew && privateLink ? (
        <div className="mt-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-[14px] font-semibold text-ink-900">Keep this link</p>
          <p className="mt-0.5 text-[12px] text-ink-600">There is no account, so this link is how you reach the booking from another device.</p>
          <p className="mt-2 break-all rounded-xl bg-surface px-3 py-2 font-mono text-[11px] text-ink-800">{privateLink}</p>
          <div className="mt-2">
            <CopyButton value={privateLink} label="Copy link" />
          </div>
        </div>
      ) : null}

      <Section title="Details">
        <dl className="divide-y divide-line rounded-2xl bg-surface px-4 shadow-card">
          {rows.map(([term, value]) => (
            <div key={term} className="flex justify-between gap-4 py-3 text-[14px]">
              <dt className="text-ink-500">{term}</dt>
              <dd className="text-right font-medium text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
        {booking.hostMessage ? (
          <p className="mt-3 rounded-2xl bg-surface-2 p-3.5 text-[13px] text-ink-700">
            <span className="font-semibold">From the host:</span> {booking.hostMessage}
          </p>
        ) : null}
        {booking.cancellationReason ? <p className="mt-3 text-[12px] text-ink-600">{booking.cancellationReason}</p> : null}
      </Section>

      {booking.status === 'AWAITING_PAYMENT' && booking.paymentDueAt ? (
        <Section title={`Pay ${formatRupees(booking.amountPaise)}`}>
          <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-card">
            <p className="text-[13px] text-ink-600">Pay by {formatIndiaDateTime(booking.paymentDueAt)}, or the host&rsquo;s acceptance lapses.</p>
            {payments.configured ? (
              <>
                <PayButton
                  reference={booking.reference}
                  {...(key ? { accessKey: key } : {})}
                  label={`Pay ${formatRupees(booking.amountPaise)}`}
                  description={`${subject.title} · ${booking.reference}`}
                />
                <p className="text-[12px] text-ink-500">Paid through Razorpay. Card, UPI and bank details never reach this platform.</p>
                {payments.gateway.testMode ? (
                  <p className="rounded-xl border border-warn-500/30 bg-warn-100 px-3 py-2 text-[12px] text-warn-700">
                    Test mode: no real money moves. UPI <code className="font-mono">success@razorpay</code> or card{' '}
                    <code className="font-mono">4111 1111 1111 1111</code>.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="rounded-xl border border-warn-500/30 bg-warn-100 px-3 py-2 text-[13px] text-warn-700">{payments.reason}</p>
            )}
          </div>
        </Section>
      ) : null}

      {booking.refunds.length > 0 ? (
        <Section title="Refunds">
          <ul className="space-y-2 rounded-2xl bg-surface p-4 shadow-card">
            {booking.refunds.map((refund) => (
              <li key={refund.createdAt} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-ink-800">
                  {formatRupees(refund.amountPaise)} · {refund.reason}
                </span>
                <Badge tone={refund.status === 'PROCESSED' ? 'good' : refund.status === 'FAILED' ? 'warn' : 'info'}>
                  {refund.status === 'PROCESSED' ? 'Refunded' : refund.status === 'FAILED' ? 'Retrying' : 'In progress'}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {cancellable ? (
        <Section title="Cancel">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-3 text-[13px] text-ink-600">
              {preview
                ? preview.refundPaise > 0
                  ? `Cancelling now refunds ${formatRupees(preview.refundPaise)} in full. Free cancellation ends ${formatIndiaDateTime(freeCancellationUntil(booking.date))}.`
                  : 'Cancelling now is not refundable: the day is less than 48 hours away.'
                : 'Nothing has been paid, so cancelling costs nothing.'}
            </p>
            <MobileForm
              action={cancelMyBookingForm}
              submitLabel={booking.status === 'CONFIRMED' ? 'Cancel booking' : 'Cancel request'}
              pendingLabel="Cancelling…"
              hiddenFields={{ reference: booking.reference, ...(key ? { key } : {}) }}
              refreshOnSuccess
              after={<p className="text-[12px] text-ink-500">{CANCELLATION_POLICY}</p>}
            />
          </div>
        </Section>
      ) : null}

      <p className="mt-5 text-[11px] leading-relaxed text-ink-500">
        Your name and phone number are shared only with {business?.name ?? 'the host'}. The Tourism Department sees booking
        counts per destination, never who booked.
      </p>
    </div>
  );
}
