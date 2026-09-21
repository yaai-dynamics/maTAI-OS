import { z } from 'zod';
import { destinationCategorySchema, provenanceSchema } from '@/lib/types/core';

/**
 * Tourist-side entities. Tourist records are anonymous by design: the platform
 * never needs an identity to produce useful destination intelligence
 * (CLAUDE.md section 9, master document section 8).
 */

export const touristSessionSchema = z.object({
  id: z.string(),
  /** Opaque per-device identifier. Never joined to a person. */
  anonymousId: z.string(),
  consentLocation: z.boolean().default(false),
  consentAnalytics: z.boolean().default(true),
  createdAt: z.string(),
});
export type TouristSession = z.infer<typeof touristSessionSchema>;

export const budgetLevelSchema = z.enum(['BUDGET', 'MODERATE', 'PREMIUM']);
export type BudgetLevel = z.infer<typeof budgetLevelSchema>;

export const crowdPreferenceSchema = z.enum(['QUIET', 'BALANCED', 'POPULAR']);
export type CrowdPreference = z.infer<typeof crowdPreferenceSchema>;

export const paceSchema = z.enum(['RELAXED', 'BALANCED', 'PACKED']);
export type Pace = z.infer<typeof paceSchema>;

export const accessibilityNeedSchema = z.enum([
  'NONE',
  'LOW_MOBILITY',
  'SENIOR_FRIENDLY',
  'FAMILY_WITH_CHILDREN',
]);
export type AccessibilityNeed = z.infer<typeof accessibilityNeedSchema>;

/**
 * Structured output of E1. The planner extracts this from free text; every
 * downstream recommendation is explained in terms of these fields.
 */
export const tripProfileSchema = z.object({
  durationDays: z.number().int().min(1).max(10),
  budget: budgetLevelSchema,
  interests: z.array(destinationCategorySchema).min(1),
  crowdPreference: crowdPreferenceSchema,
  pace: paceSchema,
  accessibility: accessibilityNeedSchema.default('NONE'),
  startingPoint: z.string().default('Imphal'),
  travelStyle: z.string(),
  languages: z.array(z.string()).default(['English']),
  /** Free text the tourist originally typed, kept for explanation only. */
  rawRequest: z.string().default(''),
});
export type TripProfile = z.infer<typeof tripProfileSchema>;

export const tripStatusSchema = z.enum(['DRAFT', 'SAVED', 'ACTIVE', 'COMPLETED']);
export type TripStatus = z.infer<typeof tripStatusSchema>;

export const itineraryItemSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  destinationId: z.string(),
  experienceId: z.string().optional(),
  /** Day index starting at 1, kept relative so demo resets stay stable. */
  day: z.number().int().min(1),
  sequence: z.number().int().min(1),
  startTime: z.string(),
  durationMinutes: z.number().int().positive(),
  travelMinutesFromPrevious: z.number().int().nonnegative(),
  /** Why this was chosen, phrased against the trip profile. */
  rationale: z.string(),
  matchedInterests: z.array(destinationCategorySchema).default([]),
  kind: z.enum(['DESTINATION', 'EXPERIENCE']).default('DESTINATION'),
});
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;

export const itineraryAlternativeSchema = z.object({
  replacesItemId: z.string(),
  destinationId: z.string(),
  reason: z.string(),
});
export type ItineraryAlternative = z.infer<typeof itineraryAlternativeSchema>;

export const tripSchema = z.object({
  id: z.string(),
  touristSessionId: z.string(),
  title: z.string(),
  /** Narrative theme, for example "The floating world of Loktak". */
  theme: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  preferences: tripProfileSchema,
  items: z.array(itineraryItemSchema),
  alternatives: z.array(itineraryAlternativeSchema).default([]),
  status: tripStatusSchema,
  createdAt: z.string(),
  /** Set when an adaptive re-plan has been applied. */
  adaptedReason: z.string().optional(),
  provenance: provenanceSchema,
});
export type Trip = z.infer<typeof tripSchema>;

export const interactionTypeSchema = z.enum([
  'SEARCH',
  'ITINERARY_ADD',
  'DESTINATION_VIEW',
  'NAVIGATION_START',
  'QR_CHECKIN',
  'BOOKING',
  'REVIEW',
  'FEEDBACK',
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
]);
export type InteractionType = z.infer<typeof interactionTypeSchema>;

export const INTERACTION_LABEL: Record<InteractionType, string> = {
  SEARCH: 'Search',
  ITINERARY_ADD: 'Itinerary addition',
  DESTINATION_VIEW: 'Destination view',
  NAVIGATION_START: 'Navigation start',
  QR_CHECKIN: 'QR check-in',
  BOOKING: 'Booking request or enquiry',
  REVIEW: 'Review',
  FEEDBACK: 'Feedback',
  BOOKING_CONFIRMED: 'Paid booking',
  BOOKING_CANCELLED: 'Cancelled booking',
};

export const tourismInteractionSchema = z.object({
  id: z.string(),
  anonymousSessionId: z.string(),
  destinationId: z.string().optional(),
  experienceId: z.string().optional(),
  tripId: z.string().optional(),
  campaignId: z.string().optional(),
  type: interactionTypeSchema,
  timestamp: z.string(),
  provenance: provenanceSchema,
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Browser-assigned id for events sent to /api/telemetry; makes a retry idempotent. */
  clientEventId: z.string().optional(),
});
export type TourismInteraction = z.infer<typeof tourismInteractionSchema>;

export const issueCategorySchema = z.enum([
  'TRANSPORT',
  'CLEANLINESS',
  'SIGNAGE',
  'SAFETY',
  'CONNECTIVITY',
  'FACILITIES',
  'PRICING',
  'CROWDING',
  'ACCESSIBILITY',
  'GUIDE_QUALITY',
]);
export type IssueCategory = z.infer<typeof issueCategorySchema>;

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  TRANSPORT: 'Transport and connectivity to site',
  CLEANLINESS: 'Cleanliness and waste',
  SIGNAGE: 'Signage and wayfinding',
  SAFETY: 'Safety',
  CONNECTIVITY: 'Mobile and internet connectivity',
  FACILITIES: 'Toilets, water and rest facilities',
  PRICING: 'Pricing clarity',
  CROWDING: 'Crowding',
  ACCESSIBILITY: 'Accessibility',
  GUIDE_QUALITY: 'Guide and information quality',
};

/** Feedback themes that are praise rather than a service problem. */
export const positiveThemeSchema = z.enum([
  'EXPERIENCE',
  'NATURE',
  'HERITAGE',
  'CULTURE',
  'FOOD',
  'HOSPITALITY',
]);
export type PositiveTheme = z.infer<typeof positiveThemeSchema>;

export const feedbackCategorySchema = z.union([issueCategorySchema, positiveThemeSchema]);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackSchema = z.object({
  id: z.string(),
  destinationId: z.string(),
  experienceId: z.string().optional(),
  tripId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  category: feedbackCategorySchema,
  text: z.string(),
  language: z.string().default('English'),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
  /** Free text is stripped of contact details before it reaches government views. */
  anonymized: z.boolean().default(true),
  createdAt: z.string(),
  provenance: provenanceSchema,
});
export type Feedback = z.infer<typeof feedbackSchema>;
