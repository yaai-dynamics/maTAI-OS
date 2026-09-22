import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, Clock, Footprints, IndianRupee, ShieldCheck, Store } from 'lucide-react';

import { addDays, toIsoDate } from '@/lib/date';
import { now } from '@/lib/config';
import { formatDuration } from '@/lib/geo';
import { formatRupees } from '@/lib/money';
import { BUSINESS_TYPE_LABEL, EXPERIENCE_CATEGORY_LABEL } from '@/lib/types';
import { getBusiness, getDestination, getExperience } from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { sendEnquiryForm } from '@/server/actions/forms';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { BackLink } from '@/components/mobile/BackLink';
import { PlacePhoto } from '@/components/mobile/PlacePhoto';
import { creditLine, photoFor } from '@/lib/mobile/photos';
import { MobileField, MobileForm, mobileInput } from '@/components/mobile/form';
import { AvailabilityPill, Section, StickyActions, StickySpacer } from '@/components/mobile/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  return { title: getExperience(id)?.title ?? 'Experience' };
}

/** E5 on mobile: one local experience, with booking or an enquiry. */
export default async function MobileExperiencePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const experience = getExperience(id);
  if (!experience) notFound();
  const business = getBusiness(experience.businessId);
  const destination = getDestination(experience.destinationId);

  const bookable =
    experience.availabilityStatus !== 'UNAVAILABLE' &&
    business?.status === 'PARTICIPATING' &&
    (await businessesAcceptingBookings()).has(experience.businessId);
  const enquirable = experience.availabilityStatus !== 'UNAVAILABLE';
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
            credit={photo ? { label: creditLine(photo.credit), href: photo.credit.source || undefined } : undefined}
            className="h-72"
            fallback={<DestinationVisual destination={destination} height="lg" overlay className="h-72!" />}
          />
        ) : (
          <div className="immersive h-56" />
        )}
        <BackLink fallbackHref="/m/discover?mode=experiences" tone="floating" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-lily-200">
            {EXPERIENCE_CATEGORY_LABEL[experience.category]}
          </p>
          <h1 className="mt-1 text-[24px] font-bold leading-tight text-white">{experience.title}</h1>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]">
        <AvailabilityPill status={experience.availabilityStatus} />
        {experience.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-good-100 px-2 py-0.5 font-medium text-good-700">
            <ShieldCheck aria-hidden size={12} />
            Verified host
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Stat icon={<IndianRupee aria-hidden size={16} />} label="Per person" value={formatRupees(experience.price)} />
        <Stat icon={<Clock aria-hidden size={16} />} label="Duration" value={formatDuration(experience.durationMinutes)} />
        <Stat icon={<Footprints aria-hidden size={16} />} label="Effort" value={experience.accessibility.charAt(0) + experience.accessibility.slice(1).toLowerCase()} />
      </dl>

      <p className="mt-5 text-[15px] leading-relaxed text-ink-900">{experience.description}</p>

      {business ? (
        <Section title="Your host">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-lily-100 text-lily-600">
                <Store aria-hidden size={20} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink-900">{business.name}</p>
                <p className="text-[12px] text-ink-500">
                  {BUSINESS_TYPE_LABEL[business.businessType]} · {business.district}
                </p>
              </div>
            </div>
            {business.description ? <p className="mt-3 text-[13px] leading-relaxed text-ink-700">{business.description}</p> : null}
          </div>
        </Section>
      ) : null}

      {destination ? (
        <Link
          href={`/m/place/${destination.id}`}
          className="mt-4 flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-card"
        >
          <PlacePhoto
            src={photo?.sm}
            alt={destination.name}
            className="h-16 w-16 shrink-0 rounded-xl"
            fallback={<DestinationVisual destination={destination} height="sm" className="h-16!" />}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-500">Where</p>
            <p className="truncate text-[14px] font-semibold text-ink-900">{destination.name}</p>
          </div>
          <ChevronRight aria-hidden size={18} className="text-ink-400" />
        </Link>
      ) : null}

      {enquirable ? (
        <Section title="Ask the host">
          <div id="enquire" className="scroll-mt-20 rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-4 text-[13px] text-ink-600">
              The host replies directly. An enquiry takes no payment and shares no contact details.
            </p>
            <MobileForm action={sendEnquiryForm} submitLabel="Send enquiry" pendingLabel="Sending…" hiddenFields={{ experienceId: experience.id }}>
              <div className="grid grid-cols-2 gap-3">
                <MobileField label="People" htmlFor="partySize" required>
                  <input id="partySize" name="partySize" type="number" inputMode="numeric" min={1} max={20} defaultValue={2} required className={mobileInput} />
                </MobileField>
                <MobileField label="Date" htmlFor="preferredDate" required>
                  <input id="preferredDate" name="preferredDate" type="date" required defaultValue={toIsoDate(addDays(now(), 3))} className={mobileInput} />
                </MobileField>
              </div>
              <MobileField label="Anything the host should know" htmlFor="note">
                <textarea id="note" name="note" rows={3} maxLength={400} placeholder="Dietary needs, mobility, arrival time." className={mobileInput} />
              </MobileField>
            </MobileForm>
          </div>
        </Section>
      ) : (
        <p className="mt-6 rounded-2xl bg-surface-2 p-4 text-[13px] text-ink-600">
          Not bookable yet. This provider is still being onboarded.
        </p>
      )}

      {bookable ? (
        <>
          <StickySpacer />
          <StickyActions>
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className="num text-[17px] font-bold text-ink-900">{formatRupees(experience.price)}</p>
                <p className="text-[11px] text-ink-500">per person · pay after the host accepts</p>
              </div>
              <Link
                href={`/m/experience/${experience.id}/book`}
                className="ml-auto flex h-12 shrink-0 items-center whitespace-nowrap rounded-xl bg-brand-700 px-5 text-[15px] font-semibold text-white active:scale-[0.98]"
              >
                Request to book
              </Link>
            </div>
          </StickyActions>
        </>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 shadow-card">
      <dt className="flex items-center gap-1 text-[11px] text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </dt>
      <dd className="num mt-1 truncate text-[14px] font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
