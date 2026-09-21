import { ANALYSIS_WINDOW_DAYS } from '@/lib/config';
import type { Confidence, Provenance } from '@/lib/provenance';
import { deriveConfidence } from '@/lib/provenance';
import type { Alert } from '@/lib/types';
import { getBusinesses, getInteractions, getOfficialStatistics } from '@/server/data/repository';
import { computeAlerts } from '@/server/analytics/alerts';
import { computeCapacity, computeStateCapacity, type DestinationCapacity } from '@/server/analytics/capacity';
import {
  computeActivitySeries,
  computeConcentration,
  computeDemand,
  computeEmerging,
  CONCENTRATION_METHOD,
  DEMAND_METHOD,
  type ConcentrationSummary,
  type DestinationDemand,
  type EmergingDestination,
} from '@/server/analytics/demand';
import {
  computeDestinationSentiment,
  computeIssues,
  computeSatisfaction,
  SATISFACTION_METHOD,
  type DestinationSentiment,
  type IssueAnalysis,
  type SatisfactionSummary,
} from '@/server/analytics/sentiment';
import { currentWindow, makeWindow, percentChange, previousWindow, roundTo, type AnalysisWindow } from '@/server/analytics/windows';

/**
 * Tourism Pulse assembly.
 *
 * Six headline indicators as required by docs/02-mvp-spec.md, plus the wider
 * indicator index from the master concept document held in a single secondary
 * module so the home screen stays under the density limit in
 * docs/06-design-system.md.
 */

export interface PulseKpi {
  id: string;
  label: string;
  value: string;
  /** Present when the figure has a meaningful numeric form. */
  numericValue?: number;
  unit?: string;
  caption: string;
  trend?: { percent: number | null; label: string; direction: 'UP' | 'DOWN' | 'FLAT' };
  provenance: Provenance;
  confidence?: Confidence;
  method: string;
  sourceIds: string[];
  /** NOT_CONNECTED renders an explicit empty state instead of a number. */
  state: 'OK' | 'NOT_CONNECTED';
  connectionNote?: string;
}

export interface TourismPulse {
  window: AnalysisWindow;
  headline: PulseKpi[];
  indicatorIndex: PulseKpi[];
  demand: DestinationDemand[];
  concentration: ConcentrationSummary;
  emerging: EmergingDestination[];
  satisfaction: SatisfactionSummary;
  issues: IssueAnalysis;
  sentiment: DestinationSentiment[];
  capacity: DestinationCapacity[];
  alerts: Alert[];
  activitySeries: { date: string; value: number }[];
  totals: { interactions: number; previousInteractions: number; feedback: number };
}

const direction = (percent: number | null): 'UP' | 'DOWN' | 'FLAT' => {
  if (percent === null || Math.abs(percent) < 1) return 'FLAT';
  return percent > 0 ? 'UP' : 'DOWN';
};

export function computePulse(windowDays: number = ANALYSIS_WINDOW_DAYS): TourismPulse {
  const window = currentWindow(windowDays);
  const prior = previousWindow(window);

  const demand = computeDemand(window);
  const concentration = computeConcentration(demand);
  const emerging = computeEmerging(demand);
  const satisfaction = computeSatisfaction(window);
  const issues = computeIssues(window);
  const sentiment = computeDestinationSentiment(window);
  const capacity = computeCapacity();
  const stateCapacity = computeStateCapacity();
  const alerts = computeAlerts({ demand, sentiment, capacity });
  const activitySeries = computeActivitySeries(window);
  const official = getOfficialStatistics();

  const interactions = getInteractions({ from: window.from, to: window.to }).length;
  const previousInteractions = getInteractions({ from: prior.from, to: prior.to }).length;
  const activityChange = percentChange(interactions, previousInteractions);

  const sevenDay = makeWindow(7);
  const sevenDayPrior = previousWindow(sevenDay);
  const sevenDayCount = getInteractions({ from: sevenDay.from, to: sevenDay.to }).length;
  const sevenDayPriorCount = getInteractions({
    from: sevenDayPrior.from,
    to: sevenDayPrior.to,
  }).length;
  const sevenDayChange = percentChange(sevenDayCount, sevenDayPriorCount);

  const topDemand = demand[0];
  const topEmerging = emerging[0];
  const topIssue = issues.issues[0];
  const openIssueAlerts = alerts.filter((alert) => alert.severity !== 'INFO');

  const activityProvenance: Provenance = 'PLATFORM_OBSERVED';

  const headline: PulseKpi[] = [
    {
      id: 'platform-activity',
      label: 'Platform observed tourism activity',
      value: interactions.toLocaleString('en-IN'),
      numericValue: interactions,
      unit: 'interactions',
      caption: `Searches, destination views, itinerary additions, check-ins and feedback in the last ${window.days} days`,
      trend: {
        percent: activityChange === null ? null : roundTo(activityChange, 1),
        label: `vs previous ${window.days} days`,
        direction: direction(activityChange),
      },
      provenance: activityProvenance,
      confidence: deriveConfidence({
        sources: [activityProvenance, 'DEMO_SYNTHETIC'],
        sampleSize: interactions,
        consistent: previousInteractions > 0,
      }),
      method:
        'Count of platform interactions in the window. Measures interest expressed on this platform, not visitor volume.',
      sourceIds: ['src-platform-signals', 'src-demo-seed'],
      state: 'OK',
    },
    {
      id: 'seven-day-trend',
      label: '7 day activity trend',
      value:
        sevenDayChange === null
          ? 'No baseline'
          : `${sevenDayChange >= 0 ? '+' : ''}${roundTo(sevenDayChange, 1)}%`,
      numericValue: sevenDayChange ?? undefined,
      caption: `${sevenDayCount.toLocaleString('en-IN')} interactions in the last 7 days against ${sevenDayPriorCount.toLocaleString('en-IN')} in the 7 before`,
      trend: {
        percent: sevenDayChange === null ? null : roundTo(sevenDayChange, 1),
        label: 'week on week',
        direction: direction(sevenDayChange),
      },
      provenance: activityProvenance,
      confidence: deriveConfidence({
        sources: [activityProvenance, 'DEMO_SYNTHETIC'],
        sampleSize: sevenDayCount,
        consistent: sevenDayPriorCount > 0,
      }),
      method:
        'Change in interaction count over seven days against the preceding seven. Short windows are directional only.',
      sourceIds: ['src-platform-signals', 'src-demo-seed'],
      state: 'OK',
    },
    {
      id: 'demand-index',
      label: 'Destination demand index',
      value: topDemand ? `${topDemand.demandIndex}` : '0',
      numericValue: topDemand?.demandIndex ?? 0,
      unit: `highest: ${topDemand?.name ?? 'none'}`,
      caption: `Leading destination of ${demand.filter((d) => d.weightedScore > 0).length} with observed activity`,
      trend: topDemand
        ? {
            percent: topDemand.trendPercent,
            label: 'vs previous window',
            direction: direction(topDemand.trendPercent),
          }
        : undefined,
      provenance: topDemand?.provenance ?? 'DEMO_SYNTHETIC',
      confidence: topDemand?.confidence ?? 'LOW',
      method: DEMAND_METHOD,
      sourceIds: ['src-analytics-engine', 'src-platform-signals'],
      state: 'OK',
    },
    {
      id: 'satisfaction',
      label: 'Tourist satisfaction',
      value: satisfaction.averageRating === null ? 'No responses' : satisfaction.averageRating.toFixed(2),
      numericValue: satisfaction.averageRating ?? undefined,
      unit: 'of 5',
      caption: `${satisfaction.responses.toLocaleString('en-IN')} responses, ${satisfaction.positiveShare}% rated 4 or above`,
      trend: {
        percent: satisfaction.ratingChange,
        label: 'rating points vs previous window',
        direction:
          satisfaction.ratingChange === null || Math.abs(satisfaction.ratingChange) < 0.05
            ? 'FLAT'
            : satisfaction.ratingChange > 0
              ? 'UP'
              : 'DOWN',
      },
      provenance: satisfaction.provenance,
      confidence: satisfaction.confidence,
      method: SATISFACTION_METHOD,
      sourceIds: ['src-platform-signals', 'src-demo-seed'],
      state: 'OK',
    },
    {
      id: 'concentration',
      label: 'Tourism concentration',
      value: `${concentration.topThreeSharePercent}%`,
      numericValue: concentration.topThreeSharePercent,
      unit: 'in the top 3',
      caption:
        concentration.topThree.length > 0
          ? concentration.topThree.map((row) => row.name).join(', ')
          : 'No activity in the window',
      provenance: 'ESTIMATED',
      confidence: 'MEDIUM',
      method: CONCENTRATION_METHOD,
      sourceIds: ['src-analytics-engine'],
      state: 'OK',
    },
    {
      id: 'open-issues',
      label: 'Open tourism issues',
      value: `${openIssueAlerts.length}`,
      numericValue: openIssueAlerts.length,
      unit: openIssueAlerts.length === 1 ? 'needs attention' : 'need attention',
      caption: topIssue
        ? `Most reported: ${topIssue.label} (${topIssue.count} reports)`
        : 'No issue reports in the window',
      provenance: 'PLATFORM_OBSERVED',
      confidence: issues.confidence,
      method:
        'Count of open alerts at WATCH or ACTION severity produced by the deterministic alert rules from feedback, demand and capacity.',
      sourceIds: ['src-analytics-engine', 'src-platform-signals'],
      state: 'OK',
    },
  ];

  const businesses = getBusinesses();
  const participating = businesses.filter((b) => b.status === 'PARTICIPATING').length;

  const indicatorIndex: PulseKpi[] = [
    {
      id: 'official-arrivals',
      label: 'Official tourist arrivals',
      value: 'Not connected',
      caption: official.sourceName,
      provenance: 'OFFICIAL',
      method:
        'Would come from published department statistics with their period, coverage and revision notes intact.',
      sourceIds: [official.sourceId],
      state: 'NOT_CONNECTED',
      connectionNote:
        'This prototype has no integration with the Department of Tourism. No figure is generated in place of one.',
    },
    {
      id: 'emerging-score',
      label: 'Emerging destination',
      value: topEmerging?.name ?? 'None',
      numericValue: topEmerging?.score,
      unit: topEmerging ? `score ${topEmerging.score}` : undefined,
      caption: topEmerging
        ? `${topEmerging.trendPercent === null ? 'No baseline' : `${topEmerging.trendPercent > 0 ? '+' : ''}${topEmerging.trendPercent}%`} interest, ${topEmerging.capacitySignal.toLowerCase()} reported headroom`
        : 'No destination meets the growth threshold',
      provenance: 'ESTIMATED',
      confidence: 'MEDIUM',
      method:
        'Growth in weighted activity, scaled by reported partner headroom and reduced for destinations that already dominate demand.',
      sourceIds: ['src-analytics-engine', 'src-partner-reports'],
      state: 'OK',
    },
    {
      id: 'accommodation-availability',
      label: 'Accommodation availability',
      value:
        stateCapacity.occupancyRate === null
          ? 'No reports'
          : `${Math.round((1 - stateCapacity.occupancyRate) * 100)}%`,
      numericValue:
        stateCapacity.occupancyRate === null
          ? undefined
          : Math.round((1 - stateCapacity.occupancyRate) * 100),
      unit: 'free',
      caption: `${stateCapacity.availableCapacity} of ${stateCapacity.totalCapacity} reported places across ${stateCapacity.reportingProperties} participating properties`,
      provenance: 'PARTNER_REPORTED',
      confidence: 'MEDIUM',
      method: stateCapacity.coverageNote,
      sourceIds: ['src-partner-reports'],
      state: 'OK',
    },
    {
      id: 'business-coverage',
      label: 'Tourism business coverage',
      value: `${participating}`,
      numericValue: participating,
      unit: `of ${businesses.length} onboarded`,
      caption: `${stateCapacity.verifiedBusinesses} verified. ${stateCapacity.destinationsWithNoSupply.length} destination${stateCapacity.destinationsWithNoSupply.length === 1 ? '' : 's'} with no participating business`,
      provenance: 'PARTNER_REPORTED',
      confidence: 'MEDIUM',
      method: 'Count of businesses onboarded onto the platform by participation status.',
      sourceIds: ['src-partner-reports'],
      state: 'OK',
    },
    {
      id: 'distribution-score',
      label: 'Tourism distribution score',
      value: `${concentration.distributionScore}`,
      numericValue: concentration.distributionScore,
      unit: 'of 100',
      caption: `Activity spread across ${concentration.destinationsCovered} destinations. Higher is more even`,
      provenance: 'ESTIMATED',
      confidence: 'MEDIUM',
      method: CONCENTRATION_METHOD,
      sourceIds: ['src-analytics-engine'],
      state: 'OK',
    },
    {
      id: 'top-complaint',
      label: 'Top complaint category',
      value: topIssue?.label ?? 'None reported',
      numericValue: topIssue?.count,
      unit: topIssue ? `${topIssue.count} reports` : undefined,
      caption: topIssue
        ? `${topIssue.sharePercent}% of issue reports${topIssue.hotspots[0] ? `, most often at ${topIssue.hotspots[0].name}` : ''}`
        : 'No issue reports in the window',
      trend: topIssue
        ? {
            percent: topIssue.changePercent,
            label: 'vs previous window',
            direction: direction(topIssue.changePercent),
          }
        : undefined,
      provenance: 'PLATFORM_OBSERVED',
      confidence: issues.confidence,
      method:
        'Feedback items in the window grouped by the issue category recorded with the submission.',
      sourceIds: ['src-platform-signals', 'src-demo-seed'],
      state: 'OK',
    },
  ];

  return {
    window,
    headline,
    indicatorIndex,
    demand,
    concentration,
    emerging,
    satisfaction,
    issues,
    sentiment,
    capacity,
    alerts,
    activitySeries,
    totals: {
      interactions,
      previousInteractions,
      feedback: satisfaction.responses,
    },
  };
}
