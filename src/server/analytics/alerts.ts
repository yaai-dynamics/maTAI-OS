import { now } from '@/lib/config';
import type { Alert } from '@/lib/types';
import { getDestination } from '@/server/data/repository';
import { MIN_SAMPLE_FOR_TREND } from '@/server/analytics/demand';
import type { DestinationCapacity } from '@/server/analytics/capacity';
import type { DestinationDemand } from '@/server/analytics/demand';
import type { DestinationSentiment } from '@/server/analytics/sentiment';

/**
 * Deterministic alert rules.
 *
 * Alerts are produced by named rules with stated thresholds, not by a model.
 * Each alert carries the rule that fired it so an officer can see why it is on
 * the screen and decide whether the threshold is right.
 */

export const ALERT_RULES = {
  DEMAND_SURGE: `Weighted activity up more than 40 percent against the preceding window, on at least ${MIN_SAMPLE_FOR_TREND} interactions`,
  DEMAND_DROP: `Weighted activity down more than 25 percent against the preceding window, on at least ${MIN_SAMPLE_FOR_TREND} interactions`,
  CAPACITY_PRESSURE: 'Reported partner occupancy at or above 85 percent while demand is rising',
  SENSITIVE_PRESSURE: 'High ecological sensitivity with demand growth above 20 percent',
  ISSUE_CLUSTER: 'Eight or more reports of the same issue category at one destination in the window',
  SATISFACTION_DIP: 'Average rating below 3.8 with at least 20 responses',
  SUPPLY_GAP: 'Demand index above 40 with no participating accommodation reporting',
} as const;

export interface AlertInput {
  demand: readonly DestinationDemand[];
  sentiment: readonly DestinationSentiment[];
  capacity: readonly DestinationCapacity[];
}

export function computeAlerts({ demand, sentiment, capacity }: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  const detectedAt = now().toISOString();
  const sentimentById = new Map(sentiment.map((row) => [row.destinationId, row]));
  const capacityById = new Map(capacity.map((row) => [row.destinationId, row]));

  const push = (alert: Omit<Alert, 'id' | 'detectedAt' | 'status'>) => {
    alerts.push({
      ...alert,
      id: `alert-${alerts.length + 1}-${alert.entityId}`,
      detectedAt,
      status: 'OPEN',
    });
  };

  for (const row of demand) {
    const destination = getDestination(row.destinationId);
    if (!destination) continue;
    const feeling = sentimentById.get(row.destinationId);
    const supply = capacityById.get(row.destinationId);
    const trend = row.trendPercent;

    if (trend !== null && trend > 40 && row.interactions >= MIN_SAMPLE_FOR_TREND) {
      push({
        entityType: 'DESTINATION',
        entityId: row.destinationId,
        entityName: row.name,
        severity: 'WATCH',
        title: `Interest in ${row.name} is rising sharply`,
        description: `Weighted activity is up ${trend.toFixed(1)} percent against the preceding window, from ${row.previousWeightedScore} to ${row.weightedScore}.`,
        rule: ALERT_RULES.DEMAND_SURGE,
        provenance: row.provenance,
      });
    }

    if (trend !== null && trend < -25 && row.interactions + row.previousWeightedScore >= MIN_SAMPLE_FOR_TREND) {
      push({
        entityType: 'DESTINATION',
        entityId: row.destinationId,
        entityName: row.name,
        severity: 'WATCH',
        title: `Interest in ${row.name} has fallen`,
        description: `Weighted activity is down ${Math.abs(trend).toFixed(1)} percent against the preceding window. Check events, access and advisories before reading this as a trend.`,
        rule: ALERT_RULES.DEMAND_DROP,
        provenance: row.provenance,
      });
    }

    if (
      supply &&
      supply.occupancyRate !== null &&
      supply.occupancyRate >= 0.85 &&
      trend !== null &&
      trend > 0
    ) {
      push({
        entityType: 'DESTINATION',
        entityId: row.destinationId,
        entityName: row.name,
        severity: 'ACTION',
        title: `${row.name} is close to reported partner capacity`,
        description: `Participating properties report ${(supply.occupancyRate * 100).toFixed(0)} percent occupancy while interest is still rising. ${supply.coverageNote}`,
        rule: ALERT_RULES.CAPACITY_PRESSURE,
        provenance: 'PARTNER_REPORTED',
      });
    }

    if (
      destination.ecoSensitivity === 'HIGH' &&
      trend !== null &&
      trend > 20 &&
      row.interactions >= MIN_SAMPLE_FOR_TREND
    ) {
      push({
        entityType: 'DESTINATION',
        entityId: row.destinationId,
        entityName: row.name,
        severity: 'WATCH',
        title: `Growth at a high sensitivity site: ${row.name}`,
        description: `Interest is up ${trend.toFixed(1)} percent at a destination flagged as ecologically sensitive. Promotion should carry responsible visit guidance and avoid the peak window.`,
        rule: ALERT_RULES.SENSITIVE_PRESSURE,
        provenance: row.provenance,
      });
    }

    if (feeling?.topIssue && feeling.topIssue.count >= 8) {
      push({
        entityType: 'DESTINATION',
        entityId: row.destinationId,
        entityName: row.name,
        severity: 'ACTION',
        title: `${feeling.topIssue.label} reported repeatedly at ${row.name}`,
        description: `${feeling.topIssue.count} reports in the window name the same issue category. This is an operational fix rather than a promotion question.`,
        rule: ALERT_RULES.ISSUE_CLUSTER,
        provenance: 'PLATFORM_OBSERVED',
      });
    }

    if (
      feeling &&
      feeling.averageRating !== null &&
      feeling.averageRating < 3.8 &&
      feeling.responses >= 20
    ) {
      push({
        entityType: 'DESTINATION',
        entityId: row.destinationId,
        entityName: row.name,
        severity: 'ACTION',
        title: `Satisfaction at ${row.name} is below the state average`,
        description: `Average rating ${feeling.averageRating.toFixed(2)} across ${feeling.responses} responses in the window.`,
        rule: ALERT_RULES.SATISFACTION_DIP,
        provenance: 'PLATFORM_OBSERVED',
      });
    }

    if (row.demandIndex > 40 && supply && supply.reportingProperties === 0) {
      push({
        entityType: 'DESTINATION',
        entityId: row.destinationId,
        entityName: row.name,
        severity: 'INFO',
        title: `No participating accommodation reporting at ${row.name}`,
        description: `Demand index ${row.demandIndex} with no participating property reporting availability. This is an onboarding gap, not evidence that no accommodation exists.`,
        rule: ALERT_RULES.SUPPLY_GAP,
        provenance: 'PARTNER_REPORTED',
      });
    }
  }

  const severityRank = { ACTION: 0, WATCH: 1, INFO: 2 } as const;
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
