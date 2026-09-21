import { z } from 'zod';
import { PROVENANCE_VALUES } from '@/lib/provenance';

/**
 * Knowledge-layer entities: places, facts, events and the sources behind them.
 * Reference: docs/04-data-model.md.
 */

export const provenanceSchema = z.enum(PROVENANCE_VALUES);

export const districtSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Rough centroid, used by the schematic state map. */
  latitude: z.number(),
  longitude: z.number(),
});
export type District = z.infer<typeof districtSchema>;

export const destinationCategorySchema = z.enum([
  'nature',
  'heritage',
  'culture',
  'history',
  'wildlife',
  'eco-tourism',
  'adventure',
  'craft',
  'food',
  'market',
  'photography',
  'border',
  'commerce',
  'spiritual',
]);
export type DestinationCategory = z.infer<typeof destinationCategorySchema>;

export const sensitivitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type Sensitivity = z.infer<typeof sensitivitySchema>;

/** Destination health as shown on the map (docs/06: healthy | watch | attention). */
export const destinationStatusSchema = z.enum(['HEALTHY', 'WATCH', 'ATTENTION']);
export type DestinationStatus = z.infer<typeof destinationStatusSchema>;

export const destinationSchema = z.object({
  id: z.string(),
  name: z.string(),
  district: z.string(),
  districtId: z.string(),
  category: z.array(destinationCategorySchema).min(1),
  latitude: z.number(),
  longitude: z.number(),
  summary: z.string(),
  /** Longer editorial copy for E3. */
  overview: z.string().optional(),
  ecoSensitivity: sensitivitySchema,
  /**
   * Qualitative headroom for additional visitors, as judged from participating
   * supply. HIGH means "room to grow", not an official carrying capacity.
   */
  capacitySignal: sensitivitySchema,
  status: destinationStatusSchema,
  /** Typical visit length used by the itinerary builder, in minutes. */
  typicalVisitMinutes: z.number().int().positive().default(120),
  bestSeason: z.string().optional(),
  accessibilityNotes: z.string().optional(),
  /** Simple palette hint so cards look distinct without photography. */
  palette: z.enum(['lake', 'hill', 'heritage', 'market', 'forest', 'border']).default('heritage'),
  provenance: provenanceSchema,
});
export type Destination = z.infer<typeof destinationSchema>;

export const attractionSchema = z.object({
  id: z.string(),
  destinationId: z.string(),
  name: z.string(),
  category: destinationCategorySchema,
  description: z.string(),
  provenance: provenanceSchema,
});
export type Attraction = z.infer<typeof attractionSchema>;

/**
 * Curated knowledge used to ground the storyteller and creator briefs.
 * `factType` keeps documented history separate from oral tradition and from
 * interpretation (docs/05-ai-spec.md, master document §4.3).
 */
export const factTypeSchema = z.enum(['DOCUMENTED', 'ORAL_TRADITION', 'INTERPRETATION', 'PRACTICAL']);
export type FactType = z.infer<typeof factTypeSchema>;

export const verifiedFactSchema = z.object({
  id: z.string(),
  destinationId: z.string(),
  title: z.string(),
  text: z.string(),
  factType: factTypeSchema,
  sourceId: z.string(),
  verified: z.boolean(),
  verifiedAt: z.string(),
  tags: z.array(z.string()).default([]),
});
export type VerifiedFact = z.infer<typeof verifiedFactSchema>;

export const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  destinationId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  category: z.enum(['FESTIVAL', 'CULTURAL', 'SPORT', 'EXHIBITION', 'SEASONAL']),
  expectedAttendance: z.number().int().nonnegative().optional(),
  description: z.string(),
  sourceId: z.string(),
  provenance: provenanceSchema,
});
export type TourismEvent = z.infer<typeof eventSchema>;

export const dataSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['GOVERNMENT', 'PARTNER', 'PLATFORM', 'PUBLIC', 'CURATED', 'MODEL']),
  owner: z.string(),
  refreshFrequency: z.string(),
  reliabilityLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  description: z.string(),
  url: z.string().optional(),
  defaultProvenance: provenanceSchema,
});
export type DataSource = z.infer<typeof dataSourceSchema>;

export const knowledgeDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  documentType: z.enum(['POLICY', 'REPORT', 'GUIDE', 'DESTINATION_RECORD', 'ADVISORY']),
  sourceId: z.string(),
  sourceAuthority: z.string(),
  sourceUrl: z.string().optional(),
  text: z.string(),
  verified: z.boolean(),
  publishedAt: z.string(),
  destinationIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
