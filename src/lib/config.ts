/**
 * Runtime configuration.
 *
 * Demo mode keeps the prototype deterministic and offline: a fixed clock, a
 * seeded dataset and the mock AI provider. Nothing here reads a secret; the
 * AI provider key is resolved server side only, in src/lib/ai/provider.ts.
 */

/** True unless DEMO_MODE is explicitly disabled. */
export const DEMO_MODE: boolean =
  (process.env.NEXT_PUBLIC_DEMO_MODE ?? process.env.DEMO_MODE ?? 'true') !== 'false';

/**
 * Fixed clock for demo mode.
 *
 * The seed dataset is written around this instant, so pinning it keeps every
 * trend, window and campaign date coherent no matter when the demo is run.
 */
export const DEMO_NOW = new Date('2026-09-16T10:00:00.000Z');

export const now = (): Date => (DEMO_MODE ? new Date(DEMO_NOW) : new Date());

/** Analysis window used by the government views, in days. */
export const ANALYSIS_WINDOW_DAYS = 30;

/** Length of the generated signal history, in days. */
export const HISTORY_DAYS = 90;

/** Seed for the deterministic generator. Changing it changes the whole dataset. */
export const DATA_SEED = 'manipur-tourism-2026';

export const PLATFORM_NAME = 'mTour Agent';

/**
 * Absolute origin used when a link has to leave the browser — currently only the
 * printed destination QR codes, which a visitor scans from a sign.
 */
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export const ROLE_LABEL = {
  tourist: 'Explore Manipur',
  government: 'Decision Room',
  creator: 'Create for Manipur',
} as const;

export type Role = keyof typeof ROLE_LABEL;
