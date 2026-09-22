import { distanceKm, type LatLng } from '@/lib/geo';

/**
 * Road geometry for a day's route, from an OSRM server (OpenStreetMap data).
 *
 * Only for drawing the map: the plan's own travel times are the planner's
 * estimates and are not changed by this. Only the coordinates of public
 * places are sent. When the router cannot be reached (no network, the public
 * demo server busy) the route is a straight line and says so, so the map
 * still works offline.
 */

const ROUTER = (process.env.ROUTING_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '');
const TIMEOUT_MS = 6_000;
const CACHE_MS = 24 * 60 * 60 * 1000;

export interface RoadRoute {
  coordinates: [number, number][];
  source: 'road' | 'straight';
  distanceKm?: number;
  durationMinutes?: number;
}

const cache = new Map<string, { at: number; route: RoadRoute }>();

const straight = (points: LatLng[]): RoadRoute => ({
  coordinates: points.map((point) => [point.longitude, point.latitude]),
  source: 'straight',
});

export async function roadRoute(points: LatLng[]): Promise<RoadRoute> {
  if (points.length < 2 || process.env.ROUTING_URL === 'off') return straight(points);
  const path = points.map((point) => `${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`).join(';');
  const cached = cache.get(path);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.route;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ROUTER}/route/v1/driving/${path}?overview=full&geometries=geojson`, {
      signal: controller.signal,
      headers: { 'user-agent': 'maTAI/0.1 (Manipur tourism prototype)' },
    });
    if (!response.ok) return straight(points);
    const body = (await response.json()) as {
      code?: string;
      routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const best = body.routes?.[0];
    const coordinates = best?.geometry?.coordinates;
    if (body.code !== 'Ok' || !best || !coordinates || coordinates.length < 2) return straight(points);

    // A route far longer than the crow flies means the router snapped a point
    // to the wrong side of a hill or border; the straight line is more honest.
    const crow = points.slice(1).reduce((sum, point, index) => sum + distanceKm(points[index]!, point), 0);
    if (crow > 1 && best.distance / 1000 > crow * 4) return straight(points);

    const route: RoadRoute = {
      coordinates,
      source: 'road',
      distanceKm: Math.round(best.distance / 1000),
      durationMinutes: Math.max(5, Math.round(best.duration / 60 / 5) * 5),
    };
    cache.set(path, { at: Date.now(), route });
    return route;
  } catch {
    return straight(points);
  } finally {
    clearTimeout(timer);
  }
}
