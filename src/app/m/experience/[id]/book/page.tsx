import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CalendarCheck } from 'lucide-react';

import { addDays, toIsoDate } from '@/lib/date';
import { now } from '@/lib/config';
import { getBusiness, getDestination, getExperience } from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { CANCELLATION_POLICY, formatRupees, MAX_PARTY_SIZE, PAYMENT_WINDOW_HOURS } from '@/server/bookings/policy';
import { requestBookingMobileForm } from '@/server/actions/mobile';
import { MobileField, MobileForm, mobileInput } from '@/components/mobile/form';
import { MobileEmpty, MobileHeader, PrimaryLink } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Request to book', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Request a booking with a local host. Nothing is charged until they accept. */
export default async function MobileBookPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const experience = getExperience(id);
  if (!experience) notFound();
  const business = getBusiness(experience.businessId);
  const destination = getDestination(experience.destinationId);
  const bookable =
    experience.availabilityStatus !== 'UNAVAILABLE' &&
    business?.status === 'PARTICIPATING' &&
    (await businessesAcceptingBookings()).has(experience.businessId);

  if (!bookable) {
    return (
      <div>
        <MobileHeader title="Request to book" backHref={`/m/experience/${id}`} />
        <MobileEmpty
          icon={CalendarCheck}
          tone="orange"
          title="Not bookable online"
          description="This host does not take bookings online yet. Send them an enquiry instead."
          action={<PrimaryLink href={`/m/experience/${id}#enquire`}>Send an enquiry</PrimaryLink>}
        />
      </div>
    );
  }

  return (
    <div>
      <MobileHeader title="Request to book" subtitle={experience.title} backHref={`/m/experience/${id}`} />

      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="text-[15px] font-semibold text-ink-900">{experience.title}</p>
        <p className="mt-0.5 text-[12px] text-ink-500">
          {business?.name} · {destination?.name}
        </p>
        <p className="mt-3 text-[13px] text-ink-700">
          <span className="num font-semibold text-ink-900">{formatRupees(experience.price * 100)}</span> per person. Nothing
          is charged now: once the host accepts, you have up to {PAYMENT_WINDOW_HOURS} hours to pay.
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <MobileForm
          action={requestBookingMobileForm}
          submitLabel="Send request"
          pendingLabel="Sending…"
          hiddenFields={{ experienceId: experience.id }}
          after={<p className="text-center text-[12px] text-ink-500">{CANCELLATION_POLICY}</p>}
        >
          <div className="grid grid-cols-2 gap-3">
            <MobileField label="People" htmlFor="partySize" required>
              <input id="partySize" name="partySize" type="number" inputMode="numeric" min={1} max={MAX_PARTY_SIZE} defaultValue={2} required className={mobileInput} />
            </MobileField>
            <MobileField label="Day" htmlFor="date" required>
              <input
                id="date"
                name="date"
                type="date"
                required
                min={toIsoDate(addDays(now(), 1))}
                defaultValue={toIsoDate(addDays(now(), 7))}
                className={mobileInput}
              />
            </MobileField>
          </div>
          <MobileField label="Your name" htmlFor="guestName" required>
            <input id="guestName" name="guestName" autoComplete="name" maxLength={120} required className={mobileInput} />
          </MobileField>
          <MobileField label="Phone" htmlFor="guestPhone" required>
            <input id="guestPhone" name="guestPhone" type="tel" autoComplete="tel" inputMode="tel" required className={mobileInput} />
          </MobileField>
          <MobileField label="Email (optional)" htmlFor="guestEmail">
            <input id="guestEmail" name="guestEmail" type="email" autoComplete="email" className={mobileInput} />
          </MobileField>
          <MobileField label="Anything the host should know" htmlFor="note">
            <textarea id="note" name="note" rows={3} maxLength={400} placeholder="Dietary needs, mobility, arrival time." className={mobileInput} />
          </MobileField>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-ink-800">
            <input type="checkbox" name="consent" value="on" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand-600)]" />
            <span>
              Share my name and phone number with this host, so they can arrange the booking. Only the host sees them;
              the Tourism Department sees booking counts, never who booked.
            </span>
          </label>
        </MobileForm>
      </div>
    </div>
  );
}
