import { randomBytes } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import {
  destinationCategorySchema,
  itineraryAlternativeSchema,
  tripProfileSchema,
  type ItineraryItem,
  type Trip,
} from '@/lib/types';
import { prisma } from '@/server/data/client';
import { getState } from '@/server/data/store';

/**
 * Trips: the journeys visitors plan.
 *
 * Unlike tourism signals, trips are not part of the analytics working set.
 * Nothing but the visitor's own pages reads them, so with MySQL behind the
 * platform they are read from the database when a page needs one, instead of
 * being held in memory for the life of the process. Without a database (the
 * unit suite) they live in the in-memory state under the same rules:
 *
 *   - A trip belongs to one anonymous session, and every read takes that
 *     session. A trip id alone never reaches a trip.
 *   - The visitor's current trip is the one updated most recently: planned,
 *     re-planned, saved or switched to.
 *   - Planning a new trip discards the visitor's other drafts. Journeys they
 *     chose to save are kept until they delete them.
 *
 * Deleting a trip does not delete the signals raised while planning it. The
 * database clears their trip reference; the demand they record still counts.
 */

export const MAX_SAVED_TRIPS = 10;

export const newTripId = (): string => `trip-${randomBytes(12).toString('base64url')}`;

const toDbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date): string => date.toISOString().slice(0, 10);

const tripWithItems = { items: { orderBy: [{ day: 'asc' as const }, { sequence: 'asc' as const }] } };
type TripRow = Prisma.TripGetPayload<{ include: typeof tripWithItems }>;

const interestsSchema = z.array(destinationCategorySchema);
const alternativesSchema = z.array(itineraryAlternativeSchema);

/**
 * A stored trip, or undefined if its JSON no longer matches the current
 * shape. An old trip that cannot be read is treated as absent, so a schema
 * change can never break a visitor's page.
 */
function toTrip(row: TripRow): Trip | undefined {
  const preferences = tripProfileSchema.safeParse(row.preferencesJson);
  const alternatives = alternativesSchema.safeParse(row.alternativesJson);
  if (!preferences.success || !alternatives.success) return undefined;

  const items: ItineraryItem[] = [];
  for (const item of row.items) {
    const interests = interestsSchema.safeParse(item.matchedInterests);
    if (!interests.success) return undefined;
    items.push({
      id: item.id,
      tripId: item.tripId,
      destinationId: item.destinationId,
      ...(item.experienceId ? { experienceId: item.experienceId } : {}),
      day: item.day,
      sequence: item.sequence,
      startTime: item.startTime,
      durationMinutes: item.durationMinutes,
      travelMinutesFromPrevious: item.travelMinutesFromPrevious,
      rationale: item.rationale,
      matchedInterests: interests.data,
      kind: item.kind,
    });
  }

  return {
    id: row.id,
    touristSessionId: row.touristSessionId,
    title: row.title,
    theme: row.theme,
    startDate: fromDbDate(row.startDate),
    endDate: fromDbDate(row.endDate),
    preferences: preferences.data,
    items,
    alternatives: alternatives.data,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    ...(row.adaptedReason ? { adaptedReason: row.adaptedReason } : {}),
    provenance: row.provenance,
  };
}

/* -------------------------------- In memory -------------------------------- */

/** Most recently updated last, so the current trip is the last one. */
function touchInMemory(trip: Trip): void {
  const state = getState();
  state.trips = [...state.trips.filter((row) => row.id !== trip.id), trip];
}

const memoryTripsFor = (sessionId: string): Trip[] =>
  getState().trips.filter((trip) => trip.touristSessionId === sessionId);

/* ---------------------------------- Reads ---------------------------------- */

/** The visitor's current trip: the one they most recently planned, changed or opened. */
export async function getCurrentTrip(sessionId: string | null | undefined): Promise<Trip | undefined> {
  if (!sessionId) return undefined;
  if (!getState().persistent) return memoryTripsFor(sessionId).at(-1);

  // A handful of rows at most, so skipping an unreadable one is cheap.
  const rows = await prisma.trip.findMany({
    where: { touristSessionId: sessionId },
    orderBy: { updatedAt: 'desc' },
    include: tripWithItems,
    take: MAX_SAVED_TRIPS + 1,
  });
  for (const row of rows) {
    const trip = toTrip(row);
    if (trip) return trip;
  }
  return undefined;
}

/** One of the visitor's trips, or undefined if it is not theirs. */
export async function getTripFor(sessionId: string | null | undefined, tripId: string): Promise<Trip | undefined> {
  if (!sessionId) return undefined;
  if (!getState().persistent) return memoryTripsFor(sessionId).find((trip) => trip.id === tripId);
  const row = await prisma.trip.findFirst({
    where: { id: tripId, touristSessionId: sessionId },
    include: tripWithItems,
  });
  return row ? toTrip(row) : undefined;
}

export interface TripSummary {
  id: string;
  theme: string;
  title: string;
  startDate: string;
  endDate: string;
  status: Trip['status'];
  stops: number;
}

/** The visitor's saved journeys, most recently used first. */
export async function listSavedTrips(sessionId: string | null | undefined): Promise<TripSummary[]> {
  if (!sessionId) return [];
  const summarise = (trip: Trip): TripSummary => ({
    id: trip.id,
    theme: trip.theme,
    title: trip.title,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    stops: trip.items.filter((item) => item.kind === 'DESTINATION').length,
  });
  if (!getState().persistent) {
    return memoryTripsFor(sessionId)
      .filter((trip) => trip.status === 'SAVED')
      .reverse()
      .map(summarise);
  }
  const rows = await prisma.trip.findMany({
    where: { touristSessionId: sessionId, status: 'SAVED' },
    orderBy: { updatedAt: 'desc' },
    include: tripWithItems,
    take: MAX_SAVED_TRIPS,
  });
  return rows.map(toTrip).filter((trip): trip is Trip => trip !== undefined).map(summarise);
}

/** How many trips are stored for this visitor, for the privacy page. */
export async function countTrips(sessionId: string | null | undefined): Promise<number> {
  if (!sessionId) return 0;
  if (!getState().persistent) return memoryTripsFor(sessionId).length;
  return prisma.trip.count({ where: { touristSessionId: sessionId } });
}

/* ---------------------------------- Writes --------------------------------- */

export class TripOwnershipError extends Error {
  constructor() {
    super('That trip belongs to another visitor.');
  }
}

/**
 * Stores a trip and its items, replacing any items it had. The trip becomes
 * the visitor's current one.
 *
 * Refuses to overwrite a trip that belongs to another session: trip ids are
 * random and never accepted from a browser, but the check costs one read.
 */
export async function saveTrip(trip: Trip): Promise<Trip> {
  if (!getState().persistent) {
    const existing = getState().trips.find((row) => row.id === trip.id);
    if (existing && existing.touristSessionId !== trip.touristSessionId) throw new TripOwnershipError();
    touchInMemory(trip);
    return trip;
  }

  const data = {
    title: trip.title.slice(0, 512),
    theme: trip.theme.slice(0, 191),
    startDate: toDbDate(trip.startDate),
    endDate: toDbDate(trip.endDate),
    preferencesJson: trip.preferences as unknown as Prisma.InputJsonValue,
    alternativesJson: trip.alternatives as unknown as Prisma.InputJsonValue,
    status: trip.status,
    adaptedReason: trip.adaptedReason ?? null,
    provenance: trip.provenance,
    // Set explicitly so a save that changes nothing else still makes this the current trip.
    updatedAt: new Date(),
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.trip.findUnique({ where: { id: trip.id }, select: { touristSessionId: true } });
    if (existing && existing.touristSessionId !== trip.touristSessionId) throw new TripOwnershipError();

    if (existing) {
      await tx.trip.update({ where: { id: trip.id }, data });
      await tx.itineraryItem.deleteMany({ where: { tripId: trip.id } });
    } else {
      await tx.trip.create({
        data: { id: trip.id, touristSessionId: trip.touristSessionId, createdAt: new Date(trip.createdAt), ...data },
      });
    }
    if (trip.items.length > 0) {
      await tx.itineraryItem.createMany({
        data: trip.items.map((item) => ({
          id: item.id,
          tripId: trip.id,
          destinationId: item.destinationId,
          experienceId: item.experienceId ?? null,
          day: item.day,
          sequence: item.sequence,
          startTime: item.startTime,
          durationMinutes: item.durationMinutes,
          travelMinutesFromPrevious: item.travelMinutesFromPrevious,
          rationale: item.rationale,
          matchedInterests: item.matchedInterests,
          kind: item.kind,
        })),
      });
    }
  });
  return trip;
}

/**
 * Removes the visitor's drafts other than `keepId`. Called when a new trip is
 * planned, so abandoned plans do not pile up under a session.
 */
export async function discardOtherDrafts(sessionId: string, keepId: string): Promise<number> {
  if (!getState().persistent) {
    const state = getState();
    const before = state.trips.length;
    state.trips = state.trips.filter(
      (trip) => !(trip.touristSessionId === sessionId && trip.status === 'DRAFT' && trip.id !== keepId),
    );
    return before - state.trips.length;
  }
  const { count } = await prisma.trip.deleteMany({
    where: { touristSessionId: sessionId, status: 'DRAFT', id: { not: keepId } },
  });
  return count;
}

export type SaveOutcome = 'SAVED' | 'ALREADY_SAVED' | 'LIMIT_REACHED' | 'NOT_FOUND';

/**
 * Keeps a trip past the next plan. A visitor may keep MAX_SAVED_TRIPS; beyond
 * that they choose one to delete, rather than the oldest vanishing unasked.
 */
export async function markTripSaved(sessionId: string, tripId: string): Promise<SaveOutcome> {
  const trip = await getTripFor(sessionId, tripId);
  if (!trip) return 'NOT_FOUND';
  if (trip.status === 'SAVED') return 'ALREADY_SAVED';
  if ((await listSavedTrips(sessionId)).length >= MAX_SAVED_TRIPS) return 'LIMIT_REACHED';
  await saveTrip({ ...trip, status: 'SAVED' });
  return 'SAVED';
}

/** Makes one of the visitor's saved trips their current one. */
export async function switchToTrip(sessionId: string, tripId: string): Promise<Trip | undefined> {
  const trip = await getTripFor(sessionId, tripId);
  if (!trip) return undefined;
  if (!getState().persistent) {
    touchInMemory(trip);
    return trip;
  }
  await prisma.trip.updateMany({ where: { id: tripId, touristSessionId: sessionId }, data: { updatedAt: new Date() } });
  return trip;
}

/** Deletes one of the visitor's trips. */
export async function deleteTrip(sessionId: string, tripId: string): Promise<boolean> {
  if (!getState().persistent) {
    const state = getState();
    const before = state.trips.length;
    state.trips = state.trips.filter((trip) => !(trip.id === tripId && trip.touristSessionId === sessionId));
    return state.trips.length < before;
  }
  const { count } = await prisma.trip.deleteMany({ where: { id: tripId, touristSessionId: sessionId } });
  return count > 0;
}

/** Deletes every trip the visitor has, saved or not. */
export async function deleteTripsForSession(sessionId: string): Promise<number> {
  if (!getState().persistent) {
    const state = getState();
    const before = state.trips.length;
    state.trips = state.trips.filter((trip) => trip.touristSessionId !== sessionId);
    return before - state.trips.length;
  }
  const { count } = await prisma.trip.deleteMany({ where: { touristSessionId: sessionId } });
  return count;
}
