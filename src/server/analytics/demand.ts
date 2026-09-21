import { addDays, startOfUtcDay, toIsoDate } from '@/lib/date';
import { deriveConfidence, weakestProvenance, type Confidence, type Provenance } from '@/lib/provenance';
import type { Destination, InteractionType, TourismInteraction } from '@/lib/types';
import { getDestinations, getInteractions } from '@/server/data/repository';
import { percentChange, previousWindow, roundTo, type AnalysisWindow } from '@/server/analytics/windows';

/**
 * Destination demand, trend, concentration and distribution.
 *
 * Every figure here is computed in code, never by a model. The weighting is
 * documented in the knowledge base as doc-004 and doc-005 so the government
 * interface can show a reader exactly how a number was produced.
 */

/** Interaction weights for the demand index. Intent counts for more than a glance. */
export const DEMAND_WEIGHTS: Record<InteractionType, number> = {
  DESTINATION_VIEW: 1,
  SEARCH: 1,
  NAVIGATION_START: 2,
  ITINERARY_ADD: 3,
  QR_CHECKIN: 4,
  BOOKING: 4,
  REVIEW: 1,
  FEEDBACK: 1,
  // The request that led to a payment has already counted as intent (BOOKING),
  // so paying adds nothing to demand. Counting it again would let one
  // traveller's booking weigh twice as much as another's enquiry.
  BOOKING_CONFIRMED: 0,
  BOOKING_CANCELLED: 0,
};

export const DEMAND_METHOD =
  'Weighted platform interactions over the window: views and searches x1, navigation starts x2, itinerary additions x3, check-ins and booking requests or enquiries x4 (paying for a booking adds nothing further). Scaled so the highest scoring destination is 100.';

export interface DestinationDemand {
  destinationId: string;
  name: string;
  district: string;
  /** 0 to 100, relative to the strongest destination in the same window. */
  demandIndex: number;
  weightedScore: number;
  interactions: number;
  views: number;
  searches: number;
  itineraryAdds: number;
  navigationStarts: number;
  checkins: number;
  enquiries: number;
  /** Percentage change in weighted score against the preceding window. */
  trendPercent: number | null;
  previousWeightedScore: number;
  /** Share of total weighted activity across all destinations. */
  sharePercent: number;
  provenance: Provenance;
  confidence: Confidence;
}

const weightOf = (interaction: TourismInteraction): number => DEMAND_WEIGHTS[interaction.type];

function tally(interactions: readonly TourismInteraction[]) {
  let weighted = 0;
  const counts: Record<InteractionType, number> = {
    DESTINATION_VIEW: 0,
    SEARCH: 0,
    NAVIGATION_START: 0,
    ITINERARY_ADD: 0,
    QR_CHECKIN: 0,
    BOOKING: 0,
    REVIEW: 0,
    FEEDBACK: 0,
    BOOKING_CONFIRMED: 0,
    BOOKING_CANCELLED: 0,
  };
  const provenances: Provenance[] = [];

  for (const interaction of interactions) {
    weighted += weightOf(interaction);
    counts[interaction.type] += 1;
    provenances.push(interaction.provenance);
  }

  return { weighted, counts, provenances };
}

export function computeDemand(window: AnalysisWindow): DestinationDemand[] {
  const destinations = getDestinations();
  const previous = previousWindow(window);

  const rows = destinations.map((destination) => {
    const current = getInteractions({
      destinationId: destination.id,
      from: window.from,
      to: window.to,
    });
    const before = getInteractions({
      destinationId: destination.id,
      from: previous.from,
      to: previous.to,
    });

    const currentTally = tally(current);
    const beforeTally = tally(before);

    return {
      destination,
      currentTally,
      beforeWeighted: beforeTally.weighted,
      interactions: current.length,
    };
  });

  const maxWeighted = Math.max(1, ...rows.map((row) => row.currentTally.weighted));
  const totalWeighted = rows.reduce((sum, row) => sum + row.currentTally.weighted, 0) || 1;

  return rows
    .map(({ destination, currentTally, beforeWeighted, interactions }) => {
      const provenance = weakestProvenance(
        currentTally.provenances.length > 0 ? currentTally.provenances : ['DEMO_SYNTHETIC'],
      );
      return {
        destinationId: destination.id,
        name: destination.name,
        district: destination.district,
        demandIndex: Math.round((currentTally.weighted / maxWeighted) * 100),
        weightedScore: currentTally.weighted,
        interactions,
        views: currentTally.counts.DESTINATION_VIEW,
        searches: currentTally.counts.SEARCH,
        itineraryAdds: currentTally.counts.ITINERARY_ADD,
        navigationStarts: currentTally.counts.NAVIGATION_START,
        checkins: currentTally.counts.QR_CHECKIN,
        enquiries: currentTally.counts.BOOKING,
        trendPercent:
          percentChange(currentTally.weighted, beforeWeighted) === null
            ? null
            : roundTo(percentChange(currentTally.weighted, beforeWeighted)!, 1),
        previousWeightedScore: beforeWeighted,
        sharePercent: roundTo((currentTally.weighted / totalWeighted) * 100, 1),
        provenance,
        confidence: deriveConfidence({
          sources: [provenance],
          sampleSize: interactions,
          consistent: beforeWeighted > 0,
        }),
      } satisfies DestinationDemand;
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);
}

export interface ConcentrationSummary {
  /** Share of weighted activity held by the top three destinations, 0 to 100. */
  topThreeSharePercent: number;
  topThree: { name: string; sharePercent: number }[];
  /** Normalised entropy, 0 to 100. Higher means activity is spread more evenly. */
  distributionScore: number;
  destinationsCovered: number;
  method: string;
}

export const CONCENTRATION_METHOD =
  'Share of weighted interaction volume held by the three highest ranked destinations, and the normalised entropy of the share across all destinations expressed from 0 to 100.';

export function computeConcentration(demand: readonly DestinationDemand[]): ConcentrationSummary {
  const total = demand.reduce((sum, row) => sum + row.weightedScore, 0);
  const active = demand.filter((row) => row.weightedScore > 0);

  if (total === 0 || active.length === 0) {
    return {
      topThreeSharePercent: 0,
      topThree: [],
      distributionScore: 0,
      destinationsCovered: 0,
      method: CONCENTRATION_METHOD,
    };
  }

  const topThree = demand.slice(0, 3);
  const topThreeShare = (topThree.reduce((sum, row) => sum + row.weightedScore, 0) / total) * 100;

  const entropy = active.reduce((sum, row) => {
    const share = row.weightedScore / total;
    return sum - share * Math.log(share);
  }, 0);
  const maxEntropy = Math.log(active.length);

  return {
    topThreeSharePercent: roundTo(topThreeShare, 1),
    topThree: topThree.map((row) => ({ name: row.name, sharePercent: row.sharePercent })),
    distributionScore: maxEntropy === 0 ? 0 : Math.round((entropy / maxEntropy) * 100),
    destinationsCovered: active.length,
    method: CONCENTRATION_METHOD,
  };
}

/**
 * Emerging score: growth that the destination can actually absorb.
 * Growth alone is not an opportunity if there is nowhere for visitors to stay.
 */
export interface EmergingDestination {
  destinationId: string;
  name: string;
  district: string;
  score: number;
  trendPercent: number | null;
  demandIndex: number;
  capacitySignal: Destination['capacitySignal'];
  ecoSensitivity: Destination['ecoSensitivity'];
  reason: string;
}

const CAPACITY_WEIGHT: Record<Destination['capacitySignal'], number> = {
  HIGH: 1,
  MEDIUM: 0.6,
  LOW: 0.2,
};

/**
 * Minimum interactions in the window before a growth rate is allowed to drive a
 * recommendation. Below this a large percentage is an artefact of a small
 * denominator, and promoting on it would be promoting noise.
 */
export const MIN_SAMPLE_FOR_TREND = 40;

export function computeEmerging(demand: readonly DestinationDemand[]): EmergingDestination[] {
  const destinations = new Map(getDestinations().map((d) => [d.id, d]));

  return demand
    .map((row) => {
      const destination = destinations.get(row.destinationId);
      if (!destination) return undefined;

      const hasSample = row.interactions >= MIN_SAMPLE_FOR_TREND;
      const growth = row.trendPercent ?? 0;
      // Growth carries the score; headroom scales it; a saturated destination
      // scores low however fast it is growing. Too small a sample scores zero.
      const headroom = CAPACITY_WEIGHT[destination.capacitySignal];
      const notAlreadyDominant = 1 - Math.min(1, row.demandIndex / 100) * 0.6;
      const score = hasSample ? Math.max(0, growth) * headroom * notAlreadyDominant : 0;

      return {
        destinationId: row.destinationId,
        name: row.name,
        district: row.district,
        score: roundTo(score, 1),
        trendPercent: row.trendPercent,
        demandIndex: row.demandIndex,
        capacitySignal: destination.capacitySignal,
        ecoSensitivity: destination.ecoSensitivity,
        reason: !hasSample
          ? `Too few interactions in the window (${row.interactions}) to read a growth rate`
          : destination.capacitySignal === 'HIGH'
            ? 'Rising interest with reported headroom among participating partners'
            : destination.capacitySignal === 'MEDIUM'
              ? 'Rising interest with limited reported headroom'
              : 'Rising interest but little reported headroom',
      } satisfies EmergingDestination;
    })
    .filter((row): row is EmergingDestination => row !== undefined)
    .sort((a, b) => b.score - a.score);
}

/** Daily weighted activity series for the whole state, used by trend charts. */
export function computeActivitySeries(
  window: AnalysisWindow,
  destinationId?: string,
): { date: string; value: number }[] {
  const interactions = getInteractions({
    from: window.from,
    to: window.to,
    ...(destinationId ? { destinationId } : {}),
  });

  const byDay = new Map<string, number>();
  for (let i = 0; i < window.days; i += 1) {
    byDay.set(toIsoDate(addDays(startOfUtcDay(window.from), i)), 0);
  }
  for (const interaction of interactions) {
    const key = toIsoDate(new Date(interaction.timestamp));
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + weightOf(interaction));
  }

  return [...byDay.entries()].map(([date, value]) => ({ date, value }));
}
