import { formatShortDate, formatTime } from '@/lib/date';
import type { Trip } from '@/lib/types';

/**
 * Where a journey stands, from its status and travel window.
 *
 * Pure, and given the time explicitly, so the server decides with its own
 * clock (the demo clock in demo mode) and every page agrees.
 */

/** Manipur time. India keeps one offset all year. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** A wall-clock date and time in Manipur, as an instant. */
export function istInstant(date: string, time = '00:00'): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!) - IST_OFFSET_MINUTES * 60_000);
}

/** Today's date in Manipur, YYYY-MM-DD. */
export const istDate = (at: Date): string =>
  new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);

/** The travel window, when the visitor gave one. */
export function tripWindow(
  trip: Pick<Trip, 'startDate' | 'endDate' | 'arriveTime' | 'departTime'>,
): { start: Date; end: Date } | undefined {
  if (!trip.startDate || !trip.endDate) return undefined;
  return {
    start: istInstant(trip.startDate, trip.arriveTime ?? '00:00'),
    // Without a departure time the whole last day counts.
    end: new Date(istInstant(trip.endDate, trip.departTime ?? '23:59').getTime() + (trip.departTime ? 0 : 59_999)),
  };
}

export type JourneyPhase = 'OPTION' | 'IN_PROGRESS' | 'UPCOMING' | 'FINALISED' | 'PAST';

export const PHASE_LABEL: Record<JourneyPhase, string> = {
  OPTION: 'Option',
  IN_PROGRESS: 'Current',
  UPCOMING: 'Upcoming',
  FINALISED: 'Finalised',
  PAST: 'Past',
};

/**
 * An option is a plan not yet chosen. A chosen plan is current once the
 * visitor starts it, or while the time is inside its travel window.
 */
export function journeyPhase(
  trip: Pick<Trip, 'status' | 'startDate' | 'endDate' | 'arriveTime' | 'departTime'>,
  at: Date,
): JourneyPhase {
  if (trip.status === 'DRAFT') return 'OPTION';
  if (trip.status === 'ACTIVE') return 'IN_PROGRESS';
  if (trip.status === 'COMPLETED') return 'PAST';
  const window = tripWindow(trip);
  if (!window) return 'FINALISED';
  if (at < window.start) return 'UPCOMING';
  if (at > window.end) return 'PAST';
  return 'IN_PROGRESS';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const withYear = (date: string) => `${formatShortDate(date)} ${date.slice(0, 4)}`;

/** "17 Sep 10:30 → 19 Sep 2026 17:00", or undefined when no dates were given. */
export function formatPlanFor(
  trip: Pick<Trip, 'startDate' | 'endDate' | 'arriveTime' | 'departTime'>,
): string | undefined {
  if (!trip.startDate || !trip.endDate) return undefined;
  if (trip.startDate === trip.endDate) {
    const times = [trip.arriveTime, trip.departTime].filter(Boolean).join(' to ');
    return `${withYear(trip.startDate)}${times ? `, ${times}` : ''}`;
  }
  return `${formatShortDate(trip.startDate)}${trip.arriveTime ? ` ${trip.arriveTime}` : ''} → ${withYear(trip.endDate)}${
    trip.departTime ? ` ${trip.departTime}` : ''
  }`;
}

/** An instant as a Manipur wall-clock date. */
const inIst = (value: string | Date) =>
  new Date(new Date(value).getTime() + IST_OFFSET_MINUTES * 60_000);

/** "16 Sep 2026, 15:30" in Manipur time. */
export function formatPlannedOn(createdAt: string): string {
  const india = inIst(createdAt);
  return `${formatShortDate(india)} ${india.getUTCFullYear()}, ${formatTime(india)}`;
}

/** "16 Sep", the Manipur date of an instant. */
export const formatIstDay = (value: string | Date): string => formatShortDate(inIst(value));

/** "Thu 17 Sep": day `day` of a trip starting on `startDate`. */
export function formatTripDay(startDate: string, day: number): string {
  const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + (day - 1) * 86_400_000);
  return `${WEEKDAYS[date.getUTCDay()]} ${formatShortDate(date)}`;
}
