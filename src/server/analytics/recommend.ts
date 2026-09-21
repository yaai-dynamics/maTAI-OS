import type { Alert, Destination } from '@/lib/types';
import { getDestination } from '@/server/data/repository';
import type { DestinationCapacity } from '@/server/analytics/capacity';
import { MIN_SAMPLE_FOR_TREND, type ConcentrationSummary, type DestinationDemand } from '@/server/analytics/demand';
import type { DestinationSentiment } from '@/server/analytics/sentiment';
import { roundTo } from '@/server/analytics/windows';

/**
 * Promotion target recommendation.
 *
 * Implements the diversification rule recorded in the knowledge base as
 * doc-001. Rising interest on its own is an observation, not an opportunity:
 * a promotion candidate also needs somewhere for the visitors to stay, enough
 * of a local supply base for them to spend into, and headroom that promoting it
 * would not immediately exhaust.
 *
 * Two deliberate design decisions, both of which cost the obvious answer:
 *
 * 1. A destination already inside the top three by share is excluded from a
 *    diversification objective. Promoting it increases concentration, which is
 *    the opposite of what was asked.
 * 2. An open action-level issue does not disqualify a destination. It reduces
 *    the score and attaches a condition, so the department promotes and fixes
 *    together rather than doing neither.
 *
 * The emerging score in demand.ts answers "what is growing". This answers
 * "what should we promote", which is a stricter question.
 */

export const RECOMMENDATION_METHOD =
  'Growth in weighted activity, scaled by spare reported partner capacity against a 20 place campaign threshold, by the breadth of participating local supply, and reduced for ecological sensitivity, for share of state activity and for any open action-level issue. Destinations that are already among the three largest, have no participating business, sit under an advisory or have too small a sample are excluded and listed with the reason.';

const SENSITIVITY_FACTOR: Record<Destination['ecoSensitivity'], number> = {
  LOW: 1,
  MEDIUM: 0.85,
  HIGH: 0.6,
};

/** Spare places a destination needs before a campaign can be absorbed comfortably. */
const CAMPAIGN_CAPACITY_THRESHOLD = 20;

/** Participating businesses plus bookable experiences that count as a full supply base. */
const SUPPLY_BREADTH_TARGET = 8;

/** Applied when an action-level issue is open at the destination. */
const OPEN_ISSUE_PENALTY = 0.7;

export type CampaignObjective = 'DIVERSIFY' | 'GROW';

export interface CampaignTarget {
  destinationId: string;
  name: string;
  district: string;
  score: number;
  trendPercent: number | null;
  demandIndex: number;
  sharePercent: number;
  spareCapacity: number;
  totalCapacity: number;
  supplyBusinesses: number;
  availableExperiences: number;
  ecoSensitivity: Destination['ecoSensitivity'];
  averageRating: number | null;
  /** Why this is a candidate, in officer-readable form. */
  rationale: string[];
  /** Things that must happen alongside the campaign, not instead of it. */
  conditions: string[];
  /** Populated when the destination is excluded. */
  exclusionReason?: string;
}

export interface RecommendationInput {
  demand: readonly DestinationDemand[];
  capacity: readonly DestinationCapacity[];
  sentiment: readonly DestinationSentiment[];
  alerts: readonly Alert[];
  concentration: ConcentrationSummary;
  objective?: CampaignObjective;
  limit?: number;
}

export interface RecommendationResult {
  objective: CampaignObjective;
  recommended: CampaignTarget[];
  excluded: CampaignTarget[];
  method: string;
}

export function recommendCampaignTargets({
  demand,
  capacity,
  sentiment,
  alerts,
  concentration,
  objective = 'DIVERSIFY',
  limit = 3,
}: RecommendationInput): RecommendationResult {
  const capacityById = new Map(capacity.map((row) => [row.destinationId, row]));
  const sentimentById = new Map(sentiment.map((row) => [row.destinationId, row]));
  const topThreeNames = new Set(concentration.topThree.map((row) => row.name));

  const actionAlertsByDestination = new Map<string, Alert[]>();
  for (const alert of alerts) {
    if (alert.severity !== 'ACTION' || alert.entityType !== 'DESTINATION') continue;
    const list = actionAlertsByDestination.get(alert.entityId) ?? [];
    list.push(alert);
    actionAlertsByDestination.set(alert.entityId, list);
  }

  const recommended: CampaignTarget[] = [];
  const excluded: CampaignTarget[] = [];

  for (const row of demand) {
    const destination = getDestination(row.destinationId);
    if (!destination) continue;

    const supply = capacityById.get(row.destinationId);
    const feeling = sentimentById.get(row.destinationId);
    const spare = supply?.availableCapacity ?? 0;
    const businesses = supply?.totalBusinesses ?? 0;
    const availableExperiences = supply?.availableExperiences ?? 0;
    const blocking = actionAlertsByDestination.get(row.destinationId) ?? [];

    const base = {
      destinationId: row.destinationId,
      name: row.name,
      district: row.district,
      trendPercent: row.trendPercent,
      demandIndex: row.demandIndex,
      sharePercent: row.sharePercent,
      spareCapacity: spare,
      totalCapacity: supply?.totalCapacity ?? 0,
      supplyBusinesses: businesses,
      availableExperiences,
      ecoSensitivity: destination.ecoSensitivity,
      averageRating: feeling?.averageRating ?? null,
    };

    let exclusionReason: string | undefined;
    if (destination.status === 'ATTENTION') {
      exclusionReason =
        'Destination status is ATTENTION. Resolve the underlying problem before promoting.';
    } else if (destination.id === 'dest-moreh') {
      exclusionReason =
        'Access and permitted activity depend on current border advisories, which have to be checked before any promotion.';
    } else if (objective === 'DIVERSIFY' && topThreeNames.has(row.name)) {
      exclusionReason = `Already among the three destinations holding most activity (${row.sharePercent} percent). Promoting it would increase concentration rather than reduce it.`;
    } else if (businesses === 0) {
      exclusionReason =
        'No participating tourism business here yet. This is a supply development candidate, not a promotion target.';
    } else if (row.interactions < MIN_SAMPLE_FOR_TREND) {
      exclusionReason = `Only ${row.interactions} interactions in the window, too few to read a growth rate.`;
    } else if ((row.trendPercent ?? 0) <= 0) {
      exclusionReason = 'Interest is not rising in this window.';
    }

    if (exclusionReason) {
      excluded.push({ ...base, score: 0, rationale: [], conditions: [], exclusionReason });
      continue;
    }

    const growth = Math.max(0, row.trendPercent ?? 0);
    const headroom = Math.min(1, spare / CAMPAIGN_CAPACITY_THRESHOLD);
    const breadth = Math.min(1, (businesses + availableExperiences) / SUPPLY_BREADTH_TARGET);
    const sensitivity = SENSITIVITY_FACTOR[destination.ecoSensitivity];
    // Squared so that share of activity bites: a destination close to the top
    // contributes very little to distributing demand.
    const diversification =
      objective === 'DIVERSIFY' ? (1 - Math.min(0.95, row.sharePercent / 100)) ** 2 : 1;
    const issueFactor = blocking.length > 0 ? OPEN_ISSUE_PENALTY : 1;

    const score = roundTo(growth * headroom * breadth * sensitivity * diversification * issueFactor, 1);

    const rationale = [
      `Interest is up ${growth.toFixed(1)} percent against the preceding window on ${row.interactions} interactions.`,
      spare > 0
        ? `Participating partners report ${spare} of ${supply?.totalCapacity ?? 0} places free. ${supply?.coverageNote ?? ''}`
        : 'No participating partner is reporting spare places, which caps how much a campaign can be absorbed.',
      `${businesses} participating business${businesses === 1 ? '' : 'es'} and ${availableExperiences} bookable experience${availableExperiences === 1 ? '' : 's'}, so incremental visitors have somewhere to spend locally.`,
      `Holds ${row.sharePercent} percent of state activity, so promoting it spreads demand rather than concentrating it further.`,
    ];
    if (feeling?.averageRating != null) {
      rationale.push(
        `Visitor satisfaction is ${feeling.averageRating.toFixed(2)} of 5 across ${feeling.responses} responses.`,
      );
    }

    const conditions: string[] = [];
    if (blocking.length > 0) {
      for (const alert of blocking) {
        conditions.push(`${alert.title}. Address this alongside the campaign, not after it.`);
      }
    }
    if (destination.ecoSensitivity === 'HIGH') {
      conditions.push(
        'Ecologically sensitive site: carry responsible visit guidance inside the creative brief and avoid the peak window.',
      );
    }
    if (spare < CAMPAIGN_CAPACITY_THRESHOLD) {
      conditions.push(
        `Only ${spare} spare places are being reported. Onboard more participating accommodation before the campaign opens, or spread the campaign window.`,
      );
    }

    recommended.push({ ...base, score, rationale, conditions });
  }

  recommended.sort((a, b) => b.score - a.score);

  return {
    objective,
    recommended: recommended.slice(0, limit),
    excluded,
    method: RECOMMENDATION_METHOD,
  };
}
