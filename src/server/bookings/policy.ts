/**
 * Booking rules, as pure functions.
 *
 * Everything a traveller is told before paying — the price, how long they have
 * to pay, what they get back if they cancel — is decided here and nowhere else,
 * so the page that states a rule and the code that applies it cannot disagree.
 *
 * Money is integer paise throughout. Dates are the experience day in India
 * (IST, UTC+05:30), written YYYY-MM-DD.
 */

export const MAX_PARTY_SIZE = 20;
/** Nights one stay request may cover. */
export const MAX_NIGHTS = 30;
/** Rooms one stay request may hold. */
export const MAX_ROOMS = 6;
/** How far ahead a request may be made. */
export const MAX_ADVANCE_DAYS = 180;
/** After the host accepts, the traveller has this long to pay. */
export const PAYMENT_WINDOW_HOURS = 24;
/** Guest cancellations at least this far ahead of the day are refunded in full. */
export const FREE_CANCELLATION_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Midnight at the start of the experience day, in India. */
export const dayStartsAt = (date: string): Date => new Date(`${date}T00:00:00+05:30`);

/** Today's date in India. */
export const indiaDate = (at: Date): string =>
  new Date(at.getTime() + 5.5 * HOUR_MS).toISOString().slice(0, 10);

export const priceFor = (unitPriceRupees: number, partySize: number) => {
  const unitPricePaise = Math.round(unitPriceRupees * 100);
  return { unitPricePaise, amountPaise: unitPricePaise * partySize };
};

/** A stay is quoted per room per night, so the room nights are what multiply. */
export const stayPriceFor = (ratePerNightRupees: number, nights: number, rooms: number) => {
  const unitPricePaise = Math.round(ratePerNightRupees * 100);
  return { unitPricePaise, amountPaise: unitPricePaise * nights * rooms };
};

/** Nights from arrival to departure: the departure day is not one. */
export const nightsBetween = (checkIn: string, checkOut: string): number =>
  Math.round((dayStartsAt(checkOut).getTime() - dayStartsAt(checkIn).getTime()) / DAY_MS);

/** Why a date cannot be requested, or null when it can. */
export function dateProblem(date: string, at: Date): string | null {
  // JavaScript reads 30 February as 2 March; a real date survives the round trip.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dayStartsAt(date).getTime())) return 'Choose a date.';
  if (indiaDate(dayStartsAt(date)) !== date) return 'Choose a date.';
  const today = indiaDate(at);
  if (date <= today) return 'Choose a date from tomorrow onwards.';
  if (dayStartsAt(date).getTime() - dayStartsAt(today).getTime() > MAX_ADVANCE_DAYS * DAY_MS) {
    return `Requests can be made up to ${MAX_ADVANCE_DAYS} days ahead.`;
  }
  return null;
}

/**
 * Why a stay's departure day cannot be requested, or null when it can. The
 * arrival day goes through dateProblem first, like any other booking.
 */
export function checkOutProblem(checkIn: string, checkOut: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || Number.isNaN(dayStartsAt(checkOut).getTime())) {
    return 'Choose a day to leave.';
  }
  if (indiaDate(dayStartsAt(checkOut)) !== checkOut) return 'Choose a day to leave.';
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return 'Leave at least one night after you arrive.';
  if (nights > MAX_NIGHTS) return `Stays can be booked for up to ${MAX_NIGHTS} nights at a time.`;
  return null;
}

/**
 * When payment is due after the host accepts: a day later, or the start of the
 * experience day if that comes first. Null when the day has already begun, in
 * which case the request can no longer be accepted.
 */
export function paymentDueAt(date: string, acceptedAt: Date): Date | null {
  const start = dayStartsAt(date).getTime();
  if (acceptedAt.getTime() >= start) return null;
  return new Date(Math.min(acceptedAt.getTime() + PAYMENT_WINDOW_HOURS * HOUR_MS, start));
}

export type CancelledBy = 'GUEST' | 'HOST';

/**
 * What a cancellation refunds.
 *
 * A host cancelling always refunds in full: the traveller did nothing wrong.
 * A traveller cancelling is refunded in full up to 48 hours before the day,
 * and not at all after that, because a homestay cannot re-let a room at a
 * day's notice.
 */
export function refundFor(
  cancelledBy: CancelledBy,
  paidPaise: number,
  date: string,
  at: Date,
): { refundPaise: number; rule: string } {
  if (paidPaise <= 0) return { refundPaise: 0, rule: 'Nothing was paid.' };
  if (cancelledBy === 'HOST') {
    return { refundPaise: paidPaise, rule: 'Cancelled by the host: refunded in full.' };
  }
  const hoursAhead = (dayStartsAt(date).getTime() - at.getTime()) / HOUR_MS;
  return hoursAhead >= FREE_CANCELLATION_HOURS
    ? { refundPaise: paidPaise, rule: `Cancelled ${FREE_CANCELLATION_HOURS}+ hours ahead: refunded in full.` }
    : {
        refundPaise: 0,
        rule: `Cancelled less than ${FREE_CANCELLATION_HOURS} hours before the day: not refundable.`,
      };
}

/** The last moment a guest can cancel for a full refund. */
export const freeCancellationUntil = (date: string): Date =>
  new Date(dayStartsAt(date).getTime() - FREE_CANCELLATION_HOURS * HOUR_MS);

export const CANCELLATION_POLICY = `Free cancellation until ${FREE_CANCELLATION_HOURS} hours before the day of the experience; no refund after that. If the host cancels, you are refunded in full.`;

/** ₹1,400 or ₹1,400.50 — paise shown only when there are any. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
