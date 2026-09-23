import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, BedDouble, MapPin, ShieldCheck } from 'lucide-react';

import { now } from '@/lib/config';
import { addDays, toIsoDate } from '@/lib/date';
import { BUSINESS_TYPE_LABEL } from '@/lib/types';
import { getDestination, getStay } from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import {
  CANCELLATION_POLICY,
  MAX_NIGHTS,
  MAX_PARTY_SIZE,
  MAX_ROOMS,
  PAYMENT_WINDOW_HOURS,
} from '@/server/bookings/policy';
import { requestStayForm } from '@/server/actions/forms';
import { ActionForm, CheckboxRow, Field, TextArea, TextInput } from '@/components/shared/ActionForm';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { Badge, Card, CardBody, CardHeader, DefinitionRow } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const stay = getStay(id);
  return stay ? { title: stay.name, description: stay.description } : { title: 'Stay' };
}

export const dynamic = 'force-dynamic';

/** One property: what it is, what a room costs, and the request form. */
export default async function StayPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const stay = getStay(id);
  if (!stay || stay.status !== 'PARTICIPATING') notFound();

  const destination = getDestination(stay.destinationId);
  const online = (await businessesAcceptingBookings()).has(stay.id);
  const at = now();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/explore/stays"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-brand-700"
      >
        <ArrowLeft aria-hidden size={15} />
        All stays
      </Link>

      {destination ? (
        <div className="relative overflow-hidden rounded-2xl">
          <DestinationVisual destination={destination} height="lg" overlay />
          <div className="absolute inset-x-0 bottom-0 p-5">
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
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-white">{stay.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-[13px] text-white/80">
              <MapPin aria-hidden size={13} />
              {destination.name}, {stay.district} district
            </p>
          </div>
        </div>
      ) : (
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900">{stay.name}</h1>
      )}

      <Card>
        <CardBody className="space-y-3 p-4">
          {stay.description ? (
            <p className="text-[14px] leading-relaxed text-ink-800">{stay.description}</p>
          ) : null}
          <dl className="divide-y divide-line border-t border-line">
            <DefinitionRow term="Rate">
              {stay.rate ? (
                <>
                  <span className="text-[15px] font-semibold text-ink-900">
                    ₹{stay.rate.amount.toLocaleString('en-IN')}
                  </span>{' '}
                  per room, per night
                  {stay.rate.note ? <span className="text-ink-600"> · {stay.rate.note}</span> : null}
                </>
              ) : (
                'On enquiry'
              )}
            </DefinitionRow>
            {stay.reportedCapacity !== undefined ? (
              <DefinitionRow term="Rooms">
                {stay.reportedCapacity} <span className="text-[12px] text-ink-500">reported by the host</span>
              </DefinitionRow>
            ) : null}
            {destination ? (
              <DefinitionRow term="Near">
                <Link href={`/explore/destinations/${destination.id}`} className="text-brand-700 hover:underline">
                  {destination.name}
                </Link>
              </DefinitionRow>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {online && stay.rate ? (
        <Card>
          <CardHeader
            title="Request these nights"
            subtitle={`Nothing is charged now. Once the host accepts, you have up to ${PAYMENT_WINDOW_HOURS} hours to pay, and the booking is confirmed when you do.`}
          />
          <CardBody>
            <ActionForm
              action={requestStayForm}
              submitLabel="Send request"
              pendingLabel="Sending…"
              hiddenFields={{ businessId: stay.id }}
              footer={<span className="text-[12px] text-ink-500">{CANCELLATION_POLICY}</span>}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Arriving" name="checkIn" required>
                  <TextInput
                    id="checkIn"
                    name="checkIn"
                    type="date"
                    required
                    min={toIsoDate(addDays(at, 1))}
                    defaultValue={toIsoDate(addDays(at, 7))}
                  />
                </Field>
                <Field label="Leaving" name="checkOut" required>
                  <TextInput
                    id="checkOut"
                    name="checkOut"
                    type="date"
                    required
                    min={toIsoDate(addDays(at, 2))}
                    defaultValue={toIsoDate(addDays(at, 9))}
                  />
                </Field>
                <Field label="Rooms" name="rooms" required>
                  <TextInput
                    id="rooms"
                    name="rooms"
                    type="number"
                    min={1}
                    max={Math.min(MAX_ROOMS, stay.reportedCapacity ?? MAX_ROOMS)}
                    defaultValue={1}
                    required
                  />
                </Field>
                <Field label="Guests" name="partySize" required>
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
                    <TextArea
                      id="note"
                      name="note"
                      maxLength={400}
                      placeholder="Arrival time, dietary needs, travelling with children."
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <CheckboxRow
                    name="consent"
                    value="on"
                    label="Share my name and phone number with this host, so they can arrange the stay."
                  />
                  <p className="mt-1.5 text-[12px] text-ink-500">
                    Only the host sees them. The Tourism Department sees booking counts, never who booked.
                  </p>
                </div>
              </div>
            </ActionForm>
            <p className="mt-3 text-[12px] text-ink-500">
              Up to {MAX_NIGHTS} nights in one request. The total is the room rate times the nights times the rooms,
              and is shown on the booking before you pay.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card tone="outline">
          <CardHeader
            title="Not bookable online yet"
            subtitle={`${stay.name} is on the platform, but its host has not opened an account to answer booking requests. Rather than take a request nobody would read, maTAI says so.`}
          />
          {destination ? (
            <CardBody>
              <Link
                href={`/explore/destinations/${destination.id}`}
                className="text-[13px] font-medium text-brand-700 hover:underline"
              >
                Other places to stay and things to do around {destination.name} →
              </Link>
            </CardBody>
          ) : null}
        </Card>
      )}
    </div>
  );
}
