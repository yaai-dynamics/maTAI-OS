import { ANALYSIS_WINDOW_DAYS, now } from '@/lib/config';
import { addDays, formatPeriod, startOfUtcDay } from '@/lib/date';

/** A closed analysis window, always carried alongside the figures it produced. */
export interface AnalysisWindow {
  from: Date;
  to: Date;
  days: number;
  label: string;
}

export function makeWindow(days: number, endingAt: Date = now()): AnalysisWindow {
  const to = endingAt;
  const from = addDays(startOfUtcDay(to), -(days - 1));
  return { from, to, days, label: formatPeriod(from, to) };
}

/** The window immediately before the given one, for like-for-like comparison. */
export function previousWindow(window: AnalysisWindow): AnalysisWindow {
  const to = addDays(window.from, -1);
  const from = addDays(startOfUtcDay(to), -(window.days - 1));
  return { from, to, days: window.days, label: formatPeriod(from, to) };
}

export const currentWindow = (days: number = ANALYSIS_WINDOW_DAYS): AnalysisWindow =>
  makeWindow(days);

/** Percentage change, guarding the zero-baseline case that trends are prone to. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export const roundTo = (value: number, places = 1): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
