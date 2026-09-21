import { createHash } from 'node:crypto';

import { cookies, headers } from 'next/headers';

import { prisma } from '@/server/data/client';
import { getState } from '@/server/data/store';
import { looksLikeToken, newSessionToken } from '@/server/auth/tokens';

/**
 * The anonymous visitor behind a tourist signal.
 *
 * CLAUDE.md section 9: anonymous session identifiers for tourist signals, and
 * a consent flag. A browser gets a random cookie; the session id every signal
 * carries is a hash of it, so neither the cookie nor anything that identifies
 * a person is stored. What the platform can say is "this browser viewed Loktak
 * twice", never who it was.
 *
 * Before this, outside demo mode every signal got a fresh random id, so one
 * visitor looked like a hundred and no count of visitors meant anything.
 */

export const VISITOR_COOKIE = 'mt_visitor';
export const ANALYTICS_COOKIE = 'mt_analytics';
const VISITOR_MAX_AGE_S = 365 * 24 * 60 * 60;

export type AnalyticsChoice = 'yes' | 'no' | 'unset';

export interface Visitor {
  /** The anonymous session id signals are recorded under, or null before the first write. */
  sessionId: string | null;
  choice: AnalyticsChoice;
  /** The browser sent Global Privacy Control. */
  gpc: boolean;
  /** Whether passive signals (views, searches) may be recorded for this visitor. */
  analyticsAllowed: boolean;
}

const sessionIdFor = (token: string): string =>
  `sess-${createHash('sha256').update(token).digest('hex').slice(0, 24)}`;

/**
 * Recording is on unless the visitor said no. Global Privacy Control counts
 * as a no until the visitor explicitly says yes, because it is the browser
 * stating its user's preference before being asked.
 */
export const analyticsAllowed = (choice: AnalyticsChoice, gpc: boolean): boolean =>
  choice === 'yes' || (choice === 'unset' && !gpc);

const parseChoice = (value: string | undefined): AnalyticsChoice =>
  value === 'yes' || value === 'no' ? value : 'unset';

/** Reads the visitor without creating anything. Safe in Server Components. */
export async function readVisitor(): Promise<Visitor> {
  const store = await cookies();
  const token = store.get(VISITOR_COOKIE)?.value;
  const choice = parseChoice(store.get(ANALYTICS_COOKIE)?.value);
  const gpc = (await headers()).get('sec-gpc') === '1';
  return {
    sessionId: looksLikeToken(token) ? sessionIdFor(token) : null,
    choice,
    gpc,
    analyticsAllowed: analyticsAllowed(choice, gpc),
  };
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: VISITOR_MAX_AGE_S,
};

/**
 * Sessions already written to TouristSession, per loaded state. A demo reset
 * empties the table and loads a new state, and with it a new set. A single
 * process-wide set would still believe the rows existed, and the next trip a
 * returning visitor planned would fail its foreign key to TouristSession.
 */
const knownByState = new WeakMap<object, Set<string>>();

function knownSessions(): Set<string> {
  const state = getState();
  let known = knownByState.get(state);
  if (!known) {
    known = new Set<string>();
    knownByState.set(state, known);
  }
  return known;
}

async function recordSession(sessionId: string, consentAnalytics: boolean, choiceMade: boolean): Promise<void> {
  if (!getState().persistent) return;
  const at = new Date();
  await prisma.touristSession.upsert({
    where: { anonymousId: sessionId },
    create: {
      id: sessionId,
      anonymousId: sessionId,
      consentAnalytics,
      createdAt: at,
      lastSeenAt: at,
      ...(choiceMade ? { analyticsChoiceAt: at } : {}),
    },
    update: { consentAnalytics, lastSeenAt: at, ...(choiceMade ? { analyticsChoiceAt: at } : {}) },
  });
  knownSessions().add(sessionId);
}

/** As readVisitor, creating the cookie first. Server Actions and Route Handlers only. */
export async function ensureVisitor(): Promise<Visitor & { sessionId: string }> {
  const visitor = await readVisitor();
  let sessionId = visitor.sessionId;
  if (!sessionId) {
    const token = newSessionToken();
    (await cookies()).set(VISITOR_COOKIE, token, cookieOptions);
    sessionId = sessionIdFor(token);
  }
  if (!knownSessions().has(sessionId)) await recordSession(sessionId, visitor.analyticsAllowed, false);
  return { ...visitor, sessionId };
}

/** Records the visitor's answer to the analytics notice. */
export async function setAnalyticsChoice(choice: 'yes' | 'no'): Promise<Visitor & { sessionId: string }> {
  const visitor = await ensureVisitor();
  (await cookies()).set(ANALYTICS_COOKIE, choice, cookieOptions);
  await recordSession(visitor.sessionId, choice === 'yes', true);
  return { ...visitor, choice, analyticsAllowed: choice === 'yes' };
}

/**
 * The stored choice for a session, for signals raised with no browser in the
 * room — a payment confirmed by a webhook, for instance. A session with no row
 * (demo seed data, tests) has made no choice and is treated as allowed.
 */
export async function analyticsAllowedFor(sessionId: string): Promise<boolean> {
  if (!getState().persistent) return true;
  const row = await prisma.touristSession.findUnique({
    where: { anonymousId: sessionId },
    select: { consentAnalytics: true },
  });
  return row?.consentAnalytics ?? true;
}
