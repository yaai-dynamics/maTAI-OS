import { afterEach, describe, expect, it } from 'vitest';
import { dayColor, dayWaypoints, directionsHref, type MapStop, type TripMapData } from '@/lib/map';
import { roadRoute } from '@/server/geo/road-route';

const base = { name: 'Imphal', latitude: 24.8072, longitude: 93.9368 };

const stop = (number: number, day: number, latitude: number, longitude: number): MapStop => ({
  number,
  itemId: `item-${number}`,
  day,
  destinationId: `dest-${number}`,
  title: `Stop ${number}`,
  placeName: `Place ${number}`,
  district: 'Bishnupur',
  latitude,
  longitude,
  palette: 'lake',
  category: ['nature'],
  kind: 'DESTINATION',
  startTime: '09:00',
  durationMinutes: 120,
  rationale: 'Because.',
});

describe('trip map routes', () => {
  it('runs each day from where the last night was spent, and the last day back to Imphal', () => {
    const map: TripMapData = {
      tripId: 't',
      days: 2,
      base,
      stops: [stop(1, 1, 24.54, 93.8), stop(2, 2, 24.5, 93.78)],
      nights: [{ night: 1, destinationId: 'dest-1', placeName: 'Place 1', latitude: 24.54, longitude: 93.8 }],
    };
    const [day1, day2] = dayWaypoints(map);
    expect(day1!.points[0]).toEqual({ latitude: base.latitude, longitude: base.longitude });
    // The night is at the day's last stop, so the line does not repeat it.
    expect(day1!.points).toHaveLength(2);
    expect(day2!.points[0]).toEqual({ latitude: 24.54, longitude: 93.8 });
    expect(day2!.points.at(-1)).toEqual({ latitude: base.latitude, longitude: base.longitude });
  });

  it('skips a day with no movement', () => {
    const map: TripMapData = { tripId: 't', days: 1, base, stops: [stop(1, 1, base.latitude, base.longitude)], nights: [] };
    expect(dayWaypoints(map)).toEqual([]);
  });

  it('gives each day its own colour and links directions to the place', () => {
    expect(dayColor(1)).not.toBe(dayColor(2));
    expect(directionsHref(24.54, 93.8)).toBe('https://www.google.com/maps/dir/?api=1&destination=24.54,93.8');
  });
});

describe('road routes', () => {
  const previous = process.env.ROUTING_URL;
  afterEach(() => {
    if (previous === undefined) delete process.env.ROUTING_URL;
    else process.env.ROUTING_URL = previous;
  });

  it('falls back to a straight line, marked as such, when routing is off', async () => {
    process.env.ROUTING_URL = 'off';
    const route = await roadRoute([
      { latitude: 24.8, longitude: 93.93 },
      { latitude: 24.54, longitude: 93.8 },
    ]);
    expect(route.source).toBe('straight');
    expect(route.coordinates).toEqual([[93.93, 24.8], [93.8, 24.54]]);
    expect(route.distanceKm).toBeUndefined();
  });
});
