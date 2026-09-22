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
  /** How many are travelling. Rooms, cars and experience places follow from it. */
  travellers: z.number().int().min(1).max(20).default(1),
  /** The whole trip's budget in rupees, for everyone travelling, when given. */
  budgetAmount: z.number().int().positive().max(10_000_000).optional(),
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

/* --------------------------- What a plan includes --------------------------- */

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** A place found by web search: never a partner, never priced, always sourced. */
export const onlinePlaceSchema = z.object({
  kind: z.enum(['STAY', 'GUIDE', 'TRANSPORT']),
  destinationId: z.string(),
  name: z.string().min(2).max(120),
  note: z.string().max(240).optional(),
  sources: z.array(z.object({ uri: z.string().url(), title: z.string() })).min(1),
});
export type OnlinePlace = z.infer<typeof onlinePlaceSchema>;

/** One night. No businessId means no verified partner stay was found near it. */
export const tripStaySchema = z.object({
  night: z.number().int().min(1),
  /** Where the night is spent: the day's last stop. */
  destinationId: z.string(),
  businessId: z.string().optional(),
  rooms: z.number().int().min(1),
  /** Per room per night, as the partner quoted it when the plan was made. */
  rate: z.number().int().nonnegative().optional(),
  /** From the day's last stop to the stay, when the stay is elsewhere. */
  travelMinutes: z.number().int().nonnegative().default(0),
});
export type TripStay = z.infer<typeof tripStaySchema>;

export const tripTransportSchema = z.object({
  businessId: z.string().optional(),
  vehicles: z.number().int().min(1),
  days: z.number().int().min(1),
  /** Per vehicle per day. */
  rate: z.number().int().nonnegative().optional(),
});
export type TripTransport = z.infer<typeof tripTransportSchema>;

export const tripGuideSchema = z.object({
  day: z.number().int().min(1),
  destinationId: z.string(),
  businessId: z.string(),
  /** Per day, for the group. */
  rate: z.number().int().nonnegative().optional(),
});
export type TripGuide = z.infer<typeof tripGuideSchema>;

export const onlineSearchStatusSchema = z.enum(['NOT_RUN', 'FOUND', 'NONE_FOUND', 'OFF', 'FAILED', 'LIMITED']);
export type OnlineSearchStatus = z.infer<typeof onlineSearchStatusSchema>;

export const tripLogisticsSchema = z.object({
  stays: z.array(tripStaySchema).default([]),
  transport: tripTransportSchema.optional(),
  guides: z.array(tripGuideSchema).default([]),
  online: z
    .object({
      status: onlineSearchStatusSchema,
      checkedAt: z.string().optional(),
      places: z.array(onlinePlaceSchema).default([]),
    })
    .default({ status: 'NOT_RUN', places: [] }),
});
export type TripLogistics = z.infer<typeof tripLogisticsSchema>;

export const tripSchema = z.object({
  id: z.string(),
  touristSessionId: z.string(),
  title: z.string(),
  /** Narrative theme, for example "The floating world of Loktak". */
  theme: z.string(),
  /** The travel window, when the visitor gave one (YYYY-MM-DD, Manipur time). */
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  /** Arrival on the first day and departure on the last, HH:MM in IST. */
  arriveTime: clockTime.optional(),
  departTime: clockTime.optional(),
  preferences: tripProfileSchema,
  items: z.array(itineraryItemSchema),
  alternatives: z.array(itineraryAlternativeSchema).default([]),
  logistics: tripLogisticsSchema.optional(),
  /**
   * DRAFT is an option not yet chosen, SAVED a finalised journey, ACTIVE a
   * started one, COMPLETED an ended one.
   */
  status: tripStatusSchema,
  /** Options from one planning request share a group. */
  optionGroupId: z.string().optional(),
  optionLabel: z.string().optional(),
  startedAt: z.string().optional(),
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
