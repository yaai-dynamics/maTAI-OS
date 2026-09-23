import { randomBytes } from 'node:crypto';

import { now } from '@/lib/config';
import type {
  AccommodationSnapshot,
  Campaign,
  CampaignContent,
  CreatorApplication,
  Enquiry,
  Feedback,
  Creator,
  LandingPage,
  Payout,
  TourismBusiness,
  TourismInteraction,
  Trip,
} from '@/lib/types';
import { generateSignals } from '@/server/data/generate';
import { loadState } from '@/server/data/load';
import {
  deleteInteractionsForSession,
  persistApplication,
  persistAvailability,
  persistBusiness,
  persistCampaign,
  persistContent,
  persistCreator,
  persistEnquiry,
  persistFeedback,
  persistInteraction,
  persistLandingPage,
} from '@/server/data/persist';
import { seed } from '@/server/data/seed';

/**
 * In-memory tourism data store.
 *
 * The prototype deliberately runs on a seeded in-memory store rather than a
 * database so the demo needs no external service (CLAUDE.md section 3). The
 * repository boundary in src/server/data/repository.ts is the only thing the
 * rest of the application talks to, so a relational implementation can replace
 * this without touching the analytics, AI or UI layers. prisma/schema.prisma
 * holds the relational shape for that path.
 */

export interface MutableState {
  interactions: TourismInteraction[];
  feedback: Feedback[];
  accommodationSnapshots: AccommodationSnapshot[];
  enquiries: Enquiry[];
  payouts: Payout[];
  campaigns: Campaign[];
  applications: CreatorApplication[];
  campaignContent: CampaignContent[];
  /**
   * Mutable from Phase 1 onwards: partners onboard themselves, are verified and
   * report availability, so the supply side is no longer a fixed seed list.
   */
  businesses: TourismBusiness[];
  /** Mutable from Phase 3: creators onboard themselves and are then verified. */
  creators: Creator[];
  /** AI-generated microsites, for a partner's own business or a campaign/festival. */
  landingPages: LandingPage[];
  /**
   * Trips when there is no database (the unit suite). With MySQL they are
   * read and written by src/server/data/trips.ts directly and this stays empty.
   */
  trips: Trip[];
  /** Ids of records created during this session, used for the demo highlight. */
  sessionRecordIds: Set<string>;
  /**
   * True when the cache is backed by MySQL, so writes are mirrored to it.
   * False for the seed-built state the unit tests run against.
   */
  persistent: boolean;
  createdAt: string;
}

function buildState(): MutableState {
  const generated = generateSignals(seed);
  return {
    interactions: [...generated.interactions],
    feedback: [...seed.feedback, ...generated.feedback].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    ),
    accommodationSnapshots: [...generated.accommodationSnapshots],
    enquiries: [...generated.enquiries],
    payouts: [...generated.payouts],
    businesses: seed.businesses.map((business) => ({ ...business })),
    creators: seed.creators.map((creator) => ({ ...creator })),
    campaigns: seed.campaigns.map((campaign) => ({ ...campaign })),
    applications: seed.applications.map((application) => ({ ...application })),
    campaignContent: seed.campaignContent.map((content) => ({ ...content })),
    landingPages: seed.landingPages.map((page) => ({ ...page })),
    trips: [],
    sessionRecordIds: new Set<string>(),
    persistent: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Survives hot reload in development so demo state is not lost on every edit.
 *
 * The version is part of the identity: adding a collection to MutableState used
 * to leave a stale object in place across a reload, and the new field read as
 * undefined. Bumping it discards state whose shape no longer matches.
 */
const STATE_VERSION = 5;

const globalForStore = globalThis as unknown as {
  __manipurState?: MutableState;
  __manipurStateVersion?: number;
};

/**
 * Loads the working set out of MySQL into the cache.
 *
 * Called once at server start from instrumentation.ts. Reads stay synchronous
 * afterwards, which is what lets the analytics modules keep their shape:
 * computeDemand loops over destinations, so a per-call query would be an N+1.
 */
export async function initState(): Promise<void> {
  const loaded = await loadState();
  globalForStore.__manipurState = {
    ...loaded,
    trips: [],
    sessionRecordIds: new Set<string>(),
    persistent: true,
    createdAt: new Date().toISOString(),
  };
  globalForStore.__manipurStateVersion = STATE_VERSION;
}

/** Discards local changes and re-reads the database. */
export async function reloadState(): Promise<void> {
  await initState();
}

export function getState(): MutableState {
  if (!globalForStore.__manipurState || globalForStore.__manipurStateVersion !== STATE_VERSION) {
    globalForStore.__manipurState = buildState();
    globalForStore.__manipurStateVersion = STATE_VERSION;
  }
  return globalForStore.__manipurState;
}

/** Returns the store to its deterministic seeded state. */
export function resetState(): void {
  globalForStore.__manipurState = buildState();
  globalForStore.__manipurStateVersion = STATE_VERSION;
}

/**
 * An id for a record created while the platform runs: creation time, then
 * enough randomness that two processes cannot collide.
 *
 * This was a per-process counter (int-live-0001, 0002, ...). Every restart
 * began again at 0001 while MySQL still held the rows from before it, so after
 * a restart new signals were rejected as duplicates, feedback failed to save,
 * and a new campaign, business or creator — written with an upsert — replaced
 * an existing one.
 */
export function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
}

function markSession(id: string): void {
  getState().sessionRecordIds.add(id);
}

export const isSessionRecord = (id: string): boolean => getState().sessionRecordIds.has(id);

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export interface RecordInteractionInput {
  anonymousSessionId: string;
  type: TourismInteraction['type'];
  destinationId?: string;
  experienceId?: string;
  tripId?: string;
  campaignId?: string;
  metadata?: TourismInteraction['metadata'];
  clientEventId?: string;
}

export async function recordInteraction(input: RecordInteractionInput): Promise<TourismInteraction> {
  const state = getState();
  const interaction: TourismInteraction = {
    id: nextId('int-live'),
    anonymousSessionId: input.anonymousSessionId,
    type: input.type,
    timestamp: now().toISOString(),
    // Interactions produced by real use of the platform are observed, not synthetic,
    // even in demo mode. The distinction is what makes the closed loop honest.
    provenance: 'PLATFORM_OBSERVED',
    metadata: input.metadata ?? {},
    ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    ...(input.experienceId ? { experienceId: input.experienceId } : {}),
    ...(input.tripId ? { tripId: input.tripId } : {}),
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    ...(input.clientEventId ? { clientEventId: input.clientEventId } : {}),
  };
  if (state.persistent) {
    // Written before it is cached: a unique clientEventId that already exists
    // is rejected here, and must not leave a duplicate in the cache.
    await persistInteraction(interaction);
  }
  state.interactions.push(interaction);
  markSession(interaction.id);
  return interaction;
}

export interface SubmitFeedbackInput {
  destinationId: string;
  experienceId?: string;
  tripId?: string;
  anonymousSessionId: string;
  rating: number;
  category: Feedback['category'];
  text: string;
  language?: string;
  sentiment: Feedback['sentiment'];
  campaignId?: string;
}

export async function submitFeedback(input: SubmitFeedbackInput): Promise<Feedback> {
  const state = getState();
  const entry: Feedback = {
    id: nextId('fb-live'),
    destinationId: input.destinationId,
    rating: input.rating,
    category: input.category,
    text: input.text,
    language: input.language ?? 'English',
    sentiment: input.sentiment,
    anonymized: true,
    createdAt: now().toISOString(),
    provenance: 'PLATFORM_OBSERVED',
    ...(input.experienceId ? { experienceId: input.experienceId } : {}),
    ...(input.tripId ? { tripId: input.tripId } : {}),
  };
  state.feedback.push(entry);
  markSession(entry.id);
  if (state.persistent) await persistFeedback(entry);

  await recordInteraction({
    anonymousSessionId: input.anonymousSessionId,
    type: 'FEEDBACK',
    destinationId: input.destinationId,
    metadata: { feedbackId: entry.id, rating: input.rating },
    ...(input.experienceId ? { experienceId: input.experienceId } : {}),
    ...(input.tripId ? { tripId: input.tripId } : {}),
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
  });

  return entry;
}

export async function createCampaign(campaign: Campaign): Promise<Campaign> {
  const state = getState();
  state.campaigns.push(campaign);
  markSession(campaign.id);
  if (state.persistent) await persistCampaign(campaign);
  return campaign;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign | undefined> {
  const state = getState();
  const index = state.campaigns.findIndex((c) => c.id === id);
  if (index < 0) return undefined;
  const updated = { ...state.campaigns[index]!, ...patch };
  state.campaigns[index] = updated;
  markSession(id);
  if (state.persistent) await persistCampaign(updated);
  return updated;
}

export async function upsertApplication(application: CreatorApplication): Promise<CreatorApplication> {
  const state = getState();
  const index = state.applications.findIndex(
    (a) => a.campaignId === application.campaignId && a.creatorId === application.creatorId,
  );
  if (index >= 0) {
    state.applications[index] = { ...state.applications[index]!, ...application };
    markSession(state.applications[index]!.id);
    if (state.persistent) await persistApplication(state.applications[index]!);
    return state.applications[index]!;
  }
  state.applications.push(application);
  markSession(application.id);
  if (state.persistent) await persistApplication(application);
  return application;
}

export async function submitContent(content: CampaignContent): Promise<CampaignContent> {
  const state = getState();
  state.campaignContent.push(content);
  markSession(content.id);
  if (state.persistent) await persistContent(content);
  return content;
}

export async function updateContent(id: string, patch: Partial<CampaignContent>): Promise<CampaignContent | undefined> {
  const state = getState();
  const index = state.campaignContent.findIndex((c) => c.id === id);
  if (index < 0) return undefined;
  const updated = { ...state.campaignContent[index]!, ...patch };
  state.campaignContent[index] = updated;
  markSession(id);
  if (state.persistent) await persistContent(updated);
  return updated;
}

export async function createEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  const state = getState();
  state.enquiries.push(enquiry);
  markSession(enquiry.id);
  if (state.persistent) await persistEnquiry(enquiry);
  return enquiry;
}

export async function updateEnquiry(id: string, patch: Partial<Enquiry>): Promise<Enquiry | undefined> {
  const state = getState();
  const index = state.enquiries.findIndex((e) => e.id === id);
  if (index < 0) return undefined;
  const updated = { ...state.enquiries[index]!, ...patch };
  state.enquiries[index] = updated;
  markSession(id);
  if (state.persistent) await persistEnquiry(updated);
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Supply side (Phase 1)                                                      */
/* -------------------------------------------------------------------------- */

export async function registerBusiness(business: TourismBusiness): Promise<TourismBusiness> {
  const state = getState();
  state.businesses.push(business);
  markSession(business.id);
  if (state.persistent) await persistBusiness(business);
  return business;
}

export async function updateBusiness(
  id: string,
  patch: Partial<TourismBusiness>,
): Promise<TourismBusiness | undefined> {
  const state = getState();
  const index = state.businesses.findIndex((b) => b.id === id);
  if (index < 0) return undefined;
  const updated = { ...state.businesses[index]!, ...patch };
  state.businesses[index] = updated;
  markSession(id);
  if (state.persistent) await persistBusiness(updated);
  return updated;
}

export async function registerCreator(creator: Creator): Promise<Creator> {
  const state = getState();
  state.creators.push(creator);
  markSession(creator.id);
  if (state.persistent) await persistCreator(creator);
  return creator;
}

export async function updateCreator(id: string, patch: Partial<Creator>): Promise<Creator | undefined> {
  const state = getState();
  const index = state.creators.findIndex((c) => c.id === id);
  if (index < 0) return undefined;
  const updated = { ...state.creators[index]!, ...patch };
  state.creators[index] = updated;
  markSession(id);
  if (state.persistent) await persistCreator(updated);
  return updated;
}

/**
 * Records partner reported availability for a date.
 *
 * One snapshot per property per date: a partner correcting today's figure
 * replaces it rather than adding a second, contradictory row.
 */
export async function recordAvailability(snapshot: AccommodationSnapshot): Promise<AccommodationSnapshot> {
  const state = getState();
  const index = state.accommodationSnapshots.findIndex(
    (row) => row.businessId === snapshot.businessId && row.date === snapshot.date,
  );
  if (index >= 0) {
    state.accommodationSnapshots[index] = snapshot;
  } else {
    state.accommodationSnapshots.push(snapshot);
  }
  markSession(snapshot.id);
  if (state.persistent) await persistAvailability(snapshot);
  return snapshot;
}

/* -------------------------------------------------------------------------- */
/* Landing pages                                                              */
/* -------------------------------------------------------------------------- */

export async function createLandingPage(page: LandingPage): Promise<LandingPage> {
  const state = getState();
  state.landingPages.push(page);
  markSession(page.id);
  if (state.persistent) await persistLandingPage(page);
  return page;
}

export async function updateLandingPage(
  id: string,
  patch: Partial<LandingPage>,
): Promise<LandingPage | undefined> {
  const state = getState();
  const index = state.landingPages.findIndex((p) => p.id === id);
  if (index < 0) return undefined;
  const updated = { ...state.landingPages[index]!, ...patch };
  state.landingPages[index] = updated;
  markSession(id);
  if (state.persistent) await persistLandingPage(updated);
  return updated;
}

/** Counts are a display figure, not a tourism signal, so they skip TourismInteraction. */
export async function recordLandingPageView(id: string): Promise<void> {
  const state = getState();
  const page = state.landingPages.find((p) => p.id === id);
  if (!page) return;
  await updateLandingPage(id, { viewCount: page.viewCount + 1 });
}

export async function recordLandingPageShare(id: string): Promise<void> {
  const state = getState();
  const page = state.landingPages.find((p) => p.id === id);
  if (!page) return;
  await updateLandingPage(id, { shareCount: page.shareCount + 1 });
}

/**
 * Forgets a visitor's passive signals — views, searches, plans — when they ask.
 * Check-ins and feedback are left: they were sent deliberately, and carry no
 * identity beyond the same anonymous id.
 */
export async function forgetSessionSignals(
  sessionId: string,
  types: readonly TourismInteraction['type'][],
): Promise<number> {
  const state = getState();
  const before = state.interactions.length;
  state.interactions = state.interactions.filter(
    (row) => !(row.anonymousSessionId === sessionId && types.includes(row.type)),
  );
  const removed = before - state.interactions.length;
  if (state.persistent) return deleteInteractionsForSession(sessionId, types);
  return removed;
}
