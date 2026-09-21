import { addDays, startOfUtcDay, toIsoDate } from '@/lib/date';
import type { Provenance } from '@/lib/provenance';
import type { Alert, IssueCategory } from '@/lib/types';
import { ISSUE_CATEGORY_LABEL } from '@/lib/types';
import { getDestinations, getDistricts, getFeedback, getInteractions } from '@/server/data/repository';
import type { DestinationCapacity } from '@/server/analytics/capacity';
import { DEMAND_WEIGHTS, type DestinationDemand } from '@/server/analytics/demand';
import { percentChange, previousWindow, roundTo, type AnalysisWindow } from '@/server/analytics/windows';

/**
 * District-level analytics — roadmap Phase 2.
 *
 * A district is the unit a tourism department is actually organised around, so
 * a pilot deployment needs the same picture at that level: demand, the supply
 * that could absorb it, satisfaction, and what is going wrong.
 *
 * Districts with no destination on the platform are included and marked as such,
 * because an absent district is a coverage gap, not a district with no tourism.
 */

export interface DistrictIntelligence {
  districtId: string;
  district: string;
  destinations: number;
  destinationNames: string[];
  /** Weighted platform activity in the window. */
  weightedScore: number;
  previousWeightedScore: number;
  trendPercent: number | null;
  sharePercent: number;
  interactions: number;
  businesses: number;
  verifiedBusinesses: number;
  totalCapacity: number;
  availableCapacity: number;
  responses: number;
  averageRating: number | null;
  issueReports: number;
  topIssue: { category: IssueCategory; label: string; count: number } | null;
  openAlerts: number;
  /** True when the platform holds no destination for this district at all. */
  notCovered: boolean;
  provenance: Provenance;
}

const ISSUE_CATEGORIES = Object.keys(ISSUE_CATEGORY_LABEL) as IssueCategory[];
const isIssueCategory = (value: string): value is IssueCategory =>
  (ISSUE_CATEGORIES as string[]).includes(value);

export function computeDistrictIntelligence(
  window: AnalysisWindow,
  input: { demand: readonly DestinationDemand[]; capacity: readonly DestinationCapacity[]; alerts: readonly Alert[] },
): DistrictIntelligence[] {
  const destinations = getDestinations();
  const prior = previousWindow(window);

  const demandById = new Map(input.demand.map((row) => [row.destinationId, row]));
  const capacityById = new Map(input.capacity.map((row) => [row.destinationId, row]));

  const alertsByDestination = new Map<string, number>();
  for (const alert of input.alerts) {
    if (alert.entityType !== 'DESTINATION' || alert.severity === 'INFO') continue;
    alertsByDestination.set(alert.entityId, (alertsByDestination.get(alert.entityId) ?? 0) + 1);
  }

  const totalWeighted =
    input.demand.reduce((sum, row) => sum + row.weightedScore, 0) || 1;

  const rows = getDistricts().map((district) => {
    const districtDestinations = destinations.filter((d) => d.districtId === district.id);
    const ids = districtDestinations.map((d) => d.id);

    const weightedScore = ids.reduce(
      (sum, id) => sum + (demandById.get(id)?.weightedScore ?? 0),
      0,
    );
    const previousWeightedScore = ids.reduce(
      (sum, id) => sum + (demandById.get(id)?.previousWeightedScore ?? 0),
      0,
    );
    const interactions = ids.reduce((sum, id) => sum + (demandById.get(id)?.interactions ?? 0), 0);

    const entries =
      ids.length === 0
        ? []
        : getFeedback({ destinationIds: ids, from: window.from, to: window.to });

    const issues = entries.filter((entry) => isIssueCategory(entry.category));
    const counts = new Map<IssueCategory, number>();
    for (const entry of issues) {
      const category = entry.category as IssueCategory;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

    const change = percentChange(weightedScore, previousWeightedScore);

    return {
      districtId: district.id,
      district: district.name,
      destinations: districtDestinations.length,
      destinationNames: districtDestinations.map((d) => d.name),
      weightedScore,
      previousWeightedScore,
      trendPercent: change === null ? null : roundTo(change, 1),
      sharePercent: roundTo((weightedScore / totalWeighted) * 100, 1),
      interactions,
      businesses: ids.reduce((sum, id) => sum + (capacityById.get(id)?.totalBusinesses ?? 0), 0),
      verifiedBusinesses: ids.reduce(
        (sum, id) => sum + (capacityById.get(id)?.verifiedBusinesses ?? 0),
        0,
      ),
      totalCapacity: ids.reduce((sum, id) => sum + (capacityById.get(id)?.totalCapacity ?? 0), 0),
      availableCapacity: ids.reduce(
        (sum, id) => sum + (capacityById.get(id)?.availableCapacity ?? 0),
        0,
      ),
      responses: entries.length,
      averageRating:
        entries.length === 0
          ? null
          : roundTo(entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length, 2),
      issueReports: issues.length,
      topIssue: top
        ? { category: top[0], label: ISSUE_CATEGORY_LABEL[top[0]], count: top[1] }
        : null,
      openAlerts: ids.reduce((sum, id) => sum + (alertsByDestination.get(id) ?? 0), 0),
      notCovered: districtDestinations.length === 0,
      provenance: (interactions > 0 ? 'PLATFORM_OBSERVED' : 'DEMO_SYNTHETIC') as Provenance,
    } satisfies DistrictIntelligence;
  });

  void prior;
  return rows.sort((a, b) => b.weightedScore - a.weightedScore);
}

export const DISTRICT_METHOD =
  'Destination level figures summed to the district that each destination belongs to. Weighted activity uses the same intent weighting as the demand index. Districts with no destination on the platform are shown as not covered rather than as zero.';

/* -------------------------------------------------------------------------- */
/* Historical view — roadmap Phase 2                                          */
/* -------------------------------------------------------------------------- */

export interface HistoryPoint {
  periodStart: string;
  label: string;
  interactions: number;
  weightedScore: number;
  checkins: number;
  itineraryAdds: number;
  feedback: number;
  averageRating: number | null;
}

/**
 * Fixed-length periods across the whole retained history.
 *
 * A single 30-day window answers "what is happening now". It cannot answer
 * "is this normal", which is the question that actually decides whether a
 * department should act. This is that second series.
 */
export function computeHistory(options: { days: number; periodDays: number }): HistoryPoint[] {
  const { days, periodDays } = options;
  const interactions = getInteractions({});
  const feedback = getFeedback({});

  if (interactions.length === 0) return [];

  const latest = interactions.reduce(
    (max, row) => (row.timestamp > max ? row.timestamp : max),
    interactions[0]!.timestamp,
  );
  const end = startOfUtcDay(new Date(latest));
  const start = addDays(end, -(days - 1));
  const periods = Math.max(1, Math.ceil(days / periodDays));

  const points: HistoryPoint[] = [];

  for (let index = 0; index < periods; index += 1) {
    const periodStart = addDays(start, index * periodDays);
    const periodEnd = addDays(periodStart, periodDays);

    const inPeriod = interactions.filter((row) => {
      const at = new Date(row.timestamp).getTime();
      return at >= periodStart.getTime() && at < periodEnd.getTime();
    });
    const feedbackInPeriod = feedback.filter((row) => {
      const at = new Date(row.createdAt).getTime();
      return at >= periodStart.getTime() && at < periodEnd.getTime();
    });

    points.push({
      periodStart: toIsoDate(periodStart),
      label: toIsoDate(periodStart),
      interactions: inPeriod.length,
      weightedScore: inPeriod.reduce((sum, row) => sum + DEMAND_WEIGHTS[row.type], 0),
      checkins: inPeriod.filter((row) => row.type === 'QR_CHECKIN').length,
      itineraryAdds: inPeriod.filter((row) => row.type === 'ITINERARY_ADD').length,
      feedback: feedbackInPeriod.length,
      averageRating:
        feedbackInPeriod.length === 0
          ? null
          : roundTo(
              feedbackInPeriod.reduce((sum, row) => sum + row.rating, 0) / feedbackInPeriod.length,
              2,
            ),
    });
  }

  return points;
}

export const HISTORY_COVERAGE_NOTE =
  'The platform retains 90 days of prototype history. Year on year comparison, seasonality and any statement about a normal range need a longer series than exists, and are not offered.';
