'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { now } from '@/lib/config';
import {
  feedbackCategorySchema,
  type Feedback,
  type Trip,
  type TripProfile,
} from '@/lib/types';
import { askAboutDestination, type GroundedAnswer } from '@/server/ai/storyteller';
import {
  buildItinerary,
  describeTrip,
  extractTripProfile,
  replanTrip,
  type BuiltTrip,
  type TripCondition,
} from '@/server/ai/trip-planner';
import { getExperience } from '@/server/data/repository';
import { createEnquiry, forgetSessionSignals, nextId, submitFeedback } from '@/server/data/store';
import {
  deleteTrip,
  deleteTripsForSession,
  discardOtherDrafts,
  getCurrentTrip,
  markTripSaved,
  MAX_SAVED_TRIPS,
  saveTrip,
  switchToTrip,
} from '@/server/data/trips';
import { activeCampaignFor } from '@/server/data/attribution';
import { ensureVisitor, setAnalyticsChoice } from '@/server/telemetry/visitor';
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

const planInput = z.object({
  request: z.string().min(3).max(600),
  durationDays: z.coerce.number().int().min(1).max(10).optional(),
  interests: z.array(z.string()).optional(),
  budget: z.enum(['BUDGET', 'MODERATE', 'PREMIUM']).optional(),
  crowdPreference: z.enum(['QUIET', 'BALANCED', 'POPULAR']).optional(),
  accessibility: z.enum(['NONE', 'LOW_MOBILITY', 'SENIOR_FRIENDLY', 'FAMILY_WITH_CHILDREN']).optional(),
});

export interface PlanResult {
  ok: boolean;
  error?: string;
  trip?: Trip;
  profile?: TripProfile;
  notIncluded?: BuiltTrip['notIncluded'];
  introduction?: string;
  provider?: string;
}

export async function planTrip(input: unknown): Promise<PlanResult> {
  const parsed = planInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Tell us a little about the trip you want, in a sentence or two.' };
  }

  const visitor = await ensureVisitor();
  const sessionId = visitor.sessionId;
  const overrides: Partial<TripProfile> = {};
  if (parsed.data.durationDays) overrides.durationDays = parsed.data.durationDays;
  if (parsed.data.budget) overrides.budget = parsed.data.budget;
  if (parsed.data.crowdPreference) overrides.crowdPreference = parsed.data.crowdPreference;
  if (parsed.data.accessibility) overrides.accessibility = parsed.data.accessibility;

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

  const built = buildItinerary(profile, sessionId);
  const { notIncluded } = built;
  if (built.trip.items.length === 0) {
    return { ok: false, error: 'No destination matched those preferences. Try widening the interests.' };
  }

  // Stored before the signals below, which reference it. A new plan replaces
  // the visitor's previous draft; journeys they saved are left alone.
  const trip = await saveTrip({ ...built.trip, status: 'DRAFT' });
  await discardOtherDrafts(sessionId, trip.id);

  // Each stop placed on a plan is a real itinerary addition signal.
  for (const item of trip.items) {
    if (item.kind !== 'DESTINATION') continue;
    await ingest(visitor, {
      type: 'ITINERARY_ADD',
      destinationId: item.destinationId,
      tripId: trip.id,
      metadata: { day: item.day },
    });
  }

  const introduction = await describeTrip(trip, notIncluded);

  revalidatePath('/explore', 'layout');
  revalidatePath('/gov', 'layout');

  return {
    ok: true,
    trip,
    profile,
    notIncluded,
    introduction: introduction.text,
    provider: introduction.fallback ? `${introduction.provider} (fallback)` : introduction.provider,
  };
}

export async function replanCurrentTrip(condition: TripCondition): Promise<PlanResult> {
  const visitor = await ensureVisitor();
  const trip = await getCurrentTrip(visitor.sessionId);
  if (!trip) return { ok: false, error: 'Plan a journey first.' };

  const replanned = await saveTrip(replanTrip(trip, condition));

  await ingest(visitor, { type: 'SEARCH', tripId: trip.id, metadata: { replan: condition } });

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

const tripIdInput = z.string().min(1).max(64);

/**
 * Keeps a planned journey, so the next plan does not replace it. A trip id is
 * not a credential: every trip action is scoped to the visitor's own session,
 * so another visitor's id reaches nothing.
 */
export async function saveCurrentTrip(tripId: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = tripIdInput.safeParse(tripId);
  if (!id.success) return { ok: false, error: 'That journey could not be found.' };
  const visitor = await ensureVisitor();
  const outcome = await markTripSaved(visitor.sessionId, id.data);
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'That journey could not be found.' };
  if (outcome === 'LIMIT_REACHED') {
    return {
      ok: false,
      error: `You already have ${MAX_SAVED_TRIPS} saved journeys. Delete one to keep this one.`,
    };
  }
  revalidatePath('/explore', 'layout');
  return { ok: true };
}

/** Makes one of the visitor's saved journeys their current one. */
export async function switchJourney(tripId: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = tripIdInput.safeParse(tripId);
  const visitor = await ensureVisitor();
  if (!id.success || !(await switchToTrip(visitor.sessionId, id.data))) {
    return { ok: false, error: 'That journey could not be found.' };
  }
  revalidatePath('/explore', 'layout');
  return { ok: true };
}

/** Deletes one of the visitor's journeys. */
export async function deleteJourney(tripId: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = tripIdInput.safeParse(tripId);
  const visitor = await ensureVisitor();
  if (!id.success || !(await deleteTrip(visitor.sessionId, id.data))) {
    return { ok: false, error: 'That journey could not be found.' };
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
