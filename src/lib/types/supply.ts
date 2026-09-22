import { z } from 'zod';
import { destinationCategorySchema, provenanceSchema } from '@/lib/types/core';

/** Supply side: businesses, bookable experiences and reported capacity. */

export const businessTypeSchema = z.enum([
  'HOTEL',
  'HOMESTAY',
  'TOUR_OPERATOR',
  'GUIDE',
  'RESTAURANT',
  'EXPERIENCE_PROVIDER',
  'ARTISAN',
  'TRANSPORT',
]);
export type BusinessType = z.infer<typeof businessTypeSchema>;

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  HOTEL: 'Hotel',
  HOMESTAY: 'Homestay',
  TOUR_OPERATOR: 'Tour operator',
  GUIDE: 'Guide',
  RESTAURANT: 'Restaurant',
  EXPERIENCE_PROVIDER: 'Experience provider',
  ARTISAN: 'Artisan',
  TRANSPORT: 'Transport',
};

export const businessStatusSchema = z.enum([
  'PARTICIPATING',
  'INVITED',
  'PENDING_VERIFICATION',
  'INACTIVE',
]);
export type BusinessStatus = z.infer<typeof businessStatusSchema>;

/**
 * What a partner charges, used to cost a trip. covers says what the price buys,
 * so a cycle-tour operator is never mistaken for car hire.
 */
export const businessRateSchema = z.object({
  amount: z.number().int().positive(),
  unit: z.enum(['NIGHT', 'DAY']),
  covers: z.enum(['ROOM', 'GUIDE', 'VEHICLE']),
  /** What the rate includes, in the partner's words. */
  note: z.string().optional(),
});
export type BusinessRate = z.infer<typeof businessRateSchema>;

export const tourismBusinessSchema = z.object({
  id: z.string(),
  name: z.string(),
  businessType: businessTypeSchema,
  district: z.string(),
  destinationId: z.string(),
  status: businessStatusSchema,
  description: z.string().optional(),
  /** Contact detail is withheld from government analytics views by default. */
  contactVisibility: z.enum(['PUBLIC', 'ON_ENQUIRY', 'PRIVATE']).default('ON_ENQUIRY'),
  verified: z.boolean().default(false),
  /** Rooms or seats offered, where the partner has reported it. */
  reportedCapacity: z.number().int().nonnegative().optional(),
  rate: businessRateSchema.optional(),
  provenance: provenanceSchema,
});
export type TourismBusiness = z.infer<typeof tourismBusinessSchema>;

export const experienceCategorySchema = z.enum([
  'food',
  'handloom',
  'craft',
  'culture',
  'nature',
  'photography',
  'homestay',
]);
export type ExperienceCategory = z.infer<typeof experienceCategorySchema>;

export const EXPERIENCE_CATEGORY_LABEL: Record<ExperienceCategory, string> = {
  food: 'Food',
  handloom: 'Handloom',
  craft: 'Craft',
  culture: 'Culture',
  nature: 'Nature',
  photography: 'Photography',
  homestay: 'Homestay',
};

export const experienceSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  destinationId: z.string(),
  title: z.string(),
  category: experienceCategorySchema,
  description: z.string(),
  durationMinutes: z.number().int().positive(),
  /** Indicative price per person in INR. */
  price: z.number().int().nonnegative(),
  verified: z.boolean(),
  availabilityStatus: z.enum(['AVAILABLE', 'LIMITED', 'UNAVAILABLE']),
  /** Interests this experience satisfies, reused by the itinerary builder. */
  tags: z.array(destinationCategorySchema).default([]),
  accessibility: z.enum(['EASY', 'MODERATE', 'DEMANDING']).default('MODERATE'),
  provenance: provenanceSchema,
});
export type Experience = z.infer<typeof experienceSchema>;

/**
 * Partner-reported availability. Coverage is limited to participating
 * properties and the UI must say so wherever this is aggregated.
 */
export const accommodationSnapshotSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  destinationId: z.string(),
  date: z.string(),
  totalCapacity: z.number().int().nonnegative(),
  availableCapacity: z.number().int().nonnegative(),
  occupancyRate: z.number().min(0).max(1),
  provenance: provenanceSchema,
});
export type AccommodationSnapshot = z.infer<typeof accommodationSnapshotSchema>;

export const enquirySchema = z.object({
  id: z.string(),
  experienceId: z.string(),
  businessId: z.string(),
  anonymousSessionId: z.string(),
  partySize: z.number().int().positive(),
  preferredDate: z.string(),
  note: z.string().optional(),
  status: z.enum(['SUBMITTED', 'ACKNOWLEDGED', 'CONFIRMED', 'DECLINED']),
  createdAt: z.string(),
  provenance: provenanceSchema,
});
export type Enquiry = z.infer<typeof enquirySchema>;
