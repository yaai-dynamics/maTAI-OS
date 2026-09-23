import type { BookingKind } from '@/server/bookings/ledger';
import { getBusiness, getEvent, getExperience } from '@/server/data/repository';

/**
 * What a booking is of.
 *
 * One ledger holds three kinds, and every screen that lists bookings needs the
 * same sentence for each: what it is, and the words for when and how many. Kept
 * here so the tourist, host and mobile screens cannot describe the same booking
 * differently.
 */

export interface BookingLike {
  kind: BookingKind;
  experienceId: string | null;
  eventId: string | null;
  businessId: string;
  partySize: number;
  rooms: number | null;
  nights: number | null;
}

export interface BookingSubject {
  /** The thing booked: the experience, the property or the event. */
  title: string;
  /** "Experience", "Stay" or "Event", for a badge. */
  kindLabel: string;
  /** "2 nights · 1 room · 3 guests", or "3 people". */
  quantity: string;
  /** What the unit price is per, for a price breakdown. */
  unitLabel: string;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function bookingSubject(booking: BookingLike): BookingSubject {
  if (booking.kind === 'STAY') {
    const rooms = booking.rooms ?? 1;
    const nights = booking.nights ?? 1;
    return {
      title: getBusiness(booking.businessId)?.name ?? 'Stay',
      kindLabel: 'Stay',
      quantity: `${plural(nights, 'night')} · ${plural(rooms, 'room')} · ${plural(booking.partySize, 'guest')}`,
      unitLabel: 'per room per night',
    };
  }
  if (booking.kind === 'EVENT') {
    return {
      title: getEvent(booking.eventId ?? '')?.name ?? 'Event',
      kindLabel: 'Event',
      quantity: plural(booking.partySize, 'place'),
      unitLabel: 'per person',
    };
  }
  return {
    title: getExperience(booking.experienceId ?? '')?.title ?? 'Experience',
    kindLabel: 'Experience',
    quantity: plural(booking.partySize, 'person', 'people'),
    unitLabel: 'per person',
  };
}
