import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BedDouble, ChevronRight, ShieldCheck } from 'lucide-react';

import { now } from '@/lib/config';
import { addDays, toIsoDate } from '@/lib/date';
import { BUSINESS_TYPE_LABEL } from '@/lib/types';
import { getDestination, getStay } from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { CANCELLATION_POLICY, MAX_NIGHTS, MAX_PARTY_SIZE, MAX_ROOMS, PAYMENT_WINDOW_HOURS } from '@/server/bookings/policy';
import { requestStayMobileForm } from '@/server/actions/mobile';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { BackLink } from '@/components/mobile/BackLink';
import { EdgeToEdge } from '@/components/mobile/EdgeToEdge';
import { photoFor } from '@/lib/mobile/photos';
import { MobileField, MobileForm, mobileInput } from '@/components/mobile/form';
import { MobileEmpty, PhotoCredit, Section } from '@/components/mobile/ui';
import { Badge } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const stay = getStay(id);
  return stay ? { title: stay.name } : { title: 'Stay' };
}

export const dynamic = 'force-dynamic';

/** One property on mobile: what it is, what a room costs, and the request form. */
export default async function MobileStayPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const stay = getStay(id);
  if (!stay || stay.status !== 'PARTICIPATING') notFound();

  const destination = stay.destinationId ? getDestination(stay.destinationId) : undefined;
  const online = (await businessesAcceptingBookings()).has(stay.id);
  const at = now();
  const photo = destination ? photoFor(destination.id) : undefined;

  return (
    <div>
      <section className="relative -mx-4">
        {destination ? (
          <PlacePhoto
            src={photo?.hd}
            alt={destination.name}
            eager
            overlay
            className="h-64"
            fallback={<DestinationVisual destination={destination} height="lg" overlay className="h-64!" />}
          />
        ) : (
          <div className="immersive h-56" />
        )}
        <EdgeToEdge />
        <BackLink fallbackHref="/m/stays" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="lake">
              <BedDouble aria-hidden size={11} />
              {BUSINESS_TYPE_LABEL[stay.businessType]}
            </Badge>
            {stay.verified ? (
              <Badge tone="good">
                <ShieldCheck aria-hidden size={11} />
                Verified
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-1.5 text-[24px] font-bold leading-tight text-white">{stay.name}</h1>
          {destination ? <p className="text-[13px] text-white/80">{destination.name}, {stay.district} district</p> : null}
        </div>
      </section>

      {stay.description ? (
        <p className="mt-4 text-[15px] leading-relaxed text-ink-900">{stay.description}</p>
      ) : null}
      {destination ? (
        <div className="mt-2">
          <PhotoCredit photo={photo} />
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <dl className="divide-y divide-line">
          <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
            <dt className="text-[13px] text-ink-500">Rate</dt>
            <dd className="text-[14px] font-semibold text-ink-900">
              {stay.rate ? (
                <>
                  ₹{stay.rate.amount.toLocaleString('en-IN')} <span className="font-normal text-ink-500">/ room / night</span>
                </>
              ) : (
                'On enquiry'
              )}
            </dd>
          </div>
          {stay.reportedCapacity !== undefined ? (
            <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
              <dt className="text-[13px] text-ink-500">Rooms</dt>
              <dd className="text-[14px] font-semibold text-ink-900">{stay.reportedCapacity} reported</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {destination ? (
        <Link
          href={`/m/place/${destination.id}`}
          className="mt-3 flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-card active:scale-[0.99]"
        >
          <PlacePhoto
            src={photo?.sm}
            alt={destination.name}
            className="h-16 w-16 shrink-0 rounded-xl"
            fallback={<DestinationVisual destination={destination} height="sm" className="h-16!" />}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-500">Near</p>
            <p className="truncate text-[14px] font-semibold text-ink-900">{destination.name}</p>
          </div>
          <ChevronRight aria-hidden size={18} className="text-ink-400" />
        </Link>
      ) : null}

      {online && stay.rate ? (
        <Section title="Request these nights">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-4 text-[13px] text-ink-600">
              Nothing is charged now. Once the host accepts, you have up to {PAYMENT_WINDOW_HOURS} hours to pay.
            </p>
            <MobileForm
              action={requestStayMobileForm}
              submitLabel="Send request"
              pendingLabel="Sending…"
              hiddenFields={{ businessId: stay.id }}
              after={<p className="text-center text-[12px] text-ink-500">{CANCELLATION_POLICY}</p>}
            >
              <div className="grid grid-cols-2 gap-3">
                <MobileField label="Arriving" htmlFor="checkIn" required>
                  <input
                    id="checkIn"
                    name="checkIn"
                    type="date"
                    required
                    min={toIsoDate(addDays(at, 1))}
                    defaultValue={toIsoDate(addDays(at, 7))}
                    className={mobileInput}
                  />
                </MobileField>
                <MobileField label="Leaving" htmlFor="checkOut" required>
                  <input
                    id="checkOut"
                    name="checkOut"
                    type="date"
                    required
                    min={toIsoDate(addDays(at, 2))}
                    defaultValue={toIsoDate(addDays(at, 9))}
                    className={mobileInput}
                  />
                </MobileField>
                <MobileField label="Rooms" htmlFor="rooms" required>
                  <input
                    id="rooms"
                    name="rooms"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.min(MAX_ROOMS, stay.reportedCapacity ?? MAX_ROOMS)}
                    defaultValue={1}
                    required
                    className={mobileInput}
                  />
                </MobileField>
                <MobileField label="Guests" htmlFor="partySize" required>
                  <input
                    id="partySize"
                    name="partySize"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_PARTY_SIZE}
                    defaultValue={2}
                    required
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
                <textarea id="note" name="note" rows={3} maxLength={400} placeholder="Arrival time, dietary needs, travelling with children." className={mobileInput} />
              </MobileField>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-ink-800">
                <input type="checkbox" name="consent" value="on" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand-600)]" />
                <span>
                  Share my name and phone number with this host, so they can arrange the stay. Only the host sees
                  them; the Tourism Department sees booking counts, never who booked.
                </span>
              </label>
            </MobileForm>
            <p className="mt-3 text-[12px] text-ink-500">
              Up to {MAX_NIGHTS} nights in one request. The total is the room rate times the nights times the rooms.
            </p>
          </div>
        </Section>
      ) : (
        <div className="mt-6">
          <MobileEmpty
            icon={BedDouble}
            tone="graphite"
            title="Not bookable online yet"
            description={`${stay.name} is on the platform, but its host has not opened an account to answer booking requests yet.`}
            action={
              destination ? (
                <Link href={`/m/place/${destination.id}`} className="text-[13px] font-medium text-brand-700">
                  Other places to stay and do around {destination.name} →
                </Link>
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
