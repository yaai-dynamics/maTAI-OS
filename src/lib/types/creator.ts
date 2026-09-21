import { z } from 'zod';
import { provenanceSchema } from '@/lib/types/core';

/** Creator economy entities shared by the government and creator interfaces. */

export const platformSchema = z.enum(['Instagram', 'YouTube', 'Facebook', 'X']);
export type SocialPlatform = z.infer<typeof platformSchema>;

export const creatorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  homeDistrict: z.string(),
  bio: z.string().optional(),
  categories: z.array(z.string()).min(1),
  languages: z.array(z.string()).min(1),
  platforms: z.array(platformSchema).min(1),
  audienceSummary: z.string(),
  /** Age band the creator predominantly reaches, for example "18-35". */
  audienceAgeBand: z.string().default('18-35'),
  audienceRegions: z.array(z.string()).default([]),
  /**
   * Composite 0-100 score from prior campaign delivery and tourism outcomes.
   * A demo value in the prototype.
   */
  creatorScore: z.number().min(0).max(100),
  /** Campaigns delivered through this platform, used by deterministic matching. */
  campaignsCompleted: z.number().int().nonnegative().default(0),
  /** Median itinerary additions attributed to past content by this creator. */
  medianItineraryAdds: z.number().int().nonnegative().default(0),
  status: z.enum(['ACTIVE', 'PENDING_VERIFICATION', 'INACTIVE']).default('ACTIVE'),
  verified: z.boolean().default(false),
  provenance: provenanceSchema,
});
export type Creator = z.infer<typeof creatorSchema>;

export const campaignStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
]);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  destinationId: z.string(),
  targetAudience: z.string(),
  audienceAgeBand: z.string().default('18-35'),
  platforms: z.array(platformSchema).min(1),
  rewardPool: z.number().int().nonnegative(),
  startDate: z.string(),
  endDate: z.string(),
  contentRequirement: z.string(),
  /** Interest themes the campaign is meant to serve. */
  themes: z.array(z.string()).default([]),
  preferredLanguages: z.array(z.string()).default([]),
  status: campaignStatusSchema,
  createdBy: z.string().default('Tourism Department (demo)'),
  createdAt: z.string().optional(),
  provenance: provenanceSchema,
});
export type Campaign = z.infer<typeof campaignSchema>;

export const applicationStatusSchema = z.enum([
  'INVITED',
  'APPLIED',
  'SHORTLISTED',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const creatorApplicationSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  creatorId: z.string(),
  status: applicationStatusSchema,
  proposedConcept: z.string().optional(),
  submittedAt: z.string(),
  provenance: provenanceSchema,
});
export type CreatorApplication = z.infer<typeof creatorApplicationSchema>;

export const contentStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'CHANGES_REQUESTED',
  'PUBLISHED',
]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const campaignContentSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  creatorId: z.string(),
  title: z.string(),
  platform: platformSchema,
  contentUrl: z.string(),
  caption: z.string(),
  /** Paid-partnership disclosure is mandatory before review. */
  disclosure: z.string(),
  status: contentStatusSchema,
  submittedAt: z.string(),
  reviewNote: z.string().optional(),
  provenance: provenanceSchema,
});
export type CampaignContent = z.infer<typeof campaignContentSchema>;

export const campaignMetricNameSchema = z.enum([
  'VIEWS',
  'WATCH_TIME',
  'CLICKS',
  'DESTINATION_PAGE_VISITS',
  'ITINERARY_ADDS',
  'CHECKINS',
  'BOOKINGS',
  'PAID_BOOKINGS',
]);
export type CampaignMetricName = z.infer<typeof campaignMetricNameSchema>;

export const CAMPAIGN_METRIC_LABEL: Record<CampaignMetricName, string> = {
  VIEWS: 'Views',
  WATCH_TIME: 'Watch time (minutes)',
  CLICKS: 'Clicks',
  DESTINATION_PAGE_VISITS: 'Destination page visits',
  ITINERARY_ADDS: 'Itinerary additions',
  CHECKINS: 'Verified check-ins',
  BOOKINGS: 'Booking requests and enquiries',
  PAID_BOOKINGS: 'Paid bookings',
};

export const campaignMetricSchema = z.object({
  id: z.string(),
  campaignContentId: z.string(),
  campaignId: z.string(),
  metric: campaignMetricNameSchema,
  value: z.number().nonnegative(),
  recordedAt: z.string(),
  provenance: provenanceSchema,
});
export type CampaignMetric = z.infer<typeof campaignMetricSchema>;

export const payoutSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  creatorId: z.string(),
  amount: z.number().int().nonnegative(),
  basis: z.string(),
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'PAID']),
  recordedAt: z.string(),
  provenance: provenanceSchema,
});
export type Payout = z.infer<typeof payoutSchema>;
