import type { MapNight, MapStop, TripMapData } from '@/lib/map';
import type { Trip } from '@/lib/types';
import { IMPHAL } from '@/server/ai/trip-logistics';
import { getBusiness, getDestination, getExperience } from '@/server/data/repository';

export { dayWaypoints } from '@/lib/map';

/**
 * A trip as the map draws it. Stops are numbered in the timeline's order,
 * across days, so "3" on the map is the third card in the timeline.
 */
export function buildTripMap(trip: Trip): TripMapData {
  const ordered = [...trip.items].sort((a, b) => a.day - b.day || a.sequence - b.sequence);
  const stops: MapStop[] = [];
  for (const item of ordered) {
    const destination = getDestination(item.destinationId);
    if (!destination) continue;
    const experience = item.experienceId ? getExperience(item.experienceId) : undefined;
    stops.push({
      number: stops.length + 1,
      itemId: item.id,
      day: item.day,
      destinationId: destination.id,
      title: experience?.title ?? destination.name,
      placeName: destination.name,
      district: destination.district,
      latitude: destination.latitude,
      longitude: destination.longitude,
      palette: destination.palette,
      category: destination.category,
      kind: item.kind,
      startTime: item.startTime,
      durationMinutes: item.durationMinutes,
      rationale: item.rationale,
    });
  }

  const nights: MapNight[] = [];
  for (const stay of trip.logistics?.stays ?? []) {
    const destination = getDestination(stay.destinationId);
    if (!destination) continue;
    const partner = stay.businessId ? getBusiness(stay.businessId) : undefined;
    nights.push({
      night: stay.night,
      destinationId: destination.id,
      placeName: destination.name,
      latitude: destination.latitude,
      longitude: destination.longitude,
      ...(partner ? { partnerName: partner.name } : {}),
    });
  }

  const imphal = getDestination(IMPHAL);
  return {
    tripId: trip.id,
    days: Math.max(trip.preferences.durationDays, ...trip.items.map((item) => item.day)),
    stops,
    nights,
    base: {
      name: 'Imphal',
      latitude: imphal?.latitude ?? 24.8072,
      longitude: imphal?.longitude ?? 93.9368,
    },
  };
}
