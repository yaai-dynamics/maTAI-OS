import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, Ticket } from 'lucide-react';

import { formatLongDate } from '@/lib/date';
import { getBusiness } from '@/server/data/repository';
import { readGuestOwner } from '@/server/bookings/guest';
import { bookingSubject } from '@/server/bookings/subject';
import { listBookingsForOwner } from '@/server/bookings/ledger';
import { formatRupees } from '@/server/bookings/policy';
import { BOOKING_STATUS } from '@/components/bookings/status';
import { Badge } from '@/components/ui/primitives';
import { MobileEmpty, MobileHeader, PrimaryLink } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Your bookings', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MobileBookingsPage() {
  const ownerHash = await readGuestOwner();
  const bookings = ownerHash ? await listBookingsForOwner(ownerHash) : [];

  return (
    <div>
      <MobileHeader title="Your bookings" subtitle="Made from this device" />

      {bookings.length === 0 ? (
        <MobileEmpty
          icon={<Ticket aria-hidden size={24} />}
          title="No bookings yet"
          description="Request a homestay night, a meal or a workshop with a local host. You pay only once the host accepts."
          action={<PrimaryLink href="/m/discover?mode=experiences">Browse experiences</PrimaryLink>}
        />
      ) : (
        <ul className="space-y-2.5">
          {bookings.map((booking) => {
            const status = BOOKING_STATUS[booking.status];
            return (
              <li key={booking.id}>
                <Link
                  href={`/m/bookings/${booking.reference}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink-900">
                      {bookingSubject(booking).title}
                    </span>
                    <span className="block truncate text-[12px] text-ink-500">
                      {getBusiness(booking.businessId)?.name ?? 'Local host'}
                    </span>
                    <span className="mt-1 block text-[12px] text-ink-600">
                      {formatLongDate(booking.date)} · {booking.partySize} {booking.partySize === 1 ? 'person' : 'people'} ·{' '}
                      {formatRupees(booking.amountPaise)}
                    </span>
                    <span className="mt-2 flex items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="font-mono text-[11px] text-ink-400">{booking.reference}</span>
                    </span>
                  </span>
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-5 text-[11px] leading-relaxed text-ink-500">
        A booking made on another device opens from its private link. <Link href="/m/privacy" className="underline">Your data</Link>
      </p>
    </div>
  );
}
