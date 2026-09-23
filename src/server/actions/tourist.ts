'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { now } from '@/lib/config';
import { formatPlanFor, istDate } from '@/lib/journey';
import {
  feedbackCategorySchema,
  type Feedback,
  type OnlineSearchStatus,
  type Trip,
  type TripProfile,
} from '@/lib/types';
import { webSearchAvailable } from '@/lib/ai/web-search';
import { findOnlineFor, findPlaceMediaOnline, findPlaceSnapshot } from '@/server/ai/online-places';
import type { PlaceMedia, PlaceSnapshot } from '@/lib/ai/web-media';
import type { RouteShape } from '@/lib/map';
import { buildTripMap, dayWaypoints } from '@/server/data/trip-map';
import { roadRoute } from '@/server/geo/road-route';
import { buildLogistics, nightsFromItems, stopNamesOf, summariseTrip } from '@/server/ai/trip-logistics';
import { askAboutDestination, type GroundedAnswer } from '@/server/ai/storyteller';
import {
  runDiscoverChat,
  stepsAfterOnline,
  type DiscoverAction,
  type DiscoverChatAnswer,
  type DiscoverFocus,
} from '@/server/ai/discover';
import {
  describeTrip,
  extractTripProfile,
  MAX_TRIP_DAYS,
  planOptions,
  replanTrip,
  windowDays,
  type BuiltTrip,
  type TravelWindow,
  type TripCondition,
} from '@/server/ai/trip-planner';
import { getBusiness, getDestination, getExperience } from '@/server/data/repository';
import { buildDestinationPreview } from '@/server/data/destination-preview';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { createEnquiry, forgetSessionSignals, nextId, submitFeedback } from '@/server/data/store';
import {
  chooseOption,
  deleteTrip,
  deleteTripsForSession,
  discardUnchosenOptions,
  endTrip,
  getCurrentTrip,
  getTripFor,
  listTrips,
  MAX_SAVED_TRIPS,
  saveLogistics,
  saveTrip,
  startTrip,
} from '@/server/data/trips';
import { activeCampaignFor } from '@/server/data/attribution';
import { ensureVisitor, readVisitor, setAnalyticsChoice } from '@/server/telemetry/visitor';
import { ingest, PASSIVE_TYPES } from '@/server/telemetry/ingest';

/**
 * Tourist-side writes.
 *
 * Every one of these produces a PLATFORM_OBSERVED signal, which is what makes
 * the closed loop real rather than illustrated: a check-in or a feedback item
 * created here changes the government views immediately.
 *
 * Signals go through ingest(), never straight to the store, so a visitor who
 * opted out is not recorded and a repeat is not counted twice. The feature
 * itself still works for them: declining analytics never breaks a page.
 */

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const planInput = z.object({
  request: z.string().min(3).max(600),
  durationDays: z.coerce.number().int().min(1).max(10).optional(),
  interests: z.array(z.string()).optional(),
  budget: z.enum(['BUDGET', 'MODERATE', 'PREMIUM']).optional(),
  crowdPreference: z.enum(['QUIET', 'BALANCED', 'POPULAR']).optional(),
  accessibility: z.enum(['NONE', 'LOW_MOBILITY', 'SENIOR_FRIENDLY', 'FAMILY_WITH_CHILDREN']).optional(),
  travellers: z.coerce.number().int().min(1).max(20).optional(),
  budgetAmount: z.coerce.number().int().min(500).max(10_000_000).optional(),
  window: z
    .object({
      startDate: dateText,
      endDate: dateText,
      arriveTime: timeText.optional(),
      departTime: timeText.optional(),
    })
    .optional(),
});

/** A travel window the planner can use, or the reason it cannot. */
function checkWindow(window: TravelWindow): string | undefined {
  if (window.startDate < istDate(now())) return 'The trip cannot start before today.';
  if (window.endDate < window.startDate) return 'The trip ends before it starts. Check the dates.';
  const span = (Date.parse(window.endDate) - Date.parse(window.startDate)) / 86_400_000 + 1;
  if (span > MAX_TRIP_DAYS) return `The planner builds trips of up to ${MAX_TRIP_DAYS} days.`;
  if (window.startDate === window.endDate && window.arriveTime && window.departTime && window.departTime <= window.arriveTime) {
    return 'On a one-day trip, departure has to be after arrival.';
  }
  return undefined;
}

/** What the planner's reply shows for each option. */
export interface PlanOptionView {
  tripId: string;
  label: string;
  summary: string;
  theme: string;
  days: number;
  stopNames: string[];
  experiences: number;
  nights: number;
  partnerNights: number;
  guides: number;
  /** The estimate from partner rates, in rupees. */
  cost: number;
  fitsBudget?: boolean;
}

export interface PlanResult {
  ok: boolean;
  error?: string;
  /** The best match, for callers that want one trip. */
  trip?: Trip;
  profile?: TripProfile;
  groupId?: string;
  options?: PlanOptionView[];
  notIncluded?: BuiltTrip['notIncluded'];
  introduction?: string;
  provider?: string;
  /** The destinations of the best match, in order. */
  stopNames?: string[];
  /** "17 Sep 10:00 → 19 Sep 2026 18:00", when dates were given. */
  planFor?: string;
  /** Whether a web search for places that are not partners can follow. */
  searchOnline?: boolean;
}

function optionView(trip: Trip, label: string, summary: string): PlanOptionView {
  return {
    tripId: trip.id,
    label,
    summary,
    theme: trip.theme,
    days: trip.preferences.durationDays,
    ...summariseTrip(trip),
  };
}

/**
 * E1: plans two or three options for one request. The visitor chooses one;
 * nothing is kept past the next request until they do.
 */
export async function planTrip(input: unknown): Promise<PlanResult> {
  const parsed = planInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Tell us a little about the trip you want, in a sentence or two.' };
  }
  const window = parsed.data.window;
  const problem = window ? checkWindow(window) : undefined;
  if (problem) return { ok: false, error: problem };

  const visitor = await ensureVisitor();
  const sessionId = visitor.sessionId;
  const overrides: Partial<TripProfile> = {};
  if (parsed.data.durationDays) overrides.durationDays = parsed.data.durationDays;
  if (parsed.data.budget) overrides.budget = parsed.data.budget;
  if (parsed.data.crowdPreference) overrides.crowdPreference = parsed.data.crowdPreference;
  if (parsed.data.accessibility) overrides.accessibility = parsed.data.accessibility;
  if (parsed.data.travellers) overrides.travellers = parsed.data.travellers;
  if (parsed.data.budgetAmount) overrides.budgetAmount = parsed.data.budgetAmount;
  if (window) overrides.durationDays = windowDays(window);

  const profile = extractTripProfile(parsed.data.request, overrides);

  // Chips are additive: a tapped interest is added to what the text implied.
  if (parsed.data.interests && parsed.data.interests.length > 0) {
    const merged = new Set([...profile.interests, ...parsed.data.interests]);
    profile.interests = [...merged] as TripProfile['interests'];
  }

  await ingest(visitor, {
    type: 'SEARCH',
    metadata: { request: parsed.data.request.slice(0, 180), interests: profile.interests.join(',') },
  });

  const options = planOptions(profile, sessionId, window);
  const best = options[0]!;
  if (best.trip.items.length === 0) {
    return {
      ok: false,
      error: window?.arriveTime || window?.departTime
        ? 'Nothing fits between those arrival and departure times. Try a longer window.'
        : 'No destination matched those preferences. Try widening the interests.',
    };
  }

  // A new request replaces options that were never chosen; chosen journeys stay.
  // Saved last to first, so the best match is the most recent and lists first.
  for (const option of [...options].reverse()) await saveTrip(option.trip);
  await discardUnchosenOptions(sessionId, best.trip.optionGroupId!);

  const introduction = await describeTrip(best.trip, best.notIncluded);

  revalidatePath('/explore', 'layout');

  const planFor = formatPlanFor(best.trip);
  return {
    ok: true,
    trip: best.trip,
    profile: best.trip.preferences,
    groupId: best.trip.optionGroupId!,
    options: options.map((option) => optionView(option.trip, option.label, option.summary)),
    notIncluded: best.notIncluded,
    introduction: introduction.text,
    provider: introduction.fallback ? `${introduction.provider} (fallback)` : introduction.provider,
    stopNames: stopNamesOf(best.trip),
    ...(planFor ? { planFor } : {}),
    searchOnline: webSearchAvailable(),
  };
}

const conditionInput = z.enum(['RAIN', 'SHORT_ON_TIME', 'CLOSURE']);

/** Re-plans the visitor's current journey: the one the live trip follows. */
export async function replanCurrentTrip(condition: TripCondition): Promise<PlanResult> {
  const visitor = await ensureVisitor();
  return replanFor(visitor, await getCurrentTrip(visitor.sessionId), condition);
}

/** Re-plans one of the visitor's journeys, from its own page. */
export async function replanJourney(tripId: unknown, condition: unknown): Promise<PlanResult> {
  const id = tripIdInput.safeParse(tripId);
  const visitor = await ensureVisitor();
  const trip = id.success ? await getTripFor(visitor.sessionId, id.data) : undefined;
  if (!trip) return { ok: false, error: 'That trip could not be found.' };
  return replanFor(visitor, trip, condition);
}

async function replanFor(
  visitor: Awaited<ReturnType<typeof ensureVisitor>>,
  trip: Trip | undefined,
  condition: unknown,
): Promise<PlanResult> {
  if (!trip) return { ok: false, error: 'Plan a trip first.' };
  const parsed = conditionInput.safeParse(condition);
  if (!parsed.success) return { ok: false, error: 'Choose what changed.' };

  const replanned = await saveTrip(replanTrip(trip, parsed.data));

  await ingest(visitor, { type: 'SEARCH', tripId: trip.id, metadata: { replan: parsed.data } });

  revalidatePath('/explore', 'layout');
  return { ok: true, trip: replanned, profile: replanned.preferences };
}

export async function checkIn(destinationId: string, consentLocation: boolean) {
  if (!consentLocation) {
    return { ok: false as const, error: 'Check-in needs your consent, which you can withdraw at any time.' };
  }

  const visitor = await ensureVisitor();
  const trip = await getCurrentTrip(visitor.sessionId);
  const result = await ingest(visitor, {
    type: 'QR_CHECKIN',
    destinationId,
    metadata: { consent: true },
    ...(trip ? { tripId: trip.id } : {}),
  });
  if (result.outcome === 'UNKNOWN_REFERENCE') {
    return { ok: false as const, error: 'That check-in point is not recognised.' };
  }
  // A second scan the same day is not an error to the visitor: they are
  // checked in. It is simply not counted twice.

  revalidatePath('/explore', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true as const };
}

/** The visitor's answer to the analytics notice, or a later change of mind. */
export async function chooseAnalytics(choice: 'yes' | 'no'): Promise<{ ok: boolean }> {
  await setAnalyticsChoice(choice === 'yes' ? 'yes' : 'no');
  revalidatePath('/explore', 'layout');
  return { ok: true };
}

/** Stops counting and removes what this browser was already counted for. */
export async function forgetMyVisits(): Promise<{ ok: boolean; removed: number }> {
  const visitor = await setAnalyticsChoice('no');
  const removed = await forgetSessionSignals(visitor.sessionId, PASSIVE_TYPES);
  revalidatePath('/explore', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, removed };
}

const feedbackInput = z.object({
  destinationId: z.string().min(1),
  experienceId: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  category: feedbackCategorySchema,
  text: z.string().min(3).max(600),
});

export async function submitTouristFeedback(
  input: unknown,
): Promise<{ ok: boolean; error?: string; feedback?: Feedback }> {
  const parsed = feedbackInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Choose a rating and a category, and write a short comment.' };
  }

  const visitor = await ensureVisitor();
  const trip = await getCurrentTrip(visitor.sessionId);
  const { rating } = parsed.data;

  const entry = await submitFeedback({
    destinationId: parsed.data.destinationId,
    rating,
    category: parsed.data.category,
    text: parsed.data.text,
    sentiment: rating >= 4 ? 'POSITIVE' : rating === 3 ? 'NEUTRAL' : 'NEGATIVE',
    anonymousSessionId: visitor.sessionId,
    ...(parsed.data.experienceId ? { experienceId: parsed.data.experienceId } : {}),
    ...(trip ? { tripId: trip.id } : {}),
    ...(activeCampaignFor(parsed.data.destinationId)
      ? { campaignId: activeCampaignFor(parsed.data.destinationId)! }
      : {}),
  });

  revalidatePath('/explore', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, feedback: entry };
}

export async function askPlace(
  destinationId: string,
  question: string,
): Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }> {
  if (!question.trim()) return { ok: false, error: 'Type a question about this place.' };

  const answer = await askAboutDestination(destinationId, question.trim());
  await ingest(await ensureVisitor(), {
    type: 'SEARCH',
    destinationId,
    metadata: { askedAboutPlace: question.slice(0, 160) },
    // Asking about a place is curiosity, not a response to a campaign.
    attribution: 'none',
  });
  revalidatePath('/gov', 'layout');
  return { ok: true, answer };
}

const discoverChatInput = z.object({
  message: z.string().min(1).max(300),
  focus: z
    .object({
      destinationId: z.string().optional(),
      experienceId: z.string().optional(),
    })
    .optional(),
});

/** The Discover chat: one message, plus whatever the previous turn's reply set as `focus`. See server/ai/discover.ts. */
export async function discoverChat(input: unknown): Promise<{ ok: boolean; error?: string; answer?: DiscoverChatAnswer }> {
  const parsed = discoverChatInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Type a message.' };

  const answer = await runDiscoverChat(parsed.data.message.trim(), parsed.data.focus as DiscoverFocus | undefined);
  await ingest(await ensureVisitor(), {
    type: 'SEARCH',
    metadata: { discover: parsed.data.message.slice(0, 160), kind: answer.kind },
  });
  revalidatePath('/gov', 'layout');
  return { ok: true, answer };
}

/** The same "Explore" popup used on a trip's stops, fetched for a place clicked in the Discover chat. */
export async function getDestinationPreview(destinationId: unknown): Promise<{ ok: boolean; error?: string; data?: DestinationDetailsData }> {
  const parsed = z.string().min(1).max(64).safeParse(destinationId);
  if (!parsed.success) return { ok: false, error: 'That place could not be found.' };
  const destination = getDestination(parsed.data);
  if (!destination) return { ok: false, error: 'That place could not be found.' };
  return { ok: true, data: buildDestinationPreview(destination) };
}

/**
 * What the web has about a place in the Discover chat: Wikipedia, photos,
 * verified YouTube videos and grounded facts. Takes a destination id, never
 * free text, so only the place's own name leaves the platform.
 */
export async function discoverPlaceOnline(destinationId: unknown): Promise<{
  ok: boolean;
  error?: string;
  media?: PlaceMedia;
  actions?: DiscoverAction[];
}> {
  const parsed = z.string().min(1).max(64).safeParse(destinationId);
  const destination = parsed.success ? getDestination(parsed.data) : undefined;
  if (!destination) return { ok: false, error: 'That place could not be found.' };

  const visitor = await ensureVisitor();
  const media = await findPlaceMediaOnline(visitor.sessionId, destination.name, destination.district);
  await ingest(visitor, {
    type: 'SEARCH',
    destinationId: destination.id,
    metadata: { discoverOnline: true },
    attribution: 'none',
  });
  return { ok: true, media, actions: stepsAfterOnline(destination) };
}

/**
 * The Trip map's roads, one route per day, fetched after the map has drawn so
 * the page never waits on the router. Reads the trip with the session, so an
 * id from another browser gets nothing.
 */
export async function tripRoutes(tripId: unknown): Promise<{ ok: boolean; routes?: RouteShape[] }> {
  const parsed = z.string().min(1).max(64).safeParse(tripId);
  if (!parsed.success) return { ok: false };
  const { sessionId } = await readVisitor();
  const trip = await getTripFor(sessionId, parsed.data);
  if (!trip) return { ok: false };
  const days = dayWaypoints(buildTripMap(trip));
  const routes = await Promise.all(
    days.map(async ({ day, points }) => ({ day, ...(await roadRoute(points)) })),
  );
  return { ok: true, routes };
}

/** A photograph and short summary of a place for the map's card, from Wikipedia. */
export async function mapPlaceSnapshot(destinationId: unknown): Promise<{ ok: boolean; snapshot?: PlaceSnapshot }> {
  const parsed = z.string().min(1).max(64).safeParse(destinationId);
  const destination = parsed.success ? getDestination(parsed.data) : undefined;
  if (!destination) return { ok: false };
  return { ok: true, snapshot: await findPlaceSnapshot(destination.name, destination.district) };
}

const enquiryInput = z.object({
  experienceId: z.string().min(1),
  partySize: z.coerce.number().int().min(1).max(20),
  preferredDate: z.string().min(4),
  note: z.string().max(400).optional(),
});

export async function sendEnquiry(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = enquiryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a party size and a date.' };

  const experience = getExperience(parsed.data.experienceId);
  if (!experience) return { ok: false, error: 'That experience is no longer listed.' };

  const visitor = await ensureVisitor();
  const sessionId = visitor.sessionId;
  await createEnquiry({
    id: nextId('enq-live'),
    experienceId: experience.id,
    businessId: experience.businessId,
    anonymousSessionId: sessionId,
    partySize: parsed.data.partySize,
    preferredDate: parsed.data.preferredDate,
    status: 'SUBMITTED',
    createdAt: now().toISOString(),
    provenance: 'PLATFORM_OBSERVED',
    ...(parsed.data.note ? { note: parsed.data.note } : {}),
  });

  await ingest(visitor, {
    type: 'BOOKING',
    destinationId: experience.destinationId,
    experienceId: experience.id,
  });

  revalidatePath('/explore', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true };
}

/** Digits, with an optional leading +; 10 to 15 of them. */
const chatPhoneInput = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine((value) => /^\+?\d{10,15}$/.test(value), 'Enter a phone number the host can call.');

const chatEnquiryInput = z
  .object({
    experienceId: z.string().min(1).optional(),
    businessId: z.string().min(1).optional(),
    contactName: z.string().trim().min(2, 'Enter a name.').max(120),
    contactPhone: chatPhoneInput,
    message: z.string().trim().max(500).optional(),
  })
  .refine((data) => Boolean(data.experienceId || data.businessId), { message: 'Missing what this enquiry is about.' });

/**
 * The chat agent's enquiry: a plain conversation collects a name, a phone
 * number and a message, rather than the party-size-and-date form. It can
 * name an experience, or (for a stay with no experience of its own) the
 * business directly.
 */
export async function sendChatEnquiry(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = chatEnquiryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };

  const experience = parsed.data.experienceId ? getExperience(parsed.data.experienceId) : undefined;
  if (parsed.data.experienceId && !experience) return { ok: false, error: 'That experience is no longer listed.' };

  const business = experience ? getBusiness(experience.businessId) : getBusiness(parsed.data.businessId ?? '');
  if (!business) return { ok: false, error: 'That listing is no longer available.' };

  const visitor = await ensureVisitor();
  await createEnquiry({
    id: nextId('enq-live'),
    ...(experience ? { experienceId: experience.id } : {}),
    businessId: business.id,
    anonymousSessionId: visitor.sessionId,
    contactName: parsed.data.contactName,
    contactPhone: parsed.data.contactPhone,
    ...(parsed.data.message ? { message: parsed.data.message } : {}),
    status: 'SUBMITTED',
    createdAt: now().toISOString(),
    provenance: 'PLATFORM_OBSERVED',
  });

  await ingest(visitor, {
    type: 'BOOKING',
    destinationId: experience?.destinationId ?? business.destinationId,
    ...(experience ? { experienceId: experience.id } : {}),
  });

  revalidatePath('/explore', 'layout');
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true };
}

const tripIdInput = z.string().min(1).max(64);

/**
 * Finalises one option of a plan: it becomes a kept journey and the other
 * options go. A trip id is not a credential: every trip action is scoped to
 * the visitor's own session, so another visitor's id reaches nothing.
 *
 * Choosing is what counts as putting places on an itinerary, so the demand
 * signals are raised here, once, rather than for every option shown.
 */
export async function chooseJourney(tripId: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = tripIdInput.safeParse(tripId);
  if (!id.success) return { ok: false, error: 'That plan could not be found.' };
  const visitor = await ensureVisitor();
  const { outcome, trip } = await chooseOption(visitor.sessionId, id.data);
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'That plan could not be found. It may have been replaced by a newer one.' };
  if (outcome === 'LIMIT_REACHED') {
    return { ok: false, error: `You already keep ${MAX_SAVED_TRIPS} trips. Delete one to keep this one.` };
  }
  if (outcome === 'CHOSEN' && trip) {
    for (const item of trip.items) {
      if (item.kind !== 'DESTINATION') continue;
      await ingest(visitor, {
        type: 'ITINERARY_ADD',
        destinationId: item.destinationId,
        tripId: trip.id,
        metadata: { day: item.day },
      });
    }
    revalidatePath('/gov', 'layout');
  }
  revalidatePath('/explore', 'layout');
  return { ok: true };
}

/** Starts a finalised journey: from now on it is the current one. */
export async function startJourney(tripId: unknown): Promise<{ ok: boolean; error?: string; ended?: string }> {
  const id = tripIdInput.safeParse(tripId);
  if (!id.success) return { ok: false, error: 'That trip could not be found.' };
  const visitor = await ensureVisitor();
  const { outcome, ended } = await startTrip(visitor.sessionId, id.data);
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'That trip could not be found.' };
  if (outcome === 'NOT_CHOSEN') return { ok: false, error: 'Choose this plan first, then start it.' };
  revalidatePath('/explore', 'layout');
  return { ok: true, ...(ended ? { ended: ended.theme } : {}) };
}

/** Ends the journey under way. */
export async function endJourney(tripId: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = tripIdInput.safeParse(tripId);
  if (!id.success) return { ok: false, error: 'That trip could not be found.' };
  const visitor = await ensureVisitor();
  const outcome = await endTrip(visitor.sessionId, id.data);
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'That trip could not be found.' };
  if (outcome === 'NOT_STARTED') return { ok: false, error: 'This trip has not been started.' };
  revalidatePath('/explore', 'layout');
  return { ok: true };
}

export interface OnlineSearchResult {
  ok: boolean;
  status: OnlineSearchStatus;
  found: number;
  error?: string;
}

/**
 * Looks online for stays, guides and transport that are not partners, for
 * every option of a plan (a group id) or for one journey (a trip id). What is
 * found is stored on each plan, labelled as found online.
 */
export async function findPlacesOnline(planOrTripId: unknown): Promise<OnlineSearchResult> {
  const id = tripIdInput.safeParse(planOrTripId);
  if (!id.success) return { ok: false, status: 'FAILED', found: 0, error: 'That plan could not be found.' };
  const visitor = await ensureVisitor();
  const trips = (await listTrips(visitor.sessionId)).filter(
    (trip) => trip.id === id.data || trip.optionGroupId === id.data,
  );
  if (trips.length === 0) return { ok: false, status: 'FAILED', found: 0, error: 'That plan could not be found.' };

  const result = await findOnlineFor(visitor.sessionId, trips);
  if (result.status === 'LIMITED') {
    return { ok: false, status: 'LIMITED', found: 0, error: 'Online search is paused for a while: this browser has used its searches for the hour.' };
  }
  for (const trip of trips) {
    const logistics = trip.logistics ?? buildLogistics(trip, nightsFromItems(trip));
    const areas = new Set([...trip.items.map((item) => item.destinationId), ...logistics.stays.map((stay) => stay.destinationId)]);
    await saveLogistics(visitor.sessionId, trip.id, {
      ...logistics,
      online: {
        status: result.status,
        ...(result.checkedAt ? { checkedAt: result.checkedAt } : {}),
        places: result.places.filter((place) => areas.has(place.destinationId)),
      },
    });
  }
  revalidatePath('/explore', 'layout');
  return { ok: result.status === 'FOUND' || result.status === 'NONE_FOUND', status: result.status, found: result.places.length };
}

/** Deletes one of the visitor's journeys. */
export async function deleteJourney(tripId: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = tripIdInput.safeParse(tripId);
  const visitor = await ensureVisitor();
  if (!id.success || !(await deleteTrip(visitor.sessionId, id.data))) {
    return { ok: false, error: 'That trip could not be found.' };
  }
  revalidatePath('/explore', 'layout');
  return { ok: true };
}

/** Deletes every journey this browser has planned or saved. */
export async function deleteMyJourneys(): Promise<{ ok: boolean; removed: number }> {
  const visitor = await ensureVisitor();
  const removed = await deleteTripsForSession(visitor.sessionId);
  revalidatePath('/explore', 'layout');
  return { ok: true, removed };
}
