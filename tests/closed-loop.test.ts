import { beforeEach, describe, expect, it } from 'vitest';

import { askManipurTourism } from '@/server/ai/government-analyst';
import { buildItinerary, extractTripProfile } from '@/server/ai/trip-planner';
import { computeCampaignFunnel } from '@/server/analytics/campaign';
import { computePulse } from '@/server/analytics/pulse';
import { computeIssues } from '@/server/analytics/sentiment';
import { currentWindow } from '@/server/analytics/windows';
import { getCampaign, getInteractions } from '@/server/data/repository';
import {
  isSessionRecord,
  recordInteraction,
  resetState,
  submitFeedback,
  updateCampaign,
} from '@/server/data/store';
import { saveTrip } from '@/server/data/trips';

/**
 * The closed loop.
 *
 * CLAUDE.md section 13 defines success as a reviewer being able to submit
 * tourist feedback and then see the resulting signal in the government
 * experience. This exercises exactly that path against the real store and the
 * real analytics, with no mocking, so the loop cannot quietly break.
 */

const SESSION = 'sess-loop-test';

describe('a tourist action reaches the government views', () => {
  beforeEach(() => {
    resetState();
  });

  it('counts a live check-in in the platform activity figure', async () => {
    const before = computePulse().totals.interactions;

    await recordInteraction({
      anonymousSessionId: SESSION,
      type: 'QR_CHECKIN',
      destinationId: 'dest-ukhrul',
    });

    expect(computePulse().totals.interactions).toBe(before + 1);
  });

  it('marks live signals as platform observed, not as demo data', async () => {
    const interaction = await recordInteraction({
      anonymousSessionId: SESSION,
      type: 'DESTINATION_VIEW',
      destinationId: 'dest-ukhrul',
    });

    expect(interaction.provenance).toBe('PLATFORM_OBSERVED');
    expect(isSessionRecord(interaction.id)).toBe(true);
  });

  it('never reuses a record id after a restart', async () => {
    // Ids were a per-process counter, so the first signal after a restart took
    // an id MySQL already held. A fresh state stands in for the restart.
    const before = await recordInteraction({ anonymousSessionId: SESSION, type: 'DESTINATION_VIEW', destinationId: 'dest-ukhrul' });
    resetState();
    const after = await recordInteraction({ anonymousSessionId: SESSION, type: 'DESTINATION_VIEW', destinationId: 'dest-ukhrul' });
    expect(after.id).not.toBe(before.id);
    expect(after.id).toMatch(/^int-live-[a-z0-9]+-[0-9a-f]{10}$/);
  });

  it('moves the destination demand index when a journey is planned', async () => {
    const before = computePulse().demand.find((row) => row.destinationId === 'dest-ukhrul');

    const profile = extractTripProfile(
      'I have 3 days, love nature, culture and local food, and prefer less crowded places.',
    );
    const { trip } = buildItinerary(profile, SESSION);
    await saveTrip(trip);

    for (const item of trip.items.filter((entry) => entry.kind === 'DESTINATION')) {
      await recordInteraction({
        anonymousSessionId: SESSION,
        type: 'ITINERARY_ADD',
        destinationId: item.destinationId,
        tripId: trip.id,
      });
    }

    const after = computePulse().demand.find((row) => row.destinationId === 'dest-ukhrul');
    const planned = trip.items.some((item) => item.destinationId === 'dest-ukhrul');

    if (planned) {
      expect(after!.weightedScore).toBeGreaterThan(before!.weightedScore);
      expect(after!.itineraryAdds).toBeGreaterThan(before!.itineraryAdds);
    }
  });

  it('surfaces live feedback as a counted, categorised issue', async () => {
    const window = currentWindow();
    const before = computeIssues(window, 'dest-ukhrul').issues.find(
      (issue) => issue.category === 'TRANSPORT',
    );

    const entry = await submitFeedback({
      destinationId: 'dest-ukhrul',
      anonymousSessionId: SESSION,
      rating: 3,
      category: 'TRANSPORT',
      text: 'Beautiful experience, but transport information was confusing.',
      sentiment: 'NEUTRAL',
    });

    const after = computeIssues(window, 'dest-ukhrul').issues.find(
      (issue) => issue.category === 'TRANSPORT',
    );

    expect(after!.count).toBe((before?.count ?? 0) + 1);
    // The newest item is first, so a live submission is immediately visible.
    expect(after!.examples[0]!.id).toBe(entry.id);
    expect(isSessionRecord(entry.id)).toBe(true);
    expect(entry.anonymized).toBe(true);
  });

  it('answers the complaints question using the feedback just submitted', async () => {
    await submitFeedback({
      destinationId: 'dest-ukhrul',
      anonymousSessionId: SESSION,
      rating: 3,
      category: 'TRANSPORT',
      text: 'Transport information was confusing.',
      sentiment: 'NEUTRAL',
    });

    const answer = await askManipurTourism('What are tourists complaining about at Ukhrul?');
    expect(answer.answer.toLowerCase()).toContain('transport');
    expect(answer.evidence.length).toBeGreaterThan(0);
  });

  it('moves the campaign funnel when a signal is attributed to a live campaign', async () => {
    // Launch the drafted campaign the way the department does in the demo.
    await updateCampaign('camp-001', { status: 'OPEN', startDate: '2026-09-16', endDate: '2026-09-30' });
    const campaign = getCampaign('camp-001')!;
    expect(campaign.status).toBe('OPEN');

    const before = computeCampaignFunnel('camp-001')!;
    const beforeVisits = before.steps.find((step) => step.metric === 'DESTINATION_PAGE_VISITS')!;

    await recordInteraction({
      anonymousSessionId: SESSION,
      type: 'DESTINATION_VIEW',
      destinationId: 'dest-ukhrul',
      campaignId: 'camp-001',
    });

    const after = computeCampaignFunnel('camp-001')!;
    const afterVisits = after.steps.find((step) => step.metric === 'DESTINATION_PAGE_VISITS')!;

    expect(afterVisits.value).toBe(beforeVisits.value + 1);
    expect(afterVisits.capturedThisSession).toBe(1);
    expect(afterVisits.provenance).toBe('PLATFORM_OBSERVED');
  });

  it('returns to a known state on reset, so the demo can be run again', async () => {
    const baseline = computePulse().totals.interactions;

    await recordInteraction({
      anonymousSessionId: SESSION,
      type: 'QR_CHECKIN',
      destinationId: 'dest-loktak',
    });
    await submitFeedback({
      destinationId: 'dest-loktak',
      anonymousSessionId: SESSION,
      rating: 5,
      category: 'NATURE',
      text: 'Wonderful.',
      sentiment: 'POSITIVE',
    });

    expect(computePulse().totals.interactions).toBeGreaterThan(baseline);

    resetState();

    expect(computePulse().totals.interactions).toBe(baseline);
    expect(getInteractions({}).some((row) => row.anonymousSessionId === SESSION)).toBe(false);
    expect(getCampaign('camp-001')?.status).toBe('DRAFT');
  });
});
