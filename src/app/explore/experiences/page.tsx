import type { Metadata } from 'next';

import { EXPERIENCE_CATEGORY_LABEL, type ExperienceCategory } from '@/lib/types';
import { toIsoDate, addDays } from '@/lib/date';
import { now } from '@/lib/config';
import { getBusiness, getDestination, getExperiences } from '@/server/data/repository';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { ExperienceCard } from '@/components/shared/cards';
import { ActionForm, CheckboxRow, Field, TextArea, TextInput } from '@/components/shared/ActionForm';
import { requestBookingForm, sendEnquiryForm } from '@/server/actions/forms';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { CANCELLATION_POLICY, formatRupees, MAX_PARTY_SIZE, PAYMENT_WINDOW_HOURS } from '@/server/bookings/policy';

export const metadata: Metadata = { title: 'Local experiences' };
export const dynamic = 'force-dynamic';

const CATEGORIES: ExperienceCategory[] = [
  'food',
  'handloom',
  'craft',
  'culture',
  'nature',
  'photography',
  'homestay',
];

export default async function ExperiencesPage(props: {
  searchParams: Promise<{ category?: string; experience?: string; book?: string }>;
}) {
  const { category, experience: experienceParam, book: bookParam } = await props.searchParams;
  const active = (category ?? 'all') as ExperienceCategory | 'all';

  const all = getExperiences();
  const filtered = all
    .filter((experience) => active === 'all' || experience.category === active)
    .sort((a, b) => {
      // Bookable and verified first: a listing nobody can act on is not useful.
      const rank = (value: typeof a) =>
        (value.availabilityStatus === 'AVAILABLE' ? 0 : value.availabilityStatus === 'LIMITED' ? 1 : 2) +
        (value.verified ? 0 : 0.5);
      return rank(a) - rank(b);
    });

  const selected = experienceParam
    ? all.find((experience) => experience.id === experienceParam)
    : undefined;

  // Only a host on the platform can answer a booking request. The others are
  // still listed, and still reachable by enquiry.
  const accepting = await businessesAcceptingBookings();
  const bookable = (experience: (typeof all)[number]) =>
    experience.availabilityStatus !== 'UNAVAILABLE' &&
    accepting.has(experience.businessId) &&
    getBusiness(experience.businessId)?.status === 'PARTICIPATING';
  const booking = bookParam ? all.find((experience) => experience.id === bookParam && bookable(experience)) : undefined;
  const categoryQuery = active === 'all' ? '' : `&category=${active}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Local experiences</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Run by homestays, guides, cooks and artisans who have joined the platform. Hosts who take
          bookings online accept or decline your request here, and you pay only after they accept.
        </p>
      </div>

      <nav
        aria-label="Filter by category"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        <a
          href="/explore/experiences"
          className={
            active === 'all'
              ? 'shrink-0 rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700'
              : 'shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2'
          }
        >
          All
        </a>
        {CATEGORIES.map((value) => (
          <a
            key={value}
            href={`/explore/experiences?category=${value}`}
            className={
              active === value
                ? 'shrink-0 rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700'
                : 'shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2'
            }
          >
            {EXPERIENCE_CATEGORY_LABEL[value]}
          </a>
        ))}
      </nav>

      {booking ? (
        <Card>
          <CardHeader
            title={`Request to book: ${booking.title}`}
            subtitle={`${getBusiness(booking.businessId)?.name} at ${getDestination(booking.destinationId)?.name}. ${formatRupees(booking.price * 100)} per person. Nothing is charged now: once the host accepts, you have up to ${PAYMENT_WINDOW_HOURS} hours to pay.`}
          />
          <CardBody>
            <ActionForm
              action={requestBookingForm}
              submitLabel="Send request"
              pendingLabel="Sending…"
              hiddenFields={{ experienceId: booking.id }}
              footer={<span className="text-[12px] text-ink-500">{CANCELLATION_POLICY}</span>}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How many people" name="partySize" required>
                  <TextInput
                    id="partySize"
                    name="partySize"
                    type="number"
                    min={1}
                    max={MAX_PARTY_SIZE}
                    defaultValue={2}
                    required
                  />
                </Field>
                <Field label="Day" name="date" required>
                  <TextInput
                    id="date"
                    name="date"
                    type="date"
                    required
                    min={toIsoDate(addDays(now(), 1))}
                    defaultValue={toIsoDate(addDays(now(), 7))}
                  />
                </Field>
                <Field label="Your name" name="guestName" required>
                  <TextInput id="guestName" name="guestName" autoComplete="name" maxLength={120} required />
                </Field>
                <Field label="Phone" name="guestPhone" required>
                  <TextInput id="guestPhone" name="guestPhone" type="tel" autoComplete="tel" inputMode="tel" required />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Email (optional)" name="guestEmail">
                    <TextInput id="guestEmail" name="guestEmail" type="email" autoComplete="email" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Anything the host should know" name="note">
                    <TextArea id="note" name="note" maxLength={400} placeholder="Dietary needs, mobility, arrival time." />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <CheckboxRow
                    name="consent"
                    value="on"
                    label="Share my name and phone number with this host, so they can arrange the booking."
                  />
                  <p className="mt-1.5 text-[12px] text-ink-500">
                    Only the host sees them. The Tourism Department sees booking counts, never who booked.
                  </p>
                </div>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      {selected ? (
        <Card>
          <CardHeader
            title={`Enquire: ${selected.title}`}
            subtitle={`${getBusiness(selected.businessId)?.name} at ${getDestination(selected.destinationId)?.name}. The provider replies directly; an enquiry takes no payment.`}
          />
          <CardBody>
            <ActionForm
              action={sendEnquiryForm}
              submitLabel="Send enquiry"
              pendingLabel="Sending…"
              hiddenFields={{ experienceId: selected.id }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How many people" name="partySize" required>
                  <TextInput
                    id="partySize"
                    name="partySize"
                    type="number"
                    min={1}
                    max={20}
                    defaultValue={2}
                    required
                  />
                </Field>
                <Field label="Preferred date" name="preferredDate" required>
                  <TextInput
                    id="preferredDate"
                    name="preferredDate"
                    type="date"
                    required
                    defaultValue={toIsoDate(addDays(now(), 3))}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Anything the host should know" name="note">
                    <TextArea
                      id="note"
                      name="note"
                      maxLength={400}
                      placeholder="Dietary needs, mobility, arrival time."
                    />
                  </Field>
                </div>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing listed in that category yet"
          description="Provider onboarding is ongoing. Try another category."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((experience) => {
            const business = getBusiness(experience.businessId);
            const destination = getDestination(experience.destinationId);
            return (
              <li key={experience.id}>
                <ExperienceCard
                  experience={experience}
                  destinationName={destination?.name ?? experience.destinationId}
                  businessName={business?.name ?? 'Local provider'}
                  action={
                    experience.availabilityStatus === 'UNAVAILABLE' ? (
                      <p className="text-[12px] text-ink-500">
                        Not bookable yet. This provider is still being onboarded.
                      </p>
                    ) : bookable(experience) ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/explore/experiences?book=${experience.id}${categoryQuery}`}
                          className="inline-block rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
                        >
                          Request to book
                        </a>
                        <a
                          href={`/explore/experiences?experience=${experience.id}${categoryQuery}`}
                          className="text-[12px] font-medium text-brand-700 hover:underline"
                        >
                          Ask a question
                        </a>
                      </span>
                    ) : (
                      <a
                        href={`/explore/experiences?experience=${experience.id}${categoryQuery}`}
                        className="inline-block rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
                      >
                        Enquire
                      </a>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className="text-[12px] text-ink-600">
            Verified means the platform has checked the provider before listing them. Online bookings
            are paid through Razorpay once the host accepts; card, UPI and bank details go to Razorpay
            and never to this platform. Hosts not yet taking bookings online reply to enquiries directly.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
