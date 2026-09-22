import { randomBytes } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { now } from '@/lib/config';
import { journeyPhase, tripWindow } from '@/lib/journey';
import {
  destinationCategorySchema,
  itineraryAlternativeSchema,
  tripLogisticsSchema,
  tripProfileSchema,
  type ItineraryItem,
  type Trip,
  type TripLogistics,
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
 *   - One planning request produces two or three options (DRAFT), sharing an
 *     option group. The visitor finalises one (SAVED) and the others go.
 *     Planning again discards options that were never chosen.
 *   - A finalised journey is current once the visitor starts it (ACTIVE), or
 *     while the time is inside its travel window. Being the latest plan does
 *     not make a journey current.
 *
 * Deleting a trip does not delete the signals raised while planning it. The
 * database clears their trip reference; the demand they record still counts.
 */

/** Journeys a visitor may keep: finalised, in progress and past. Options do not count. */
export const MAX_SAVED_TRIPS = 10;

export const newTripId = (): string => `trip-${randomBytes(12).toString('base64url')}`;
export const newOptionGroupId = (): string => `plan-${randomBytes(9).toString('base64url')}`;

const toDbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date): string => date.toISOString().slice(0, 10);

const tripWithItems = { items: { orderBy: [{ day: 'asc' as const }, { sequence: 'asc' as const }] } };
type TripRow = Prisma.TripGetPayload<{ include: typeof tripWithItems }>;

const interestsSchema = z.array(destinationCategorySchema);
const alternativesSchema = z.array(itineraryAlternativeSchema);

/** Enough rows for every option and every kept journey, most recent first. */
const READ_LIMIT = MAX_SAVED_TRIPS + 12;

/**
 * A stored trip, or undefined if its JSON no longer matches the current
 * shape. An old trip that cannot be read is treated as absent, so a schema
 * change can never break a visitor's page.
 */
function toTrip(row: TripRow): Trip | undefined {
  const preferences = tripProfileSchema.safeParse(row.preferencesJson);
  const alternatives = alternativesSchema.safeParse(row.alternativesJson);
  if (!preferences.success || !alternatives.success) return undefined;
  const logistics = row.logisticsJson === null ? undefined : tripLogisticsSchema.safeParse(row.logisticsJson);
  if (logistics && !logistics.success) return undefined;

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
    ...(row.startDate ? { startDate: fromDbDate(row.startDate) } : {}),
    ...(row.endDate ? { endDate: fromDbDate(row.endDate) } : {}),
    ...(row.arriveTime ? { arriveTime: row.arriveTime } : {}),
    ...(row.departTime ? { departTime: row.departTime } : {}),
    preferences: preferences.data,
    items,
    alternatives: alternatives.data,
    ...(logistics?.success ? { logistics: logistics.data } : {}),
    status: row.status,
    ...(row.optionGroupId ? { optionGroupId: row.optionGroupId } : {}),
    ...(row.optionLabel ? { optionLabel: row.optionLabel } : {}),
    ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.adaptedReason ? { adaptedReason: row.adaptedReason } : {}),
    provenance: row.provenance,
  };
}

/* -------------------------------- In memory -------------------------------- */

/** Most recently updated last. */
function touchInMemory(trip: Trip): void {
  const state = getState();
  state.trips = [...state.trips.filter((row) => row.id !== trip.id), trip];
}

const memoryTripsFor = (sessionId: string): Trip[] =>
  getState().trips.filter((trip) => trip.touristSessionId === sessionId);

function removeInMemory(keep: (trip: Trip) => boolean): number {
  const state = getState();
  const before = state.trips.length;
  state.trips = state.trips.filter(keep);
  return before - state.trips.length;
}

/* ---------------------------------- Reads ---------------------------------- */

/** Every journey and option the visitor has, most recently changed first. */
export async function listTrips(sessionId: string | null | undefined): Promise<Trip[]> {
  if (!sessionId) return [];
  if (!getState().persistent) return memoryTripsFor(sessionId).reverse();
  const rows = await prisma.trip.findMany({
    where: { touristSessionId: sessionId },
    orderBy: { updatedAt: 'desc' },
    include: tripWithItems,
    take: READ_LIMIT,
  });
  // A handful of rows at most, so skipping an unreadable one is cheap.
  return rows.map(toTrip).filter((trip): trip is Trip => trip !== undefined);
}

/**
 * The journey the visitor is on now: the one they started, or else a
 * finalised one whose travel window contains the current time.
 */
export async function getCurrentTrip(sessionId: string | null | undefined): Promise<Trip | undefined> {
  const at = now();
  const trips = await listTrips(sessionId);
  const started = trips
    .filter((trip) => trip.status === 'ACTIVE')
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0];
  if (started) return started;
  return trips
    .filter((trip) => journeyPhase(trip, at) === 'IN_PROGRESS')
    .sort((a, b) => tripWindow(a)!.start.getTime() - tripWindow(b)!.start.getTime())[0];
}

/** The most recently changed journey, for links that name no journey. */
export async function getLatestTrip(sessionId: string | null | undefined): Promise<Trip | undefined> {
  return (await listTrips(sessionId))[0];
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

/** Journeys kept past planning: finalised, in progress or past. */
export async function countKeptTrips(sessionId: string | null | undefined): Promise<number> {
  if (!sessionId) return 0;
  if (!getState().persistent) return memoryTripsFor(sessionId).filter((trip) => trip.status !== 'DRAFT').length;
  return prisma.trip.count({ where: { touristSessionId: sessionId, status: { not: 'DRAFT' } } });
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

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Stores a trip and its items, replacing any items it had.
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
    startDate: trip.startDate ? toDbDate(trip.startDate) : null,
    endDate: trip.endDate ? toDbDate(trip.endDate) : null,
    arriveTime: trip.arriveTime ?? null,
    departTime: trip.departTime ?? null,
    preferencesJson: json(trip.preferences),
    alternativesJson: json(trip.alternatives),
    logisticsJson: trip.logistics ? json(trip.logistics) : Prisma.DbNull,
    status: trip.status,
    optionGroupId: trip.optionGroupId ?? null,
    optionLabel: trip.optionLabel?.slice(0, 64) ?? null,
    startedAt: trip.startedAt ? new Date(trip.startedAt) : null,
    adaptedReason: trip.adaptedReason ?? null,
    provenance: trip.provenance,
    // Set explicitly so a save that changes nothing else still counts as a change.
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

/** Replaces only what a trip includes (stays, transport, guides, online finds). */
export async function saveLogistics(sessionId: string, tripId: string, logistics: TripLogistics): Promise<boolean> {
  const trip = await getTripFor(sessionId, tripId);
  if (!trip) return false;
  if (!getState().persistent) {
    // In place, so the order of the visitor's trips does not change.
    getState().trips = getState().trips.map((row) => (row.id === tripId ? { ...row, logistics } : row));
    return true;
  }
  await prisma.trip.updateMany({
    where: { id: tripId, touristSessionId: sessionId },
    data: { logisticsJson: json(logistics) },
  });
  return true;
}

/**
 * Removes the visitor's options that were never chosen, other than those of
 * `keepGroupId`. Called when a new plan is made, so abandoned options do not
 * pile up under a session.
 */
export async function discardUnchosenOptions(sessionId: string, keepGroupId: string): Promise<number> {
  if (!getState().persistent) {
    return removeInMemory(
      (trip) => !(trip.touristSessionId === sessionId && trip.status === 'DRAFT' && trip.optionGroupId !== keepGroupId),
    );
  }
  const { count } = await prisma.trip.deleteMany({
    where: {
      touristSessionId: sessionId,
      status: 'DRAFT',
      OR: [{ optionGroupId: null }, { optionGroupId: { not: keepGroupId } }],
    },
  });
  return count;
}

export type ChooseOutcome = 'CHOSEN' | 'ALREADY_CHOSEN' | 'LIMIT_REACHED' | 'NOT_FOUND';

/**
 * Finalises one option: it becomes a kept journey and the other options from
 * the same request go. A visitor may keep MAX_SAVED_TRIPS; beyond that they
 * choose one to delete, rather than the oldest vanishing unasked.
 */
export async function chooseOption(
  sessionId: string,
  tripId: string,
): Promise<{ outcome: ChooseOutcome; trip?: Trip }> {
  const trip = await getTripFor(sessionId, tripId);
  if (!trip) return { outcome: 'NOT_FOUND' };
  if (trip.status !== 'DRAFT') return { outcome: 'ALREADY_CHOSEN', trip };
  if ((await countKeptTrips(sessionId)) >= MAX_SAVED_TRIPS) return { outcome: 'LIMIT_REACHED' };

  const chosen = await saveTrip({ ...trip, status: 'SAVED' });
  if (trip.optionGroupId) {
    const group = trip.optionGroupId;
    if (!getState().persistent) {
      removeInMemory(
        (row) =>
          !(row.touristSessionId === sessionId && row.optionGroupId === group && row.status === 'DRAFT' && row.id !== tripId),
      );
    } else {
      await prisma.trip.deleteMany({
        where: { touristSessionId: sessionId, optionGroupId: group, status: 'DRAFT', id: { not: tripId } },
      });
    }
  }
  return { outcome: 'CHOSEN', trip: chosen };
}

export type StartOutcome = 'STARTED' | 'ALREADY_STARTED' | 'NOT_CHOSEN' | 'NOT_FOUND';

/**
 * Starts a finalised journey: it is the current one from now on. A journey
 * already under way is ended, since a visitor travels one at a time.
 */
export async function startTrip(sessionId: string, tripId: string): Promise<{ outcome: StartOutcome; ended?: Trip }> {
  const trip = await getTripFor(sessionId, tripId);
  if (!trip) return { outcome: 'NOT_FOUND' };
  if (trip.status === 'ACTIVE') return { outcome: 'ALREADY_STARTED' };
  if (trip.status === 'DRAFT') return { outcome: 'NOT_CHOSEN' };

  const others = (await listTrips(sessionId)).filter((row) => row.status === 'ACTIVE' && row.id !== tripId);
  for (const other of others) await saveTrip({ ...other, status: 'COMPLETED' });
  await saveTrip({ ...trip, status: 'ACTIVE', startedAt: now().toISOString() });
  return { outcome: 'STARTED', ...(others[0] ? { ended: others[0] } : {}) };
}

/** Ends a journey the visitor started. */
export async function endTrip(sessionId: string, tripId: string): Promise<'ENDED' | 'NOT_STARTED' | 'NOT_FOUND'> {
  const trip = await getTripFor(sessionId, tripId);
  if (!trip) return 'NOT_FOUND';
  if (trip.status !== 'ACTIVE') return 'NOT_STARTED';
  await saveTrip({ ...trip, status: 'COMPLETED' });
  return 'ENDED';
}

/** Deletes one of the visitor's trips. */
export async function deleteTrip(sessionId: string, tripId: string): Promise<boolean> {
  if (!getState().persistent) {
    return removeInMemory((trip) => !(trip.id === tripId && trip.touristSessionId === sessionId)) > 0;
  }
  const { count } = await prisma.trip.deleteMany({ where: { id: tripId, touristSessionId: sessionId } });
  return count > 0;
}

/** Deletes every trip the visitor has, kept or not. */
export async function deleteTripsForSession(sessionId: string): Promise<number> {
  if (!getState().persistent) return removeInMemory((trip) => trip.touristSessionId !== sessionId);
  const { count } = await prisma.trip.deleteMany({ where: { touristSessionId: sessionId } });
  return count;
}
