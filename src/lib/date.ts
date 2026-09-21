/** Date helpers. All windows are computed in UTC so the demo is reproducible. */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** YYYY-MM-DD. */
export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);

export const isWeekend = (date: Date): boolean => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "16 September 2026" — unambiguous for a mixed audience. */
export function formatLongDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "16 Sep" — for dense tables and axes. */
export function formatShortDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]!.slice(0, 3)}`;
}

/** "09:30" in UTC, used for itinerary times which are demo-relative anyway. */
export function formatTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatRelative(value: string | Date, reference: Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = daysBetween(date, reference);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff === -1) return 'tomorrow';
  if (diff > 0) return `${diff} days ago`;
  return `in ${Math.abs(diff)} days`;
}

/** Inclusive period label such as "18 Aug to 16 Sep 2026". */
export function formatPeriod(start: Date | string, end: Date | string): string {
  const from = typeof start === 'string' ? new Date(start) : start;
  const to = typeof end === 'string' ? new Date(end) : end;
  return `${formatShortDate(from)} to ${formatLongDate(to)}`;
}

/** "17 September 2026, 15:30 IST" — deadlines a traveller in India acts on. */
export function formatIndiaDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  const india = new Date(date.getTime() + 330 * 60 * 1000);
  return `${formatLongDate(india)}, ${formatTime(india)} IST`;
}
