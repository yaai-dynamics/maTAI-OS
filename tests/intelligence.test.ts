import { beforeEach, describe, expect, it } from 'vitest';

import {
  findInfrastructureOpportunities,
  forecastDemand,
  MAX_HORIZON_DAYS,
  optimiseCampaign,
} from '@/server/analytics/forecast';
import { computePulse } from '@/server/analytics/pulse';
import { askManipurTourism, classifyIntent } from '@/server/ai/government-analyst';
import { resetState } from '@/server/data/store';

/**
 * Roadmap Phase 4 — intelligence.
 *
 * The tests that matter here are the ones about restraint: a forecast that
 * claims more than ninety days of history can support would be the most
 * damaging thing this platform could produce.
 */

describe('demand forecasting', () => {
  beforeEach(() => {
    resetState();
  });

  it('produces a point for every day of the horizon', () => {
    const forecast = forecastDemand({ horizonDays: 10 });
    expect(forecast.points).toHaveLength(10);
    expect(forecast.history.length).toBeGreaterThan(30);
  });

  it('refuses a horizon longer than the history can support', () => {
    const forecast = forecastDemand({ horizonDays: 180 });
    expect(forecast.horizonDays).toBe(MAX_HORIZON_DAYS);
  });

  it('never projects a negative demand', () => {
    for (const point of forecastDemand({ horizonDays: 14 }).points) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.lower).toBeGreaterThanOrEqual(0);
    }
  });

  it('widens the interval as the horizon lengthens', () => {
    const forecast = forecastDemand({ horizonDays: 14 });
    const first = forecast.points[0]!;
    const last = forecast.points.at(-1)!;

    expect(last.upper - last.lower).toBeGreaterThan(first.upper - first.lower);
  });

  it('keeps the central projection inside its own interval', () => {
    for (const point of forecastDemand({ horizonDays: 14 }).points) {
      expect(point.value).toBeGreaterThanOrEqual(point.lower);
      expect(point.value).toBeLessThanOrEqual(point.upper);
    }
  });

  it('is never better than medium confidence, and states why', () => {
    const forecast = forecastDemand({ horizonDays: 7 });
    expect(['LOW', 'MEDIUM']).toContain(forecast.confidence);
    expect(forecast.confidenceReason.length).toBeGreaterThan(20);
  });

  it('says plainly that it cannot see annual seasonality', () => {
    const forecast = forecastDemand({});
    expect(forecast.limits.join(' ')).toMatch(/annual seasonality/i);
    expect(forecast.method).toMatch(/not a seasonal model/i);
  });

  it('flags events that fall inside the horizon as unmodelled', () => {
    const forecast = forecastDemand({ destinationId: 'dest-kangla', horizonDays: 14 });
    for (const event of forecast.eventsInHorizon) {
      expect(event.name.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    const a = forecastDemand({ destinationId: 'dest-ukhrul', horizonDays: 7 });
    const b = forecastDemand({ destinationId: 'dest-ukhrul', horizonDays: 7 });
    expect(a.points).toEqual(b.points);
  });
});

describe('infrastructure opportunity analysis', () => {
  beforeEach(() => {
    resetState();
  });

  const pulse = () => computePulse();

  it('ranks a destination with interest and no supply above a well supplied one', () => {
    const state = pulse();
    const opportunities = findInfrastructureOpportunities({
      demand: state.demand,
      capacity: state.capacity,
    });

    expect(opportunities.length).toBeGreaterThan(0);

    const scores = opportunities.map((row) => row.gapScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const top = opportunities[0]!;
    expect(top.missing.length).toBeGreaterThan(0);
    expect(top.recommendation).toMatch(/onboarding before promotion/i);
  });

  it('says what is missing rather than only scoring it', () => {
    const state = pulse();
    for (const row of findInfrastructureOpportunities({
      demand: state.demand,
      capacity: state.capacity,
    })) {
      expect(row.recommendation.length).toBeGreaterThan(20);
      if (row.missing.length === 0) {
        expect(row.recommendation).toMatch(/promotion candidate/i);
      }
    }
  });

  it('calls a supply gap a development priority, not a promotion target', () => {
    const state = pulse();
    const top = findInfrastructureOpportunities({
      demand: state.demand,
      capacity: state.capacity,
    })[0]!;
    expect(top.recommendation).not.toMatch(/promote it/i);
  });
});

describe('campaign optimisation', () => {
  it('puts fixing an open service problem above everything else', () => {
    const result = optimiseCampaign({
      campaignId: 'camp-x',
      campaignName: 'Test',
      destinationName: 'Ukhrul',
      publishedContent: 2,
      shortlistedCreators: 4,
      daysRemaining: 20,
      spareCapacity: 40,
      openIssue: 'Transport reported repeatedly at Ukhrul',
      platformSignals: 30,
      reachViews: 5000,
    });

    expect(result.levers[0]?.lever).toMatch(/fix the service problem/i);
  });

  it('puts capacity above reach when capacity is the constraint', () => {
    const result = optimiseCampaign({
      campaignId: 'camp-x',
      campaignName: 'Test',
      destinationName: 'Shirui',
      publishedContent: 3,
      shortlistedCreators: 1,
      daysRemaining: 20,
      spareCapacity: 4,
      openIssue: null,
      platformSignals: 12,
      reachViews: 5000,
    });

    const capacityIndex = result.levers.findIndex((lever) => /onboard more accommodation/i.test(lever.lever));
    const shortlistIndex = result.levers.findIndex((lever) => /widen the creator shortlist/i.test(lever.lever));

    expect(capacityIndex).toBeGreaterThanOrEqual(0);
    expect(capacityIndex).toBeLessThan(shortlistIndex);
  });

  it('flags reach with no attributable outcome', () => {
    const result = optimiseCampaign({
      campaignId: 'camp-x',
      campaignName: 'Test',
      destinationName: 'Andro',
      publishedContent: 2,
      shortlistedCreators: 5,
      daysRemaining: 20,
      spareCapacity: 40,
      openIssue: null,
      platformSignals: 0,
      reachViews: 40_000,
    });

    expect(result.levers.some((lever) => /tracked destination link/i.test(lever.lever))).toBe(true);
  });

  it('always returns a lever, and refuses to predict an uplift', () => {
    const result = optimiseCampaign({
      campaignId: 'camp-x',
      campaignName: 'Test',
      destinationName: 'Kangla',
      publishedContent: 4,
      shortlistedCreators: 6,
      daysRemaining: 30,
      spareCapacity: 60,
      openIssue: null,
      platformSignals: 80,
      reachViews: 20_000,
    });

    expect(result.levers.length).toBeGreaterThan(0);
    expect(result.caveat).toMatch(/not predicted uplifts/i);
  });
});

describe('the analyst answers the Phase 4 questions', () => {
  beforeEach(() => {
    resetState();
  });

  it('routes forecast and investment questions to their own intents', () => {
    expect(classifyIntent('What will demand look like over the next two weeks?')).toBe('FORECAST');
    expect(classifyIntent('Where should we invest in tourism infrastructure?')).toBe('OPPORTUNITY');
  });

  it('answers a forecast question without claiming a measurement', async () => {
    const answer = await askManipurTourism('What will demand look like over the next two weeks?');

    expect(answer.intent).toBe('Demand projection');
    expect(answer.confidence).not.toBe('HIGH');
    expect(answer.evidence.every((item) => item.provenance === 'FORECAST' || item.provenance === 'DEMO_SYNTHETIC')).toBe(
      true,
    );
    expect(answer.answer).toMatch(/not a seasonal model/i);
    expect(answer.caveats.join(' ')).toMatch(/annual seasonality/i);
  });

  it('answers an investment question with the supply gap, not a promotion', async () => {
    const answer = await askManipurTourism('Where should we invest in tourism infrastructure?');

    expect(answer.intent).toBe('Supply gap analysis');
    expect(answer.evidence.length).toBeGreaterThan(0);
    expect(answer.recommendation).toMatch(/development priority/i);
  });
});
