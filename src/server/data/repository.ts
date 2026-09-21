import type {
  AccommodationSnapshot,
  Campaign,
  CampaignContent,
  CampaignMetric,
  Creator,
  CreatorApplication,
  DataSource,
  Destination,
  District,
  Enquiry,
  Experience,
  Feedback,
  InteractionType,
  KnowledgeDocument,
  Payout,
  TourismBusiness,
  TourismEvent,
  TourismInteraction,
  VerifiedFact,
} from '@/lib/types';
import { seed, type HeritageExperience, type OfficialStatistics } from '@/server/data/seed';
import { getState } from '@/server/data/store';

/**
 * The only read surface over tourism data.
 *
 * Analytics, AI tools and UI all go through here, so the storage layer can be
 * replaced without touching anything above it.
 */

/* ------------------------------- Knowledge -------------------------------- */

export const getDistricts = (): District[] => seed.districts;

export const getDestinations = (): Destination[] => seed.destinations;

export const getDestination = (id: string): Destination | undefined =>
  seed.destinations.find((d) => d.id === id);

export const getDestinationsByIds = (ids: readonly string[]): Destination[] =>
  ids.map((id) => getDestination(id)).filter((d): d is Destination => d !== undefined);

export const getFactsFor = (destinationId: string): VerifiedFact[] =>
  seed.verifiedFacts.filter((f) => f.destinationId === destinationId);

export const getAllFacts = (): VerifiedFact[] => seed.verifiedFacts;

export const getHeritageExperience = (destinationId: string): HeritageExperience | undefined =>
  seed.heritageExperiences.find((h) => h.destinationId === destinationId);

export const getHeritageExperiences = (): HeritageExperience[] => seed.heritageExperiences;

export const getKnowledgeDocuments = (): KnowledgeDocument[] => seed.knowledgeDocuments;

export const getDataSources = (): DataSource[] => seed.dataSources;

export const getDataSource = (id: string): DataSource | undefined =>
  seed.dataSources.find((s) => s.id === id);

export const getOfficialStatistics = (): OfficialStatistics => seed.officialStatistics;

export const getEvents = (): TourismEvent[] => seed.events;

export function getEventsFor(destinationId: string, from?: Date, to?: Date): TourismEvent[] {
  return seed.events.filter((event) => {
    if (event.destinationId !== destinationId) return false;
    if (from && new Date(event.endAt) < from) return false;
    if (to && new Date(event.startAt) > to) return false;
    return true;
  });
}

/* --------------------------------- Supply --------------------------------- */

export const getBusinesses = (): TourismBusiness[] => getState().businesses;

export const getBusiness = (id: string): TourismBusiness | undefined =>
  getState().businesses.find((b) => b.id === id);

export const getBusinessesFor = (destinationId: string): TourismBusiness[] =>
  getState().businesses.filter((b) => b.destinationId === destinationId);

export const getEnquiriesForBusiness = (businessId: string): Enquiry[] =>
  getState()
    .enquiries.filter((enquiry) => enquiry.businessId === businessId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getAccommodationFor = (businessId: string): AccommodationSnapshot[] =>
  getState()
    .accommodationSnapshots.filter((row) => row.businessId === businessId)
    .sort((a, b) => b.date.localeCompare(a.date));

export const getExperiences = (): Experience[] => seed.experiences;

export const getExperience = (id: string): Experience | undefined =>
  seed.experiences.find((e) => e.id === id);

export const getExperiencesFor = (destinationId: string): Experience[] =>
  seed.experiences.filter((e) => e.destinationId === destinationId);

export const getAccommodationSnapshots = (): AccommodationSnapshot[] =>
  getState().accommodationSnapshots;

export function getLatestAccommodation(destinationId?: string): AccommodationSnapshot[] {
  const snapshots = getState().accommodationSnapshots.filter(
    (s) => !destinationId || s.destinationId === destinationId,
  );
  const latestByBusiness = new Map<string, AccommodationSnapshot>();
  for (const snapshot of snapshots) {
    const existing = latestByBusiness.get(snapshot.businessId);
    if (!existing || snapshot.date > existing.date) latestByBusiness.set(snapshot.businessId, snapshot);
  }
  return [...latestByBusiness.values()];
}

export const getEnquiries = (): Enquiry[] => getState().enquiries;

/* -------------------------------- Creators -------------------------------- */

export const getCreators = (): Creator[] => getState().creators;

export const getCreator = (id: string): Creator | undefined =>
  getState().creators.find((c) => c.id === id);

export const getCampaigns = (): Campaign[] => getState().campaigns;

export const getCampaign = (id: string): Campaign | undefined =>
  getState().campaigns.find((c) => c.id === id);

/** Loose name match, used when a government question names a campaign. */
export function findCampaignByName(name: string): Campaign | undefined {
  const needle = name.trim().toLowerCase();
  const campaigns = getState().campaigns;
  return (
    campaigns.find((c) => c.name.toLowerCase() === needle) ??
    campaigns.find((c) => needle.includes(c.name.toLowerCase())) ??
    campaigns.find((c) => c.name.toLowerCase().includes(needle))
  );
}

export function getApplications(filter?: { campaignId?: string; creatorId?: string }): CreatorApplication[] {
  return getState().applications.filter(
    (a) =>
      (!filter?.campaignId || a.campaignId === filter.campaignId) &&
      (!filter?.creatorId || a.creatorId === filter.creatorId),
  );
}

export function getCampaignContent(filter?: {
  campaignId?: string;
  creatorId?: string;
}): CampaignContent[] {
  return getState().campaignContent.filter(
    (c) =>
      (!filter?.campaignId || c.campaignId === filter.campaignId) &&
      (!filter?.creatorId || c.creatorId === filter.creatorId),
  );
}

export const getSeededCampaignMetrics = (campaignId?: string): CampaignMetric[] =>
  seed.campaignMetrics.filter((m) => !campaignId || m.campaignId === campaignId);

export const getPayouts = (creatorId?: string): Payout[] =>
  getState().payouts.filter((p) => !creatorId || p.creatorId === creatorId);

/* --------------------------------- Signals -------------------------------- */

export interface InteractionFilter {
  destinationId?: string;
  destinationIds?: readonly string[];
  campaignId?: string;
  types?: readonly InteractionType[];
  from?: Date;
  to?: Date;
}

export function getInteractions(filter: InteractionFilter = {}): TourismInteraction[] {
  const fromTime = filter.from?.getTime();
  const toTime = filter.to?.getTime();
  const allowedTypes = filter.types ? new Set(filter.types) : undefined;
  const allowedDestinations = filter.destinationIds ? new Set(filter.destinationIds) : undefined;

  return getState().interactions.filter((interaction) => {
    if (filter.destinationId && interaction.destinationId !== filter.destinationId) return false;
    if (allowedDestinations && (!interaction.destinationId || !allowedDestinations.has(interaction.destinationId))) {
      return false;
    }
    if (filter.campaignId && interaction.campaignId !== filter.campaignId) return false;
    if (allowedTypes && !allowedTypes.has(interaction.type)) return false;
    if (fromTime !== undefined || toTime !== undefined) {
      const time = new Date(interaction.timestamp).getTime();
      if (fromTime !== undefined && time < fromTime) return false;
      if (toTime !== undefined && time > toTime) return false;
    }
    return true;
  });
}

export interface FeedbackFilter {
  destinationId?: string;
  destinationIds?: readonly string[];
  from?: Date;
  to?: Date;
  minRating?: number;
  maxRating?: number;
}

export function getFeedback(filter: FeedbackFilter = {}): Feedback[] {
  const fromTime = filter.from?.getTime();
  const toTime = filter.to?.getTime();
  const allowedDestinations = filter.destinationIds ? new Set(filter.destinationIds) : undefined;

  return getState().feedback.filter((entry) => {
    if (filter.destinationId && entry.destinationId !== filter.destinationId) return false;
    if (allowedDestinations && !allowedDestinations.has(entry.destinationId)) return false;
    if (filter.minRating !== undefined && entry.rating < filter.minRating) return false;
    if (filter.maxRating !== undefined && entry.rating > filter.maxRating) return false;
    if (fromTime !== undefined || toTime !== undefined) {
      const time = new Date(entry.createdAt).getTime();
      if (fromTime !== undefined && time < fromTime) return false;
      if (toTime !== undefined && time > toTime) return false;
    }
    return true;
  });
}

/* ---------------------------------- Trips --------------------------------- */

// Trips are read per visitor from src/server/data/trips.ts, not from the
// cached working set: nothing in the analytics reads them.
