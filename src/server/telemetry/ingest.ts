import { now } from '@/lib/config';
import type { InteractionType, TourismInteraction } from '@/lib/types';
import { prisma } from '@/server/data/client';
import { activeCampaignFor } from '@/server/data/attribution';
import { getDestination, getExperience, getInteractions } from '@/server/data/repository';
import { getState, recordInteraction } from '@/server/data/store';

/**
 * The one way a tourist signal enters the platform.
 *
 * Browser beacons (/api/telemetry) and Server Actions both come through here,
 * so every signal the government views count has passed the same checks:
 * the visitor has not opted out, the event names things that exist, it is not
 * a repeat, and the sender is not flooding the intake. What was dropped, and
 * why, is counted — the intake has to be able to show it is working.
 *
 * The analytics modules are unchanged: they still read TourismInteraction
 * rows. This module decides which rows are allowed to exist.
 */

export type IngestSource = 'CLIENT' | 'SERVER';

export type IngestOutcome =
  | 'ACCEPTED'
  | 'DUPLICATE'
  | 'NO_CONSENT'
  | 'INVALID'
  | 'UNKNOWN_REFERENCE'
  | 'NOT_ALLOWED_FROM_CLIENT'
  | 'RATE_LIMITED'
  | 'BOT'
  | 'CROSS_SITE'
  | 'OVERSIZED';

export const OUTCOME_LABEL: Record<IngestOutcome, string> = {
  ACCEPTED: 'Recorded',
  DUPLICATE: 'Repeat of a recent signal',
  NO_CONSENT: 'Visitor opted out',
  INVALID: 'Malformed',
  UNKNOWN_REFERENCE: 'Names a place that does not exist',
  NOT_ALLOWED_FROM_CLIENT: 'Type a browser may not send',
  RATE_LIMITED: 'Too many from one visitor',
  BOT: 'Automated client',
  CROSS_SITE: 'Sent from another site',
  OVERSIZED: 'Batch too large',
};

/**
 * What a browser may report. Everything else — a search, a check-in, a
 * booking — is recorded by the server as a side effect of the action itself,
 * so a script posting to the intake cannot invent one.
 */
export const CLIENT_TYPES = ['DESTINATION_VIEW', 'NAVIGATION_START'] as const satisfies readonly InteractionType[];

/**
 * Submitted deliberately, each behind its own consent step, and so recorded
 * even for a visitor who opted out of passive analytics: declining analytics
 * must not silently discard a check-in or a complaint someone chose to send.
 */
const EXPLICIT_TYPES: readonly InteractionType[] = ['QR_CHECKIN', 'FEEDBACK'];

/** Everything a visitor's analytics choice governs: what "forget my visits" removes. */
export const PASSIVE_TYPES: readonly InteractionType[] = [
  'SEARCH',
  'ITINERARY_ADD',
  'DESTINATION_VIEW',
  'NAVIGATION_START',
  'BOOKING',
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'REVIEW',
];

/**
 * A repeat inside the window is one signal, not two. Refreshing a page is not
 * a second visit. Wall-clock time, not the demo clock, which never moves.
 */
const REPEAT_WINDOW_MS: Partial<Record<InteractionType, number>> = {
  DESTINATION_VIEW: 30 * 60 * 1000,
  NAVIGATION_START: 10 * 60 * 1000,
};

/** Per visitor, for browser events: a burst of 30, then one every two seconds. */
const BUCKET_CAPACITY = 30;
const REFILL_PER_MS = 1 / 2000;

const MAX_TRACKED = 20_000;

export interface IngestVisitor {
  sessionId: string;
  analyticsAllowed: boolean;
}

export interface IngestEvent {
  type: InteractionType;
  destinationId?: string;
  experienceId?: string;
  tripId?: string;
  campaignId?: string;
  metadata?: TourismInteraction['metadata'];
  clientEventId?: string;
  /**
   * 'auto' credits the campaign running for the destination now. 'none' keeps
   * campaignId as given: a payment is credited to the campaign behind the
   * request, not to one that started while the traveller was deciding.
   */
  attribution?: 'auto' | 'none';
}

export type IngestResult = { outcome: IngestOutcome; interaction?: TourismInteraction };

/* ------------------------------ Process state ----------------------------- */
// Per process, like the cache these signals land in. The database's unique
// clientEventId is the backstop for a retry that reaches another process.

const lastSeen = new Map<string, number>();
const buckets = new Map<string, { tokens: number; at: number }>();
const recentEventIds = new Map<string, true>();

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_TRACKED) map.delete(map.keys().next().value as string);
}

/** Clears the in-process windows. Tests only. */
export function resetIntakeForTests(): void {
  lastSeen.clear();
  buckets.clear();
  recentEventIds.clear();
}

function takeToken(sessionId: string, wall: number): boolean {
  const bucket = buckets.get(sessionId) ?? { tokens: BUCKET_CAPACITY, at: wall };
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + (wall - bucket.at) * REFILL_PER_MS);
  bucket.at = wall;
  if (bucket.tokens < 1) {
    remember(buckets, sessionId, bucket);
    return false;
  }
  bucket.tokens -= 1;
  remember(buckets, sessionId, bucket);
  return true;
}

/* -------------------------------- Checks ---------------------------------- */

const EVENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** A browser may label where an event came from, and nothing else. */
function clientMetadata(metadata: IngestEvent['metadata']): TourismInteraction['metadata'] {
  const surface = metadata?.surface;
  return typeof surface === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(surface) ? { surface } : {};
}

const sameIndiaDay = (a: Date, b: Date): boolean =>
  new Date(a.getTime() + 330 * 60_000).toISOString().slice(0, 10) ===
  new Date(b.getTime() + 330 * 60_000).toISOString().slice(0, 10);

function checkedInToday(sessionId: string, destinationId: string, at: Date): boolean {
  return getInteractions({ destinationId, types: ['QR_CHECKIN'] }).some(
    (row) => row.anonymousSessionId === sessionId && sameIndiaDay(new Date(row.timestamp), at),
  );
}

/** Whether this visitor has already checked in here today. */
export const hasCheckedInToday = (sessionId: string, destinationId: string): boolean =>
  checkedInToday(sessionId, destinationId, now());

function screen(visitor: IngestVisitor, event: IngestEvent, source: IngestSource, wall: number): IngestOutcome | null {
  if (!visitor.sessionId || typeof event?.type !== 'string') return 'INVALID';

  if (source === 'CLIENT') {
    if (!(CLIENT_TYPES as readonly string[]).includes(event.type)) return 'NOT_ALLOWED_FROM_CLIENT';
    if (event.clientEventId !== undefined && !EVENT_ID.test(event.clientEventId)) return 'INVALID';
  }

  if (!visitor.analyticsAllowed && !EXPLICIT_TYPES.includes(event.type)) return 'NO_CONSENT';

  if (event.destinationId !== undefined && !getDestination(event.destinationId)) return 'UNKNOWN_REFERENCE';
  if (event.experienceId !== undefined && !getExperience(event.experienceId)) return 'UNKNOWN_REFERENCE';
  if (source === 'CLIENT' && !event.destinationId) return 'INVALID';

  // Before the repeat checks: a script resending one event is still a flood.
  if (source === 'CLIENT' && !takeToken(visitor.sessionId, wall)) return 'RATE_LIMITED';

  if (event.clientEventId && recentEventIds.has(event.clientEventId)) return 'DUPLICATE';

  if (event.type === 'QR_CHECKIN' && event.destinationId && checkedInToday(visitor.sessionId, event.destinationId, now())) {
    return 'DUPLICATE';
  }
  const window = REPEAT_WINDOW_MS[event.type];
  if (window) {
    const key = `${visitor.sessionId}|${event.type}|${event.destinationId ?? ''}|${event.experienceId ?? ''}`;
    const previous = lastSeen.get(key);
    if (previous !== undefined && wall - previous < window) return 'DUPLICATE';
    remember(lastSeen, key, wall);
  }
  return null;
}

/* --------------------------------- Intake --------------------------------- */

async function accept(visitor: IngestVisitor, event: IngestEvent, source: IngestSource): Promise<IngestResult> {
  const campaignId =
    event.campaignId ??
    (event.attribution !== 'none' && event.destinationId ? activeCampaignFor(event.destinationId) : undefined);
  try {
    const interaction = await recordInteraction({
      anonymousSessionId: visitor.sessionId,
      type: event.type,
      metadata: source === 'CLIENT' ? clientMetadata(event.metadata) : (event.metadata ?? {}),
      ...(event.destinationId ? { destinationId: event.destinationId } : {}),
      ...(event.experienceId ? { experienceId: event.experienceId } : {}),
      ...(event.tripId ? { tripId: event.tripId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(event.clientEventId ? { clientEventId: event.clientEventId } : {}),
    });
    if (event.clientEventId) remember(recentEventIds, event.clientEventId, true);
    return { outcome: 'ACCEPTED', interaction };
  } catch (error) {
    // The same beacon, retried into another process after the first landed.
    // Only an event carrying a client id can collide legitimately; any other
    // unique-key failure is a fault, and must not pass silently as a duplicate.
    if ((error as { code?: string }).code === 'P2002' && event.clientEventId) return { outcome: 'DUPLICATE' };
    throw error;
  }
}

async function ingestOne(visitor: IngestVisitor, event: IngestEvent, source: IngestSource): Promise<IngestResult> {
  const rejected = screen(visitor, event, source, Date.now());
  return rejected ? { outcome: rejected } : accept(visitor, event, source);
}

/** Records one signal raised by the server as part of an action. */
export async function ingest(
  visitor: IngestVisitor,
  event: IngestEvent,
  source: IngestSource = 'SERVER',
): Promise<IngestResult> {
  const result = await ingestOne(visitor, event, source);
  await countOutcomes([result.outcome]);
  return result;
}

/** Records a batch of browser events. Each is judged on its own. */
export async function ingestBatch(visitor: IngestVisitor, events: readonly IngestEvent[]): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const event of events) results.push(await ingestOne(visitor, event, 'CLIENT'));
  await countOutcomes(results.map((result) => result.outcome));
  return results;
}

/* -------------------------------- Counters -------------------------------- */

const todayUtc = (): Date => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

/** Adds to the per-day outcome counters. Counting never blocks or fails an event. */
export async function countOutcomes(outcomes: readonly IngestOutcome[]): Promise<void> {
  if (!getState().persistent || outcomes.length === 0) return;
  const tally = new Map<IngestOutcome, number>();
  for (const outcome of outcomes) tally.set(outcome, (tally.get(outcome) ?? 0) + 1);
  const day = todayUtc();
  try {
    for (const [outcome, count] of tally) {
      await prisma.telemetryCounter.upsert({
        where: { day_outcome: { day, outcome } },
        create: { day, outcome, count },
        update: { count: { increment: count } },
      });
    }
  } catch (error) {
    console.error('[telemetry] counter update failed', (error as Error).message);
  }
}

export interface IntakeSummary {
  days: number;
  byOutcome: { outcome: IngestOutcome; count: number }[];
  accepted: number;
  dropped: number;
}

/** The last `days` days of intake outcomes, for the department's data page. */
export async function intakeSummary(days = 7): Promise<IntakeSummary> {
  const since = new Date(todayUtc().getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const rows = await prisma.telemetryCounter.groupBy({
    by: ['outcome'],
    where: { day: { gte: since } },
    _sum: { count: true },
  });
  const byOutcome = rows
    .map((row) => ({ outcome: row.outcome as IngestOutcome, count: row._sum.count ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const accepted = byOutcome.find((row) => row.outcome === 'ACCEPTED')?.count ?? 0;
  return { days, byOutcome, accepted, dropped: byOutcome.reduce((sum, row) => sum + row.count, 0) - accepted };
}

/** Distinct anonymous visitors whose signals are in the working set, by provenance. */
export function observedVisitorCount(): number {
  const sessions = new Set<string>();
  for (const row of getState().interactions) {
    if (row.provenance === 'PLATFORM_OBSERVED') sessions.add(row.anonymousSessionId);
  }
  return sessions.size;
}
