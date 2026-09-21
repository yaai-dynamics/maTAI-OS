import { addDays, formatShortDate, startOfUtcDay, toIsoDate } from '@/lib/date';
import { deriveConfidence, weakestProvenance, type Confidence, type Provenance } from '@/lib/provenance';
import {
  ISSUE_CATEGORY_LABEL,
  type Feedback,
  type IssueCategory,
} from '@/lib/types';
import { getDestinations, getFeedback } from '@/server/data/repository';
import { percentChange, previousWindow, roundTo, type AnalysisWindow } from '@/server/analytics/windows';

/**
 * Satisfaction and issue analytics.
 *
 * Issue classification is deterministic: feedback carries a category chosen by
 * the tourist or assigned when the record was created. The model is used only
 * to summarise what the categories add up to, never to invent a count.
 */

const ISSUE_CATEGORIES = Object.keys(ISSUE_CATEGORY_LABEL) as IssueCategory[];
const isIssueCategory = (value: string): value is IssueCategory =>
  (ISSUE_CATEGORIES as string[]).includes(value);

export interface SatisfactionSummary {
  averageRating: number | null;
  responses: number;
  positiveShare: number;
  negativeShare: number;
  previousAverageRating: number | null;
  ratingChange: number | null;
  distribution: { rating: number; count: number }[];
  provenance: Provenance;
  confidence: Confidence;
  method: string;
}

export const SATISFACTION_METHOD =
  'Mean of tourist submitted ratings in the window, on a 1 to 5 scale, with the share of responses rated 4 or above and 2 or below.';

function averageRating(entries: readonly Feedback[]): number | null {
  if (entries.length === 0) return null;
  return roundTo(entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length, 2);
}

export function computeSatisfaction(
  window: AnalysisWindow,
  destinationId?: string,
): SatisfactionSummary {
  const filter = destinationId ? { destinationId } : {};
  const prior = previousWindow(window);
  const entries = getFeedback({ ...filter, from: window.from, to: window.to });
  const before = getFeedback({ ...filter, from: prior.from, to: prior.to });

  const current = averageRating(entries);
  const previous = averageRating(before);
  const provenance = weakestProvenance(
    entries.length > 0 ? entries.map((e) => e.provenance) : ['DEMO_SYNTHETIC'],
  );

  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: entries.filter((entry) => entry.rating === rating).length,
  }));

  return {
    averageRating: current,
    responses: entries.length,
    positiveShare:
      entries.length === 0
        ? 0
        : roundTo((entries.filter((e) => e.rating >= 4).length / entries.length) * 100, 1),
    negativeShare:
      entries.length === 0
        ? 0
        : roundTo((entries.filter((e) => e.rating <= 2).length / entries.length) * 100, 1),
    previousAverageRating: previous,
    ratingChange: current !== null && previous !== null ? roundTo(current - previous, 2) : null,
    distribution,
    provenance,
    confidence: deriveConfidence({
      sources: [provenance],
      sampleSize: entries.length,
      consistent: before.length > 0,
    }),
    method: SATISFACTION_METHOD,
  };
}

export interface IssueSummary {
  category: IssueCategory;
  label: string;
  count: number;
  sharePercent: number;
  previousCount: number;
  changePercent: number | null;
  averageRating: number | null;
  /** Destinations where this issue appears most often. */
  hotspots: { destinationId: string; name: string; count: number }[];
  examples: Feedback[];
}

export interface IssueAnalysis {
  window: AnalysisWindow;
  totalIssueReports: number;
  totalResponses: number;
  issues: IssueSummary[];
  provenance: Provenance;
  confidence: Confidence;
  method: string;
}

export const ISSUE_METHOD =
  'Counts of feedback items in the window whose category is a service or infrastructure issue, compared with the preceding window of equal length.';

export function computeIssues(window: AnalysisWindow, destinationId?: string): IssueAnalysis {
  const destinationNames = new Map(getDestinations().map((d) => [d.id, d.name]));
  const filter = destinationId ? { destinationId } : {};

  const prior = previousWindow(window);
  const all = getFeedback({ ...filter, from: window.from, to: window.to });
  const before = getFeedback({ ...filter, from: prior.from, to: prior.to });

  const issueEntries = all.filter((entry) => isIssueCategory(entry.category));
  const beforeIssues = before.filter((entry) => isIssueCategory(entry.category));

  const issues: IssueSummary[] = ISSUE_CATEGORIES.map((category) => {
    const matching = issueEntries.filter((entry) => entry.category === category);
    const previousCount = beforeIssues.filter((entry) => entry.category === category).length;

    const byDestination = new Map<string, number>();
    for (const entry of matching) {
      byDestination.set(entry.destinationId, (byDestination.get(entry.destinationId) ?? 0) + 1);
    }

    const change = percentChange(matching.length, previousCount);

    return {
      category,
      label: ISSUE_CATEGORY_LABEL[category],
      count: matching.length,
      sharePercent:
        issueEntries.length === 0
          ? 0
          : roundTo((matching.length / issueEntries.length) * 100, 1),
      previousCount,
      changePercent: change === null ? null : roundTo(change, 1),
      averageRating: averageRating(matching),
      hotspots: [...byDestination.entries()]
        .map(([id, count]) => ({
          destinationId: id,
          name: destinationNames.get(id) ?? id,
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      // Newest first, so a live demo submission surfaces immediately.
      examples: [...matching].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    };
  })
    .filter((issue) => issue.count > 0 || issue.previousCount > 0)
    .sort((a, b) => b.count - a.count);

  const provenance = weakestProvenance(
    issueEntries.length > 0 ? issueEntries.map((e) => e.provenance) : ['DEMO_SYNTHETIC'],
  );

  return {
    window,
    totalIssueReports: issueEntries.length,
    totalResponses: all.length,
    issues,
    provenance,
    confidence: deriveConfidence({
      sources: [provenance],
      sampleSize: issueEntries.length,
      consistent: beforeIssues.length > 0,
    }),
    method: ISSUE_METHOD,
  };
}

/** Per destination sentiment, used by the destination intelligence table. */
export interface DestinationSentiment {
  destinationId: string;
  averageRating: number | null;
  responses: number;
  negativeShare: number;
  topIssue: { category: IssueCategory; label: string; count: number } | null;
}

export function computeDestinationSentiment(window: AnalysisWindow): DestinationSentiment[] {
  return getDestinations().map((destination) => {
    const entries = getFeedback({
      destinationId: destination.id,
      from: window.from,
      to: window.to,
    });
    const issueCounts = new Map<IssueCategory, number>();
    for (const entry of entries) {
      if (isIssueCategory(entry.category)) {
        issueCounts.set(entry.category, (issueCounts.get(entry.category) ?? 0) + 1);
      }
    }
    const top = [...issueCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      destinationId: destination.id,
      averageRating: averageRating(entries),
      responses: entries.length,
      negativeShare:
        entries.length === 0
          ? 0
          : roundTo((entries.filter((e) => e.rating <= 2).length / entries.length) * 100, 1),
      topIssue: top ? { category: top[0], label: ISSUE_CATEGORY_LABEL[top[0]], count: top[1] } : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Richer feedback analytics — roadmap Phase 1                                */
/* -------------------------------------------------------------------------- */

/**
 * Weekly issue counts across the window.
 *
 * A single window comparison tells you a category moved. It does not tell you
 * whether it is a trend or one bad week, which is the question an officer
 * actually has before committing money to a fix.
 */
export interface IssueTrendPoint {
  weekStart: string;
  label: string;
  total: number;
  byCategory: Partial<Record<IssueCategory, number>>;
}

export function computeIssueTrend(
  window: AnalysisWindow,
  options: { destinationId?: string; category?: IssueCategory } = {},
): IssueTrendPoint[] {
  const entries = getFeedback({
    from: window.from,
    to: window.to,
    ...(options.destinationId ? { destinationId: options.destinationId } : {}),
  }).filter((entry) => isIssueCategory(entry.category));

  const weeks = Math.max(1, Math.ceil(window.days / 7));
  const points: IssueTrendPoint[] = [];

  for (let index = 0; index < weeks; index += 1) {
    const start = addDays(startOfUtcDay(window.from), index * 7);
    const end = addDays(start, 7);
    const inWeek = entries.filter((entry) => {
      const at = new Date(entry.createdAt).getTime();
      return at >= start.getTime() && at < end.getTime();
    });

    const byCategory: Partial<Record<IssueCategory, number>> = {};
    for (const entry of inWeek) {
      const category = entry.category as IssueCategory;
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }

    points.push({
      weekStart: toIsoDate(start),
      label: formatShortDate(start),
      total: options.category ? (byCategory[options.category] ?? 0) : inWeek.length,
      byCategory,
    });
  }

  return points;
}

/** District rollup, for the district-level view a pilot deployment needs. */
export interface DistrictSentiment {
  districtId: string;
  district: string;
  destinations: number;
  responses: number;
  averageRating: number | null;
  issueReports: number;
  topIssue: { category: IssueCategory; label: string; count: number } | null;
}

export function computeDistrictSentiment(window: AnalysisWindow): DistrictSentiment[] {
  const destinations = getDestinations();
  const districts = new Map<string, { id: string; name: string; destinationIds: string[] }>();

  for (const destination of destinations) {
    const existing = districts.get(destination.districtId);
    if (existing) {
      existing.destinationIds.push(destination.id);
    } else {
      districts.set(destination.districtId, {
        id: destination.districtId,
        name: destination.district,
        destinationIds: [destination.id],
      });
    }
  }

  return [...districts.values()]
    .map((district) => {
      const entries = getFeedback({
        destinationIds: district.destinationIds,
        from: window.from,
        to: window.to,
      });
      const issues = entries.filter((entry) => isIssueCategory(entry.category));

      const counts = new Map<IssueCategory, number>();
      for (const entry of issues) {
        const category = entry.category as IssueCategory;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

      return {
        districtId: district.id,
        district: district.name,
        destinations: district.destinationIds.length,
        responses: entries.length,
        averageRating: averageRating(entries),
        issueReports: issues.length,
        topIssue: top
          ? { category: top[0], label: ISSUE_CATEGORY_LABEL[top[0]], count: top[1] }
          : null,
      } satisfies DistrictSentiment;
    })
    .sort((a, b) => b.issueReports - a.issueReports);
}
