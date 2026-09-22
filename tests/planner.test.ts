import { beforeEach, describe, expect, it } from 'vitest';

import { travelMinutes } from '@/lib/geo';
import {
  budgetLevelFor,
  buildItinerary,
  extractTripProfile,
  MAX_OPTIONS,
  planOptions,
  readBudgetAmount,
  readTravellers,
  windowDays,
} from '@/server/ai/trip-planner';
import { costTrip, isPlannablePartner, roomsFor, vehiclesFor } from '@/server/ai/trip-logistics';
import { getBusiness, getBusinesses, getDestination } from '@/server/data/repository';
import { resetState } from '@/server/data/store';

/**
 * The complete planner: what it reads from a request, how dates shape the
 * days, what a plan includes and costs, and how its options differ.
 */

beforeEach(() => resetState());

const NATURE = 'I have 3 days, love nature, culture and local food, and prefer less crowded places.';

describe('reading a request', () => {
  it('finds how many are travelling', () => {
    expect(readTravellers('a trip for 4 people')).toBe(4);
    expect(readTravellers('three friends and a long weekend')).toBe(3);
    expect(readTravellers('a family of five')).toBe(5);
    expect(readTravellers('travelling solo')).toBe(1);
    expect(readTravellers('a couple on honeymoon')).toBe(2);
    expect(readTravellers('with my parents')).toBe(3);
    expect(readTravellers('three days of nature')).toBeUndefined();
  });

  it('finds a budget in rupees, however it is written, and nothing else', () => {
    expect(readBudgetAmount('budget ₹25,000')).toBe(25_000);
    expect(readBudgetAmount('around 30k rupees')).toBe(30_000);
    expect(readBudgetAmount('rs 1.5 lakh for the family')).toBe(150_000);
    expect(readBudgetAmount('a budget of 18000')).toBe(18_000);
    expect(readBudgetAmount('under 3 days, on a budget')).toBeUndefined();
    expect(readBudgetAmount('I have 3 days')).toBeUndefined();
  });

  it('lets an amount set the stay level, unless a level was chosen', () => {
    expect(budgetLevelFor(9_000, 2, 3)).toBe('BUDGET');
    expect(budgetLevelFor(30_000, 2, 3)).toBe('MODERATE');
    expect(budgetLevelFor(90_000, 2, 3)).toBe('PREMIUM');
    expect(extractTripProfile('3 days for 2 people, budget ₹9,000').budget).toBe('BUDGET');
    expect(extractTripProfile('3 days for 2 people, budget ₹9,000', { budget: 'PREMIUM' }).budget).toBe('PREMIUM');
    expect(extractTripProfile(NATURE).travellers).toBe(1);
  });
});

describe('dates', () => {
  it('decide the length of the trip', () => {
    expect(windowDays({ startDate: '2026-09-17', endDate: '2026-09-17' })).toBe(1);
    expect(windowDays({ startDate: '2026-09-17', endDate: '2026-09-21' })).toBe(5);
    const { trip } = buildItinerary(extractTripProfile(NATURE), 'sess-d', undefined, {
      window: { startDate: '2026-09-17', endDate: '2026-09-21' },
    });
    expect(trip.preferences.durationDays).toBe(5);
    expect(trip.title).toBe('5 days in Manipur');
  });

  it('leave the first day empty after a late arrival, rather than squeezing a stop in', () => {
    const { trip } = buildItinerary(extractTripProfile(NATURE), 'sess-d', undefined, {
      window: { startDate: '2026-09-17', endDate: '2026-09-19', arriveTime: '18:30' },
    });
    expect(trip.items.filter((item) => item.day === 1)).toHaveLength(0);
    expect(trip.items.some((item) => item.day === 2)).toBe(true);
  });

  it('end the last day in time to drive back to Imphal for the flight', () => {
    const { trip } = buildItinerary(extractTripProfile(NATURE), 'sess-d', undefined, {
      window: { startDate: '2026-09-17', endDate: '2026-09-19', departTime: '14:00' },
    });
    const imphal = getDestination('dest-kangla')!;
    for (const item of trip.items.filter((row) => row.day === 3)) {
      const [hours, minutes] = item.startTime.split(':').map(Number);
      const place = getDestination(item.destinationId)!;
      const back = place.id === imphal.id ? 0 : travelMinutes(place, imphal, { hill: true });
      // Finished, driven back and two hours before the flight.
      expect(hours! * 60 + minutes! + item.durationMinutes).toBeLessThanOrEqual(14 * 60 - 120 - back + 30);
    }
  });
});

describe('what a plan includes', () => {
  const { trip } = buildItinerary(extractTripProfile(`${NATURE} 3 people, budget ₹40,000`), 'sess-l');

  it('has a stay for every night but the last, only ever from a verified partner', () => {
    expect(trip.logistics!.stays).toHaveLength(trip.preferences.durationDays - 1);
    for (const stay of trip.logistics!.stays) {
      if (stay.businessId) expect(isPlannablePartner(getBusiness(stay.businessId)!)).toBe(true);
      expect(stay.rooms).toBe(roomsFor(3));
    }
  });

  it('never plans a partner that is not verified and participating', () => {
    const unplannable = new Set(getBusinesses().filter((business) => !isPlannablePartner(business)).map((b) => b.id));
    const used = [
      ...trip.logistics!.stays.map((stay) => stay.businessId),
      trip.logistics!.transport?.businessId,
      ...trip.logistics!.guides.map((guide) => guide.businessId),
    ].filter(Boolean);
    expect(unplannable.size).toBeGreaterThan(0);
    expect(used.some((id) => unplannable.has(id!))).toBe(false);
  });

  it('puts a guide only where the guide works, and only on a kind of place they know', () => {
    for (const guide of trip.logistics!.guides) {
      const home = getDestination(getBusiness(guide.businessId)!.destinationId)!;
      const stop = getDestination(guide.destinationId)!;
      expect(home.id === stop.id || home.category.some((category) => stop.category.includes(category))).toBe(true);
    }
  });

  it('costs every line from partner rates and listed prices, and adds them up', () => {
    const cost = costTrip(trip);
    expect(cost.total).toBe(cost.lines.reduce((sum, line) => sum + line.amount, 0));
    expect(cost.perPerson).toBe(Math.round(cost.total / 3));
    expect(cost.budget).toMatchObject({ amount: 40_000, difference: 40_000 - cost.total });
    expect(cost.excludes).toContain('entry fees');
    expect(trip.logistics!.transport?.vehicles).toBe(vehiclesFor(3));
  });

  it('tracks rooms and cars with the group', () => {
    expect([roomsFor(1), roomsFor(2), roomsFor(3), roomsFor(5)]).toEqual([1, 1, 2, 3]);
    expect([vehiclesFor(1), vehiclesFor(4), vehiclesFor(5)]).toEqual([1, 1, 2]);
  });
});

describe('options', () => {
  it('are different from each other, labelled, and share one request', () => {
    const options = planOptions(extractTripProfile(NATURE), 'sess-o');
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(MAX_OPTIONS);
    expect(options[0]!.label).toBe('Best match');
    const routes = options.map((option) =>
      option.trip.items.filter((item) => item.kind === 'DESTINATION').map((item) => item.destinationId).join(),
    );
    expect(new Set(routes).size).toBe(options.length);
    expect(new Set(options.map((option) => option.trip.optionGroupId)).size).toBe(1);
    expect(options.every((option) => option.trip.optionLabel === option.label)).toBe(true);
  });

  it('put a cheaper version first when the best match is over the budget', () => {
    const tight = extractTripProfile('3 days of nature and culture for 2 people, budget ₹8,000');
    const options = planOptions(tight, 'sess-o');
    const best = costTrip(options[0]!.trip).total;
    expect(best).toBeGreaterThan(8_000);
    const cheaper = options.find((option) => option.label === 'Lower cost');
    expect(cheaper).toBeDefined();
    expect(costTrip(cheaper!.trip).total).toBeLessThan(best);
  });

  it('are the same every time for the same request', () => {
    const shape = (seed: string) =>
      planOptions(extractTripProfile(NATURE), seed).map((option) => [
        option.label,
        option.trip.items.map((item) => item.destinationId).join(),
      ]);
    expect(shape('sess-x')).toEqual(shape('sess-y'));
  });
});
