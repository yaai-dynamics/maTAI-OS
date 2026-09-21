import { describe, expect, it } from 'vitest';

import { deriveConfidence, isQuotableExternally, weakestProvenance } from '@/lib/provenance';
import { travelMinutes } from '@/lib/geo';
import { computeCampaignFunnel } from '@/server/analytics/campaign';
import { computeCapacity, computeStateCapacity } from '@/server/analytics/capacity';
import {
  computeConcentration,
  computeDemand,
  computeEmerging,
  DEMAND_WEIGHTS,
  MIN_SAMPLE_FOR_TREND,
} from '@/server/analytics/demand';
import { matchCreators } from '@/server/analytics/matching';
import { computePulse } from '@/server/analytics/pulse';
import { recommendCampaignTargets } from '@/server/analytics/recommend';
import { computeIssues, computeSatisfaction } from '@/server/analytics/sentiment';
import { simulateCampaign } from '@/server/analytics/simulation';
import { currentWindow, percentChange, previousWindow } from '@/server/analytics/windows';
import { getCampaign, getDestination } from '@/server/data/repository';

/** Core analytics. These are the functions the AI layer is forbidden to do itself. */

const window = currentWindow();
const pulse = computePulse();

describe('provenance contract', () => {
  it('lets the weakest input decide how a combined figure is labelled', () => {
    expect(weakestProvenance(['OFFICIAL', 'PLATFORM_OBSERVED', 'DEMO_SYNTHETIC'])).toBe('DEMO_SYNTHETIC');
    expect(weakestProvenance(['OFFICIAL', 'PARTNER_REPORTED'])).toBe('PARTNER_REPORTED');
    expect(weakestProvenance([])).toBe('ESTIMATED');
  });

  it('never lets synthetic or modelled data be quoted as a measurement', () => {
    expect(isQuotableExternally('DEMO_SYNTHETIC')).toBe(false);
    expect(isQuotableExternally('ESTIMATED')).toBe(false);
    expect(isQuotableExternally('FORECAST')).toBe(false);
    expect(isQuotableExternally('OFFICIAL')).toBe(true);
    expect(isQuotableExternally('PLATFORM_OBSERVED')).toBe(true);
  });

  it('caps confidence when any input is synthetic', () => {
    expect(
      deriveConfidence({ sources: ['DEMO_SYNTHETIC'], sampleSize: 5000, consistent: true }),
    ).toBe('MEDIUM');
    expect(
      deriveConfidence({ sources: ['OFFICIAL'], sampleSize: 5000, consistent: true }),
    ).toBe('HIGH');
  });

  it('refuses high confidence on a small sample or a forecast', () => {
    expect(deriveConfidence({ sources: ['OFFICIAL'], sampleSize: 10, consistent: true })).toBe('LOW');
    expect(deriveConfidence({ sources: ['FORECAST'], sampleSize: 9000, consistent: true })).toBe('LOW');
  });
});

describe('demand', () => {
  const demand = computeDemand(window);

  it('weights intent above attention', () => {
    expect(DEMAND_WEIGHTS.QR_CHECKIN).toBeGreaterThan(DEMAND_WEIGHTS.ITINERARY_ADD);
    expect(DEMAND_WEIGHTS.ITINERARY_ADD).toBeGreaterThan(DEMAND_WEIGHTS.NAVIGATION_START);
    expect(DEMAND_WEIGHTS.NAVIGATION_START).toBeGreaterThan(DEMAND_WEIGHTS.DESTINATION_VIEW);
  });

  it('scales the index so the strongest destination is 100', () => {
    expect(demand[0]?.demandIndex).toBe(100);
    for (const row of demand) {
      expect(row.demandIndex).toBeGreaterThanOrEqual(0);
      expect(row.demandIndex).toBeLessThanOrEqual(100);
    }
  });

  it('returns shares that sum to about 100 percent', () => {
    const total = demand.reduce((sum, row) => sum + row.sharePercent, 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  it('covers every seeded destination', () => {
    expect(demand).toHaveLength(14);
  });

  it('compares against a preceding window of equal length that does not overlap', () => {
    const prior = previousWindow(window);
    expect(prior.days).toBe(window.days);
    expect(prior.to.getTime()).toBeLessThan(window.from.getTime());
  });

  it('guards the zero baseline case rather than dividing by it', () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(150, 100)).toBe(50);
  });
});

describe('concentration', () => {
  const concentration = computeConcentration(computeDemand(window));

  it('reports the top three share and names them', () => {
    expect(concentration.topThree).toHaveLength(3);
    expect(concentration.topThreeSharePercent).toBeGreaterThan(0);
    expect(concentration.topThreeSharePercent).toBeLessThanOrEqual(100);
  });

  it('scores distribution between 0 and 100', () => {
    expect(concentration.distributionScore).toBeGreaterThanOrEqual(0);
    expect(concentration.distributionScore).toBeLessThanOrEqual(100);
  });

  it('returns a safe result when there is no activity at all', () => {
    const empty = computeConcentration([]);
    expect(empty.topThreeSharePercent).toBe(0);
    expect(empty.distributionScore).toBe(0);
  });
});

describe('emerging destinations', () => {
  it('scores zero where the sample is too small to read a growth rate', () => {
    const emerging = computeEmerging(computeDemand(window));
    const demand = computeDemand(window);

    for (const row of emerging) {
      const source = demand.find((entry) => entry.destinationId === row.destinationId)!;
      if (source.interactions < MIN_SAMPLE_FOR_TREND) {
        expect(row.score, `${row.name} should not score on a small sample`).toBe(0);
        expect(row.reason).toContain('Too few interactions');
      }
    }
  });
});

describe('promotion recommendation', () => {
  const result = recommendCampaignTargets({
    demand: pulse.demand,
    capacity: pulse.capacity,
    sentiment: pulse.sentiment,
    alerts: pulse.alerts,
    concentration: pulse.concentration,
  });

  it('excludes destinations that are already among the three largest', () => {
    const topNames = new Set(pulse.concentration.topThree.map((row) => row.name));
    for (const target of result.recommended) {
      expect(topNames.has(target.name), `${target.name} is already concentrated`).toBe(false);
    }
  });

  it('gives a reason for every exclusion', () => {
    for (const target of result.excluded) {
      expect(target.exclusionReason).toBeTruthy();
    }
  });

  it('never recommends the border destination without an advisory check', () => {
    expect(result.recommended.some((target) => target.destinationId === 'dest-moreh')).toBe(false);
    const moreh = result.excluded.find((target) => target.destinationId === 'dest-moreh');
    expect(moreh?.exclusionReason).toMatch(/advisor/i);
  });

  it('attaches conditions rather than silently ignoring an open issue', () => {
    for (const target of result.recommended) {
      const hasOpenIssue = pulse.alerts.some(
        (alert) => alert.severity === 'ACTION' && alert.entityId === target.destinationId,
      );
      if (hasOpenIssue) {
        expect(target.conditions.length).toBeGreaterThan(0);
      }
    }
  });

  it('ranks by score, highest first', () => {
    const scores = result.recommended.map((target) => target.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('sentiment', () => {
  it('reports satisfaction with its sample size', () => {
    const satisfaction = computeSatisfaction(window);
    expect(satisfaction.responses).toBeGreaterThan(0);
    expect(satisfaction.averageRating).not.toBeNull();
    expect(satisfaction.averageRating!).toBeGreaterThanOrEqual(1);
    expect(satisfaction.averageRating!).toBeLessThanOrEqual(5);
    expect(satisfaction.positiveShare + satisfaction.negativeShare).toBeLessThanOrEqual(100);
  });

  it('counts only service issues as issues, not praise', () => {
    const issues = computeIssues(window);
    expect(issues.totalIssueReports).toBeLessThanOrEqual(issues.totalResponses);
    for (const issue of issues.issues) {
      expect(issue.count + issue.previousCount).toBeGreaterThan(0);
    }
  });

  it('names transport as the leading issue at Ukhrul', () => {
    const ukhrul = pulse.sentiment.find((row) => row.destinationId === 'dest-ukhrul');
    expect(ukhrul?.topIssue?.category).toBe('TRANSPORT');
  });
});

describe('capacity', () => {
  it('never reports more available places than exist', () => {
    for (const row of computeCapacity()) {
      expect(row.availableCapacity).toBeLessThanOrEqual(row.totalCapacity);
      expect(row.coverageNote).toMatch(/participating partners only/i);
    }
  });

  it('states coverage limits on the state summary', () => {
    const state = computeStateCapacity();
    expect(state.availableCapacity).toBeLessThanOrEqual(state.totalCapacity);
    expect(state.coverageNote).toBeTruthy();
  });
});

describe('campaign funnel', () => {
  const funnel = computeCampaignFunnel('camp-000');

  it('keeps reach and platform signals in separate blocks', () => {
    expect(funnel).toBeDefined();
    const reach = funnel!.steps.filter((step) => step.block === 'REACH');
    const platform = funnel!.steps.filter((step) => step.block === 'PLATFORM');
    expect(reach.length).toBeGreaterThan(0);
    expect(platform.length).toBeGreaterThan(0);
    expect(funnel!.scaleNote).toMatch(/conversion rate/i);
  });

  it('refuses to claim attribution', () => {
    expect(funnel!.attributionStatement).toMatch(/does not claim/i);
    expect(funnel!.caveats.join(' ')).toMatch(/association, not attribution/i);
  });

  it('labels a draft campaign as unlaunched rather than as a failure', () => {
    const draft = computeCampaignFunnel('camp-001');
    expect(draft?.campaign.status).toBe('DRAFT');
    expect(draft?.daysElapsed).toBe(0);
    expect(draft?.caveats[0]).toMatch(/still a draft/i);
  });
});

describe('creator matching', () => {
  const campaign = getCampaign('camp-001')!;
  const matches = matchCreators(campaign, 5);

  it('is deterministic', () => {
    const again = matchCreators(campaign, 5);
    expect(again.map((m) => m.creator.id)).toEqual(matches.map((m) => m.creator.id));
    expect(again.map((m) => m.totalScore)).toEqual(matches.map((m) => m.totalScore));
  });

  it('ranks highest first and stays within 100', () => {
    const scores = matches.map((match) => match.totalScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    for (const score of scores) expect(score).toBeLessThanOrEqual(100);
  });

  it('shows every component of the score, so the ranking is not opaque', () => {
    for (const match of matches) {
      expect(match.factors).toHaveLength(6);
      const summed = match.factors.reduce((sum, factor) => sum + factor.score, 0);
      expect(Math.abs(summed - match.totalScore)).toBeLessThan(0.5);
      for (const factor of match.factors) {
        expect(factor.detail.length).toBeGreaterThan(0);
        expect(factor.score).toBeLessThanOrEqual(factor.maxScore);
      }
    }
  });

  it('puts a creator based in the campaign district near the top', () => {
    const destination = getDestination(campaign.destinationId)!;
    const local = matches.findIndex((match) => match.creator.homeDistrict === destination.district);
    expect(local).toBeGreaterThanOrEqual(0);
    expect(local).toBeLessThan(3);
  });

  it('excludes inactive creators', () => {
    for (const match of matches) expect(match.creator.status).not.toBe('INACTIVE');
  });
});

describe('simulation', () => {
  const result = simulateCampaign({ destinationId: 'dest-ukhrul', additionalVisitors: 5000 });

  it('labels its output as a forecast with stated assumptions', () => {
    expect(result?.provenance).toBe('FORECAST');
    expect(result?.assumptions.averageStayNights).toBeGreaterThan(0);
    expect(result?.caveats.join(' ')).toMatch(/scenario under stated assumptions/i);
  });

  it('returns a range on every projected figure', () => {
    for (const pressure of result!.pressures) {
      expect(pressure.range).toMatch(/ to /);
    }
  });

  it('flags a scenario that exceeds reported partner capacity', () => {
    const accommodation = result!.pressures[0]!;
    expect(['OVER_CAPACITY', 'TIGHT', 'COMFORTABLE', 'UNKNOWN']).toContain(accommodation.reading);
    if (accommodation.reading === 'OVER_CAPACITY') {
      expect(result!.mitigations.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing for a destination that does not exist', () => {
    expect(simulateCampaign({ destinationId: 'dest-nowhere', additionalVisitors: 100 })).toBeUndefined();
  });
});

describe('travel estimates', () => {
  it('inflates a hill route over a valley route of the same distance', () => {
    const a = { latitude: 24.8, longitude: 93.9 };
    const b = { latitude: 25.1, longitude: 94.3 };
    expect(travelMinutes(a, b, { hill: true })).toBeGreaterThan(travelMinutes(a, b, { hill: false }));
  });

  it('returns zero for the same point', () => {
    const a = { latitude: 24.8, longitude: 93.9 };
    expect(travelMinutes(a, a)).toBe(0);
  });
});

describe('tourism pulse', () => {
  it('shows six headline indicators, as the MVP spec requires', () => {
    expect(pulse.headline).toHaveLength(6);
  });

  it('keeps the official tier visible but explicitly not connected', () => {
    const official = pulse.indicatorIndex.find((kpi) => kpi.id === 'official-arrivals');
    expect(official?.state).toBe('NOT_CONNECTED');
    expect(official?.numericValue).toBeUndefined();
    expect(official?.connectionNote).toMatch(/no integration/i);
  });

  it('gives every indicator a method and a source', () => {
    for (const kpi of [...pulse.headline, ...pulse.indicatorIndex]) {
      expect(kpi.method.length).toBeGreaterThan(10);
      expect(kpi.sourceIds.length).toBeGreaterThan(0);
    }
  });

  it('names the rule behind every alert', () => {
    for (const alert of pulse.alerts) {
      expect(alert.rule.length).toBeGreaterThan(10);
    }
  });
});
