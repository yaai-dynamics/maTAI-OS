import {
  businessRateSchema,
  type AccommodationSnapshot,
  type Campaign,
  type CampaignContent,
  type Creator,
  type CreatorApplication,
  type Destination,
  type District,
  type Enquiry,
  type Feedback,
  type LandingPage,
  type Payout,
  type TourismBusiness,
  type TourismInteraction,
} from '@/lib/types';
import { prisma } from '@/server/data/client';

/**
 * Reads the tourism working set out of MySQL and back into the domain types.
 *
 * Why the whole set rather than per-query filters: every analytics module
 * computes over the full analysis window, and the analysis window is the whole
 * table — a 90 day window covers 100% of rows. Filtering in SQL would return
 * the same rows while turning one read into the N+1 storm that
 * computeDemand's per-destination loop would otherwise produce.
 *
 * The scaling path is already in the schema: TourismMetric holds pre-computed
 * rollups. When the interaction table outgrows memory, analytics read rollups
 * written by a job rather than raw rows. That is a change behind this module,
 * not above it.
 *
 * See docs/09-implementation-notes.md §17.
 */

/** Prisma returns Date; the domain types carry ISO strings. */
const iso = (value: Date): string => value.toISOString();

/** Columns declared Json hold string arrays. */
const list = <T extends string>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Prisma models nullable columns as null; the domain types use undefined. */
const opt = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

/** A partner rate that no longer parses is left off, rather than failing the load. */
const rateOf = (value: unknown) => {
  const rate = businessRateSchema.safeParse(value);
  return rate.success ? { rate: rate.data } : {};
};

/** Left off entirely when empty, so an artisan without products reads the same as before this field existed. */
const productsOf = (value: unknown) => {
  const products = list<string>(value);
  return products.length > 0 ? { products } : {};
};

export interface LoadedState {
  districts: District[];
  destinations: Destination[];
  businesses: TourismBusiness[];
  creators: Creator[];
  campaigns: Campaign[];
  applications: CreatorApplication[];
  campaignContent: CampaignContent[];
  interactions: TourismInteraction[];
  feedback: Feedback[];
  accommodationSnapshots: AccommodationSnapshot[];
  enquiries: Enquiry[];
  payouts: Payout[];
  landingPages: LandingPage[];
}

export async function loadState(): Promise<LoadedState> {
  const [
    districtRows,
    destinationRows,
    businessRows,
    creatorRows,
    campaignRows,
    applicationRows,
    contentRows,
    interactionRows,
    feedbackRows,
    accommodationRows,
    enquiryRows,
    payoutRows,
    landingPageRows,
  ] = await Promise.all([
    prisma.district.findMany(),
    prisma.destination.findMany(),
    prisma.tourismBusiness.findMany(),
    prisma.creator.findMany(),
    prisma.creatorCampaign.findMany(),
    prisma.creatorApplication.findMany(),
    prisma.campaignContent.findMany(),
    prisma.tourismInteraction.findMany({ orderBy: { timestamp: 'asc' } }),
    prisma.feedback.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.accommodationSnapshot.findMany(),
    prisma.enquiry.findMany(),
    prisma.payout.findMany(),
    prisma.landingPage.findMany(),
  ]);

  // District name is denormalised onto Destination and TourismBusiness in the
  // domain types; the relational form stores only the key.
  const districtNameById = new Map(districtRows.map((d) => [d.id, d.name]));
  const districtName = (id: string): string => districtNameById.get(id) ?? 'Unknown district';

  return {
    districts: districtRows.map((d) => ({
      id: d.id,
      name: d.name,
      latitude: d.latitude,
      longitude: d.longitude,
    })),

    destinations: destinationRows.map((d) => ({
      id: d.id,
      name: d.name,
      district: districtName(d.districtId),
      districtId: d.districtId,
      category: list(d.category),
      latitude: d.latitude,
      longitude: d.longitude,
      summary: d.summary,
      overview: opt(d.overview),
      ecoSensitivity: d.ecoSensitivity,
      capacitySignal: d.capacitySignal,
      status: d.status,
      typicalVisitMinutes: d.typicalVisitMinutes,
      bestSeason: opt(d.bestSeason),
      accessibilityNotes: opt(d.accessibilityNotes),
      palette: d.palette,
      provenance: d.provenance,
    })) as Destination[],

    businesses: businessRows.map((b) => ({
      id: b.id,
      name: b.name,
      businessType: b.businessType,
      district: districtName(b.districtId),
      destinationId: b.destinationId,
      status: b.status,
      description: opt(b.description),
      contactVisibility: b.contactVisibility,
      verified: b.verified,
      reportedCapacity: opt(b.reportedCapacity),
      ...rateOf(b.rateJson),
      ...productsOf(b.productsJson),
      provenance: b.provenance,
    })) as TourismBusiness[],

    creators: creatorRows.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      homeDistrict: c.homeDistrict,
      bio: opt(c.bio),
      categories: list(c.categories),
      languages: list(c.languages),
      platforms: list(c.platforms),
      audienceSummary: opt(c.audienceSummary),
      audienceAgeBand: opt(c.audienceAgeBand),
      audienceRegions: list(c.audienceRegions),
      creatorScore: c.creatorScore,
      campaignsCompleted: c.campaignsCompleted,
      medianItineraryAdds: c.medianItineraryAdds,
      status: c.status,
      verified: c.verified,
      provenance: c.provenance,
    })) as Creator[],

    campaigns: campaignRows.map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      destinationId: c.destinationId,
      targetAudience: opt(c.targetAudience),
      audienceAgeBand: opt(c.audienceAgeBand),
      platforms: list(c.platforms),
      rewardPool: c.rewardPool,
      startDate: iso(c.startDate),
      endDate: iso(c.endDate),
      contentRequirement: opt(c.contentRequirement),
      themes: list(c.themes),
      preferredLanguages: list(c.preferredLanguages),
      status: c.status,
      createdBy: opt(c.createdBy),
      createdAt: iso(c.createdAt),
      provenance: c.provenance,
    })) as Campaign[],

    applications: applicationRows.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      creatorId: a.creatorId,
      status: a.status,
      proposedConcept: opt(a.proposedConcept),
      submittedAt: iso(a.submittedAt),
      provenance: a.provenance,
    })) as CreatorApplication[],

    campaignContent: contentRows.map((c) => ({
      id: c.id,
      campaignId: c.campaignId,
      creatorId: c.creatorId,
      title: c.title,
      platform: c.platform,
      contentUrl: c.contentUrl,
      caption: opt(c.caption),
      disclosure: opt(c.disclosure),
      status: c.status,
      submittedAt: iso(c.submittedAt),
      reviewNote: opt(c.reviewNote),
      provenance: c.provenance,
    })) as CampaignContent[],

    interactions: interactionRows.map((i) => ({
      id: i.id,
      anonymousSessionId: i.anonymousSessionId,
      destinationId: opt(i.destinationId),
      experienceId: opt(i.experienceId),
      tripId: opt(i.tripId),
      campaignId: opt(i.campaignId),
      type: i.type,
      timestamp: iso(i.timestamp),
      provenance: i.provenance,
      metadata: (i.metadata ?? {}) as TourismInteraction['metadata'],
    })) as TourismInteraction[],

    feedback: feedbackRows.map((f) => ({
      id: f.id,
      destinationId: f.destinationId,
      experienceId: opt(f.experienceId),
      tripId: opt(f.tripId),
      rating: f.rating,
      category: f.category,
      text: f.text,
      language: f.language,
      sentiment: f.sentiment,
      anonymized: f.anonymized,
      createdAt: iso(f.createdAt),
      provenance: f.provenance,
    })) as Feedback[],

    accommodationSnapshots: accommodationRows.map((a) => ({
      id: a.id,
      businessId: a.businessId,
      destinationId: a.destinationId,
      date: iso(a.date).slice(0, 10),
      totalCapacity: a.totalCapacity,
      availableCapacity: a.availableCapacity,
      occupancyRate: a.occupancyRate,
      provenance: a.provenance,
    })) as AccommodationSnapshot[],

    enquiries: enquiryRows.map((e) => ({
      id: e.id,
      experienceId: opt(e.experienceId),
      businessId: e.businessId,
      anonymousSessionId: e.anonymousSessionId,
      partySize: opt(e.partySize),
      preferredDate: e.preferredDate ? iso(e.preferredDate).slice(0, 10) : undefined,
      contactName: opt(e.contactName),
      contactPhone: opt(e.contactPhone),
      message: opt(e.message),
      note: opt(e.note),
      status: e.status,
      createdAt: iso(e.createdAt),
      provenance: e.provenance,
    })) as Enquiry[],

    payouts: payoutRows.map((p) => ({
      id: p.id,
      campaignId: p.campaignId,
      creatorId: p.creatorId,
      amount: p.amount,
      basis: p.basis,
      status: p.status,
      recordedAt: iso(p.recordedAt),
      provenance: p.provenance,
    })) as Payout[],

    landingPages: landingPageRows.map((p) => {
      const content = (p.contentJson ?? {}) as { sections?: LandingPage['sections']; hashtags?: unknown };
      return {
        id: p.id,
        ownerType: p.ownerType,
        businessId: opt(p.businessId),
        campaignId: opt(p.campaignId),
        eventId: opt(p.eventId),
        slug: p.slug,
        title: p.title,
        tagline: p.tagline,
        heroImageUrl: opt(p.heroImageUrl),
        sections: Array.isArray(content.sections) ? content.sections : [],
        hashtags: list<string>(content.hashtags),
        bookingUrl: opt(p.bookingUrl),
        status: p.status,
        viewCount: p.viewCount,
        shareCount: p.shareCount,
        generatedBy: p.generatedBy,
        generatedAt: iso(p.generatedAt),
        publishedAt: p.publishedAt ? iso(p.publishedAt) : undefined,
        createdBy: p.createdBy,
        provenance: p.provenance,
      };
    }) as LandingPage[],
  };
}
