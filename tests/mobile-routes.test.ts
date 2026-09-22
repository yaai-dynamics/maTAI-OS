import { describe, expect, it } from 'vitest';

import { mobileHref } from '@/lib/mobile/routes';

describe('mobileHref', () => {
  it('maps the planner and journeys', () => {
    expect(mobileHref('/explore')).toBe('/m/plan');
    expect(mobileHref('/explore?plan=A%20trip')).toBe('/m/plan?plan=A+trip');
    expect(mobileHref('/explore/journey')).toBe('/m/plan');
    expect(mobileHref('/explore/journey/trip-abc?view=map')).toBe('/m/journey/trip-abc?view=map');
  });

  it('maps destinations and heritage', () => {
    expect(mobileHref('/explore/destinations/dest-loktak')).toBe('/m/place/dest-loktak');
    expect(mobileHref('/explore/destinations/dest-ukhrul/heritage')).toBe('/m/place/dest-ukhrul/heritage');
    expect(mobileHref('/explore/destinations')).toBe('/m/discover');
  });

  it('maps discover links to experiences and booking', () => {
    expect(mobileHref('/explore/discover?mode=experiences&experience=exp-1')).toBe('/m/experience/exp-1');
    expect(mobileHref('/explore/discover?mode=experiences&book=exp-2')).toBe('/m/experience/exp-2/book');
    expect(mobileHref('/explore/discover?mode=experiences&destination=dest-a')).toBe(
      '/m/discover?mode=experiences&destination=dest-a',
    );
    expect(mobileHref('/explore/experiences')).toBe('/m/discover?mode=experiences');
  });

  it('maps trip, bookings and privacy', () => {
    expect(mobileHref('/explore/trip?destination=dest-a')).toBe('/m/trip?destination=dest-a');
    expect(mobileHref('/explore/bookings')).toBe('/m/bookings');
    expect(mobileHref('/explore/bookings/MT-ABC123?key=k')).toBe('/m/bookings/MT-ABC123?key=k');
    expect(mobileHref('/explore/privacy')).toBe('/m/privacy');
  });

  it('leaves everything else alone', () => {
    expect(mobileHref('/gov/issues')).toBeUndefined();
    expect(mobileHref('/explorer')).toBeUndefined();
    expect(mobileHref('https://example.com/explore')).toBeUndefined();
    expect(mobileHref('/explore/checkin/dest-a')).toBeUndefined();
  });
});
