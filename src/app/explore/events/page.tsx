import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarDays, MapPin, Ticket, Users } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPeriod } from '@/lib/date';
import {
  EVENT_CATEGORY_LABEL,
  type EventCategory,
  type TourismEvent,
} from '@/lib/types';
import { getDestination, getUpcomingEvents } from '@/server/data/repository';
import { Badge, Card, CardBody, EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Events and festivals',
  description: "Manipur's festivals, commemorations and seasonal events, with what is on when.",
};
export const dynamic = 'force-dynamic';

const CATEGORIES: EventCategory[] = ['FESTIVAL', 'CULTURAL', 'SEASONAL', 'EXHIBITION', 'SPORT'];

/**
 * PS7: one calendar for the state. Everything not yet finished, soonest first,
 * grouped by the month it starts in, filterable by kind and by district.
 *
 * Dates that follow the traditional calendar are marked as expected rather
 * than fixed, because that is what their organisers say about them.
 */
export default async function EventsPage(props: {
  searchParams: Promise<{ category?: string; district?: string }>;
}) {
  const { category, district } = await props.searchParams;
  const at = now();

  const all = getUpcomingEvents(at).map((event) => ({
    event,
    destination: getDestination(event.destinationId),
  }));

  const districts = [...new Set(all.map((row) => row.destination?.district).filter(Boolean))].sort() as string[];
  const activeCategory = CATEGORIES.includes(category as EventCategory) ? (category as EventCategory) : undefined;
  const activeDistrict = district && districts.includes(district) ? district : undefined;

  const shown = all.filter(
    (row) =>
      (!activeCategory || row.event.category === activeCategory) &&
      (!activeDistrict || row.destination?.district === activeDistrict),
  );

  const months = groupByMonth(shown);

  const href = (next: { category?: string; district?: string }) => {
    const params = new URLSearchParams();
    const c = next.category ?? activeCategory;
    const d = next.district ?? activeDistrict;
    if (c && c !== 'all') params.set('category', c);
    if (d && d !== 'all') params.set('district', d);
    const query = params.toString();
    return query ? `/explore/events?${query}` : '/explore/events';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Events and festivals</h1>
        <p className="mt-1 max-w-prose text-[13px] text-ink-600">
          What is on across Manipur, soonest first. Many festivals follow the traditional calendar and are confirmed
          by their organisers closer to the time — those are marked.
        </p>
      </div>

      <div className="space-y-2">
        <Filters label="Kind">
          <FilterChip href={href({ category: 'all' })} active={!activeCategory}>
            All
          </FilterChip>
          {CATEGORIES.map((value) => (
            <FilterChip key={value} href={href({ category: value })} active={activeCategory === value}>
              {EVENT_CATEGORY_LABEL[value]}
            </FilterChip>
          ))}
        </Filters>

        <Filters label="District">
          <FilterChip href={href({ district: 'all' })} active={!activeDistrict}>
            Everywhere
          </FilterChip>
          {districts.map((value) => (
            <FilterChip key={value} href={href({ district: value })} active={activeDistrict === value}>
              {value}
            </FilterChip>
          ))}
        </Filters>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          description="Try a different kind of event, or look across every district."
        />
      ) : (
        <div className="space-y-6">
          {months.map(([month, rows]) => (
            <section key={month}>
              <h2 className="sticky top-12 z-10 -mx-1 bg-paper/95 px-1 py-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500 backdrop-blur">
                {month}
              </h2>
              <ul className="mt-1 space-y-2.5">
                {rows.map(({ event, destination }) => (
                  <li key={event.id}>
                    <EventRow event={event} destinationName={destination?.name} district={destination?.district} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-[12px] text-ink-500">
        Prototype calendar. Dates, venues and any entry charge for a state or community festival are set by its
        organiser, not by this platform — check with them before travelling for one.
      </p>
    </div>
  );
}

function groupByMonth(
  rows: { event: TourismEvent; destination?: { name: string; district: string } }[],
): [string, typeof rows][] {
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = new Date(row.event.startAt).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()];
}

function Filters({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[12px] font-medium text-ink-500">{label}</span>
      {children}
    </nav>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700'
          : 'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2'
      }
    >
      {children}
    </Link>
  );
}

function EventRow({
  event,
  destinationName,
  district,
}: {
  event: TourismEvent;
  destinationName?: string;
  district?: string;
}) {
  return (
    <Card as="article" className="transition-colors hover:bg-surface-2">
      <CardBody className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={event.category === 'FESTIVAL' ? 'lily' : 'neutral'}>
              {EVENT_CATEGORY_LABEL[event.category]}
            </Badge>
            {event.admission === 'TICKETED' ? (
              <Badge tone="brand">
                <Ticket aria-hidden size={11} />
                {event.ticketPrice ? `₹${event.ticketPrice.toLocaleString('en-IN')}` : 'Ticketed'}
              </Badge>
            ) : null}
            {event.admission === 'REGISTRATION' ? <Badge tone="info">Register</Badge> : null}
            {event.datesProvisional ? <Badge tone="warn">Dates confirmed nearer the time</Badge> : null}
          </div>

          <h3 className="mt-1.5 text-[15px] font-semibold text-ink-900">
            <Link href={`/explore/events/${event.id}`} className="hover:text-brand-700 hover:underline">
              {event.name}
            </Link>
          </h3>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-600">
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden size={12} />
              {formatPeriod(event.startAt, event.endAt)}
            </span>
            {destinationName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden size={12} />
                {event.venue ?? destinationName}
                {district ? `, ${district}` : ''}
              </span>
            ) : null}
            {event.expectedAttendance ? (
              <span className="inline-flex items-center gap-1">
                <Users aria-hidden size={12} />
                {event.expectedAttendance.toLocaleString('en-IN')} expected
              </span>
            ) : null}
          </p>

          <p className="mt-1.5 max-w-prose text-[13px] text-ink-700">{event.description}</p>
        </div>

        <Link
          href={`/explore/events/${event.id}`}
          className="shrink-0 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
        >
          Details
        </Link>
      </CardBody>
    </Card>
  );
}
