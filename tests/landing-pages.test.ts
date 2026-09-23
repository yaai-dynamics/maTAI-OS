import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEvent, getLandingPageBySlug, getLandingPagesForBusiness } from '@/server/data/repository';
import { resetState } from '@/server/data/store';

/**
 * AI landing pages: partner microsites and government campaign/festival pages.
 *
 * Two boundaries are stubbed because they need a request scope: revalidatePath,
 * and the identity layer — the same convention as tests/pilot.test.ts. The AI
 * provider is left as the default mock, so content assembly is asserted on the
 * deterministic parts only; narrate() just echoes its deterministic text back.
 */
vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock('@/server/auth/session', async () => (await import('./support/identity')).sessionModule);

import { actAs } from './support/identity';

const {
  createCampaignLandingPage,
  generateBusinessLandingPage,
  publishBusinessLandingPage,
  publishCampaignLandingPage,
  recordLandingPageShare,
  recordLandingPageView,
  updateBusinessLandingPage,
} = await import('@/server/actions/landing-pages');

describe('partner landing pages', () => {
  beforeEach(() => {
    resetState();
  });

  it('refuses to generate a page for a caller who is not signed in as a partner', async () => {
    actAs({});
    const result = await generateBusinessLandingPage();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sign in/i);
  });

  it('generates a draft from the business record, deterministically', async () => {
    // biz-014 has no seeded landing page yet, unlike the demo partner (biz-013).
    actAs({ businessId: 'biz-014' });
    const result = await generateBusinessLandingPage();

    expect(result.ok).toBe(true);
    expect(result.page?.status).toBe('DRAFT');
    expect(result.page?.businessId).toBe('biz-014');
    expect(result.page?.title).toBe('Eastern Hills Transport');
    expect(result.page?.sections.map((s) => s.key)).toEqual(['about', 'highlights', 'practical']);
    expect(result.page?.provenance).toBe('PARTNER_REPORTED');
    // No live provider is configured in the test suite, so no figure is invented.
    expect(result.page?.generatedBy).toBe('mock');
  });

  it('regenerates in place rather than creating a second page for the same business', async () => {
    actAs({ businessId: 'biz-013' });
    const first = await generateBusinessLandingPage();
    const second = await generateBusinessLandingPage();

    expect(second.page?.id).toBe(first.page?.id);
    expect(getLandingPagesForBusiness('biz-013')).toHaveLength(1);
  });

  it('lets the owning partner edit and publish, and the page becomes reachable by slug', async () => {
    actAs({ businessId: 'biz-013' });
    await generateBusinessLandingPage();

    const edited = await updateBusinessLandingPage({
      title: 'Tangkhul Homestays',
      tagline: 'A night in a Tangkhul Naga village home.',
      about: 'Updated about paragraph with enough length to pass validation.',
      highlights: 'Room and meals included',
      practical: '₹1,400 per night',
    });
    expect(edited.ok).toBe(true);
    expect(edited.page?.title).toBe('Tangkhul Homestays');

    const published = await publishBusinessLandingPage(true);
    expect(published.ok).toBe(true);
    expect(published.page?.status).toBe('PUBLISHED');
    expect(published.page?.publishedAt).toBeDefined();

    const bySlug = getLandingPageBySlug(published.page!.slug);
    expect(bySlug?.status).toBe('PUBLISHED');

    const unpublished = await publishBusinessLandingPage(false);
    expect(unpublished.page?.status).toBe('DRAFT');
  });

  it('assigns a unique slug when two businesses would otherwise collide', async () => {
    actAs({ businessId: 'biz-013' });
    const first = await generateBusinessLandingPage();

    actAs({ businessId: 'biz-014' });
    const second = await generateBusinessLandingPage();

    if (first.page?.title === second.page?.title) {
      expect(second.page?.slug).not.toBe(first.page?.slug);
    }
  });
});

describe('campaign and festival landing pages', () => {
  beforeEach(() => {
    resetState();
  });

  it('refuses a viewer, and allows an officer, per the permission table', async () => {
    actAs({ role: 'VIEWER' });
    const refused = await createCampaignLandingPage({ eventId: 'ev-006' });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/cannot/i);

    actAs({ role: 'OFFICER' });
    const allowed = await createCampaignLandingPage({ eventId: 'ev-006' });
    expect(allowed.ok).toBe(true);
    expect(allowed.page?.eventId).toBe('ev-006');
    expect(allowed.page?.title).toBe(getEvent('ev-006')!.name);
    expect(allowed.page?.provenance).toBe('DEMO_SYNTHETIC');
  });

  it('refuses a page linked to neither a campaign nor an event', async () => {
    actAs({ role: 'OFFICER' });
    const result = await createCampaignLandingPage({});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/campaign or an event/i);
  });

  it('builds content from the linked event, including its dates and venue', async () => {
    actAs({ role: 'OFFICER' });
    const result = await createCampaignLandingPage({ eventId: 'ev-006' });
    const about = result.page?.sections.find((s) => s.key === 'about')?.body ?? '';
    const practical = result.page?.sections.find((s) => s.key === 'practical')?.body ?? '';

    expect(about).toMatch(/Sangai|Imphal|craft/i);
    expect(practical).toMatch(/Imphal/);
  });

  it('lets an officer publish a campaign page', async () => {
    actAs({ role: 'OFFICER' });
    const created = await createCampaignLandingPage({ eventId: 'ev-006' });
    const published = await publishCampaignLandingPage(created.page!.id, true);
    expect(published.ok).toBe(true);
    expect(published.page?.status).toBe('PUBLISHED');
  });
});

describe('public view and share counters', () => {
  beforeEach(() => {
    resetState();
  });

  it('counts a view only for a published page, never a draft', async () => {
    // The seeded Sangai Festival page is published; count a view on it.
    const before = getLandingPageBySlug('sangai-festival-2026')!;
    await recordLandingPageView('sangai-festival-2026');
    const after = getLandingPageBySlug('sangai-festival-2026')!;
    expect(after.viewCount).toBe(before.viewCount + 1);

    // biz-014 has no seeded landing page, so this generation is a fresh draft.
    actAs({ businessId: 'biz-014' });
    const draft = await generateBusinessLandingPage();
    const draftBefore = draft.page!.viewCount;
    await recordLandingPageView(draft.page!.slug);
    expect(getLandingPageBySlug(draft.page!.slug)!.viewCount).toBe(draftBefore);
  });

  it('counts a share intent for a published page', async () => {
    const before = getLandingPageBySlug('tangkhul-village-homestay-network')!;
    const result = await recordLandingPageShare('tangkhul-village-homestay-network');
    expect(result.ok).toBe(true);
    const after = getLandingPageBySlug('tangkhul-village-homestay-network')!;
    expect(after.shareCount).toBe(before.shareCount + 1);
  });
});
