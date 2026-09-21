import { DATA_SEED, DEMO_NOW, HISTORY_DAYS } from '@/lib/config';
import { addDays, isWeekend, startOfUtcDay, toIsoDate } from '@/lib/date';
import type {
  AccommodationSnapshot,
  Enquiry,
  Feedback,
  InteractionType,
  IssueCategory,
  Payout,
  TourismInteraction,
} from '@/lib/types';
import { createRng, type Rng } from '@/server/data/random';
import { pickIssueText, pickPositiveText, positiveThemeFor } from '@/server/data/feedback-text';
import type { Seed } from '@/server/data/seed';

/**
 * Deterministic generation of the demo signal history.
 *
 * Volumes follow the prototype guidance in docs/04-data-model.md (300 to 1000
 * interactions, 100 to 300 feedback items). Everything produced here is
 * DEMO_SYNTHETIC: it describes no real visitor and is never presented as a
 * tourism statistic. Because every KPI is computed from these records rather
 * than from stored aggregates, signals created during a live demo move the
 * numbers in exactly the same way.
 */

/** Interaction mix, excluding feedback and bookings which are generated from their own records. */
const TYPE_WEIGHTS: Record<Exclude<InteractionType, 'FEEDBACK' | 'BOOKING' | 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED'>, number> = {
  DESTINATION_VIEW: 36,
  SEARCH: 30,
  ITINERARY_ADD: 15,
  NAVIGATION_START: 11,
  QR_CHECKIN: 6,
  REVIEW: 2,
};

const SESSION_POOL = 320;
const WEEKEND_LIFT = 1.25;
const WEEKDAY_FACTOR = 0.95;
const EVENT_PEAK_LIFT = 0.7;
const CAMPAIGN_ATTRIBUTION_RATE = 0.45;
const ACCOMMODATION_WINDOW_DAYS = 14;

export interface GeneratedSignals {
  interactions: TourismInteraction[];
  feedback: Feedback[];
  accommodationSnapshots: AccommodationSnapshot[];
  enquiries: Enquiry[];
  payouts: Payout[];
}

const sessionId = (rng: Rng): string => `sess-${String(rng.int(1, SESSION_POOL)).padStart(4, '0')}`;

/**
 * Timestamp inside a day, biased towards daylight hours.
 *
 * Returns undefined when the moment would fall after the demo clock. A platform
 * must not hold records timestamped in the future: it makes the current day a
 * partial day, which is correct, and it keeps every window that ends at "now"
 * consistent with the history series.
 */
function timeInDay(day: Date, rng: Rng): string | undefined {
  const hour = Math.min(22, Math.max(5, Math.round(6 + rng.float(0, 1) ** 0.8 * 15)));
  const minute = rng.int(0, 59);
  const at = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute),
  );
  return at.getTime() > DEMO_NOW.getTime() ? undefined : at.toISOString();
}

/**
 * Multiplier applied to a destination on a given day because a seeded event
 * falls inside its lift window. Peaks on the event date and decays either side.
 */
function eventLift(
  day: Date,
  destinationId: string,
  events: Seed['events'],
  windowDays: number,
): number {
  if (windowDays <= 0) return 1;
  let lift = 1;
  for (const event of events) {
    if (event.destinationId !== destinationId) continue;
    const start = startOfUtcDay(new Date(event.startAt));
    const offset = Math.round((day.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    // Anticipation before the event, a tail afterwards.
    if (offset < -windowDays || offset > windowDays) continue;
    const closeness = 1 - Math.abs(offset) / (windowDays + 1);
    lift += EVENT_PEAK_LIFT * closeness;
  }
  return lift;
}

export function generateSignals(seed: Seed): GeneratedSignals {
  const rng = createRng(DATA_SEED);
  const windowStart = startOfUtcDay(addDays(DEMO_NOW, -HISTORY_DAYS + 1));

  const destinationById = new Map(seed.destinations.map((d) => [d.id, d]));
  const interactions: TourismInteraction[] = [];
  const feedback: Feedback[] = [];

  let interactionSeq = 0;
  let feedbackSeq = 0;

  for (const profile of seed.signalProfiles) {
    const destination = destinationById.get(profile.destinationId);
    if (!destination) continue;

    let destinationInteractions = 0;

    for (let dayIndex = 0; dayIndex < HISTORY_DAYS; dayIndex += 1) {
      const day = addDays(windowStart, dayIndex);
      const growth = (1 + profile.growthPerMonth) ** (dayIndex / 30);
      const seasonality = isWeekend(day) ? WEEKEND_LIFT : WEEKDAY_FACTOR;
      const lift = eventLift(day, profile.destinationId, seed.events, profile.eventLiftWindowDays);
      const expected = profile.dailyInteractionBase * growth * seasonality * lift;

      const count = rng.poisson(expected);
      for (let i = 0; i < count; i += 1) {
        const type = rng.weighted(TYPE_WEIGHTS) as InteractionType;
        const timestamp = timeInDay(day, rng);
        if (!timestamp) continue;

        // Attribute a share of activity to a campaign running for this
        // destination on this day, the way a tracked link would.
        const campaign = seed.campaigns.find(
          (c) =>
            c.destinationId === profile.destinationId &&
            c.status !== 'DRAFT' &&
            toIsoDate(day) >= c.startDate &&
            toIsoDate(day) <= c.endDate,
        );
        const attributed = campaign !== undefined && rng.chance(CAMPAIGN_ATTRIBUTION_RATE);

        interactionSeq += 1;
        destinationInteractions += 1;
        interactions.push({
          id: `int-${String(interactionSeq).padStart(5, '0')}`,
          anonymousSessionId: sessionId(rng),
          destinationId: profile.destinationId,
          type,
          timestamp,
          provenance: 'DEMO_SYNTHETIC',
          ...(attributed && campaign ? { campaignId: campaign.id } : {}),
          metadata: attributed && campaign ? { attributedTo: campaign.id } : {},
        });
      }
    }

    // Feedback volume follows interaction volume, weighted towards recent days.
    const feedbackCount = Math.round(
      (destinationInteractions * profile.feedbackPerHundredInteractions) / 100,
    );
    for (let i = 0; i < feedbackCount; i += 1) {
      const recency = rng.next() ** 0.6; // bias towards the recent end of the window
      const dayIndex = Math.min(HISTORY_DAYS - 1, Math.floor(recency * HISTORY_DAYS));
      const day = addDays(windowStart, dayIndex);
      const timestamp = timeInDay(day, rng);
      if (!timestamp) continue;

      const raw = profile.sentimentBase + rng.float(-1.3, 0.6);
      const rating = Math.min(5, Math.max(1, Math.round(raw)));
      const isIssue = rating <= 3;
      const category = isIssue
        ? (rng.weighted(profile.issueMix) as IssueCategory)
        : positiveThemeFor(destination.category, rng);
      const text = isIssue
        ? pickIssueText(rng, category as IssueCategory)
        : pickPositiveText(rng, category as ReturnType<typeof positiveThemeFor>);

      feedbackSeq += 1;
      const feedbackId = `fbg-${String(feedbackSeq).padStart(4, '0')}`;
      feedback.push({
        id: feedbackId,
        destinationId: profile.destinationId,
        rating,
        category,
        text,
        language: 'English',
        sentiment: rating >= 4 ? 'POSITIVE' : rating === 3 ? 'NEUTRAL' : 'NEGATIVE',
        anonymized: true,
        createdAt: timestamp,
        provenance: 'DEMO_SYNTHETIC',
      });

      interactionSeq += 1;
      interactions.push({
        id: `int-${String(interactionSeq).padStart(5, '0')}`,
        anonymousSessionId: sessionId(rng),
        destinationId: profile.destinationId,
        type: 'FEEDBACK',
        timestamp,
        provenance: 'DEMO_SYNTHETIC',
        metadata: { feedbackId },
      });
    }
  }

  const enquiries = generateEnquiries(seed, rng, interactions, interactionSeq);
  const accommodationSnapshots = generateAccommodation(seed, rng);
  const payouts = generatePayouts(seed);

  interactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  feedback.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { interactions, feedback, accommodationSnapshots, enquiries, payouts };
}

/** Enquiries against bookable experiences, each paired with a BOOKING interaction. */
function generateEnquiries(
  seed: Seed,
  rng: Rng,
  interactions: TourismInteraction[],
  startingSeq: number,
): Enquiry[] {
  const bookable = seed.experiences.filter((e) => e.availabilityStatus !== 'UNAVAILABLE');
  const enquiries: Enquiry[] = [];
  let seq = startingSeq;

  for (let i = 0; i < 22; i += 1) {
    const experience = rng.pick(bookable);
    const dayIndex = rng.int(0, 44);
    const day = addDays(startOfUtcDay(DEMO_NOW), -dayIndex);
    const createdAt = timeInDay(day, rng);
    if (!createdAt) continue;
    const session = sessionId(rng);

    enquiries.push({
      id: `enq-${String(i + 1).padStart(3, '0')}`,
      experienceId: experience.id,
      businessId: experience.businessId,
      anonymousSessionId: session,
      partySize: rng.int(1, 5),
      preferredDate: toIsoDate(addDays(day, rng.int(3, 28))),
      status: rng.weighted({ SUBMITTED: 3, ACKNOWLEDGED: 4, CONFIRMED: 5, DECLINED: 1 }) as
        | 'SUBMITTED'
        | 'ACKNOWLEDGED'
        | 'CONFIRMED'
        | 'DECLINED',
      createdAt,
      provenance: 'DEMO_SYNTHETIC',
    });

    seq += 1;
    interactions.push({
      id: `int-${String(seq).padStart(5, '0')}`,
      anonymousSessionId: session,
      destinationId: experience.destinationId,
      experienceId: experience.id,
      type: 'BOOKING',
      timestamp: createdAt,
      provenance: 'DEMO_SYNTHETIC',
      metadata: { experienceId: experience.id },
    });
  }

  return enquiries;
}

/** Partner reported availability for participating accommodation. */
function generateAccommodation(seed: Seed, rng: Rng): AccommodationSnapshot[] {
  const profileByDestination = new Map(seed.signalProfiles.map((p) => [p.destinationId, p]));
  const maxBase = Math.max(...seed.signalProfiles.map((p) => p.dailyInteractionBase));
  const snapshots: AccommodationSnapshot[] = [];

  const properties = seed.businesses.filter(
    (b) =>
      (b.businessType === 'HOTEL' || b.businessType === 'HOMESTAY') &&
      b.status === 'PARTICIPATING' &&
      typeof b.reportedCapacity === 'number' &&
      b.reportedCapacity > 0,
  );

  let seq = 0;
  for (const property of properties) {
    const profile = profileByDestination.get(property.destinationId);
    const demandShare = profile ? profile.dailyInteractionBase / maxBase : 0.3;
    const total = property.reportedCapacity ?? 0;

    for (let dayOffset = ACCOMMODATION_WINDOW_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = addDays(startOfUtcDay(DEMO_NOW), -dayOffset);
      const occupancy = Math.min(
        0.97,
        Math.max(
          0.05,
          0.3 + 0.45 * demandShare + (isWeekend(day) ? 0.12 : 0) + rng.float(-0.08, 0.08),
        ),
      );
      const available = Math.max(0, Math.round(total * (1 - occupancy)));

      seq += 1;
      snapshots.push({
        id: `acc-${String(seq).padStart(4, '0')}`,
        businessId: property.id,
        destinationId: property.destinationId,
        date: toIsoDate(day),
        totalCapacity: total,
        availableCapacity: available,
        occupancyRate: Number((1 - available / Math.max(1, total)).toFixed(3)),
        provenance: 'PARTNER_REPORTED',
      });
    }
  }

  return snapshots;
}

/** Reward distribution for completed campaigns, weighted by past delivery. */
function generatePayouts(seed: Seed): Payout[] {
  const payouts: Payout[] = [];
  const creatorById = new Map(seed.creators.map((c) => [c.id, c]));

  for (const campaign of seed.campaigns) {
    if (campaign.status !== 'COMPLETED') continue;
    const accepted = seed.applications.filter(
      (a) => a.campaignId === campaign.id && a.status === 'ACCEPTED',
    );
    if (accepted.length === 0) continue;

    const weights = accepted.map(
      (a) => (creatorById.get(a.creatorId)?.medianItineraryAdds ?? 50) + 50,
    );
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    accepted.forEach((application, index) => {
      const share = (weights[index] ?? 0) / totalWeight;
      payouts.push({
        id: `pay-${campaign.id}-${application.creatorId}`,
        campaignId: campaign.id,
        creatorId: application.creatorId,
        amount: Math.round((campaign.rewardPool * share) / 100) * 100,
        basis: 'Share of campaign reward pool, weighted by verified tourism outcomes',
        status: 'PAID',
        recordedAt: `${campaign.endDate}T00:00:00Z`,
        provenance: 'DEMO_SYNTHETIC',
      });
    });
  }

  return payouts;
}
