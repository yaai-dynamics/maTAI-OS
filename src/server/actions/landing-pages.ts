'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { now } from '@/lib/config';
import { can, refusalMessage } from '@/lib/roles';
import type { LandingPage } from '@/lib/types';
import { generateBusinessLandingContent, generateCampaignLandingContent } from '@/server/ai/landing-page';
import { getActingBusinessId, getGovernmentRole, NOT_SIGNED_IN } from '@/server/auth/session';
import {
  getBusiness,
  getCampaign,
  getEvent,
  getLandingPage,
  getLandingPageBySlug,
  getLandingPagesForBusiness,
} from '@/server/data/repository';
import {
  createLandingPage,
  nextId,
  recordLandingPageView as recordView,
  updateLandingPage,
  deleteLandingPage as removeLandingPage,
} from '@/server/data/store';

/**
 * Landing page writes — partner microsites and government campaign pages.
 *
 * Follows src/server/actions/partner.ts exactly: the acting business comes
 * from the signed-in session, never from a form field, and a government write
 * is gated by the permission table in src/lib/roles.ts rather than by the UI
 * merely hiding a button.
 */

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'page';
}

/** Appends a short suffix if the slug is already taken, so two pages never collide. */
function uniqueSlug(base: string, ignoreId?: string): string {
  const slug = slugify(base);
  const taken = (candidate: string) => {
    const existing = getLandingPageBySlug(candidate);
    return Boolean(existing && existing.id !== ignoreId);
  };
  if (!taken(slug)) return slug;
  let suffix = 2;
  while (taken(`${slug}-${suffix}`)) suffix += 1;
  return `${slug}-${suffix}`;
}

/* --------------------------------- Partner -------------------------------- */

/**
 * Creates the acting partner's landing page if none exists yet, or
 * regenerates the one they already have. A partner has at most one.
 */
export async function generateBusinessLandingPage(): Promise<{
  ok: boolean;
  error?: string;
  page?: LandingPage;
}> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const business = getBusiness(businessId);
  if (!business) return { ok: false, error: 'That business is not on the platform.' };

  const draft = await generateBusinessLandingContent(businessId);
  if (!draft) return { ok: false, error: 'Could not generate a page for this business.' };

  const existing = getLandingPagesForBusiness(businessId)[0];
  const timestamp = now().toISOString();

  if (existing) {
    const updated = await updateLandingPage(existing.id, {
      title: draft.title,
      tagline: draft.tagline,
      sections: draft.sections,
      hashtags: draft.hashtags,
      generatedBy: draft.generatedBy,
      generatedAt: timestamp,
      ...(draft.heroImageUrl ? { heroImageUrl: draft.heroImageUrl } : {}),
    });
    revalidatePath('/partner', 'layout');
    revalidatePath(`/p/${existing.slug}`);
    return { ok: true, page: updated };
  }

  const page: LandingPage = {
    id: nextId('lp-live'),
    ownerType: 'BUSINESS',
    businessId,
    slug: uniqueSlug(business.name),
    title: draft.title,
    tagline: draft.tagline,
    sections: draft.sections,
    hashtags: draft.hashtags,
    ...(draft.heroImageUrl ? { heroImageUrl: draft.heroImageUrl } : {}),
    status: 'DRAFT',
    viewCount: 0,
    shareCount: 0,
    generatedBy: draft.generatedBy,
    generatedAt: timestamp,
    createdBy: business.name,
    provenance: 'PARTNER_REPORTED',
    galleryMedia: [],
  };
  const created = await createLandingPage(page);
  revalidatePath('/partner', 'layout');
  return { ok: true, page: created };
}

const updateContentInput = z.object({
  title: z.string().min(3).max(120),
  tagline: z.string().min(3).max(200),
  about: z.string().min(10).max(1200),
  highlights: z.string().max(1200).optional(),
  practical: z.string().max(1200).optional(),
  bookingUrl: z.string().max(512).optional(),
});

export async function updateBusinessLandingPage(
  input: unknown,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const parsed = updateContentInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the page details and try again.' };
  }

  const existing = getLandingPagesForBusiness(businessId)[0];
  if (!existing) return { ok: false, error: 'Generate a page before editing it.' };

  const updated = await updateLandingPage(existing.id, {
    title: parsed.data.title,
    tagline: parsed.data.tagline,
    bookingUrl: parsed.data.bookingUrl || undefined,
    sections: [
      { key: 'about', heading: 'About', body: parsed.data.about },
      { key: 'highlights', heading: 'What guests can expect', body: parsed.data.highlights ?? '' },
      { key: 'practical', heading: 'Good to know', body: parsed.data.practical ?? '' },
    ],
  });

  revalidatePath('/partner', 'layout');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

async function setPublished(
  page: LandingPage,
  published: boolean,
): Promise<LandingPage | undefined> {
  return updateLandingPage(page.id, {
    status: published ? 'PUBLISHED' : 'DRAFT',
    publishedAt: published ? now().toISOString() : undefined,
  });
}

export async function publishBusinessLandingPage(
  published: boolean,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const existing = getLandingPagesForBusiness(businessId)[0];
  if (!existing) return { ok: false, error: 'Generate a page before publishing it.' };

  const updated = await setPublished(existing, published);
  revalidatePath('/partner', 'layout');
  revalidatePath('/explore/discover');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

/* ------------------------------- Government ------------------------------- */

const campaignPageInput = z.object({
  campaignId: z.string().optional(),
  eventId: z.string().optional(),
  title: z.string().max(120).optional(),
  bookingUrl: z.string().max(512).optional(),
});

export async function createCampaignLandingPage(
  input: unknown,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const role = await getGovernmentRole();
  if (!can(role, 'landingpage:publish')) {
    return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  const parsed = campaignPageInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Choose a campaign or an event.' };
  }
  if (!parsed.data.campaignId && !parsed.data.eventId) {
    return { ok: false, error: 'Choose a campaign or an event to link this page to.' };
  }
  if (parsed.data.campaignId && !getCampaign(parsed.data.campaignId)) {
    return { ok: false, error: 'That campaign is not on the platform.' };
  }
  if (parsed.data.eventId && !getEvent(parsed.data.eventId)) {
    return { ok: false, error: 'That event is not on the platform.' };
  }

  const draft = await generateCampaignLandingContent({
    campaignId: parsed.data.campaignId,
    eventId: parsed.data.eventId,
    titleOverride: parsed.data.title,
  });
  if (!draft) return { ok: false, error: 'Could not generate a page for that.' };

  const timestamp = now().toISOString();
  const page: LandingPage = {
    id: nextId('lp-live'),
    ownerType: 'CAMPAIGN',
    ...(parsed.data.campaignId ? { campaignId: parsed.data.campaignId } : {}),
    ...(parsed.data.eventId ? { eventId: parsed.data.eventId } : {}),
    slug: uniqueSlug(parsed.data.title || draft.title),
    title: parsed.data.title || draft.title,
    tagline: draft.tagline,
    sections: draft.sections,
    hashtags: draft.hashtags,
    ...(parsed.data.bookingUrl ? { bookingUrl: parsed.data.bookingUrl } : {}),
    ...(draft.heroImageUrl ? { heroImageUrl: draft.heroImageUrl } : {}),
    status: 'DRAFT',
    viewCount: 0,
    shareCount: 0,
    generatedBy: draft.generatedBy,
    generatedAt: timestamp,
    createdBy: 'Tourism Department (demo)',
    // A page created in the prototype is prototype data, and says so — the
    // same rule src/server/actions/government.ts applies to a new campaign.
    provenance: 'DEMO_SYNTHETIC',
    galleryMedia: [],
  };
  const created = await createLandingPage(page);
  revalidatePath('/gov/campaigns', 'layout');
  return { ok: true, page: created };
}

export async function publishCampaignLandingPage(
  id: string,
  published: boolean,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const role = await getGovernmentRole();
  if (!can(role, 'landingpage:publish')) {
    return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  const existing = getLandingPage(id);
  if (!existing || existing.ownerType !== 'CAMPAIGN') return { ok: false, error: 'That page does not exist.' };

  const updated = await setPublished(existing, published);
  revalidatePath('/gov/campaigns', 'layout');
  revalidatePath('/explore/discover');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

export async function deleteCampaignLandingPage(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const role = await getGovernmentRole();
  if (!can(role, 'landingpage:publish')) {
    return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  const existing = getLandingPage(id);
  if (!existing || existing.ownerType !== 'CAMPAIGN') return { ok: false, error: 'That page does not exist.' };

  const success = await removeLandingPage(id);
  if (!success) return { ok: false, error: 'Failed to delete landing page.' };
  
  revalidatePath('/gov/campaigns', 'layout');
  return { ok: true };
}

/* --------------------------------- Gallery -------------------------------- */

export async function addGalleryMedia(
  pageId: string,
  mediaType: 'IMAGE' | 'VIDEO',
  url: string,
  thumbnailUrl?: string,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const existing = getLandingPage(pageId);
  if (!existing) return { ok: false, error: 'That page does not exist.' };
  
  // Basic mock auth check
  if (existing.ownerType === 'BUSINESS') {
    const businessId = await getActingBusinessId();
    if (!businessId || existing.businessId !== businessId) return { ok: false, error: NOT_SIGNED_IN };
  } else {
    const role = await getGovernmentRole();
    if (!can(role, 'landingpage:publish')) return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  const updatedGallery = [
    ...existing.galleryMedia,
    {
      id: nextId('media'),
      type: mediaType,
      url,
      thumbnailUrl,
    }
  ];

  const updated = await updateLandingPage(existing.id, { galleryMedia: updatedGallery });
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov/campaigns', 'layout');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

export async function removeGalleryMedia(
  pageId: string,
  mediaId: string,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const existing = getLandingPage(pageId);
  if (!existing) return { ok: false, error: 'That page does not exist.' };

  if (existing.ownerType === 'BUSINESS') {
    const businessId = await getActingBusinessId();
    if (!businessId || existing.businessId !== businessId) return { ok: false, error: NOT_SIGNED_IN };
  } else {
    const role = await getGovernmentRole();
    if (!can(role, 'landingpage:publish')) return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  const updatedGallery = existing.galleryMedia.filter(m => m.id !== mediaId);
  const updated = await updateLandingPage(existing.id, { galleryMedia: updatedGallery });
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov/campaigns', 'layout');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

export async function enhanceGalleryImage(
  pageId: string,
  mediaId: string,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const existing = getLandingPage(pageId);
  if (!existing) return { ok: false, error: 'That page does not exist.' };

  if (existing.ownerType === 'BUSINESS') {
    const businessId = await getActingBusinessId();
    if (!businessId || existing.businessId !== businessId) return { ok: false, error: NOT_SIGNED_IN };
  } else {
    const role = await getGovernmentRole();
    if (!can(role, 'landingpage:publish')) return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  const mediaIndex = existing.galleryMedia.findIndex(m => m.id === mediaId);
  if (mediaIndex === -1) return { ok: false, error: 'Media not found.' };

  // Mock AI editing by simulating a delay and changing the URL slightly
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const updatedGallery = [...existing.galleryMedia];
  const item = updatedGallery[mediaIndex];
  if (!item) return { ok: false, error: 'Media not found.' };
  if (item.type !== 'IMAGE') return { ok: false, error: 'Cannot enhance a video.' };
  
  // Append a dummy query param to show it was edited
  item.url = item.url.includes('?') ? `${item.url}&enhanced=true` : `${item.url}?enhanced=true`;

  const updated = await updateLandingPage(existing.id, { galleryMedia: updatedGallery });
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov/campaigns', 'layout');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

export async function enhanceHeroImage(
  pageId: string,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const existing = getLandingPage(pageId);
  if (!existing) return { ok: false, error: 'That page does not exist.' };

  if (existing.ownerType === 'BUSINESS') {
    const businessId = await getActingBusinessId();
    if (!businessId || existing.businessId !== businessId) return { ok: false, error: NOT_SIGNED_IN };
  } else {
    const role = await getGovernmentRole();
    if (!can(role, 'landingpage:publish')) return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  if (!existing.heroImageUrl) return { ok: false, error: 'No hero image to enhance.' };

  // Mock AI editing
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  let newUrl = existing.heroImageUrl;
  newUrl = newUrl.includes('?') ? `${newUrl}&enhanced=true` : `${newUrl}?enhanced=true`;

  const updated = await updateLandingPage(existing.id, { heroImageUrl: newUrl });
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov/campaigns', 'layout');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

export async function uploadHeroImage(
  pageId: string,
): Promise<{ ok: boolean; error?: string; page?: LandingPage }> {
  const existing = getLandingPage(pageId);
  if (!existing) return { ok: false, error: 'That page does not exist.' };

  if (existing.ownerType === 'BUSINESS') {
    const businessId = await getActingBusinessId();
    if (!businessId || existing.businessId !== businessId) return { ok: false, error: NOT_SIGNED_IN };
  } else {
    const role = await getGovernmentRole();
    if (!can(role, 'landingpage:publish')) return { ok: false, error: refusalMessage(role, 'landingpage:publish') };
  }

  // Mock file upload delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock image URL from picsum
  const randomId = Math.floor(Math.random() * 1000);
  const newUrl = `https://picsum.photos/seed/${randomId}/1200/600`;

  const updated = await updateLandingPage(existing.id, { heroImageUrl: newUrl });
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov/campaigns', 'layout');
  revalidatePath(`/p/${existing.slug}`);
  return { ok: true, page: updated };
}

/* --------------------------------- Public --------------------------------- */

/** Called from the published page itself. No auth: a page view is not a signal that identifies anyone. */
export async function recordLandingPageView(slug: string): Promise<void> {
  const page = getLandingPageBySlug(slug);
  if (page && page.status === 'PUBLISHED') await recordView(page.id);
}

/** Called by the share buttons. Counts intent to share, not a confirmed share. */
export async function recordLandingPageShare(slug: string): Promise<{ ok: boolean }> {
  const page = getLandingPageBySlug(slug);
  if (!page || page.status !== 'PUBLISHED') return { ok: false };
  await recordShare(page.id);
  return { ok: true };
}
