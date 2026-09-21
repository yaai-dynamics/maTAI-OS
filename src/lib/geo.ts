/** Geography helpers for routing and the schematic state map. */

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface LatLng {
  latitude: number;
  longitude: number;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Indicative road travel time.
 *
 * Straight line distance understates a hill route badly, so it is inflated by a
 * road factor and then divided by an average speed that drops with altitude
 * gain. This is a planning estimate shown as "about", never a routed time.
 */
export function travelMinutes(a: LatLng, b: LatLng, options: { hill?: boolean } = {}): number {
  const straight = distanceKm(a, b);
  if (straight < 0.8) return 0;

  const roadFactor = options.hill ? 1.55 : 1.25;
  const averageSpeedKph = options.hill ? 28 : 42;
  const minutes = ((straight * roadFactor) / averageSpeedKph) * 60;

  // Round to the nearest five minutes: the precision is not real.
  return Math.max(10, Math.round(minutes / 5) * 5);
}

/** Formats minutes as "1 h 20 m" or "45 m". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

/** Projects latitude and longitude into a 0-1 box for the schematic map. */
export function projectToBox(
  point: LatLng,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): { x: number; y: number } {
  const x = (point.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon);
  const y = 1 - (point.latitude - bounds.minLat) / (bounds.maxLat - bounds.minLat);
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}
