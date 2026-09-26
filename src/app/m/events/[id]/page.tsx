import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CalendarDays, Clock, ExternalLink, MapPin, Ticket, Users } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPeriod, formatRelative } from '@/lib/date';
import { directionsHref } from '@/lib/map';
import { EVENT_CATEGORY_LABEL } from '@/lib/types';
import { getBusiness, getDestination, getEvent, getUpcomingEvents } from '@/server/data/repository';
import { businessesAcceptingBookings, placesTaken } from '@/server/bookings/ledger';
import { CANCELLATION_POLICY, MAX_PARTY_SIZE, PAYMENT_WINDOW_HOURS } from '@/server/bookings/policy';
import { requestEventPlaceMobileForm } from '@/server/actions/mobile';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { ProvenanceBadge } from '@/components/shared/badges';
import { BackLink } from '@/components/mobile/BackLink';
import { EdgeToEdge } from '@/components/mobile/EdgeToEdge';
import { photoFor } from '@/lib/mobile/photos';
import { MobileField, MobileForm, mobileInput } from '@/components/mobile/form';
import { PhotoCredit, PrimaryLink, Section } from '@/components/mobile/ui';
import { Badge } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const event = getEvent(id);
  return event ? { title: event.name } : { title: 'Event' };
}

export const dynamic = 'force-dynamic';

/** One event on mobile: when, where, how to get in, and how to hold a place. */
export default async function MobileEventPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const event = getEvent(id);
  if (!event) notFound();

  const destination = getDestination(event.destinationId);
  const at = now();
  const start = new Date(event.startAt);
  const finished = new Date(event.endAt) < at;
  const running = !finished && start <= at;

  const host = event.organiserBusinessId ? getBusiness(event.organiserBusinessId) : undefined;
  const organiserOnline =
    Boolean(host) && host!.status === 'PARTICIPATING' && (await businessesAcceptingBookings()).has(host!.id);
  const bookable = event.admission !== 'FREE' && organiserOnline && !finished && !running;
  const taken = bookable && event.capacity !== undefined ? await placesTaken(event.id, at) : 0;
  const placesLeft = event.capacity !== undefined ? Math.max(0, event.capacity - taken) : undefined;
  const full = placesLeft === 0;

  const alsoThere = getUpcomingEvents(at)
    .filter((other) => other.id !== event.id && other.destinationId === event.destinationId)
    .slice(0, 3);
  const photo = destination ? photoFor(destination.id) : undefined;

  return (
    <div>
      <section className="relative -mx-4">
        {destination ? (
          <PlacePhoto
            src={photo?.hd}
            alt={event.name}
            eager
            overlay
            className="h-64"
            fallback={<DestinationVisual destination={destination} height="lg" overlay className="h-64!" />}
          />
        ) : (
          <div className="immersive h-56" />
        )}
        <EdgeToEdge />
        <BackLink fallbackHref="/m/events" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="lily">{EVENT_CATEGORY_LABEL[event.category]}</Badge>
            {running ? <Badge tone="good">On now</Badge> : null}
            {finished ? <Badge tone="neutral">Finished</Badge> : null}
          </div>
          <h1 className="mt-1.5 text-[24px] font-bold leading-tight text-white">{event.name}</h1>
          <p className="text-[13px] text-white/80">
            {event.venue ?? destination?.name}
            {destination?.district ? `, ${destination.district} district` : ''}
          </p>
        </div>
      </section>

      <p className="mt-4 text-[15px] leading-relaxed text-ink-900">{event.description}</p>
      {destination ? (
        <div className="mt-2">
          <PhotoCredit photo={photo} />
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <dl className="divide-y divide-line">
          <Row term="When">
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <CalendarDays aria-hidden size={13} className="text-ink-400" />
              {formatPeriod(event.startAt, event.endAt)}
              {!finished ? <span className="text-ink-500">({formatRelative(event.startAt, at)})</span> : null}
            </span>
            {event.datesProvisional ? (
              <p className="mt-1 text-[12px] text-warn-700">
                These dates follow the traditional calendar. Check with the organiser before you travel.
              </p>
            ) : null}
          </Row>
          {event.organiser ? <Row term="Organiser">{event.organiser}</Row> : null}
          <Row term="Getting in">
            {event.admission === 'FREE' ? (
              'Open to all, no ticket. Turn up.'
            ) : event.admission === 'REGISTRATION' ? (
              <span className="inline-flex items-center gap-2">
                <Users aria-hidden size={13} className="text-ink-400" />
                Free, but places are limited{event.capacity ? ` to ${event.capacity}` : ''}.
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Ticket aria-hidden size={13} className="text-ink-400" />
                {event.ticketPrice ? `₹${event.ticketPrice.toLocaleString('en-IN')} per person` : 'Ticketed'}
                {event.capacity ? ` · ${event.capacity} places` : ''}
              </span>
            )}
          </Row>
          {event.expectedAttendance ? (
            <Row term="Expected">
              {event.expectedAttendance.toLocaleString('en-IN')} people
              <span className="ml-1.5 text-[12px] text-ink-500">prototype estimate</span>
            </Row>
          ) : null}
        </dl>

        {event.admission !== 'FREE' && !finished && !bookable ? (
          <div className="mt-3 rounded-xl border border-dashed border-line-strong bg-surface-2/50 p-3 text-[13px] text-ink-600">
            {running
              ? 'This event has already begun, so places can no longer be held here.'
              : 'The organiser does not take bookings through this platform. Contact them directly.'}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {destination ? (
            <a
              href={directionsHref(destination.latitude, destination.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-800"
            >
              <MapPin aria-hidden size={14} />
              Directions
            </a>
          ) : null}
          {event.officialUrl ? (
            <a
              href={event.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-800"
            >
              <ExternalLink aria-hidden size={14} />
              Organiser&rsquo;s page
            </a>
          ) : null}
        </div>
      </div>

      {destination ? (
        <div className="mt-4">
          <PrimaryLink href={`/m/plan?plan=${encodeURIComponent(`${destination.name} around ${event.name}`)}`} className="w-full">
            Plan a trip around it
          </PrimaryLink>
        </div>
      ) : null}

      {bookable ? (
        <Section title={event.admission === 'TICKETED' ? 'Book a place' : 'Hold a place'}>
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-[13px] text-ink-600">
                {event.admission === 'TICKETED'
                  ? `${event.organiser} answers first. Nothing is charged until they accept, and you then have up to ${PAYMENT_WINDOW_HOURS} hours to pay.`
                  : `Free, but the group is limited. ${event.organiser} confirms your place.`}
              </p>
              {placesLeft !== undefined ? (
                <Badge tone={full ? 'risk' : placesLeft <= 5 ? 'warn' : 'neutral'}>
                  {full ? 'Full' : `${placesLeft} left`}
                </Badge>
              ) : null}
            </div>

            {full ? (
              <p className="text-[13px] text-ink-600">
                Every place is taken or held. Places come back if a request is declined, so it is worth checking
                again.
              </p>
            ) : (
              <MobileForm
                action={requestEventPlaceMobileForm}
                submitLabel={event.admission === 'TICKETED' ? 'Request a place' : 'Register'}
                pendingLabel="Sending…"
                hiddenFields={{ eventId: event.id }}
                after={<p className="text-center text-[12px] text-ink-500">{CANCELLATION_POLICY}</p>}
              >
                <MobileField label="How many people" htmlFor="partySize" required>
                  <input
                    id="partySize"
                    name="partySize"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.min(MAX_PARTY_SIZE, placesLeft ?? MAX_PARTY_SIZE)}
                    defaultValue={2}
                    required
                    className={mobileInput}
                  />
                </MobileField>
                <MobileField label="Your name" htmlFor="guestName" required>
                  <input id="guestName" name="guestName" autoComplete="name" maxLength={120} required className={mobileInput} />
                </MobileField>
                <MobileField label="Phone" htmlFor="guestPhone" required>
                  <input id="guestPhone" name="guestPhone" type="tel" autoComplete="tel" inputMode="tel" required className={mobileInput} />
                </MobileField>
                <MobileField label="Email (optional)" htmlFor="guestEmail">
                  <input id="guestEmail" name="guestEmail" type="email" autoComplete="email" className={mobileInput} />
                </MobileField>
                <MobileField label="Anything the organiser should know" htmlFor="note">
                  <textarea id="note" name="note" rows={3} maxLength={400} placeholder="Dietary needs, mobility, who you are coming with." className={mobileInput} />
                </MobileField>
                <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-ink-800">
                  <input type="checkbox" name="consent" value="on" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand-600)]" />
                  <span>
                    Share my name and phone number with the organiser, so they can arrange my place. Only the
                    organiser sees them.
                  </span>
                </label>
              </MobileForm>
            )}
          </div>
        </Section>
      ) : null}

      {alsoThere.length > 0 ? (
        <Section title={`Also at ${destination?.name ?? 'this place'}`}>
          <div className="space-y-2 rounded-2xl bg-surface p-3 shadow-card">
            {alsoThere.map((other) => (
              <Link
                key={other.id}
                href={`/m/events/${other.id}`}
                className="flex items-center justify-between gap-3 rounded-xl p-2.5 active:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink-900">{other.name}</span>
                  <span className="block text-[12px] text-ink-500">{formatPeriod(other.startAt, other.endAt)}</span>
                </span>
                <Clock aria-hidden size={15} className="shrink-0 text-ink-400" />
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <p className="mt-6 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <ProvenanceBadge provenance={event.provenance} />
        Dates, venue and entry are set by the organiser. This platform lists them; it does not run the event.
      </p>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">{term}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink-900">{children}</dd>
    </div>
  );
}
