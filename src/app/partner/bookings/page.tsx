import type { Metadata } from 'next';

import { now } from '@/lib/config';
import { formatIndiaDateTime, formatLongDate } from '@/lib/date';
import { getBusiness, getExperience } from '@/server/data/repository';
import { requirePartner } from '@/server/auth/session';
import { listBookingsForBusiness, type BookingView } from '@/server/bookings/ledger';
import { formatRupees, indiaDate } from '@/server/bookings/policy';
import { gatewayStatus } from '@/server/payments/gateway';
import { answerBookingForm, cancelBookingAsHostForm, completeBookingForm } from '@/server/actions/forms';
import { ActionForm, Field, TextInput } from '@/components/shared/ActionForm';
import { BOOKING_STATUS, HOST_BOOKING_STATUS } from '@/components/bookings/status';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

export default async function PartnerBookingsPage() {
  const { businessId } = await requirePartner();
  const business = getBusiness(businessId);
  if (!business) return <EmptyState title="Business not found" description="Register a business first." />;

  const bookings = await listBookingsForBusiness(businessId);
  const today = indiaDate(now());
  const requests = bookings.filter((booking) => booking.status === 'REQUESTED');
  const awaiting = bookings.filter((booking) => booking.status === 'AWAITING_PAYMENT');
  const upcoming = bookings.filter((booking) => booking.status === 'CONFIRMED');
  const closed = bookings
    .filter((booking) => !['REQUESTED', 'AWAITING_PAYMENT', 'CONFIRMED'].includes(booking.status))
    .sort((a, b) => (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt));
  const received = bookings.reduce((sum, booking) => sum + booking.paidPaise - booking.refundedPaise, 0);
  const payments = gatewayStatus();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Bookings</h1>
          {payments.configured && payments.gateway.testMode ? <Badge tone="warn">Test payments</Badge> : null}
        </div>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Travellers ask for a day and a party size. You accept or decline; an accepted request becomes a booking once
          the traveller pays. You are never committed to a booking you did not accept.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          ['Need your answer', String(requests.length)],
          ['Waiting for payment', String(awaiting.length)],
          ['Confirmed, upcoming', String(upcoming.length)],
          ['Paid, after refunds', formatRupees(received)],
        ].map(([term, value]) => (
          <div key={term} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <dt className="text-[12px] text-ink-600">{term}</dt>
            <dd className="num mt-1 text-[20px] font-semibold text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader
          title="Requests"
          subtitle="Unanswered requests close at the start of the requested day."
          eyebrow={`${requests.length} open`}
        />
        <CardBody>
          {requests.length === 0 ? (
            <EmptyState icon="✓" title="Nothing waiting" description="New requests appear here as travellers send them." />
          ) : (
            <ul className="space-y-3">
              {requests.map((booking) => (
                <li key={booking.id}>
                  <BookingRow booking={booking}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ActionForm
                        action={answerBookingForm}
                        submitLabel="Accept"
                        pendingLabel="Accepting…"
                        size="sm"
                        hiddenFields={{ bookingId: booking.id, decision: 'ACCEPT' }}
                      >
                        <Field label="Message to the traveller (optional)" name={`accept-${booking.id}`}>
                          <TextInput
                            id={`accept-${booking.id}`}
                            name="message"
                            maxLength={400}
                            placeholder="Where to meet, what to bring."
                          />
                        </Field>
                      </ActionForm>
                      <ActionForm
                        action={answerBookingForm}
                        submitLabel="Decline"
                        pendingLabel="Declining…"
                        variant="secondary"
                        size="sm"
                        hiddenFields={{ bookingId: booking.id, decision: 'DECLINE' }}
                      >
                        <Field label="Reason (optional)" name={`decline-${booking.id}`}>
                          <TextInput
                            id={`decline-${booking.id}`}
                            name="message"
                            maxLength={400}
                            placeholder="Fully booked that night."
                          />
                        </Field>
                      </ActionForm>
                    </div>
                  </BookingRow>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {awaiting.length > 0 ? (
        <Card>
          <CardHeader
            title="Waiting for payment"
            subtitle="Accepted, but not yet paid. If the deadline passes, the request closes and the day is yours again."
          />
          <CardBody>
            <ul className="space-y-3">
              {awaiting.map((booking) => (
                <li key={booking.id}>
                  <BookingRow booking={booking}>
                    <p className="text-[12px] text-ink-600">
                      Payment due by {booking.paymentDueAt ? formatIndiaDateTime(booking.paymentDueAt) : '—'}.
                    </p>
                    <HostCancel booking={booking} />
                  </BookingRow>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Confirmed" subtitle="Paid in full." eyebrow={`${upcoming.length}`} />
        <CardBody>
          {upcoming.length === 0 ? (
            <EmptyState icon="—" title="No confirmed bookings" />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((booking) => (
                <li key={booking.id}>
                  <BookingRow booking={booking}>
                    <div className="flex flex-wrap items-start gap-3">
                      {booking.date <= today ? (
                        <ActionForm
                          action={completeBookingForm}
                          submitLabel="Mark as completed"
                          pendingLabel="Saving…"
                          size="sm"
                          hiddenFields={{ bookingId: booking.id }}
                        />
                      ) : null}
                    </div>
                    <HostCancel booking={booking} paid />
                  </BookingRow>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Closed" eyebrow={`${closed.length}`} />
        <CardBody>
          {closed.length === 0 ? (
            <EmptyState icon="—" title="Nothing closed yet" />
          ) : (
            <ul className="space-y-2.5">
              {closed.slice(0, 20).map((booking) => (
                <li key={booking.id}>
                  <BookingRow booking={booking} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card tone="outline">
        <CardBody className="pt-4 text-[12px] text-ink-600">
          Payments are collected by the platform through Razorpay. Paying hosts out is not automated yet: the
          department settles with you from the paid figures above. A traveller&rsquo;s name and phone number are shared
          with you only for their booking, with their consent; please do not use them for anything else.
        </CardBody>
      </Card>
    </div>
  );
}

function BookingRow({ booking, children }: { booking: BookingView; children?: React.ReactNode }) {
  const experience = getExperience(booking.experienceId);
  return (
    <div className="rounded-md border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-900">
            {formatLongDate(booking.date)} · {booking.partySize} {booking.partySize === 1 ? 'person' : 'people'} ·{' '}
            {formatRupees(booking.amountPaise)}
          </p>
          <p className="text-[12px] text-ink-600">{experience?.title ?? booking.experienceId}</p>
          <p className="mt-1 text-[12px] text-ink-800">
            {booking.guestName} ·{' '}
            <a href={`tel:${booking.guestPhone}`} className="font-medium text-brand-700 hover:underline">
              {booking.guestPhone}
            </a>
            {booking.guestEmail ? ` · ${booking.guestEmail}` : ''}
          </p>
          <p className="font-mono text-[11px] text-ink-500">{booking.reference}</p>
        </div>
        <Badge tone={BOOKING_STATUS[booking.status].tone}>{HOST_BOOKING_STATUS[booking.status]}</Badge>
      </div>
      {booking.note ? (
        <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-[12px] text-ink-700">{booking.note}</p>
      ) : null}
      {booking.cancellationReason ? <p className="mt-2 text-[12px] text-ink-600">{booking.cancellationReason}</p> : null}
      {children ? <div className="mt-3 space-y-3 border-t border-line pt-3">{children}</div> : null}
    </div>
  );
}

function HostCancel({ booking, paid = false }: { booking: BookingView; paid?: boolean }) {
  return (
    <details className="text-[12px]">
      <summary className="cursor-pointer font-medium text-ink-700">Cancel this booking</summary>
      <div className="mt-2">
        <ActionForm
          action={cancelBookingAsHostForm}
          submitLabel="Cancel booking"
          pendingLabel="Cancelling…"
          variant="danger"
          size="sm"
          hiddenFields={{ bookingId: booking.id }}
        >
          <Field label="Reason, shown to the traveller" name={`cancel-${booking.id}`} required>
            <TextInput id={`cancel-${booking.id}`} name="reason" minLength={5} maxLength={400} required />
          </Field>
          {paid ? (
            <p className="text-ink-600">The traveller is refunded {formatRupees(booking.paidPaise - booking.refundedPaise)} in full.</p>
          ) : null}
        </ActionForm>
      </div>
    </details>
  );
}
