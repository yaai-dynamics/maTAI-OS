import type {
  AccommodationSnapshot,
  Campaign,
  CampaignContent,
  Creator,
  CreatorApplication,
  Enquiry,
  Feedback,
  TourismBusiness,
  TourismInteraction,
} from '@/lib/types';
import { prisma } from '@/server/data/client';

/**
 * Write-through persistence for the store.
 *
 * The store keeps the working set in memory because every analytics module
 * reads all of it (see load.ts). Writes therefore go to two places: the cache,
 * so the next read sees them immediately, and MySQL, so they survive a restart.
 *
 * Each function here mirrors exactly one store mutation. They are deliberately
 * small and free of business rules — the rules live in the store and in the
 * actions above it. Nothing here decides a provenance or a status.
 */

/** District name to id, resolved once per process. Districts do not change. */
let districtIds: Map<string, string> | undefined;

async function districtIdFor(name: string): Promise<string> {
  if (!districtIds) {
    const rows = await prisma.district.findMany({ select: { id: true, name: true } });
    districtIds = new Map(rows.map((row) => [row.name, row.id]));
  }
  const id = districtIds.get(name);
  if (!id) throw new Error(`Unknown district "${name}" — no matching row in District`);
  return id;
}

export async function persistInteraction(interaction: TourismInteraction): Promise<void> {
  await prisma.tourismInteraction.create({
    data: {
      id: interaction.id,
      anonymousSessionId: interaction.anonymousSessionId,
      destinationId: interaction.destinationId ?? null,
      experienceId: interaction.experienceId ?? null,
      tripId: interaction.tripId ?? null,
      campaignId: interaction.campaignId ?? null,
      type: interaction.type,
      timestamp: new Date(interaction.timestamp),
      provenance: interaction.provenance,
      metadata: interaction.metadata ?? {},
      clientEventId: interaction.clientEventId ?? null,
    },
  });
}

export async function persistFeedback(entry: Feedback): Promise<void> {
  await prisma.feedback.create({
    data: {
      id: entry.id,
      destinationId: entry.destinationId,
      experienceId: entry.experienceId ?? null,
      tripId: entry.tripId ?? null,
      rating: entry.rating,
      category: entry.category,
      text: entry.text,
      language: entry.language,
      sentiment: entry.sentiment,
      anonymized: entry.anonymized,
      createdAt: new Date(entry.createdAt),
      provenance: entry.provenance,
    },
  });
}

export async function persistCampaign(campaign: Campaign): Promise<void> {
  const data = {
    name: campaign.name,
    objective: campaign.objective,
    destinationId: campaign.destinationId,
    targetAudience: campaign.targetAudience ?? null,
    audienceAgeBand: campaign.audienceAgeBand ?? null,
    platforms: campaign.platforms,
    rewardPool: campaign.rewardPool,
    startDate: new Date(campaign.startDate),
    endDate: new Date(campaign.endDate),
    contentRequirement: campaign.contentRequirement ?? null,
    themes: campaign.themes,
    preferredLanguages: campaign.preferredLanguages,
    status: campaign.status,
    createdBy: campaign.createdBy ?? null,
    // Campaign.createdAt is optional on the domain type but required in the
    // schema: a campaign always has a creation time, even if the caller omitted it.
    createdAt: campaign.createdAt ? new Date(campaign.createdAt) : new Date(),
    provenance: campaign.provenance,
  };
  await prisma.creatorCampaign.upsert({
    where: { id: campaign.id },
    create: { id: campaign.id, ...data },
    update: data,
  });
}

export async function persistApplication(application: CreatorApplication): Promise<void> {
  const data = {
    campaignId: application.campaignId,
    creatorId: application.creatorId,
    status: application.status,
    proposedConcept: application.proposedConcept ?? null,
    submittedAt: new Date(application.submittedAt),
    provenance: application.provenance,
  };
  // The campaign/creator pair is unique, so an application is upserted on that
  // rather than on the generated id: a creator applying twice updates the row.
  await prisma.creatorApplication.upsert({
    where: {
      campaignId_creatorId: { campaignId: application.campaignId, creatorId: application.creatorId },
    },
    create: { id: application.id, ...data },
    update: data,
  });
}

export async function persistContent(content: CampaignContent): Promise<void> {
  const data = {
    campaignId: content.campaignId,
    creatorId: content.creatorId,
    title: content.title,
    platform: content.platform,
    contentUrl: content.contentUrl,
    caption: content.caption ?? null,
    disclosure: content.disclosure ?? null,
    status: content.status,
    submittedAt: new Date(content.submittedAt),
    reviewNote: content.reviewNote ?? null,
    provenance: content.provenance,
  };
  await prisma.campaignContent.upsert({
    where: { id: content.id },
    create: { id: content.id, ...data },
    update: data,
  });
}

export async function persistEnquiry(enquiry: Enquiry): Promise<void> {
  const data = {
    experienceId: enquiry.experienceId,
    businessId: enquiry.businessId,
    anonymousSessionId: enquiry.anonymousSessionId,
    partySize: enquiry.partySize,
    preferredDate: new Date(enquiry.preferredDate),
    note: enquiry.note ?? null,
    status: enquiry.status,
    createdAt: new Date(enquiry.createdAt),
    provenance: enquiry.provenance,
  };
  await prisma.enquiry.upsert({
    where: { id: enquiry.id },
    create: { id: enquiry.id, ...data },
    update: data,
  });
}

export async function persistBusiness(business: TourismBusiness): Promise<void> {
  const data = {
    name: business.name,
    businessType: business.businessType,
    districtId: await districtIdFor(business.district),
    destinationId: business.destinationId,
    status: business.status,
    description: business.description ?? null,
    contactVisibility: business.contactVisibility,
    verified: business.verified,
    reportedCapacity: business.reportedCapacity ?? null,
    provenance: business.provenance,
  };
  await prisma.tourismBusiness.upsert({
    where: { id: business.id },
    create: { id: business.id, ...data },
    update: data,
  });
}

export async function persistCreator(creator: Creator): Promise<void> {
  const data = {
    displayName: creator.displayName,
    homeDistrict: creator.homeDistrict,
    bio: creator.bio ?? null,
    categories: creator.categories,
    languages: creator.languages,
    platforms: creator.platforms,
    audienceSummary: creator.audienceSummary ?? null,
    audienceAgeBand: creator.audienceAgeBand ?? null,
    audienceRegions: creator.audienceRegions,
    creatorScore: creator.creatorScore,
    campaignsCompleted: creator.campaignsCompleted,
    medianItineraryAdds: creator.medianItineraryAdds,
    status: creator.status,
    verified: creator.verified,
    provenance: creator.provenance,
  };
  await prisma.creator.upsert({
    where: { id: creator.id },
    create: { id: creator.id, ...data },
    update: data,
  });
}

export async function persistAvailability(snapshot: AccommodationSnapshot): Promise<void> {
  const data = {
    businessId: snapshot.businessId,
    destinationId: snapshot.destinationId,
    date: new Date(snapshot.date),
    totalCapacity: snapshot.totalCapacity,
    availableCapacity: snapshot.availableCapacity,
    occupancyRate: snapshot.occupancyRate,
    provenance: snapshot.provenance,
  };
  // One snapshot per property per date — the schema's unique key enforces the
  // same rule the store applies in memory.
  await prisma.accommodationSnapshot.upsert({
    where: { businessId_date: { businessId: snapshot.businessId, date: new Date(snapshot.date) } },
    create: { id: snapshot.id, ...data },
    update: data,
  });
}

/** Removes a visitor's passive signals, at their request. */
export async function deleteInteractionsForSession(
  sessionId: string,
  types: readonly TourismInteraction['type'][],
): Promise<number> {
  const result = await prisma.tourismInteraction.deleteMany({
    where: { anonymousSessionId: sessionId, type: { in: [...types] } },
  });
  return result.count;
}
