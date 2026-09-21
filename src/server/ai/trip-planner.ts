import { now } from '@/lib/config';
import { addDays, toIsoDate } from '@/lib/date';
import { travelMinutes } from '@/lib/geo';
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
import { newTripId } from '@/server/data/trips';
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

  const wordNumbers: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  };
  let durationDays = 3;
  const digitMatch = /(\d+)\s*(?:-|\s)?\s*(?:day|days|night|nights)/.exec(text);
  if (digitMatch) {
    durationDays = Math.min(10, Math.max(1, Number(digitMatch[1])));
  } else {
    for (const [word, value] of Object.entries(wordNumbers)) {
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
    ...overrides,
  };

  profile.travelStyle = describeTravelStyle(profile);
  return profile;
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

      return { destination, score, matchedInterests, reasons, sharePercent: Number(share.toFixed(1)) };
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

export interface BuiltTrip {
  trip: Trip;
  /** Destinations that were considered but did not make the plan, with reasons. */
  notIncluded: { name: string; reason: string }[];
}

/** A fresh id per plan, so signals raised while planning one trip never describe another. */
export function buildItinerary(profile: TripProfile, sessionId: string, tripId: string = newTripId()): BuiltTrip {
  const scored = scoreDestinations(profile);
  const startDate = addDays(now(), 1);
  const dayBudget = DAY_BUDGET_MINUTES[profile.pace];

  const imphal = getDestinations().find((d) => d.id === 'dest-kangla')!;
  const used = new Set<string>();
  const items: ItineraryItem[] = [];

  for (let day = 1; day <= profile.durationDays; day += 1) {
    // Anchor each day on the best remaining destination, then fill around it
    // with whatever is genuinely close, so a day is never a zig-zag.
    const anchor = scored.find((row) => !used.has(row.destination.id));
    if (!anchor) break;

    const nearby = scored
      .filter((row) => !used.has(row.destination.id) && row.destination.id !== anchor.destination.id)
      .filter(
        (row) =>
          travelMinutes(anchor.destination, row.destination, {
            hill: isHillRoute(anchor.destination, row.destination),
          }) <= 75,
      )
      .slice(0, 3);

    const dayStart = day === 1 ? imphal : anchor.destination;
    const planned = routeDay(dayStart, [anchor, ...nearby]);

    let minutesUsed = 0;
    let cursor: Destination = imphal;
    let sequence = 0;

    for (const candidate of planned) {
      const hill = isHillRoute(cursor, candidate.destination);
      const travel = cursor.id === candidate.destination.id ? 0 : travelMinutes(cursor, candidate.destination, { hill });
      const visit = candidate.destination.typicalVisitMinutes;
      if (minutesUsed + travel + visit > dayBudget && sequence > 0) continue;

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
        startTime: `${String(8 + Math.floor((minutesUsed - visit) / 60)).padStart(2, '0')}:${String((minutesUsed - visit) % 60).padStart(2, '0')}`,
        durationMinutes: visit,
        travelMinutesFromPrevious: travel,
        rationale: buildRationale(candidate, profile),
        matchedInterests: candidate.matchedInterests,
        kind: 'DESTINATION',
      });

      // One local experience per day, where it fits and matches an interest.
      const experience = pickExperience(candidate.destination, profile);
      if (experience && minutesUsed + experience.durationMinutes <= dayBudget && sequence <= 2) {
        sequence += 1;
        minutesUsed += experience.durationMinutes;
        items.push({
          id: `${tripId}-d${day}-s${sequence}`,
          tripId,
          destinationId: candidate.destination.id,
          experienceId: experience.id,
          day,
          sequence,
          startTime: `${String(8 + Math.floor((minutesUsed - experience.durationMinutes) / 60)).padStart(2, '0')}:${String((minutesUsed - experience.durationMinutes) % 60).padStart(2, '0')}`,
          durationMinutes: experience.durationMinutes,
          travelMinutesFromPrevious: 0,
          rationale: `${experience.title} is run by a local provider and matches your interest in ${experience.tags.filter((tag) => profile.interests.includes(tag)).join(' and ') || experience.category}. Booking it locally keeps the spend with the household that hosts it.`,
          matchedInterests: experience.tags.filter((tag) => profile.interests.includes(tag)),
          kind: 'EXPERIENCE',
        });
      }
    }
  }

  const dominant = profile.interests[0] ?? 'culture';
  const theme = THEME_BY_CATEGORY[dominant] ?? 'A Manipur journey built around what you asked for';

  const alternatives = buildAlternatives(items, scored, used, profile);

  const trip: Trip = {
    id: tripId,
    touristSessionId: sessionId,
    title: `${profile.durationDays} days in Manipur`,
    theme,
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(addDays(startDate, profile.durationDays - 1)),
    preferences: profile,
    items,
    alternatives,
    status: 'DRAFT',
    createdAt: now().toISOString(),
    provenance: 'PLATFORM_OBSERVED',
  };

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

function buildRationale(candidate: ScoredDestination, profile: TripProfile): string {
  const parts: string[] = [];
  if (candidate.matchedInterests.length > 0) {
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

  return { ...trip, items, adaptedReason: reason };
}

/* ------------------------------- Narration -------------------------------- */

export async function describeTrip(trip: Trip, notIncluded: BuiltTrip['notIncluded']) {
  const destinations = new Map(getDestinations().map((d) => [d.id, d.name]));
  const stops = trip.items
    .filter((item) => item.kind === 'DESTINATION')
    .map((item) => destinations.get(item.destinationId) ?? item.destinationId);

  const profile = trip.preferences;
  const deterministicText = [
    `Here is a ${profile.durationDays} day journey built around ${profile.interests.join(', ')}${
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
