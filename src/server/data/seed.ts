import { z } from 'zod';

import districtsJson from '@data/districts.json';
import destinationsJson from '@data/destinations.json';
import verifiedFactsJson from '@data/verified-facts.json';
import experiencesJson from '@data/experiences.json';
import businessesJson from '@data/businesses.json';
import eventsJson from '@data/events.json';
import creatorsJson from '@data/creators.json';
import campaignsJson from '@data/campaigns.json';
import applicationsJson from '@data/creator-applications.json';
import campaignContentJson from '@data/campaign-content.json';
import campaignMetricsJson from '@data/campaign-metrics.json';
import feedbackJson from '@data/feedback.json';
import signalProfilesJson from '@data/tourism-signals.json';
import dataSourcesJson from '@data/data-sources.json';
import knowledgeDocumentsJson from '@data/knowledge-documents.json';
import landingPagesJson from '@data/landing-pages.json';
import heritageJson from '@data/heritage-experiences.json';
import officialStatisticsJson from '@data/official-statistics.json';
import emergencyContactsJson from '@data/emergency-contacts.json';
import safetyFacilitiesJson from '@data/safety-facilities.json';
import dishesJson from '@data/dishes.json';
import foodTrailsJson from '@data/food-trails.json';

import {
  campaignContentSchema,
  campaignMetricSchema,
  campaignSchema,
  creatorApplicationSchema,
  creatorSchema,
  dataSourceSchema,
  destinationSchema,
  dishSchema,
  districtSchema,
  emergencyContactSchema,
  eventSchema,
  experienceSchema,
  feedbackSchema,
  foodTrailSchema,
  knowledgeDocumentSchema,
  landingPageSchema,
  safetyFacilitySchema,
  tourismBusinessSchema,
  verifiedFactSchema,
} from '@/lib/types';

/**
 * Curated seed records, validated once at module load.
 *
 * A schema failure here is a build-time style error rather than a silent
 * mis-render: the prototype refuses to start with malformed tourism data.
 */

/** Rows whose id starts with an underscore are documentation, not data. */
const isDocumentationRow = (row: unknown): boolean => {
  if (typeof row !== 'object' || row === null) return false;
  const record = row as Record<string, unknown>;
  return (
    typeof record['_comment'] === 'string' ||
    record['id'] === '_schema' ||
    record['destinationId'] === '_schema'
  );
};

/**
 * Parses a seed list to the schema OUTPUT type, so fields carrying a zod
 * `.default()` are required downstream rather than optional.
 */
function parseList<S extends z.ZodTypeAny>(
  schema: S,
  rows: unknown[],
  label: string,
): z.output<S>[] {
  const data = rows.filter((row) => !isDocumentationRow(row));
  const result = z.array(schema).safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Seed data for ${label} is invalid at ${issue?.path.join('.') ?? 'unknown path'}: ${issue?.message ?? ''}`,
    );
  }
  return result.data as z.output<S>[];
}

/** Per destination inputs for the deterministic signal generator. */
export const signalProfileSchema = z.object({
  destinationId: z.string(),
  dailyInteractionBase: z.number().positive(),
  growthPerMonth: z.number(),
  eventLiftWindowDays: z.number().int().nonnegative(),
  sentimentBase: z.number().min(1).max(5),
  feedbackPerHundredInteractions: z.number().nonnegative(),
  issueMix: z.record(z.string(), z.number().nonnegative()),
  partnerCapacityBase: z.number().int().nonnegative(),
  provenance: z.literal('DEMO_SYNTHETIC'),
});
export type SignalProfile = z.infer<typeof signalProfileSchema>;

export const heritageLayerSchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  narration: z.string(),
  factIds: z.array(z.string()),
  overlay: z.string(),
});

export const heritageExperienceSchema = z.object({
  id: z.string(),
  destinationId: z.string(),
  title: z.string(),
  subtitle: z.string(),
  mode: z.enum(['LIVING_CULTURE', 'HISTORICAL_LAYERS']),
  scene: z.enum(['hills', 'citadel']),
  introduction: z.string(),
  layers: z.array(heritageLayerSchema).min(1),
  askPrompts: z.array(z.string()).min(1),
  audioTranscript: z.string(),
  sourceNote: z.string(),
});
export type HeritageExperience = z.infer<typeof heritageExperienceSchema>;
export type HeritageLayer = z.infer<typeof heritageLayerSchema>;

export const officialStatisticsSchema = z.object({
  connected: z.boolean(),
  sourceId: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string(),
  expectedMetrics: z.array(
    z.object({
      metric: z.string(),
      label: z.string(),
      unit: z.string(),
      period: z.string(),
      description: z.string(),
      value: z.number().nullable(),
    }),
  ),
  integrationSteps: z.array(z.string()),
});
export type OfficialStatistics = z.infer<typeof officialStatisticsSchema>;

export const seed = {
  districts: parseList(districtSchema, districtsJson, 'districts'),
  destinations: parseList(destinationSchema, destinationsJson, 'destinations'),
  verifiedFacts: parseList(verifiedFactSchema, verifiedFactsJson, 'verified facts'),
  experiences: parseList(experienceSchema, experiencesJson, 'experiences'),
  businesses: parseList(tourismBusinessSchema, businessesJson, 'businesses'),
  events: parseList(eventSchema, eventsJson, 'events'),
  creators: parseList(creatorSchema, creatorsJson, 'creators'),
  campaigns: parseList(campaignSchema, campaignsJson, 'campaigns'),
  applications: parseList(creatorApplicationSchema, applicationsJson, 'creator applications'),
  campaignContent: parseList(campaignContentSchema, campaignContentJson, 'campaign content'),
  campaignMetrics: parseList(campaignMetricSchema, campaignMetricsJson, 'campaign metrics'),
  feedback: parseList(feedbackSchema, feedbackJson, 'feedback'),
  signalProfiles: parseList(signalProfileSchema, signalProfilesJson, 'signal profiles'),
  dataSources: parseList(dataSourceSchema, dataSourcesJson, 'data sources'),
  knowledgeDocuments: parseList(knowledgeDocumentSchema, knowledgeDocumentsJson, 'knowledge documents'),
  landingPages: parseList(landingPageSchema, landingPagesJson, 'landing pages'),
  heritageExperiences: parseList(heritageExperienceSchema, heritageJson, 'heritage experiences'),
  emergencyContacts: parseList(emergencyContactSchema, emergencyContactsJson, 'emergency contacts'),
  safetyFacilities: parseList(safetyFacilitySchema, safetyFacilitiesJson, 'safety facilities'),
  dishes: parseList(dishSchema, dishesJson, 'dishes'),
  foodTrails: parseList(foodTrailSchema, foodTrailsJson, 'food trails'),
  officialStatistics: officialStatisticsSchema.parse(officialStatisticsJson),
} as const;

export type Seed = typeof seed;

// force reload
