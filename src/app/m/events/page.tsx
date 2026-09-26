import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarDays, MapPin, Ticket, Users } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPeriod } from '@/lib/date';
import { EVENT_CATEGORY_LABEL, type EventCategory, type TourismEvent } from '@/lib/types';
import { getDestination, getUpcomingEvents } from '@/server/data/repository';
import { MobileEmpty, MobileHeader, PillBar } from '@/components/mobile/ui';
import { Badge } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Events and festivals' };
export const dynamic = 'force-dynamic';

const CATEGORIES: EventCategory[] = ['FESTIVAL', 'CULTURAL', 'SEASONAL', 'EXHIBITION', 'SPORT'];

/**
 * PS7 on mobile: one calendar for the state, soonest first, grouped by the
 * month it starts in, filterable by kind and by district.
 */
export default async function MobileEventsPage(props: {
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
    return query ? `/m/events?${query}` : '/m/events';
  };

  return (
    <div>
      <MobileHeader
        title="Events and festivals"
        subtitle="What is on across Manipur, soonest first."
        backHref="/m"
      />

      <div className="space-y-2.5">
        <PillBar
          label="Kind"
          active={activeCategory ?? 'all'}
          options={[
            { value: 'all', label: 'All', href: href({ category: 'all' }) },
            ...CATEGORIES.map((value) => ({ value, label: EVENT_CATEGORY_LABEL[value], href: href({ category: value }) })),
          ]}
        />
        <PillBar
          label="District"
          active={activeDistrict ?? 'all'}
          options={[
            { value: 'all', label: 'Everywhere', href: href({ district: 'all' }) },
            ...districts.map((value) => ({ value, label: value, href: href({ district: value }) })),
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <div className="mt-4">
          <MobileEmpty
            icon={CalendarDays}
            tone="purple"
            title="Nothing matches those filters"
            description="Try a different kind of event, or look across every district."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {months.map(([month, rows]) => (
            <section key={month}>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{month}</h2>
              <ul className="space-y-2.5">
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

      <p className="mt-6 text-[12px] text-ink-500">
        Prototype calendar. Dates, venues and entry are set by each event&rsquo;s organiser — check with them before
        travelling for one.
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
    <Link href={`/m/events/${event.id}`} className="block rounded-2xl bg-surface p-4 shadow-card active:scale-[0.99]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={event.category === 'FESTIVAL' ? 'lily' : 'neutral'}>{EVENT_CATEGORY_LABEL[event.category]}</Badge>
        {event.admission === 'TICKETED' ? (
          <Badge tone="brand">
            <Ticket aria-hidden size={11} />
            {event.ticketPrice ? `₹${event.ticketPrice.toLocaleString('en-IN')}` : 'Ticketed'}
          </Badge>
        ) : null}
        {event.admission === 'REGISTRATION' ? <Badge tone="info">Register</Badge> : null}
        {event.datesProvisional ? <Badge tone="warn">Dates confirmed nearer the time</Badge> : null}
      </div>
      <p className="mt-1.5 text-[15px] font-semibold text-ink-900">{event.name}</p>
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
      <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-700">{event.description}</p>
    </Link>
  );
}
