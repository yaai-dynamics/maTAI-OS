import type { BadgeTone } from '@/components/ui/primitives';

/** One vocabulary for booking states, shared by the traveller and host views. */

export type BookingStatusName =
  | 'REQUESTED'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED_BY_GUEST'
  | 'CANCELLED_BY_HOST';

export const BOOKING_STATUS: Record<BookingStatusName, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: 'Waiting for host', tone: 'warn' },
  AWAITING_PAYMENT: { label: 'Accepted — pay to confirm', tone: 'info' },
  CONFIRMED: { label: 'Confirmed', tone: 'good' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  DECLINED: { label: 'Declined', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CANCELLED_BY_GUEST: { label: 'Cancelled by you', tone: 'neutral' },
  CANCELLED_BY_HOST: { label: 'Cancelled by host', tone: 'risk' },
};

/** The host sees the same states, worded from their side. */
export const HOST_BOOKING_STATUS: Record<BookingStatusName, string> = {
  ...Object.fromEntries(Object.entries(BOOKING_STATUS).map(([key, value]) => [key, value.label])),
  REQUESTED: 'Needs your answer',
  AWAITING_PAYMENT: 'Waiting for payment',
  CANCELLED_BY_GUEST: 'Cancelled by traveller',
  CANCELLED_BY_HOST: 'Cancelled by you',
} as Record<BookingStatusName, string>;
