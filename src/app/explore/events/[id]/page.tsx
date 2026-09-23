import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, CalendarDays, Clock, ExternalLink, MapPin, Ticket, Users } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPeriod, formatRelative } from '@/lib/date';
import { directionsHref, planHref } from '@/lib/map';
import { EVENT_CATEGORY_LABEL } from '@/lib/types';
import { getDestination, getEvent, getUpcomingEvents } from '@/server/data/repository';
import { ProvenanceBadge } from '@/components/shared/badges';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { Badge, ButtonLink, Card, CardBody, CardHeader, DefinitionRow } from '@/components/ui/primitives';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const event = getEvent(id);
  return event ? { title: event.name, description: event.description } : { title: 'Event' };
}

export const dynamic = 'force-dynamic';

/** One event: when, where, how to get in, and the ways on from it. */
export default async function EventPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const event = getEvent(id);
  if (!event) notFound();

  const destination = getDestination(event.destinationId);
  const at = now();
  const start = new Date(event.startAt);
  const finished = new Date(event.endAt) < at;
  const running = !finished && start <= at;

  const alsoThere = getUpcomingEvents(at)
    .filter((other) => other.id !== event.id && other.destinationId === event.destinationId)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/explore/events"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-brand-700"
      >
        <ArrowLeft aria-hidden size={15} />
        All events
      </Link>

      {destination ? (
        <div className="relative overflow-hidden rounded-2xl">
          <DestinationVisual destination={destination} height="lg" overlay />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="lily">{EVENT_CATEGORY_LABEL[event.category]}</Badge>
              {running ? <Badge tone="good">On now</Badge> : null}
              {finished ? <Badge tone="neutral">Finished</Badge> : null}
            </div>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-white">{event.name}</h1>
            <p className="mt-1 text-[13px] text-white/80">
              {event.venue ?? destination.name}
              {destination.district ? `, ${destination.district} district` : ''}
            </p>
          </div>
        </div>
      ) : (
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900">{event.name}</h1>
      )}

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="text-[14px] leading-relaxed text-ink-800">{event.description}</p>

          <dl className="divide-y divide-line border-t border-line">
            <DefinitionRow term="When">
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <CalendarDays aria-hidden size={13} className="text-ink-400" />
                {formatPeriod(event.startAt, event.endAt)}
                {!finished ? (
                  <span className="text-ink-500">({formatRelative(event.startAt, at)})</span>
                ) : null}
              </span>
              {event.datesProvisional ? (
                <p className="mt-1 text-[12px] text-warn-700">
                  These dates follow the traditional calendar. The organiser confirms them closer to the time —
                  check before you travel for this.
                </p>
              ) : null}
            </DefinitionRow>

            {event.venue || destination ? (
              <DefinitionRow term="Where">
                <span className="inline-flex items-center gap-2">
                  <MapPin aria-hidden size={13} className="text-ink-400" />
                  {event.venue ?? destination?.name}
                </span>
              </DefinitionRow>
            ) : null}

            {event.organiser ? <DefinitionRow term="Organiser">{event.organiser}</DefinitionRow> : null}

            <DefinitionRow term="Getting in">
              {event.admission === 'FREE' ? (
                'Open to all, no ticket. Turn up.'
              ) : event.admission === 'REGISTRATION' ? (
                <span className="inline-flex items-center gap-2">
                  <Users aria-hidden size={13} className="text-ink-400" />
                  Free, but places are limited
                  {event.capacity ? ` to ${event.capacity}` : ''}.
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Ticket aria-hidden size={13} className="text-ink-400" />
                  {event.ticketPrice ? `₹${event.ticketPrice.toLocaleString('en-IN')} per person` : 'Ticketed'}
                  {event.capacity ? ` · ${event.capacity} places` : ''}
                </span>
              )}
            </DefinitionRow>

            {event.expectedAttendance ? (
              <DefinitionRow term="Expected">
                {event.expectedAttendance.toLocaleString('en-IN')} people
                <span className="ml-1.5 text-[12px] text-ink-500">prototype estimate</span>
              </DefinitionRow>
            ) : null}
          </dl>

          {event.admission !== 'FREE' && !finished ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-surface-2/50 p-3 text-[13px] text-ink-600">
              Holding a place through maTAI is not built yet. For now, contact the organiser.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {destination ? (
              <>
                <ButtonLink href={`/explore/destinations/${destination.id}`} variant="secondary" size="sm">
                  About {destination.name}
                </ButtonLink>
                <ButtonLink href={planHref(`${destination.name} around ${event.name}`)} size="sm">
                  Plan a trip around it
                </ButtonLink>
                <a
                  href={directionsHref(destination.latitude, destination.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
                >
                  <MapPin aria-hidden size={14} />
                  Directions
                </a>
              </>
            ) : null}
            {event.officialUrl ? (
              <a
                href={event.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
              >
                <ExternalLink aria-hidden size={14} />
                Organiser&rsquo;s page
              </a>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {alsoThere.length > 0 ? (
        <Card>
          <CardHeader title={`Also at ${destination?.name ?? 'this place'}`} />
          <CardBody className="space-y-2">
            {alsoThere.map((other) => (
              <Link
                key={other.id}
                href={`/explore/events/${other.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-2.5 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{other.name}</span>
                  <span className="block text-[12px] text-ink-500">
                    {formatPeriod(other.startAt, other.endAt)}
                  </span>
                </span>
                <Clock aria-hidden size={15} className="shrink-0 text-ink-400" />
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <ProvenanceBadge provenance={event.provenance} />
        Dates, venue and entry are set by the organiser. maTAI lists them; it does not run this event.
      </p>
    </div>
  );
}
