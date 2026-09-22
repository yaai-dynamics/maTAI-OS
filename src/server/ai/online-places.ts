import { searchPlacesOnline, webSearchAvailable, type SearchArea } from '@/lib/ai/web-search';
import type { OnlinePlace, OnlineSearchStatus, Trip } from '@/lib/types';
import { getBusinesses, getDestination } from '@/server/data/repository';

/**
 * Web search for the places a plan goes to, on behalf of one visitor.
 *
 * One search covers every area of every option in a request. Results are kept
 * for a while, since the same areas come up again and again, and each visitor
 * gets a handful of searches an hour, since every search is a billed call.
 * Times here are real time, not the demo clock: this is a real lookup.
 */

const CACHE_MS = 12 * 60 * 60 * 1000;
const SEARCHES_PER_HOUR = 6;
const MAX_AREAS = 8;

const cache = new Map<string, { at: number; places: OnlinePlace[] }>();
const recent = new Map<string, number[]>();

/** The areas worth searching: every stop and every night of the given plans. */
export function searchAreasFor(trips: Pick<Trip, 'items' | 'logistics'>[]): SearchArea[] {
  const ids = new Set<string>();
  for (const trip of trips) {
    for (const stay of trip.logistics?.stays ?? []) ids.add(stay.destinationId);
    for (const item of trip.items) ids.add(item.destinationId);
  }
  return [...ids]
    .map((id) => getDestination(id))
    .filter((destination) => destination !== undefined)
    .slice(0, MAX_AREAS)
    .map((destination) => ({ id: destination.id, name: destination.name, district: destination.district }));
}

export interface OnlineResult {
  status: OnlineSearchStatus;
  places: OnlinePlace[];
  checkedAt?: string;
}

/** Finds non-partner places for these plans. Never throws: a failed search just says so. */
export async function findOnlineFor(sessionId: string, trips: Pick<Trip, 'items' | 'logistics'>[]): Promise<OnlineResult> {
  if (!webSearchAvailable()) return { status: 'OFF', places: [] };
  const areas = searchAreasFor(trips);
  if (areas.length === 0) return { status: 'NONE_FOUND', places: [] };

  const key = areas.map((area) => area.id).sort().join(',');
  const cached = cache.get(key);
  const nowMs = Date.now();
  if (cached && nowMs - cached.at < CACHE_MS) {
    return {
      status: cached.places.length > 0 ? 'FOUND' : 'NONE_FOUND',
      places: cached.places,
      checkedAt: new Date(cached.at).toISOString(),
    };
  }

  const mine = (recent.get(sessionId) ?? []).filter((at) => nowMs - at < 60 * 60 * 1000);
  if (mine.length >= SEARCHES_PER_HOUR) return { status: 'LIMITED', places: [] };
  recent.set(sessionId, [...mine, nowMs]);

  // A partner that also turns up on the web is still a partner, and is shown as one.
  const partners = getBusinesses().map((business) => business.name);
  const outcome = await searchPlacesOnline(areas, partners);
  if (!outcome.ok) return { status: outcome.reason === 'OFF' ? 'OFF' : 'FAILED', places: [] };

  const places: OnlinePlace[] = outcome.places.map((place) => ({
    kind: place.kind,
    destinationId: place.areaId,
    name: place.name,
    ...(place.note ? { note: place.note } : {}),
    sources: place.sources,
  }));
  cache.set(key, { at: nowMs, places });
  return { status: places.length > 0 ? 'FOUND' : 'NONE_FOUND', places, checkedAt: new Date(nowMs).toISOString() };
}

/** For the tests. */
export function resetOnlineSearch(): void {
  cache.clear();
  recent.clear();
}
