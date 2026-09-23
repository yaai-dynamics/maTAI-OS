import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { getBusiness } from '@/server/data/repository';
import { bookingSubject } from '@/server/bookings/subject';
import { readGuestOwner } from '@/server/bookings/guest';
import { listBookingsForOwner } from '@/server/bookings/ledger';
import { formatRupees } from '@/server/bookings/policy';
import { BOOKING_STATUS } from '@/components/bookings/status';
import { Badge, ButtonLink, Card, CardBody, EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Your bookings', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const ownerHash = await readGuestOwner();
  const bookings = ownerHash ? await listBookingsForOwner(ownerHash) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Your bookings</h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Requests and bookings made from this browser. A booking made elsewhere opens from its private link.
        </p>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings from this browser"
          description="Request a homestay night, a meal or a workshop with a local host. You pay only once the host accepts."
          action={<ButtonLink href="/explore/discover?mode=experiences">Browse local experiences</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const status = BOOKING_STATUS[booking.status];
            return (
              <li key={booking.id}>
                <Card>
                  <CardBody className="pt-4">
                    <Link
                      href={`/explore/bookings/${booking.reference}`}
                      className="flex flex-wrap items-start justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-ink-900 hover:underline">
                          {bookingSubject(booking).title}
                        </span>
                        <span className="block text-[12px] text-ink-600">
                          {getBusiness(booking.businessId)?.name ?? 'Local host'} · {formatLongDate(booking.date)} ·{' '}
                          {bookingSubject(booking).quantity} · {formatRupees(booking.amountPaise)}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] text-ink-500">{booking.reference}</span>
                      </span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Link>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
