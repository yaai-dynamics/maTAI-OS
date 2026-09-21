import type { PrismaClient } from '@prisma/client';

import { DEMO_MODE } from '@/lib/config';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/server/auth/demo-accounts';
import { generateSignals } from '@/server/data/generate';
import { seed } from '@/server/data/seed';

/**
 * Loads the curated seed files and the deterministic signal generator into the
 * database.
 *
 * Shared by the CLI (prisma/seed.ts) and by the demo reset action, so "reset
 * the demo" restores exactly the dataset a fresh install gets — including the
 * seeded rows a demo run modifies, such as a business that was verified or an
 * enquiry that was answered. Deleting only the newly created rows would leave
 * those changes behind and the next run would not start identically.
 *
 * Every row carries its provenance from the source file. Nothing is invented
 * here and nothing is relabelled on the way in.
 */

/** ISO string to Date, preserving null/undefined. */
const date = (value: string | null | undefined): Date | undefined =>
  value == null ? undefined : new Date(value);

/** Tables in reverse dependency order, for a clean re-seed. */
const TRUNCATION_ORDER = [
  // The booking ledger points at experiences, businesses and destinations, so
  // it goes first. Payments and refunds cascade from their booking. Razorpay
  // keeps its own record of test payments; only the platform's copy goes.
  'paymentWebhookEvent',
  'booking',
  // Intake counters describe the signals being cleared; kept, they would
  // report recordings that no longer exist.
  'telemetryCounter',
  'feedback',
  'tourismInteraction',
  'itineraryItem',
  'trip',
  'touristSession',
  'payout',
  'campaignMetric',
  'campaignContent',
  'creatorApplication',
  'creatorCampaign',
  'creator',
  'enquiry',
  'accommodationSnapshot',
  'experience',
  'tourismBusiness',
  'knowledgeDocument',
  'event',
  'verifiedFact',
  'attraction',
  'destination',
  'dataSource',
  'district',
  'tourismMetric',
  'alert',
  'answerAudit',
] as const;

const DEMO_EMAILS = DEMO_ACCOUNTS.map((account) => account.email);

/**
 * Accounts point at businesses and creator profiles by foreign key, and those
 * rows are about to be deleted and re-created. So before clearing:
 *
 *  - accounts that are not demo accounts are removed. They are bound to
 *    records created during a demo run (a newly registered homestay), which a
 *    re-seed deletes, and an account for a business that no longer exists can
 *    act for nothing.
 *  - demo accounts are kept but unbound, and re-bound after the seed. Their
 *    sessions survive, so pressing "Reset demo" does not sign you out.
 *
 * Seeding is therefore a destructive development operation, which is what it
 * always was.
 */
async function releaseAccounts(prisma: PrismaClient): Promise<void> {
  await prisma.userAccount.deleteMany({ where: { email: { notIn: DEMO_EMAILS } } });
  await prisma.userAccount.updateMany({ data: { businessId: null, creatorId: null } });
}

/** Demo accounts, created only in DEMO_MODE and bound to seeded records. */
async function seedDemoAccounts(prisma: PrismaClient): Promise<void> {
  if (!DEMO_MODE) {
    // Outside demo mode the published demo password must not open anything.
    await prisma.userAccount.deleteMany({ where: { email: { in: DEMO_EMAILS } } });
    return;
  }

  for (const account of DEMO_ACCOUNTS) {
    const binding = {
      displayName: account.displayName,
      kind: account.kind,
      governmentRole: account.governmentRole ?? null,
      businessId: account.businessId ?? null,
      creatorId: account.creatorId ?? null,
      disabled: false,
      failedLoginCount: 0,
      lockedUntil: null,
      mustChangePassword: false,
      passwordExpiresAt: null,
    };
    const existing = await prisma.userAccount.findUnique({ where: { email: account.email } });
    if (existing) {
      // Keep the hash (and so every signed-in session) — only re-bind. If an
      // administrator reset or changed it during the demo, put the published
      // password back, or the one-click sign-in would stay broken.
      const stillPublished = await verifyPassword(DEMO_PASSWORD, existing.passwordHash);
      await prisma.userAccount.update({
        where: { id: existing.id },
        data: { ...binding, ...(stillPublished ? {} : { passwordHash: await hashPassword(DEMO_PASSWORD) }) },
      });
    } else {
      await prisma.userAccount.create({
        data: {
          id: `acct-demo-${account.email.split('@')[0]}`,
          email: account.email,
          passwordHash: await hashPassword(DEMO_PASSWORD),
          ...binding,
        },
      });
    }
  }
}

async function clear(prisma: PrismaClient): Promise<void> {
  await releaseAccounts(prisma);
  for (const table of TRUNCATION_ORDER) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[table].deleteMany({});
  }
}

/**
 * Whether to seed generated tourist signals: interactions, feedback,
 * availability snapshots and enquiries. On by default in demo mode, where
 * the analytics need a history to show anything; off otherwise, so a real
 * deployment starts with only what its own telemetry intake records.
 *
 * The catalogue (districts, destinations, facts, sources) is always seeded.
 * The demo businesses, creators and campaigns are too, for now, and stay
 * labelled DEMO_SYNTHETIC wherever they appear.
 */
export const seedsSyntheticSignals = (): boolean =>
  process.env.SEED_SYNTHETIC_SIGNALS ? process.env.SEED_SYNTHETIC_SIGNALS === 'true' : DEMO_MODE;

export async function seedDatabase(prisma: PrismaClient): Promise<Record<string, number>> {
  const full = generateSignals(seed);
  const synthetic = seedsSyntheticSignals();
  const generated = synthetic
    ? full
    : { ...full, interactions: [], feedback: [], accommodationSnapshots: [], enquiries: [] };
  const authoredFeedback = synthetic ? seed.feedback : [];

  /**
   * TourismBusiness carries the district as a name on the TypeScript type; the
   * relational form needs the foreign key. Resolving it here rather than
   * editing the seed files keeps the curated data as authored.
   */
  const districtIdByName = new Map(seed.districts.map((d) => [d.name, d.id]));
  const districtIdFor = (name: string): string => {
    const id = districtIdByName.get(name);
    if (!id) throw new Error(`Unknown district "${name}" — not present in data/districts.json`);
    return id;
  };
  await clear(prisma);

  await prisma.district.createMany({
    data: seed.districts.map((d) => ({
      id: d.id,
      name: d.name,
      latitude: d.latitude,
      longitude: d.longitude,
    })),
  });

  await prisma.destination.createMany({
    // `district` (the name) is denormalised on the TypeScript type for
    // convenience; the relational form keeps only districtId and joins.
    data: seed.destinations.map((d) => ({
      id: d.id,
      name: d.name,
      districtId: d.districtId,
      category: d.category,
      latitude: d.latitude,
      longitude: d.longitude,
      summary: d.summary,
      overview: d.overview,
      ecoSensitivity: d.ecoSensitivity,
      capacitySignal: d.capacitySignal,
      status: d.status,
      typicalVisitMinutes: d.typicalVisitMinutes,
      bestSeason: d.bestSeason,
      accessibilityNotes: d.accessibilityNotes,
      palette: d.palette,
      provenance: d.provenance,
    })),
  });

  await prisma.dataSource.createMany({
    data: seed.dataSources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      owner: s.owner,
      refreshFrequency: s.refreshFrequency,
      reliabilityLevel: s.reliabilityLevel,
      description: s.description,
      url: s.url,
      defaultProvenance: s.defaultProvenance,
    })),
  });

  await prisma.verifiedFact.createMany({
    data: seed.verifiedFacts.map((f) => ({
      id: f.id,
      destinationId: f.destinationId,
      title: f.title,
      text: f.text,
      factType: f.factType,
      sourceId: f.sourceId,
      verified: f.verified,
      verifiedAt: new Date(f.verifiedAt),
      tags: f.tags,
    })),
  });

  await prisma.event.createMany({
    data: seed.events.map((e) => ({
      id: e.id,
      name: e.name,
      destinationId: e.destinationId,
      startAt: date(e.startAt)!,
      endAt: date(e.endAt)!,
      category: e.category,
      expectedAttendance: e.expectedAttendance,
      description: e.description,
      sourceId: e.sourceId,
      provenance: e.provenance,
    })),
  });

  await prisma.knowledgeDocument.createMany({
    data: seed.knowledgeDocuments.map((k) => ({
      id: k.id,
      title: k.title,
      documentType: k.documentType,
      sourceId: k.sourceId,
      sourceAuthority: k.sourceAuthority,
      sourceUrl: k.sourceUrl,
      text: k.text,
      verified: k.verified,
      publishedAt: new Date(k.publishedAt),
      destinationIds: k.destinationIds,
      tags: k.tags,
    })),
  });

  await prisma.tourismBusiness.createMany({
    data: seed.businesses.map((b) => ({
      id: b.id,
      name: b.name,
      businessType: b.businessType,
      districtId: districtIdFor(b.district),
      destinationId: b.destinationId,
      status: b.status,
      description: b.description,
      contactVisibility: b.contactVisibility,
      verified: b.verified,
      reportedCapacity: b.reportedCapacity,
      provenance: b.provenance,
    })),
  });

  await prisma.experience.createMany({
    data: seed.experiences.map((e) => ({
      id: e.id,
      businessId: e.businessId,
      destinationId: e.destinationId,
      title: e.title,
      category: e.category,
      description: e.description,
      durationMinutes: e.durationMinutes,
      price: e.price,
      verified: e.verified,
      availabilityStatus: e.availabilityStatus,
      tags: e.tags,
      accessibility: e.accessibility,
      provenance: e.provenance,
    })),
  });

  await prisma.accommodationSnapshot.createMany({
    data: generated.accommodationSnapshots.map((a) => ({
      id: a.id,
      businessId: a.businessId,
      destinationId: a.destinationId,
      date: date(a.date)!,
      totalCapacity: a.totalCapacity,
      availableCapacity: a.availableCapacity,
      occupancyRate: a.occupancyRate,
      provenance: a.provenance,
    })),
  });

  await prisma.enquiry.createMany({
    data: generated.enquiries.map((e) => ({
      id: e.id,
      experienceId: e.experienceId,
      businessId: e.businessId,
      anonymousSessionId: e.anonymousSessionId,
      partySize: e.partySize,
      preferredDate: new Date(e.preferredDate),
      note: e.note,
      status: e.status,
      createdAt: date(e.createdAt)!,
      provenance: e.provenance,
    })),
  });

  await prisma.creator.createMany({
    data: seed.creators.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      homeDistrict: c.homeDistrict,
      bio: c.bio,
      categories: c.categories,
      languages: c.languages,
      platforms: c.platforms,
      audienceSummary: c.audienceSummary,
      audienceAgeBand: c.audienceAgeBand,
      audienceRegions: c.audienceRegions,
      creatorScore: c.creatorScore,
      campaignsCompleted: c.campaignsCompleted,
      medianItineraryAdds: c.medianItineraryAdds,
      status: c.status,
      verified: c.verified,
      provenance: c.provenance,
    })),
  });

  await prisma.creatorCampaign.createMany({
    data: seed.campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      destinationId: c.destinationId,
      targetAudience: c.targetAudience,
      audienceAgeBand: c.audienceAgeBand,
      platforms: c.platforms,
      rewardPool: c.rewardPool,
      startDate: date(c.startDate)!,
      endDate: date(c.endDate)!,
      contentRequirement: c.contentRequirement,
      themes: c.themes,
      preferredLanguages: c.preferredLanguages,
      status: c.status,
      createdBy: c.createdBy,
      createdAt: date(c.createdAt)!,
      provenance: c.provenance,
    })),
  });

  await prisma.creatorApplication.createMany({
    data: seed.applications.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      creatorId: a.creatorId,
      status: a.status,
      proposedConcept: a.proposedConcept,
      submittedAt: date(a.submittedAt)!,
      provenance: a.provenance,
    })),
  });

  await prisma.campaignContent.createMany({
    data: seed.campaignContent.map((c) => ({
      id: c.id,
      campaignId: c.campaignId,
      creatorId: c.creatorId,
      title: c.title,
      platform: c.platform,
      contentUrl: c.contentUrl,
      caption: c.caption,
      disclosure: c.disclosure,
      status: c.status,
      submittedAt: date(c.submittedAt)!,
      reviewNote: c.reviewNote,
      provenance: c.provenance,
    })),
  });

  await prisma.campaignMetric.createMany({
    data: seed.campaignMetrics.map((m) => ({
      id: m.id,
      campaignContentId: m.campaignContentId,
      campaignId: m.campaignId,
      metric: m.metric,
      value: m.value,
      recordedAt: date(m.recordedAt)!,
      provenance: m.provenance,
    })),
  });

  await prisma.payout.createMany({
    data: generated.payouts.map((p) => ({
      id: p.id,
      campaignId: p.campaignId,
      creatorId: p.creatorId,
      amount: p.amount,
      basis: p.basis,
      status: p.status,
      recordedAt: date(p.recordedAt)!,
      provenance: p.provenance,
    })),
  });

  // The largest table. Chunked so a single statement does not exceed
  // max_allowed_packet on a default MySQL configuration.
  const CHUNK = 500;
  const interactions = generated.interactions.map((i) => ({
    id: i.id,
    anonymousSessionId: i.anonymousSessionId,
    destinationId: i.destinationId,
    experienceId: i.experienceId,
    tripId: i.tripId,
    campaignId: i.campaignId,
    type: i.type,
    timestamp: new Date(i.timestamp),
    provenance: i.provenance,
    metadata: i.metadata ?? {},
  }));

  for (let index = 0; index < interactions.length; index += CHUNK) {
    await prisma.tourismInteraction.createMany({ data: interactions.slice(index, index + CHUNK) });
  }

  const feedback = [...authoredFeedback, ...generated.feedback].map((f) => ({
    id: f.id,
    destinationId: f.destinationId,
    experienceId: f.experienceId,
    tripId: f.tripId,
    rating: f.rating,
    category: f.category,
    text: f.text,
    language: f.language,
    sentiment: f.sentiment,
    anonymized: f.anonymized,
    createdAt: new Date(f.createdAt),
    provenance: f.provenance,
  }));

  for (let index = 0; index < feedback.length; index += CHUNK) {
    await prisma.feedback.createMany({ data: feedback.slice(index, index + CHUNK) });
  }

  await seedDemoAccounts(prisma);

  const counts = {
    districts: await prisma.district.count(),
    destinations: await prisma.destination.count(),
    dataSources: await prisma.dataSource.count(),
    verifiedFacts: await prisma.verifiedFact.count(),
    events: await prisma.event.count(),
    knowledgeDocuments: await prisma.knowledgeDocument.count(),
    businesses: await prisma.tourismBusiness.count(),
    experiences: await prisma.experience.count(),
    accommodation: await prisma.accommodationSnapshot.count(),
    enquiries: await prisma.enquiry.count(),
    creators: await prisma.creator.count(),
    campaigns: await prisma.creatorCampaign.count(),
    applications: await prisma.creatorApplication.count(),
    campaignContent: await prisma.campaignContent.count(),
    campaignMetrics: await prisma.campaignMetric.count(),
    payouts: await prisma.payout.count(),
    interactions: await prisma.tourismInteraction.count(),
    feedback: await prisma.feedback.count(),
    accounts: await prisma.userAccount.count(),
    bookings: await prisma.booking.count(),
  };

  return counts;
}

