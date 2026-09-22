import { travelMinutes } from '@/lib/geo';
import { formatRupees } from '@/lib/money';
import type {
  BusinessRate,
  Destination,
  TourismBusiness,
  Trip,
  TripGuide,
  TripLogistics,
  TripProfile,
  TripStay,
  TripTransport,
} from '@/lib/types';
import { getBusinesses, getDestination, getExperience } from '@/server/data/repository';

/**
 * What a plan includes beyond the places: where each night is spent, how the
 * visitor gets around, which days have a guide, and what it all costs.
 *
 * Only verified, participating partners are planned, the same rule that
 * decides who counts towards capacity. Prices are the partners' own rates, so
 * every figure here is traceable to a partner record. Places found online are
 * listed beside the plan, labelled, and never priced.
 */

type Covers = BusinessRate['covers'];

export const isPlannablePartner = (business: TourismBusiness): boolean =>
  business.verified && business.status === 'PARTICIPATING';

const partnersCovering = (covers: Covers): (TourismBusiness & { rate: BusinessRate })[] =>
  getBusinesses().filter(
    (business): business is TourismBusiness & { rate: BusinessRate } =>
      isPlannablePartner(business) && business.rate?.covers === covers,
  );

const hill = (a: Destination, b: Destination) => a.palette === 'hill' || b.palette === 'hill' || a.district !== b.district;
const minutesBetween = (a: Destination, b: Destination) => (a.id === b.id ? 0 : travelMinutes(a, b, { hill: hill(a, b) }));

/** Where every trip starts and ends: the airport and the hotels are in Imphal. */
export const IMPHAL = 'dest-kangla';

/** Two to a room, four to a car. */
export const roomsFor = (travellers: number): number => Math.max(1, Math.ceil(travellers / 2));
export const vehiclesFor = (travellers: number): number => Math.max(1, Math.ceil(travellers / 4));

/** How far a stay may be from where the day ends, and still count as near it. */
const STAY_RADIUS_MINUTES = 45;

/**
 * The stay for a night spent at `destinationId`. Budget travellers get the
 * cheapest near partner, premium travellers the most comfortable, and anyone
 * who gave an amount the one nearest their nightly share of it.
 */
export function pickStay(
  destinationId: string,
  profile: TripProfile,
  nights: number,
): { business: TourismBusiness & { rate: BusinessRate }; travelMinutes: number } | undefined {
  const here = getDestination(destinationId);
  if (!here) return undefined;

  const near = partnersCovering('ROOM')
    .map((business) => {
      const at = getDestination(business.destinationId);
      return at ? { business, travelMinutes: minutesBetween(here, at) } : undefined;
    })
    .filter((row): row is NonNullable<typeof row> => row !== undefined && row.travelMinutes <= STAY_RADIUS_MINUTES);
  if (near.length === 0) return undefined;

  // A third of the budget for rooms is a planning convention, not a quote.
  const nightlyShare = profile.budgetAmount
    ? (profile.budgetAmount * 0.35) / Math.max(1, nights) / roomsFor(profile.travellers)
    : undefined;

  const preference = (row: (typeof near)[number]) =>
    nightlyShare !== undefined
      ? Math.abs(row.business.rate.amount - nightlyShare)
      : profile.budget === 'PREMIUM'
        ? -row.business.rate.amount
        : row.business.rate.amount;

  return near.sort((a, b) => a.travelMinutes - b.travelMinutes || preference(a) - preference(b))[0];
}

/** One partner with vehicles for the whole trip, based as near Imphal as possible. */
export function pickTransport(profile: TripProfile, days: number): TripTransport {
  const imphal = getDestination(IMPHAL);
  const vehicles = vehiclesFor(profile.travellers);
  const partner = partnersCovering('VEHICLE')
    .map((business) => {
      const at = getDestination(business.destinationId);
      return { business, minutes: imphal && at ? minutesBetween(imphal, at) : 999 };
    })
    .sort((a, b) => a.minutes - b.minutes)[0];
  return partner
    ? { businessId: partner.business.id, vehicles, days, rate: partner.business.rate.amount }
    : { vehicles, days };
}

/** Kinds of place where a guide changes what a visitor understands or can safely do. */
const GUIDED_CATEGORIES = new Set(['heritage', 'history', 'adventure', 'wildlife']);
/** A guide works where they are based, or somewhere a few minutes away. */
const GUIDE_RADIUS_MINUTES = 15;

/** At most one guide a day, for the first stop that benefits from one. */
export function pickGuides(trip: Pick<Trip, 'items'>): TripGuide[] {
  const guides = partnersCovering('GUIDE');
  const byDay = new Map<number, TripGuide>();

  for (const item of trip.items) {
    if (item.kind !== 'DESTINATION' || byDay.has(item.day)) continue;
    const destination = getDestination(item.destinationId);
    if (!destination || !destination.category.some((category) => GUIDED_CATEGORIES.has(category))) continue;
    const guide = guides
      .map((business) => {
        const at = getDestination(business.destinationId);
        return { business, minutes: at ? minutesBetween(destination, at) : 999 };
      })
      // A wetland guide is not a temple guide: the guide's own place has to
      // share a kind of interest with the stop.
      .filter((row) => {
        const home = getDestination(row.business.destinationId);
        return (
          row.minutes <= GUIDE_RADIUS_MINUTES &&
          home !== undefined &&
          (home.id === destination.id || home.category.some((category) => destination.category.includes(category)))
        );
      })
      .sort((a, b) => a.minutes - b.minutes)[0];
    if (guide) {
      byDay.set(item.day, {
        day: item.day,
        destinationId: destination.id,
        businessId: guide.business.id,
        rate: guide.business.rate.amount,
      });
    }
  }
  return [...byDay.values()];
}

/** Stays for the nights the planner chose, with the partner for each where there is one. */
export function staysFor(nights: { night: number; destinationId: string }[], profile: TripProfile): TripStay[] {
  const rooms = roomsFor(profile.travellers);
  return nights.map(({ night, destinationId }) => {
    const stay = pickStay(destinationId, profile, nights.length);
    return stay
      ? {
          night,
          destinationId,
          businessId: stay.business.id,
          rooms,
          rate: stay.business.rate.amount,
          travelMinutes: stay.travelMinutes,
        }
      : { night, destinationId, rooms, travelMinutes: 0 };
  });
}

/**
 * Rebuilds everything a trip includes from its places. Places already found
 * online are kept where the plan still goes near them.
 */
export function buildLogistics(
  trip: Pick<Trip, 'items' | 'preferences' | 'logistics'>,
  nights: { night: number; destinationId: string }[],
): TripLogistics {
  const days = Math.max(1, ...trip.items.map((item) => item.day), trip.preferences.durationDays);
  const areas = new Set([...trip.items.map((item) => item.destinationId), ...nights.map((row) => row.destinationId)]);
  const online = trip.logistics?.online ?? { status: 'NOT_RUN' as const, places: [] };
  return {
    stays: staysFor(nights, trip.preferences),
    transport: pickTransport(trip.preferences, days),
    guides: pickGuides(trip),
    online: { ...online, places: online.places.filter((place) => areas.has(place.destinationId)) },
  };
}

/**
 * Where each night is spent, when the trip already exists: the last stop of
 * each day but the final one.
 */
export function nightsFromItems(trip: Pick<Trip, 'items' | 'preferences' | 'logistics'>): { night: number; destinationId: string }[] {
  const days = Math.max(trip.preferences.durationDays, ...trip.items.map((item) => item.day));
  const nights: { night: number; destinationId: string }[] = [];
  let last = IMPHAL;
  for (let day = 1; day < days; day += 1) {
    const stops = trip.items.filter((item) => item.day === day && item.kind === 'DESTINATION');
    const planned = trip.logistics?.stays.find((stay) => stay.night === day);
    // Keep the planned night where the plan still passes it, or where it was the Imphal base.
    last =
      planned && (planned.destinationId === IMPHAL || stops.some((item) => item.destinationId === planned.destinationId))
        ? planned.destinationId
        : (stops.at(-1)?.destinationId ?? last);
    nights.push({ night: day, destinationId: last });
  }
  return nights;
}

/* ---------------------------------- Cost ----------------------------------- */

export interface CostLine {
  key: 'STAYS' | 'TRANSPORT' | 'GUIDES' | 'EXPERIENCES';
  label: string;
  amount: number;
  detail: string;
}

export interface TripCost {
  lines: CostLine[];
  total: number;
  perPerson: number;
  /** What the total leaves out, in plain words. */
  excludes: string[];
  budget?: { amount: number; difference: number; fits: boolean };
}

/**
 * The cost of a plan, from partner rates and experience prices. Deterministic,
 * and every line says how it was reached.
 */
export function costTrip(trip: Pick<Trip, 'items' | 'preferences' | 'logistics'>): TripCost {
  const profile = trip.preferences;
  const travellers = profile.travellers;
  const logistics = trip.logistics;
  const lines: CostLine[] = [];
  const excludes = ['meals not included with a stay', 'entry fees', 'getting to and from Imphal'];

  const pricedStays = (logistics?.stays ?? []).filter((stay) => stay.rate !== undefined && stay.businessId);
  if (pricedStays.length > 0) {
    const amount = pricedStays.reduce((sum, stay) => sum + stay.rate! * stay.rooms, 0);
    lines.push({
      key: 'STAYS',
      label: `Stays · ${pricedStays.length} ${pricedStays.length === 1 ? 'night' : 'nights'}`,
      amount,
      detail: `${pricedStays[0]!.rooms} ${pricedStays[0]!.rooms === 1 ? 'room' : 'rooms'} a night at partner rates`,
    });
  }
  const unpriced = (logistics?.stays ?? []).length - pricedStays.length;
  if (unpriced > 0) excludes.unshift(`${unpriced} ${unpriced === 1 ? 'night' : 'nights'} with no partner stay nearby`);

  const transport = logistics?.transport;
  if (transport?.rate !== undefined && transport.businessId) {
    lines.push({
      key: 'TRANSPORT',
      label: `Car with driver · ${transport.days} ${transport.days === 1 ? 'day' : 'days'}`,
      amount: transport.rate * transport.vehicles * transport.days,
      detail: `${transport.vehicles} ${transport.vehicles === 1 ? 'car' : 'cars'} at ${formatRupees(transport.rate)} a day`,
    });
  } else if (transport) {
    excludes.unshift('transport, since no partner with vehicles is registered yet');
  }

  const guides = logistics?.guides ?? [];
  if (guides.length > 0) {
    lines.push({
      key: 'GUIDES',
      label: `Guides · ${guides.length} ${guides.length === 1 ? 'day' : 'days'}`,
      amount: guides.reduce((sum, guide) => sum + (guide.rate ?? 0), 0),
      detail: 'For the group, at partner day rates',
    });
  }

  const experiences = trip.items
    .filter((item) => item.kind === 'EXPERIENCE' && item.experienceId)
    .map((item) => getExperience(item.experienceId!))
    .filter((experience) => experience !== undefined);
  if (experiences.length > 0) {
    lines.push({
      key: 'EXPERIENCES',
      label: `Experiences · ${experiences.length}`,
      amount: experiences.reduce((sum, experience) => sum + experience.price * travellers, 0),
      detail: `${travellers} ${travellers === 1 ? 'place' : 'places'} each, at the listed price`,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    lines,
    total,
    perPerson: Math.round(total / travellers),
    excludes,
    ...(profile.budgetAmount
      ? {
          budget: {
            amount: profile.budgetAmount,
            difference: profile.budgetAmount - total,
            fits: total <= profile.budgetAmount,
          },
        }
      : {}),
  };
}

/* -------------------------------- Summary ---------------------------------- */

/** The destinations on a trip, in order, for a route line or a comparison. */
export const stopNamesOf = (trip: Pick<Trip, 'items'>): string[] =>
  trip.items
    .filter((item) => item.kind === 'DESTINATION')
    .map((item) => getDestination(item.destinationId)?.name ?? item.destinationId);

export interface TripSummary {
  stopNames: string[];
  experiences: number;
  nights: number;
  partnerNights: number;
  guides: number;
  cost: number;
  fitsBudget?: boolean;
}

/** What one plan includes, for an option card or a side-by-side comparison. */
export function summariseTrip(trip: Trip): TripSummary {
  const cost = costTrip(trip);
  const stays = trip.logistics?.stays ?? [];
  return {
    stopNames: stopNamesOf(trip),
    experiences: trip.items.filter((item) => item.kind === 'EXPERIENCE').length,
    nights: stays.length,
    partnerNights: stays.filter((stay) => stay.businessId).length,
    guides: trip.logistics?.guides.length ?? 0,
    cost: cost.total,
    ...(cost.budget ? { fitsBudget: cost.budget.fits } : {}),
  };
}
