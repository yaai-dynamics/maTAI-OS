import type { LatLng } from '@/lib/geo';
import type { Destination } from '@/lib/types';

/**
 * Shapes the maps on the Trip and Discover screens are drawn from. Plain data,
 * so a server page can build them and hand them to the client map.
 */

/** One day's colour, used by its pins, its route and its label, in order. */
export const DAY_COLORS = ['#6a4899', '#128a78', '#c0612b', '#2f6db5', '#a75c88', '#4f7d3a', '#b5463c', '#7a6a2f'];
export const dayColor = (day: number): string => DAY_COLORS[(Math.max(1, day) - 1) % DAY_COLORS.length]!;

/** Pin colour for a destination, from the palette its artwork uses. */
export const PALETTE_COLOR: Record<Destination['palette'], string> = {
  lake: '#2f6d80',
  hill: '#5b6690',
  heritage: '#8a5a3c',
  market: '#b5654f',
  forest: '#3f6b4c',
  border: '#8a6a3a',
};

/** A numbered stop of a trip, in the order the timeline shows it. */
export interface MapStop {
  number: number;
  itemId: string;
  day: number;
  destinationId: string;
  /** The stop's own name: the experience's title for an experience. */
  title: string;
  placeName: string;
  district: string;
  latitude: number;
  longitude: number;
  palette: Destination['palette'];
  category: Destination['category'];
  kind: 'DESTINATION' | 'EXPERIENCE';
  startTime: string;
  durationMinutes: number;
  rationale: string;
}

/** Where a night is spent. */
export interface MapNight {
  night: number;
  destinationId: string;
  placeName: string;
  latitude: number;
  longitude: number;
  partnerName?: string;
}

export interface TripMapData {
  tripId: string;
  days: number;
  stops: MapStop[];
  nights: MapNight[];
  /** Where the trip starts and ends: Imphal. */
  base: { name: string; latitude: number; longitude: number };
}

/** One day's route as drawn: by road when routing found one, else a straight line. */
export interface RouteShape {
  day: number;
  coordinates: [number, number][];
  source: 'road' | 'straight';
  distanceKm?: number;
  durationMinutes?: number;
}

/** A place on the Discover map. */
export interface MapPlace {
  id: string;
  name: string;
  district: string;
  latitude: number;
  longitude: number;
  palette: Destination['palette'];
  category: Destination['category'];
  summary: string;
  bestSeason?: string;
  typicalVisitMinutes: number;
  experienceCount: number;
  demandIndex?: number;
}

/**
 * The points each day's route passes through: from where the last night was
 * spent (Imphal on day 1), through the day's stops, to where this night is
 * spent, or back to Imphal on the last day.
 */
export function dayWaypoints(map: TripMapData): { day: number; points: LatLng[] }[] {
  const out: { day: number; points: LatLng[] }[] = [];
  let from: LatLng = map.base;
  for (let day = 1; day <= map.days; day += 1) {
    const stops = map.stops.filter((stop) => stop.day === day);
    const night = map.nights.find((row) => row.night === day);
    const to: LatLng | undefined = day === map.days ? map.base : night;
    const points = [from, ...stops, ...(to ? [to] : [])].map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
    // Consecutive stops at one place add nothing to the line.
    const distinct = points.filter(
      (point, index) =>
        index === 0 ||
        Math.abs(point.latitude - points[index - 1]!.latitude) > 1e-4 ||
        Math.abs(point.longitude - points[index - 1]!.longitude) > 1e-4,
    );
    if (distinct.length > 1) out.push({ day, points: distinct });
    from = to ?? stops.at(-1) ?? from;
  }
  return out;
}

/** Google Maps directions to a point: the visitor's own app does the routing. */
export const directionsHref = (latitude: number, longitude: number): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

/**
 * Directions to a place by name. For a building we hold only to district
 * precision, the visitor's map finds the entrance; a centroid would send them
 * to a field outside town.
 */
export const directionsToPlaceHref = (query: string): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;

export const planHref = (name: string): string =>
  `/explore?plan=${encodeURIComponent(`A trip that includes ${name}`)}`;
