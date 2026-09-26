import { z } from 'zod';
import { provenanceSchema } from '@/lib/types/core';

/**
 * AI-generated one-page microsites: a partner's own page, or a page the
 * department publishes for a campaign or festival (e.g. Sangai Festival 2026).
 *
 * Content is assembled deterministically from real platform data (the owning
 * business, or the linked event/campaign) exactly as narrate() does for
 * creator briefs — a model only rewrites the "about" paragraph, and the hero
 * image is a best-effort enhancement with a deterministic fallback visual.
 */

export const landingPageOwnerTypeSchema = z.enum(['BUSINESS', 'CAMPAIGN']);
export type LandingPageOwnerType = z.infer<typeof landingPageOwnerTypeSchema>;

export const landingPageStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type LandingPageStatus = z.infer<typeof landingPageStatusSchema>;

export const landingPageSectionSchema = z.object({
  key: z.string(),
  heading: z.string(),
  /** Plain prose, or newline-separated items for a list section. */
  body: z.string(),
});
export type LandingPageSection = z.infer<typeof landingPageSectionSchema>;

export const galleryMediaSchema = z.object({
  id: z.string(),
  type: z.enum(['IMAGE', 'VIDEO']),
  url: z.string(),
  thumbnailUrl: z.string().optional(),
});
export type GalleryMedia = z.infer<typeof galleryMediaSchema>;

export const landingPageSchema = z.object({
  id: z.string(),
  ownerType: landingPageOwnerTypeSchema,
  /** BUSINESS only: the partner this page belongs to. */
  businessId: z.string().optional(),
  /** CAMPAIGN only: a creator campaign this page promotes, when linked to one. */
  campaignId: z.string().optional(),
  /** CAMPAIGN only: the festival or event this page promotes, when linked to one. */
  eventId: z.string().optional(),
  slug: z.string(),
  title: z.string(),
  tagline: z.string(),
  /** Data URL of an AI-generated image, when generation succeeded. */
  heroImageUrl: z.string().optional(),
  sections: z.array(landingPageSectionSchema).default([]),
  galleryMedia: z.array(galleryMediaSchema).default([]),
  hashtags: z.array(z.string()).default([]),
  /** External or internal link for the "Book now" / "Plan your visit" CTA. */
  bookingUrl: z.string().optional(),
  status: landingPageStatusSchema,
  viewCount: z.number().int().nonnegative().default(0),
  shareCount: z.number().int().nonnegative().default(0),
  generatedBy: z.string(),
  generatedAt: z.string(),
  publishedAt: z.string().optional(),
  createdBy: z.string(),
  provenance: provenanceSchema,
});
export type LandingPage = z.infer<typeof landingPageSchema>;
