import { beforeEach, describe, expect, it, vi } from 'vitest';

import { now } from '@/lib/config';
import { addDays, toIsoDate } from '@/lib/date';
import { computeCapacity, computeStateCapacity } from '@/server/analytics/capacity';
import { computeDistrictSentiment, computeIssueTrend, computeIssues } from '@/server/analytics/sentiment';
import { currentWindow } from '@/server/analytics/windows';
import { getBusiness, getEnquiries, getEnquiriesForBusiness } from '@/server/data/repository';
import { resetState, submitFeedback } from '@/server/data/store';

/**
 * Roadmap Phase 1 — pilot features.
 *
 * Two boundaries are stubbed because they need a request scope: revalidatePath,
 * and the identity layer. Everything else runs against the real store and the
 * real analytics. Each test says who it acts as: a partner acts for its own
 * business, the department verifies and reviews.
 */
vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock('@/server/auth/session', async () => (await import('./support/identity')).sessionModule);
vi.mock('@/server/auth/accounts', async () => (await import('./support/identity')).accountsModule);
vi.mock('@/server/auth/registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/registration')>()),
  openAccountAndSignIn: (await import('./support/identity')).openAccountAndSignIn,
}));

import { actAs } from './support/identity';

let registrations = 0;
/** Unique credentials for each registration in this file. */
const credentials = () => {
  registrations += 1;
  return {
    contactName: 'Test Owner',
    email: `owner-${registrations}@pilot.test`,
    password: 'a long enough passphrase',
  };
};

const {
  onboardBusiness,
  reportAvailability,
  respondToEnquiry,
  reviewCampaignContent,
  verifyBusiness,
} = await import('@/server/actions/partner');
const { submitCampaignContent } = await import('@/server/actions/creator');

describe('partner availability reporting', () => {
  beforeEach(() => {
    resetState();
  });

  it('records a partner reported snapshot that reaches the capacity view', async () => {
    const business = getBusiness('biz-013')!;
    expect(business.verified).toBe(true);

    const before = computeCapacity().find((row) => row.destinationId === business.destinationId)!;

    actAs({ businessId: business.id });
    const result = await reportAvailability({
      date: toIsoDate(now()),
      totalCapacity: 30,
      availableCapacity: 22,
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.provenance).toBe('PARTNER_REPORTED');
    expect(result.snapshot?.occupancyRate).toBeCloseTo(1 - 22 / 30, 3);

    const after = computeCapacity().find((row) => row.destinationId === business.destinationId)!;
    expect(after.totalCapacity).not.toBe(before.totalCapacity);
    expect(after.coverageNote).toMatch(/verified, participating partners only/i);
  });

  it('refuses more available places than exist', async () => {
    actAs({ businessId: 'biz-013' });
    const result = await reportAvailability({
      date: toIsoDate(now()),
      totalCapacity: 10,
      availableCapacity: 12,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot exceed/i);
  });

  it('refuses a future date, because availability is reported not predicted', async () => {
    actAs({ businessId: 'biz-013' });
    const result = await reportAvailability({
      date: toIsoDate(addDays(now(), 3)),
      totalCapacity: 10,
      availableCapacity: 4,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/today or a past date/i);
  });

  it('replaces rather than duplicates a correction for the same day', async () => {
    const date = toIsoDate(now());
    actAs({ businessId: 'biz-013' });
    await reportAvailability({ date, totalCapacity: 20, availableCapacity: 5 });
    await reportAvailability({ date, totalCapacity: 20, availableCapacity: 9 });

    const rows = computeCapacity().find((row) => row.destinationId === 'dest-ukhrul')!;
    expect(rows.reportingProperties).toBe(1);
    expect(rows.availableCapacity).toBe(9);
  });
});

describe('business onboarding and verification', () => {
  beforeEach(() => {
    resetState();
  });

  it('registers a business as pending and unverified', async () => {
    const result = await onboardBusiness({
      name: 'Shirui Ridge Homestay',
      businessType: 'HOMESTAY',
      destinationId: 'dest-shirui',
      reportedCapacity: 8,
      contactVisibility: 'ON_ENQUIRY',
      ...credentials(),
    });

    expect(result.ok).toBe(true);
    expect(result.business?.status).toBe('PENDING_VERIFICATION');
    expect(result.business?.verified).toBe(false);
    expect(result.business?.provenance).toBe('PARTNER_REPORTED');
    // District is taken from the destination, not from free text.
    expect(result.business?.district).toBe('Ukhrul');
  });

  it('keeps an unverified self-report out of usable capacity', async () => {
    const before = computeStateCapacity();

    const registered = await onboardBusiness({
      name: 'Unverified Guest House',
      businessType: 'HOMESTAY',
      destinationId: 'dest-ukhrul',
      reportedCapacity: 500,
      contactVisibility: 'ON_ENQUIRY',
      ...credentials(),
    });

    actAs({ businessId: registered.business!.id });
    await reportAvailability({
      date: toIsoDate(now()),
      totalCapacity: 500,
      availableCapacity: 500,
    });

    const after = computeStateCapacity();
    expect(after.totalCapacity).toBe(before.totalCapacity);
    expect(after.availableCapacity).toBe(before.availableCapacity);
    expect(after.pendingVerificationCapacity).toBe(500);
    expect(after.awaitingVerification).toBeGreaterThan(before.awaitingVerification);
  });

  it('counts the capacity once the department verifies the business', async () => {
    const registered = await onboardBusiness({
      name: 'Newly Verified Homestay',
      businessType: 'HOMESTAY',
      destinationId: 'dest-ukhrul',
      reportedCapacity: 12,
      contactVisibility: 'ON_ENQUIRY',
      ...credentials(),
    });
    const id = registered.business!.id;

    actAs({ businessId: id });
    await reportAvailability({
      date: toIsoDate(now()),
      totalCapacity: 12,
      availableCapacity: 7,
    });

    const before = computeStateCapacity();
    actAs({ role: 'ADMINISTRATOR' });
    const verified = await verifyBusiness(id, 'VERIFY');

    expect(verified.business?.status).toBe('PARTICIPATING');
    expect(verified.business?.verified).toBe(true);

    const after = computeStateCapacity();
    expect(after.availableCapacity).toBe(before.availableCapacity + 7);
    expect(after.pendingVerificationCapacity).toBe(before.pendingVerificationCapacity - 7);
  });

  it('marks a rejected business inactive rather than deleting it', async () => {
    const registered = await onboardBusiness({
      name: 'Rejected Operator',
      businessType: 'TOUR_OPERATOR',
      destinationId: 'dest-loktak',
      contactVisibility: 'PRIVATE',
      ...credentials(),
    });
    actAs({ role: 'ADMINISTRATOR' });
    const result = await verifyBusiness(registered.business!.id, 'REJECT');

    expect(result.business?.status).toBe('INACTIVE');
    expect(result.business?.verified).toBe(false);
    expect(getBusiness(registered.business!.id)).toBeDefined();
  });
});

describe('enquiry handling', () => {
  beforeEach(() => {
    resetState();
  });

  it('lets a partner respond and records the new status', async () => {
    const enquiry = getEnquiries()[0]!;
    actAs({ businessId: enquiry.businessId });
    const result = await respondToEnquiry({ enquiryId: enquiry.id, status: 'CONFIRMED' });

    expect(result.ok).toBe(true);
    expect(result.enquiry?.status).toBe('CONFIRMED');
    expect(getEnquiriesForBusiness(enquiry.businessId)[0]?.id).toBeDefined();
  });

  it('rejects a status outside the allowed set', async () => {
    const enquiry = getEnquiries()[0]!;
    actAs({ businessId: enquiry.businessId });
    const result = await respondToEnquiry({ enquiryId: enquiry.id, status: 'SOMETHING_ELSE' });
    expect(result.ok).toBe(false);
  });
});

describe('campaign content review', () => {
  beforeEach(() => {
    resetState();
  });

  const submit = () => {
    actAs({ creatorId: 'creator-002' });
    return submitCampaignContent({
      campaignId: 'camp-002',
      title: 'Kangla in four layers',
      platform: 'YouTube',
      contentUrl: 'demo://content/review-test',
      caption: 'The same ground was a ceremonial centre, a garrison and then a heritage site again.',
      disclosure: 'Paid partnership with Manipur Tourism',
    });
  };

  it('requires a note when requesting changes', async () => {
    const submitted = await submit();
    actAs({ role: 'ADMINISTRATOR' });
    const result = await reviewCampaignContent({
      contentId: submitted.content!.id,
      decision: 'CHANGES_REQUESTED',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/say what needs to change/i);
  });

  it('records an approval and the note against the submission', async () => {
    const submitted = await submit();
    actAs({ role: 'ADMINISTRATOR' });
    const result = await reviewCampaignContent({
      contentId: submitted.content!.id,
      decision: 'APPROVED',
      note: 'Good responsible visit framing.',
    });

    expect(result.ok).toBe(true);
    expect(result.content?.status).toBe('APPROVED');
    expect(result.content?.reviewNote).toBe('Good responsible visit framing.');
  });

  it('refuses a submission without a paid partnership disclosure', async () => {
    actAs({ creatorId: 'creator-002' });
    const result = await submitCampaignContent({
      campaignId: 'camp-002',
      title: 'No disclosure',
      platform: 'Instagram',
      contentUrl: 'demo://content/no-disclosure',
      caption: 'A caption long enough to pass the length check.',
      disclosure: 'none',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/paid partnership/i);
  });
});

describe('richer feedback analytics', () => {
  beforeEach(() => {
    resetState();
  });

  const window = currentWindow();

  it('buckets issue reports into weeks that cover the window', () => {
    const trend = computeIssueTrend(window);
    expect(trend.length).toBe(Math.ceil(window.days / 7));

    const total = trend.reduce((sum, point) => sum + point.total, 0);
    expect(total).toBe(computeIssues(window).totalIssueReports);
  });

  it('filters the trend to one category when asked', () => {
    const all = computeIssueTrend(window);
    const transport = computeIssueTrend(window, { category: 'TRANSPORT' });

    const allTotal = all.reduce((sum, point) => sum + point.total, 0);
    const transportTotal = transport.reduce((sum, point) => sum + point.total, 0);

    expect(transportTotal).toBeLessThanOrEqual(allTotal);
    expect(transportTotal).toBe(
      computeIssues(window).issues.find((issue) => issue.category === 'TRANSPORT')?.count ?? 0,
    );
  });

  it('rolls feedback up to districts without losing any of it', () => {
    const districts = computeDistrictSentiment(window);
    const rolledUp = districts.reduce((sum, row) => sum + row.responses, 0);
    expect(rolledUp).toBe(computeIssues(window).totalResponses);
  });

  it('picks up a live submission in both the trend and the district rollup', async () => {
    const beforeTrend = computeIssueTrend(window, { category: 'TRANSPORT' }).reduce(
      (sum, point) => sum + point.total,
      0,
    );
    const beforeDistrict = computeDistrictSentiment(window).find(
      (row) => row.district === 'Ukhrul',
    )!;

    await submitFeedback({
      destinationId: 'dest-ukhrul',
      anonymousSessionId: 'sess-pilot-test',
      rating: 3,
      category: 'TRANSPORT',
      text: 'Transport information was confusing.',
      sentiment: 'NEUTRAL',
    });

    const afterTrend = computeIssueTrend(window, { category: 'TRANSPORT' }).reduce(
      (sum, point) => sum + point.total,
      0,
    );
    const afterDistrict = computeDistrictSentiment(window).find((row) => row.district === 'Ukhrul')!;

    expect(afterTrend).toBe(beforeTrend + 1);
    expect(afterDistrict.issueReports).toBe(beforeDistrict.issueReports + 1);
  });
});
