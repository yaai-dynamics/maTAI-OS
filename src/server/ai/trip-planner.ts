import { now } from '@/lib/config';
import { daysBetween } from '@/lib/date';
import { travelMinutes } from '@/lib/geo';
import { formatRupees } from '@/lib/money';
import { narrate } from '@/lib/ai/provider';
import { PROMPTS } from '@/lib/ai/prompts';
import type {
  AccessibilityNeed,
  Destination,
  DestinationCategory,
  Experience,
  ItineraryAlternative,
  ItineraryItem,
  Trip,
  TripProfile,
} from '@/lib/types';
import { destinationCategorySchema } from '@/lib/types';
import { getDestinations, getExperiencesFor, getInteractions } from '@/server/data/repository';
import { newOptionGroupId, newTripId } from '@/server/data/trips';
import { buildLogistics, costTrip, IMPHAL, nightsFromItems, pickStay } from '@/server/ai/trip-logistics';
import { currentWindow } from '@/server/analytics/windows';

/**
 * Tourist trip planning.
 *
 * Preference extraction and itinerary construction are both deterministic, so
 * the same request always produces the same journey and every recommendation
 * can be explained against a stated preference. The provider only writes the
 * short introduction.
 */

/* --------------------------- Preference extraction ------------------------ */

const INTEREST_KEYWORDS: Record<DestinationCategory, string[]> = {
  nature: ['nature', 'natural', 'lake', 'outdoors', 'landscape', 'scenery', 'hills', 'green', 'valley'],
  heritage: ['heritage', 'monument', 'ruins', 'palace', 'fort', 'temple', 'historic'],
  culture: ['culture', 'cultural', 'tradition', 'local life', 'people', 'village', 'community'],
  history: ['history', 'historical', 'war', 'battlefield', 'colonial', 'museum'],
  wildlife: ['wildlife', 'animals', 'birds', 'deer', 'sangai', 'safari', 'national park'],
  'eco-tourism': ['eco', 'sustainable', 'responsible', 'conservation', 'wetland'],
  adventure: ['adventure', 'trek', 'trekking', 'hike', 'hiking', 'climb', 'cycling', 'active'],
  craft: ['craft', 'crafts', 'pottery', 'handloom', 'weaving', 'textile', 'artisan', 'handicraft'],
  food: ['food', 'eat', 'eating', 'cuisine', 'culinary', 'cooking', 'meals', 'street food'],
  market: ['market', 'bazaar', 'shopping', 'keithel'],
  photography: ['photo', 'photography', 'photograph', 'camera', 'shoot'],
  border: ['border', 'frontier'],
  commerce: ['trade', 'commerce'],
  spiritual: ['spiritual', 'sacred', 'pilgrimage', 'worship'],
};

const CROWD_QUIET = ['less crowded', 'avoid crowd', 'not crowded', 'quiet', 'peaceful', 'off the beaten', 'uncrowded', 'away from crowds'];
const CROWD_POPULAR = ['popular', 'famous', 'must see', 'iconic', 'highlights', 'best known'];

const BUDGET_LOW = ['budget', 'cheap', 'affordable', 'low cost', 'backpack'];
const BUDGET_HIGH = ['premium', 'luxury', 'comfortable', 'high end', 'upmarket'];

const PACE_RELAXED = ['relaxed', 'slow', 'easy', 'unhurried', 'leisurely', 'rest'];
const PACE_PACKED = ['packed', 'as much as possible', 'see everything', 'fast', 'maximise', 'maximize'];

const ACCESSIBILITY_RULES: { need: AccessibilityNeed; terms: string[] }[] = [
  { need: 'LOW_MOBILITY', terms: ['wheelchair', 'limited mobility', 'low mobility', 'walking stick', 'cannot walk far', 'mobility'] },
  { need: 'SENIOR_FRIENDLY', terms: ['senior', 'elderly', 'parents', 'grandparent', 'older'] },
  { need: 'FAMILY_WITH_CHILDREN', terms: ['children', 'kids', 'family', 'child', 'toddler'] },
];

const containsAny = (text: string, terms: readonly string[]): boolean =>
  terms.some((term) => text.includes(term));

/**
 * Turns a free-text trip request into the structured profile every downstream
 * recommendation is explained against (docs/02-mvp-spec.md, E1).
 */
export function extractTripProfile(
  rawRequest: string,
  overrides: Partial<TripProfile> = {},
): TripProfile {
  const text = rawRequest.toLowerCase();

  let durationDays = 3;
  const digitMatch = /(\d+)\s*(?:-|\s)?\s*(?:day|days|night|nights)/.exec(text);
  if (digitMatch) {
    durationDays = Math.min(10, Math.max(1, Number(digitMatch[1])));
  } else {
    for (const [word, value] of Object.entries(WORD_NUMBERS)) {
      if (new RegExp(`\\b${word}\\s+(?:day|days|night|nights)`).test(text)) {
        durationDays = value;
        break;
      }
    }
  }

  const interests: DestinationCategory[] = [];
  for (const [category, keywords] of Object.entries(INTEREST_KEYWORDS)) {
    if (containsAny(text, keywords)) interests.push(category as DestinationCategory);
  }
  if (interests.length === 0) interests.push('culture', 'nature');

  const accessibility =
    ACCESSIBILITY_RULES.find((rule) => containsAny(text, rule.terms))?.need ?? 'NONE';

  const profile: TripProfile = {
    durationDays,
    budget: containsAny(text, BUDGET_HIGH) ? 'PREMIUM' : containsAny(text, BUDGET_LOW) ? 'BUDGET' : 'MODERATE',
    interests,
    crowdPreference: containsAny(text, CROWD_QUIET)
      ? 'QUIET'
      : containsAny(text, CROWD_POPULAR)
        ? 'POPULAR'
        : 'BALANCED',
    pace: containsAny(text, PACE_PACKED) ? 'PACKED' : containsAny(text, PACE_RELAXED) ? 'RELAXED' : 'BALANCED',
    accessibility,
    startingPoint: 'Imphal',
    travelStyle: '',
    languages: ['English'],
    rawRequest,
    travellers: readTravellers(text) ?? 1,
    ...(readBudgetAmount(text) ? { budgetAmount: readBudgetAmount(text)! } : {}),
    ...overrides,
  };

  // An amount says more than a word like "budget": it sets the level, unless
  // the level was chosen explicitly.
  if (profile.budgetAmount && !overrides.budget) {
    profile.budget = budgetLevelFor(profile.budgetAmount, profile.travellers, profile.durationDays);
  }

  profile.travelStyle = describeTravelStyle(profile);
  return profile;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const PARTY = '(?:people|persons|adults|travellers|travelers|friends|of us|pax|guests|members)';

/** How many are travelling, when the request says. */
export function readTravellers(text: string): number | undefined {
  const digits = new RegExp(`\\b(\\d{1,2})\\s*${PARTY}\\b`).exec(text);
  if (digits) return Math.min(20, Math.max(1, Number(digits[1])));
  const words = new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten)\\s+${PARTY}\\b`).exec(text);
  if (words) return WORD_NUMBERS[words[1]!];
  const family = /\bfamily of (\d{1,2}|two|three|four|five|six|seven|eight)\b/.exec(text);
  if (family) return Math.min(20, Number(family[1]) || WORD_NUMBERS[family[1]!]!);
  if (/\b(solo|alone|by myself|on my own)\b/.test(text)) return 1;
  if (/\b(couple|my (?:wife|husband|partner)|the two of us|honeymoon)\b/.test(text)) return 2;
  if (/\bwith my parents\b/.test(text)) return 3;
  return undefined;
}

const AMOUNT_PATTERNS = [
  /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac)?\b/,
  /\b(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac)?\s*(?:rupees|inr|rs)\b/,
  /\b(?:budget|spend|under|within|upto|up to|max(?:imum)?)\s*(?:of|is|around|about|:)?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac)?\b/,
];

/** The trip budget in rupees, when the request names one: "₹25,000", "30k", "1.5 lakh". */
export function readBudgetAmount(text: string): number | undefined {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const base = Number(match[1]!.replace(/,/g, ''));
    const unit = match[2];
    const value = unit === 'k' || unit === 'thousand' ? base * 1_000 : unit?.startsWith('la') ? base * 100_000 : base;
    // Small numbers after "under" or "within" are days or hours, not rupees.
    if (value >= 500 && value <= 10_000_000) return Math.round(value);
  }
  return undefined;
}

/**
 * The spending level an amount implies, per person per day. The thresholds
 * are a planning convention for choosing stays, not a price survey.
 */
export function budgetLevelFor(amount: number, travellers: number, days: number): TripProfile['budget'] {
  const perPersonPerDay = amount / Math.max(1, travellers) / Math.max(1, days);
  return perPersonPerDay < 3_500 ? 'BUDGET' : perPersonPerDay < 8_000 ? 'MODERATE' : 'PREMIUM';
}

function describeTravelStyle(profile: TripProfile): string {
  const parts: string[] = [];
  parts.push(
    profile.pace === 'RELAXED' ? 'Unhurried' : profile.pace === 'PACKED' ? 'Full' : 'Balanced',
  );
  parts.push(
    profile.crowdPreference === 'QUIET'
      ? 'quiet-leaning'
      : profile.crowdPreference === 'POPULAR'
        ? 'highlights-first'
        : 'mixed',
  );
  parts.push(`${profile.interests.slice(0, 3).join(', ')} traveller`);
  if (profile.accessibility !== 'NONE') {
    parts.push(
      profile.accessibility === 'LOW_MOBILITY'
        ? 'with step-free requirements'
        : profile.accessibility === 'SENIOR_FRIENDLY'
          ? 'travelling with seniors'
          : 'travelling with children',
    );
  }
  return parts.join(', ');
}

/* ----------------------------- Itinerary build ---------------------------- */

const DAY_BUDGET_MINUTES: Record<TripProfile['pace'], number> = {
  RELAXED: 300,
  BALANCED: 420,
  PACKED: 540,
};

const ACCESSIBILITY_MAX: Record<AccessibilityNeed, Experience['accessibility'][]> = {
  NONE: ['EASY', 'MODERATE', 'DEMANDING'],
  FAMILY_WITH_CHILDREN: ['EASY', 'MODERATE'],
  SENIOR_FRIENDLY: ['EASY', 'MODERATE'],
  LOW_MOBILITY: ['EASY'],
};

/** Destinations that cannot be reached without a sustained climb. */
const DEMANDING_DESTINATIONS = new Set(['dest-dzukou', 'dest-shirui']);

interface ScoredDestination {
  destination: Destination;
  score: number;
  matchedInterests: DestinationCategory[];
  reasons: string[];
  sharePercent: number;
  /** The request names this destination outright. */
  requested: boolean;
}

const normalizeName = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Whether the request names this place, as a whole phrase ("Loktak Lake", not "lake"). */
function namesDestination(request: string, name: string): boolean {
  const needle = normalizeName(name);
  return needle.length > 3 && ` ${normalizeName(request)} `.includes(` ${needle} `);
}

function scoreDestinations(profile: TripProfile): ScoredDestination[] {
  const window = currentWindow();
  const allInteractions = getInteractions({ from: window.from, to: window.to });
  const totalInteractions = Math.max(1, allInteractions.length);

  return getDestinations()
    .map((destination) => {
      const matchedInterests = destination.category.filter((category) =>
        profile.interests.includes(category),
      );
      const reasons: string[] = [];
      let score = matchedInterests.length * 26;

      if (matchedInterests.length > 0) {
        reasons.push(`matches your interest in ${matchedInterests.join(' and ')}`);
      }

      // A place asked for by name outranks interest matches; the safety and
      // access penalties below still apply to it.
      const requested = namesDestination(profile.rawRequest, destination.name);
      if (requested) {
        score += 80;
        reasons.push('was asked for by name');
      }

      const share =
        (allInteractions.filter((row) => row.destinationId === destination.id).length /
          totalInteractions) *
        100;

      if (profile.crowdPreference === 'QUIET') {
        // Busier destinations are penalised in proportion to their share of
        // platform activity, which is the only crowding proxy that exists here.
        const penalty = Math.min(30, share * 1.6);
        score -= penalty;
        if (share < 8) {
          score += 12;
          reasons.push('sees less platform activity than the busiest destinations, which fits your preference for quieter places');
        }
      } else if (profile.crowdPreference === 'POPULAR') {
        score += Math.min(22, share * 1.1);
        if (share > 10) reasons.push('is one of the most visited destinations in the state');
      }

      if (profile.accessibility === 'LOW_MOBILITY' || profile.accessibility === 'SENIOR_FRIENDLY') {
        if (DEMANDING_DESTINATIONS.has(destination.id)) {
          score -= 100;
        } else if (destination.typicalVisitMinutes <= 150) {
          score += 8;
          reasons.push('is a shorter, level visit');
        }
      }
      if (profile.accessibility === 'FAMILY_WITH_CHILDREN' && DEMANDING_DESTINATIONS.has(destination.id)) {
        score -= 60;
      }

      if (destination.status === 'WATCH') {
        score -= 14;
      }
      if (destination.id === 'dest-moreh') {
        // Access depends on current advisories, so it is never auto-planned.
        score -= 200;
      }

      if (profile.durationDays <= 3 && destination.typicalVisitMinutes > 400) {
        score -= 35;
        reasons.push('needs a full day, which is a lot to give up on a short trip');
      }

      return { destination, score, matchedInterests, reasons, sharePercent: Number(share.toFixed(1)), requested };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

const isHillRoute = (a: Destination, b: Destination): boolean =>
  a.palette === 'hill' || b.palette === 'hill' || a.district !== b.district;

/** Greedy nearest-neighbour ordering from the starting point, to keep days coherent. */
function routeDay(start: Destination, candidates: ScoredDestination[]): ScoredDestination[] {
  const remaining = [...candidates];
  const ordered: ScoredDestination[] = [];
  let cursor = start;

  while (remaining.length > 0) {
    remaining.sort(
      (a, b) =>
        travelMinutes(cursor, a.destination, { hill: isHillRoute(cursor, a.destination) }) -
        travelMinutes(cursor, b.destination, { hill: isHillRoute(cursor, b.destination) }),
    );
    const next = remaining.shift()!;
    ordered.push(next);
    cursor = next.destination;
  }

  return ordered;
}

function pickExperience(destination: Destination, profile: TripProfile): Experience | undefined {
  const allowed = ACCESSIBILITY_MAX[profile.accessibility];
  return getExperiencesFor(destination.id)
    .filter(
      (experience) =>
        experience.availabilityStatus !== 'UNAVAILABLE' &&
        experience.verified &&
        allowed.includes(experience.accessibility),
    )
    .map((experience) => ({
      experience,
      overlap: experience.tags.filter((tag) => profile.interests.includes(tag)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap || a.experience.durationMinutes - b.experience.durationMinutes)
    .map((row) => row.experience)[0];
}

const THEME_BY_CATEGORY: Partial<Record<DestinationCategory, string>> = {
  nature: 'The floating world and the eastern hills',
  heritage: 'Layers of Manipuri heritage',
  history: 'A history trail through the valley',
  culture: 'Living culture, market to village',
  food: 'Manipur through its kitchens',
  craft: 'Makers of Manipur',
  wildlife: 'Wetlands and wildlife',
  adventure: 'Ridges, valleys and long walks',
};

/**
 * The theme follows what the plan actually visits: the interest its stops
 * match most often, ties going to the order the visitor gave them in.
 */
function themeFor(items: readonly ItineraryItem[], profile: TripProfile): string {
  const counts = new Map<DestinationCategory, number>();
  for (const item of items) {
    if (item.kind !== 'DESTINATION') continue;
    for (const interest of item.matchedInterests) counts.set(interest, (counts.get(interest) ?? 0) + 1);
  }
  const ranked = profile.interests
    .filter((interest) => THEME_BY_CATEGORY[interest] && (counts.get(interest) ?? 0) > 0)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const dominant = ranked[0] ?? profile.interests.find((interest) => THEME_BY_CATEGORY[interest]);
  return (dominant && THEME_BY_CATEGORY[dominant]) ?? 'A Manipur journey built around what you asked for';
}

export interface BuiltTrip {
  trip: Trip;
  /** Destinations that were considered but did not make the plan, with reasons. */
  notIncluded: { name: string; reason: string }[];
}

/** When the visitor travels, if they said. Dates are Manipur dates. */
export interface TravelWindow {
  startDate: string;
  endDate: string;
  /** HH:MM on the first day. */
  arriveTime?: string;
  /** HH:MM on the last day. */
  departTime?: string;
}

/** What makes one option differ from another. */
export interface PlanShape {
  window?: TravelWindow;
  /** Places this option leaves out, so it goes somewhere else. */
  exclude?: ReadonlySet<string>;
  /** At most this many paid experiences in the whole trip. */
  maxExperiences?: number;
  optionGroupId?: string;
  optionLabel?: string;
}

/** The longest trip the planner builds. */
export const MAX_TRIP_DAYS = 10;

const DAY_START_MINUTE = 8 * 60;
/** From landing to the first stop, and from the last stop to check-in for a flight. */
const ARRIVAL_BUFFER_MINUTES = 60;
const DEPARTURE_BUFFER_MINUTES = 120;
/** A night is spent back in Imphal when the day ends this close to it. */
const RETURN_TO_BASE_MINUTES = 60;
/** ...or further, up to this, when there is no partner stay where the day ends. */
const RETURN_WITHOUT_STAY_MINUTES = 120;
/** No day starts with a longer drive than this. */
const MAX_TRANSFER_MINUTES = 300;
/** The "Shorter drives" option keeps to places this close to Imphal. */
const SHORT_DRIVE_MINUTES = 150;

const imphalOf = () => getDestinations().find((d) => d.id === IMPHAL)!;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const between2 = (a: Destination, b: Destination) =>
  a.id === b.id ? 0 : travelMinutes(a, b, { hill: isHillRoute(a, b) });

/** Days in a travel window, capped at what the planner builds. */
export const windowDays = (window: TravelWindow): number =>
  Math.min(
    MAX_TRIP_DAYS,
    Math.max(1, daysBetween(new Date(`${window.startDate}T00:00:00Z`), new Date(`${window.endDate}T00:00:00Z`)) + 1),
  );

/** A fresh id per plan, so signals raised while planning one trip never describe another. */
export function buildItinerary(
  requested: TripProfile,
  sessionId: string,
  tripId: string = newTripId(),
  shape: PlanShape = {},
): BuiltTrip {
  const { window, exclude = new Set<string>(), maxExperiences = Number.POSITIVE_INFINITY } = shape;
  // Dates, when given, decide the length: the visitor's own days beat a number in the text.
  const profile: TripProfile = window ? { ...requested, durationDays: windowDays(window) } : requested;
  const days = profile.durationDays;

  const scored = scoreDestinations(profile).filter((row) => !exclude.has(row.destination.id));
  const dayBudget = DAY_BUDGET_MINUTES[profile.pace];

  const imphal = getDestinations().find((d) => d.id === IMPHAL)!;
  const used = new Set<string>();
  const items: ItineraryItem[] = [];
  const nights: { night: number; destinationId: string }[] = [];
  let experiences = 0;
  // Each day starts where the night was spent; the first starts in Imphal.
  let base: Destination = imphal;

  for (let day = 1; day <= days; day += 1) {
    const first = day === 1;
    const last = day === days;
    const start =
      first && window?.arriveTime
        ? Math.max(DAY_START_MINUTE, minutesOf(window.arriveTime) + ARRIVAL_BUFFER_MINUTES)
        : DAY_START_MINUTE;
    // A late arrival or an early flight shortens the day; nothing is squeezed in.
    let available = Math.min(dayBudget, DAY_START_MINUTE + dayBudget + 60 - start);
    if (last && window?.departTime) {
      available = Math.min(available, minutesOf(window.departTime) - DEPARTURE_BUFFER_MINUTES - start);
    }
    const constrained = (first && Boolean(window?.arriveTime)) || (last && Boolean(window?.departTime));

    let cursor: Destination = base;
    let sequence = 0;
    let minutesUsed = 0;

    // Anchor each day on the best remaining destination that fits the day,
    // discounting long transfers from where the day starts (and, on the last
    // day, distance from Imphal, where the trip ends). Then fill around it with
    // whatever is genuinely close, so a day is never a zig-zag.
    const backFrom = (destination: Destination) => (last && window?.departTime ? between2(destination, imphal) : 0);
    const pool = scored.filter(
      (row) => !used.has(row.destination.id) && between2(base, row.destination) <= MAX_TRANSFER_MINUTES,
    );
    const fitting = pool.filter(
      (row) => between2(base, row.destination) + row.destination.typicalVisitMinutes + backFrom(row.destination) <= available,
    );
    // A single long visit may fill a normal day on its own, but never a day cut short by a flight.
    const choices = available < 60 ? [] : fitting.length > 0 ? fitting : constrained ? [] : pool;
    const anchor = choices
      .map((row) => ({
        row,
        value:
          row.score -
          Math.max(0, between2(base, row.destination) - 60) / 3 -
          // The trip ends in Imphal, so the last day leans hard towards it.
          (last ? Math.max(0, between2(row.destination, imphal) - 60) / 1.5 : 0),
      }))
      .sort((a, b) => b.value - a.value)[0]?.row;

    if (anchor) {
      const nearby = scored
        .filter((row) => !used.has(row.destination.id) && row.destination.id !== anchor.destination.id)
        .filter((row) => between2(anchor.destination, row.destination) <= 75)
        .slice(0, 3);

      for (const candidate of routeDay(base, [anchor, ...nearby])) {
        const travel = between2(cursor, candidate.destination);
        const visit = candidate.destination.typicalVisitMinutes;
        // On the last day the drive back to Imphal has to fit too.
        const back = backFrom(candidate.destination);
        const fits = minutesUsed + travel + visit + back <= available;
        if (!fits && (sequence > 0 || constrained)) continue;

        sequence += 1;
        minutesUsed += travel + visit;
        used.add(candidate.destination.id);
        cursor = candidate.destination;

        items.push({
          id: `${tripId}-d${day}-s${sequence}`,
          tripId,
          destinationId: candidate.destination.id,
          day,
          sequence,
          startTime: clock(start + minutesUsed - visit),
          durationMinutes: visit,
          travelMinutesFromPrevious: travel,
          rationale: buildRationale(candidate, profile),
          matchedInterests: candidate.matchedInterests,
          kind: 'DESTINATION',
        });

        // One local experience per day, where it fits and matches an interest.
        const experience = experiences < maxExperiences ? pickExperience(candidate.destination, profile) : undefined;
        if (experience && minutesUsed + experience.durationMinutes + back <= available && sequence <= 2) {
          sequence += 1;
          experiences += 1;
          minutesUsed += experience.durationMinutes;
          items.push({
            id: `${tripId}-d${day}-s${sequence}`,
            tripId,
            destinationId: candidate.destination.id,
            experienceId: experience.id,
            day,
            sequence,
            startTime: clock(start + minutesUsed - experience.durationMinutes),
            durationMinutes: experience.durationMinutes,
            travelMinutesFromPrevious: 0,
            rationale: `${experience.title} is run by a local provider and matches your interest in ${experience.tags.filter((tag) => profile.interests.includes(tag)).join(' and ') || experience.category}. Booking it locally keeps the spend with the household that hosts it.`,
            matchedInterests: experience.tags.filter((tag) => profile.interests.includes(tag)),
            kind: 'EXPERIENCE',
          });
        }
      }
    }

    if (!last) {
      // Sleep where the day ends if a partner can host you there; otherwise go
      // back to Imphal when it is not too far, since that is where rooms are.
      const home = between2(cursor, imphal);
      const night =
        cursor.id === imphal.id || home <= RETURN_TO_BASE_MINUTES
          ? imphal
          : pickStay(cursor.id, profile, days - 1) || home > RETURN_WITHOUT_STAY_MINUTES
            ? cursor
            : imphal;
      nights.push({ night: day, destinationId: night.id });
      base = night;
    }
  }

  const theme = themeFor(items, profile);

  const alternatives = buildAlternatives(items, scored, used, profile);

  const draft: Trip = {
    id: tripId,
    touristSessionId: sessionId,
    title: `${days} ${days === 1 ? 'day' : 'days'} in Manipur`,
    theme,
    ...(window
      ? {
          startDate: window.startDate,
          endDate: window.endDate,
          ...(window.arriveTime ? { arriveTime: window.arriveTime } : {}),
          ...(window.departTime ? { departTime: window.departTime } : {}),
        }
      : {}),
    preferences: profile,
    items,
    alternatives,
    status: 'DRAFT',
    ...(shape.optionGroupId ? { optionGroupId: shape.optionGroupId } : {}),
    ...(shape.optionLabel ? { optionLabel: shape.optionLabel } : {}),
    createdAt: now().toISOString(),
    provenance: 'PLATFORM_OBSERVED',
  };
  const trip: Trip = { ...draft, logistics: buildLogistics(draft, nights) };

  const notIncluded = scored
    .filter((row) => !used.has(row.destination.id))
    .slice(0, 4)
    .map((row) => ({
      name: row.destination.name,
      reason:
        row.destination.typicalVisitMinutes > 400
          ? 'needs a full day on its own'
          : row.sharePercent > 15 && profile.crowdPreference === 'QUIET'
            ? 'is among the busiest destinations, which does not fit your preference for quieter places'
            : 'scored lower against your stated interests than what is in the plan',
    }));

  return { trip, notIncluded };
}

/* --------------------------------- Options -------------------------------- */

export interface PlanOption extends BuiltTrip {
  label: string;
  /** One line on how this option differs from the others. */
  summary: string;
}

/** The most options one request produces. */
export const MAX_OPTIONS = 3;

const stopsOf = (trip: Trip) =>
  trip.items.filter((item) => item.kind === 'DESTINATION').map((item) => item.destinationId);

/** Share of the smaller plan's places that the two plans have in common. */
const overlap = (a: string[], b: string[]) => {
  if (a.length === 0 || b.length === 0) return 1;
  const shared = a.filter((id) => b.includes(id)).length;
  return shared / Math.min(a.length, b.length);
};

/**
 * Two or three genuinely different plans for one request: the best match, a
 * different route in the same style, and either a cheaper version (when the
 * best match is over the budget given) or a different pace. An option that
 * would repeat another is dropped, so a narrow request may get fewer.
 */
export function planOptions(profile: TripProfile, sessionId: string, window?: TravelWindow): PlanOption[] {
  const optionGroupId = newOptionGroupId();
  const make = (shapeProfile: TripProfile, shape: PlanShape, label: string) =>
    buildItinerary(shapeProfile, sessionId, newTripId(), { ...shape, ...(window ? { window } : {}), optionGroupId, optionLabel: label });
  const names = (ids: string[]) =>
    ids.map((id) => getDestinations().find((d) => d.id === id)?.name ?? id).join(' and ');

  const best = make(profile, {}, 'Best match');
  const options: PlanOption[] = [{ ...best, label: 'Best match', summary: 'The closest fit to what you asked for.' }];
  if (best.trip.items.length === 0) return options;

  const repeats = (candidate: BuiltTrip) =>
    candidate.trip.items.length === 0 ||
    options.some((option) => stopsOf(option.trip).join() === stopsOf(candidate.trip).join());

  // A different route: somewhere else entirely where there is enough else to
  // see, or failing that, without the places the best match builds its days on.
  const everywhere = new Set(stopsOf(best.trip));
  const elsewhere = make(profile, { exclude: everywhere }, 'Another route');
  const anchors = [
    ...new Set(
      [...Array(best.trip.preferences.durationDays).keys()]
        .map((index) => best.trip.items.find((item) => item.day === index + 1 && item.kind === 'DESTINATION')?.destinationId)
        .filter((id): id is string => id !== undefined),
    ),
  ].slice(0, 2);
  if (stopsOf(elsewhere.trip).length >= Math.max(1, Math.ceil(everywhere.size / 2))) {
    options.push({ ...elsewhere, label: 'Another route', summary: 'Different places in the same style.' });
  } else {
    const route = make(profile, { exclude: new Set(anchors) }, 'Another route');
    // At least a third of its places differ, or it is not really another route.
    if (!repeats(route) && overlap(stopsOf(route.trip), stopsOf(best.trip)) < 0.7) {
      options.push({ ...route, label: 'Another route', summary: `Different places in the same style, without ${names(anchors)}.` });
    }
  }

  const bestCost = costTrip(best.trip).total;
  const overBudget = profile.budgetAmount !== undefined && bestCost > profile.budgetAmount;

  const leaner = (): PlanOption | undefined => {
    const lean = make({ ...profile, budget: 'BUDGET' }, { maxExperiences: 1 }, 'Lower cost');
    const saving = bestCost - costTrip(lean.trip).total;
    return lean.trip.items.length > 0 && saving >= bestCost * 0.08
      ? { ...lean, label: 'Lower cost', summary: `Simpler stays and one paid experience: about ${formatRupees(saving)} less.` }
      : undefined;
  };
  const paced = (): PlanOption | undefined => {
    const pace: TripProfile['pace'] = profile.pace === 'RELAXED' ? 'BALANCED' : 'RELAXED';
    const shaped = { ...profile, pace, travelStyle: describeTravelStyle({ ...profile, pace }) };
    const label = pace === 'RELAXED' ? 'Slower pace' : 'More to see';
    const option = make(shaped, {}, label);
    return repeats(option)
      ? undefined
      : {
          ...option,
          label,
          summary: pace === 'RELAXED' ? 'Fewer stops and more time at each.' : 'More stops each day, at a brisker pace.',
        };
  };
  const nearer = (): PlanOption | undefined => {
    const far = new Set(
      getDestinations()
        .filter((destination) => between2(imphalOf(), destination) > SHORT_DRIVE_MINUTES)
        .map((destination) => destination.id),
    );
    if (!stopsOf(best.trip).some((id) => far.has(id))) return undefined;
    const option = make(profile, { exclude: far }, 'Shorter drives');
    return stopsOf(option.trip).length >= 2 && !repeats(option)
      ? { ...option, label: 'Shorter drives', summary: 'Everything within about two and a half hours of Imphal.' }
      : undefined;
  };
  const wider = (): PlanOption | undefined => {
    const added = (['culture', 'nature', 'heritage'] as DestinationCategory[]).filter(
      (interest) => !profile.interests.includes(interest),
    );
    if (added.length === 0) return undefined;
    const interests = [...profile.interests, ...added.slice(0, 2)];
    const shaped = { ...profile, interests, travelStyle: describeTravelStyle({ ...profile, interests }) };
    const option = make(shaped, {}, 'A wider mix');
    return !repeats(option) && overlap(stopsOf(option.trip), stopsOf(best.trip)) < 1
      ? { ...option, label: 'A wider mix', summary: `Adds ${added.slice(0, 2).join(' and ')} to what you asked for.` }
      : undefined;
  };

  // Over budget, the cheaper version matters more than a change of pace.
  const variants = overBudget ? [leaner, paced, nearer, wider] : [paced, leaner, nearer, wider];
  for (const variant of variants) {
    if (options.length >= MAX_OPTIONS) break;
    const option = variant();
    if (option) options.push(option);
  }

  return options.slice(0, MAX_OPTIONS);
}

function buildRationale(candidate: ScoredDestination, profile: TripProfile): string {
  const parts: string[] = [];
  if (candidate.requested) {
    parts.push(`Included because you asked for ${candidate.destination.name}`);
  } else if (candidate.matchedInterests.length > 0) {
    parts.push(`Recommended because you asked for ${candidate.matchedInterests.join(' and ')}`);
  } else {
    parts.push('Included to connect the day geographically');
  }
  if (profile.crowdPreference === 'QUIET' && candidate.sharePercent < 8) {
    parts.push(`it holds only ${candidate.sharePercent}% of current platform activity, so it is one of the quieter options`);
  }
  if (profile.accessibility !== 'NONE' && candidate.destination.accessibilityNotes) {
    parts.push(candidate.destination.accessibilityNotes.toLowerCase().replace(/\.$/, ''));
  }
  return `${parts.join(', and ')}.`;
}

function buildAlternatives(
  items: readonly ItineraryItem[],
  scored: readonly ScoredDestination[],
  used: ReadonlySet<string>,
  profile: TripProfile,
): ItineraryAlternative[] {
  const spare = scored.filter((row) => !used.has(row.destination.id)).slice(0, 2);
  const destinationItems = items.filter((item) => item.kind === 'DESTINATION');
  const weakest = destinationItems[destinationItems.length - 1];
  if (!weakest || spare.length === 0) return [];

  return spare.slice(0, 1).map((row) => ({
    replacesItemId: weakest.id,
    destinationId: row.destination.id,
    reason: `Swap in ${row.destination.name} if you would rather ${
      row.matchedInterests.length > 0
        ? `spend the time on ${row.matchedInterests.join(' and ')}`
        : 'see somewhere different'
    }. It is ${profile.crowdPreference === 'QUIET' ? 'quieter still' : 'a comparable visit'} and sits in ${row.destination.district}.`,
  }));
}

/* -------------------------------- Re-planning ----------------------------- */

export type TripCondition = 'RAIN' | 'SHORT_ON_TIME' | 'CLOSURE';

export const CONDITION_LABEL: Record<TripCondition, string> = {
  RAIN: 'Heavy rain forecast',
  SHORT_ON_TIME: 'Running short on time',
  CLOSURE: 'A site on the plan is closed',
};

/**
 * Adaptive re-plan under a controlled condition.
 *
 * The prototype has no weather feed connected, so the condition is supplied
 * explicitly rather than inferred. That keeps the demo honest and repeatable.
 */
export function replanTrip(trip: Trip, condition: TripCondition): Trip {
  const destinations = new Map(getDestinations().map((d) => [d.id, d]));
  const scored = scoreDestinations(trip.preferences);
  const inPlan = new Set(trip.items.map((item) => item.destinationId));

  let items = [...trip.items];
  let reason = '';

  if (condition === 'RAIN') {
    // Move outdoor-led stops off the affected day and bring indoor or covered
    // alternatives forward. Nothing is deleted without a replacement.
    const outdoorIds = new Set(
      [...destinations.values()]
        .filter((d) => d.category.some((c) => ['nature', 'adventure', 'eco-tourism', 'wildlife'].includes(c)))
        .map((d) => d.id),
    );
    const replacement = scored.find(
      (row) => !inPlan.has(row.destination.id) && !outdoorIds.has(row.destination.id),
    );
    const affected = items.find((item) => item.kind === 'DESTINATION' && outdoorIds.has(item.destinationId));

    if (affected && replacement) {
      items = items.map((item) =>
        item.id === affected.id
          ? {
              ...item,
              destinationId: replacement.destination.id,
              durationMinutes: replacement.destination.typicalVisitMinutes,
              rationale: `Swapped in for ${destinations.get(affected.destinationId)?.name ?? 'the original stop'} because heavy rain makes an open-air visit a poor use of the day. ${buildRationale(replacement, trip.preferences)}`,
              matchedInterests: replacement.matchedInterests,
            }
          : item,
      );
      reason = `Heavy rain forecast: ${destinations.get(affected.destinationId)?.name} moved out and ${replacement.destination.name} brought in, which is a covered visit.`;
    } else {
      reason = 'Heavy rain forecast: no open-air stop needed to move on this plan.';
    }
  }

  if (condition === 'SHORT_ON_TIME') {
    const perDay = new Map<number, ItineraryItem[]>();
    for (const item of items) {
      perDay.set(item.day, [...(perDay.get(item.day) ?? []), item]);
    }
    const busiest = [...perDay.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (busiest && busiest[1].length > 1) {
      const dropped = busiest[1][busiest[1].length - 1]!;
      items = items.filter((item) => item.id !== dropped.id);
      reason = `Running short on time: the last stop on day ${busiest[0]} was removed so the rest of the day is not rushed.`;
    } else {
      reason = 'Running short on time: the plan is already light enough to keep.';
    }
  }

  if (condition === 'CLOSURE') {
    const first = items.find((item) => item.kind === 'DESTINATION');
    const replacement = scored.find((row) => !inPlan.has(row.destination.id));
    if (first && replacement) {
      items = items.map((item) =>
        item.id === first.id
          ? {
              ...item,
              destinationId: replacement.destination.id,
              durationMinutes: replacement.destination.typicalVisitMinutes,
              rationale: `Replaces ${destinations.get(first.destinationId)?.name ?? 'the closed site'}, which is reported closed. ${buildRationale(replacement, trip.preferences)}`,
              matchedInterests: replacement.matchedInterests,
            }
          : item,
      );
      reason = `${destinations.get(first.destinationId)?.name} is reported closed: ${replacement.destination.name} replaces it.`;
    } else {
      reason = 'No suitable replacement was available for the closed site.';
    }
  }

  const replanned = { ...trip, items, adaptedReason: reason };
  return { ...replanned, logistics: buildLogistics(replanned, nightsFromItems(replanned)) };
}

/* ------------------------------- Narration -------------------------------- */

export async function describeTrip(trip: Trip, notIncluded: BuiltTrip['notIncluded']) {
  const destinations = new Map(getDestinations().map((d) => [d.id, d.name]));
  const stops = trip.items
    .filter((item) => item.kind === 'DESTINATION')
    .map((item) => destinations.get(item.destinationId) ?? item.destinationId);

  const profile = trip.preferences;
  const deterministicText = [
    `Here is a ${profile.durationDays} day trip built around ${profile.interests.join(', ')}${
      profile.crowdPreference === 'QUIET' ? ', leaning towards quieter places' : ''
    }.`,
    `It runs ${stops.join(' → ')}, at a ${profile.pace.toLowerCase()} pace from ${profile.startingPoint}.`,
    notIncluded.length > 0
      ? `${notIncluded[0]!.name} was left out because it ${notIncluded[0]!.reason}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return narrate({
    promptId: PROMPTS.tripPlanner.id,
    system: PROMPTS.tripPlanner.system,
    deterministicText,
    evidence: { profile, stops, theme: trip.theme, notIncluded },
    task: 'Write the short introduction to this itinerary, addressed to the traveller.',
    maxTokens: 260,
  });
}

/** Chips offered on E1, matching the categories the extractor understands. */
export const INTEREST_CHIPS: DestinationCategory[] = destinationCategorySchema.options.filter(
  (category) => !['border', 'commerce'].includes(category),
);
