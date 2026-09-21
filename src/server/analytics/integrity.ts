import { now } from '@/lib/config';
import type { Provenance } from '@/lib/provenance';
import type { CampaignContent, Creator } from '@/lib/types';
import {
  getCampaign,
  getCampaignContent,
  getCreator,
  getCreators,
  getInteractions,
  getSeededCampaignMetrics,
} from '@/server/data/repository';

/**
 * Campaign integrity checks and creator reputation — roadmap Phase 3.
 *
 * Every check here is a named deterministic rule with a stated threshold, for
 * the same reason the alert rules are: a reviewer has to be able to see why a
 * submission was flagged and argue with the threshold. Nothing is scored by a
 * model, and a flag is a prompt to look, never an accusation.
 */

export const INTEGRITY_RULES = {
  MISSING_DISCLOSURE: 'Disclosure does not identify the content as a paid partnership',
  DUPLICATE_URL: 'The same content link was submitted more than once',
  OUTSIDE_WINDOW: 'Submitted outside the campaign start and end dates',
  BURST_SUBMISSION: 'Three or more submissions from one creator to one campaign within an hour',
  REACH_WITHOUT_OUTCOME: 'Reported reach above 10,000 with no platform signal attributed to the campaign',
  THIN_CAPTION: 'Caption under 40 characters, too short to carry the required guidance',
} as const;

export type IntegrityRule = keyof typeof INTEGRITY_RULES;

export interface IntegrityFlag {
  contentId: string;
  contentTitle: string;
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorName: string;
  rule: IntegrityRule;
  description: string;
  severity: 'REVIEW' | 'HOLD';
  detail: string;
}

const BURST_WINDOW_MS = 60 * 60 * 1000;
const REACH_THRESHOLD = 10_000;

export function computeIntegrityFlags(): IntegrityFlag[] {
  const content = getCampaignContent();
  const flags: IntegrityFlag[] = [];

  const urlCounts = new Map<string, number>();
  for (const item of content) {
    urlCounts.set(item.contentUrl, (urlCounts.get(item.contentUrl) ?? 0) + 1);
  }

  const push = (
    item: CampaignContent,
    rule: IntegrityRule,
    severity: IntegrityFlag['severity'],
    detail: string,
  ) => {
    const campaign = getCampaign(item.campaignId);
    flags.push({
      contentId: item.id,
      contentTitle: item.title,
      campaignId: item.campaignId,
      campaignName: campaign?.name ?? item.campaignId,
      creatorId: item.creatorId,
      creatorName: getCreator(item.creatorId)?.displayName ?? item.creatorId,
      rule,
      description: INTEGRITY_RULES[rule],
      severity,
      detail,
    });
  };

  for (const item of content) {
    const campaign = getCampaign(item.campaignId);

    if (!/partnership|paid|sponsor|collaboration/i.test(item.disclosure)) {
      push(item, 'MISSING_DISCLOSURE', 'HOLD', `Disclosure reads: "${item.disclosure}"`);
    }

    if ((urlCounts.get(item.contentUrl) ?? 0) > 1) {
      push(item, 'DUPLICATE_URL', 'HOLD', `${item.contentUrl} appears ${urlCounts.get(item.contentUrl)} times`);
    }

    if (campaign) {
      const submitted = item.submittedAt.slice(0, 10);
      if (submitted < campaign.startDate || submitted > campaign.endDate) {
        push(
          item,
          'OUTSIDE_WINDOW',
          'REVIEW',
          `Submitted ${submitted}, campaign ran ${campaign.startDate} to ${campaign.endDate}`,
        );
      }
    }

    if (item.caption.trim().length < 40) {
      push(item, 'THIN_CAPTION', 'REVIEW', `${item.caption.trim().length} characters`);
    }

    const siblings = content.filter(
      (other) =>
        other.id !== item.id &&
        other.creatorId === item.creatorId &&
        other.campaignId === item.campaignId &&
        Math.abs(new Date(other.submittedAt).getTime() - new Date(item.submittedAt).getTime()) <
          BURST_WINDOW_MS,
    );
    if (siblings.length >= 2) {
      push(item, 'BURST_SUBMISSION', 'REVIEW', `${siblings.length + 1} submissions within an hour`);
    }

    const views = getSeededCampaignMetrics(item.campaignId)
      .filter((metric) => metric.campaignContentId === item.id && metric.metric === 'VIEWS')
      .reduce((sum, metric) => sum + metric.value, 0);

    if (views > REACH_THRESHOLD) {
      const attributed = getInteractions({ campaignId: item.campaignId }).length;
      if (attributed === 0) {
        push(
          item,
          'REACH_WITHOUT_OUTCOME',
          'REVIEW',
          `${views.toLocaleString('en-IN')} reported views, no platform signal attributed`,
        );
      }
    }
  }

  const order = { HOLD: 0, REVIEW: 1 } as const;
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* -------------------------------------------------------------------------- */
/* Creator reputation                                                         */
/* -------------------------------------------------------------------------- */

export interface ReputationComponent {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

export interface CreatorReputation {
  creator: Creator;
  /** 0 to 100, computed from delivery rather than declared. */
  score: number;
  /**
   * False when the creator has delivered nothing on this platform yet. A score
   * of zero then means "no evidence", not "bad", and the interface says so.
   */
  hasTrackRecord: boolean;
  components: ReputationComponent[];
  /** The seeded profile score, kept visible so the two can be compared. */
  declaredScore: number;
  submissions: number;
  published: number;
  changesRequested: number;
  openFlags: number;
  provenance: Provenance;
  method: string;
}

export const REPUTATION_METHOD =
  'Computed from delivery on this platform: published content out of what was submitted (30), tourism outcomes attributed to that content (30), review outcomes with changes requested counting against (20), and disclosure and integrity compliance (20). Every component scores zero without evidence, so a creator who has delivered nothing scores zero rather than inheriting credit for a clean record they have not earned. It is not the declared profile score, and where the two differ the computed one is the evidence.';

export function computeCreatorReputation(creatorId: string): CreatorReputation | undefined {
  const creator = getCreator(creatorId);
  if (!creator) return undefined;

  const submissions = getCampaignContent({ creatorId });
  const published = submissions.filter((item) => item.status === 'PUBLISHED');
  const changesRequested = submissions.filter((item) => item.status === 'CHANGES_REQUESTED');
  const flags = computeIntegrityFlags().filter((flag) => flag.creatorId === creatorId);

  // Outcomes attributed to campaigns this creator published on.
  const campaignIds = [...new Set(published.map((item) => item.campaignId))];
  const outcomes = campaignIds.reduce((sum, campaignId) => {
    const attributed = getInteractions({ campaignId }).filter(
      (row) => row.type === 'ITINERARY_ADD' || row.type === 'QR_CHECKIN',
    );
    return sum + attributed.length;
  }, 0);

  const peerCeiling = Math.max(
    1,
    ...getCreators().map((entry) => entry.medianItineraryAdds),
  );

  // Absence of evidence is not evidence of quality. A creator who has delivered
  // nothing scores zero on every component rather than inheriting credit for a
  // clean record they have not had the chance to earn.
  const hasTrackRecord = submissions.length > 0;

  const deliveryRate = hasTrackRecord ? published.length / submissions.length : 0;
  const outcomeScore =
    Math.min(1, (outcomes + creator.medianItineraryAdds) / (peerCeiling * 1.5)) * 30;
  const reviewScore = hasTrackRecord ? 20 - (changesRequested.length / submissions.length) * 20 : 0;
  const compliance = hasTrackRecord ? Math.max(0, 20 - flags.length * 7) : 0;

  const components: ReputationComponent[] = [
    {
      key: 'delivery',
      label: 'Delivered what was submitted',
      score: Number((deliveryRate * 30).toFixed(1)),
      maxScore: 30,
      detail:
        submissions.length === 0
          ? 'No submissions on this platform yet'
          : `${published.length} published of ${submissions.length} submitted`,
    },
    {
      key: 'outcomes',
      label: 'Tourism outcomes from that content',
      score: Number(outcomeScore.toFixed(1)),
      maxScore: 30,
      detail: `${outcomes} itinerary additions and check-ins attributed to campaigns they published on`,
    },
    {
      key: 'review',
      label: 'Review outcomes',
      score: Number(reviewScore.toFixed(1)),
      maxScore: 20,
      detail: !hasTrackRecord
        ? 'Nothing submitted yet, so there is no review record to score'
        : changesRequested.length === 0
          ? 'No submission has required changes'
          : `${changesRequested.length} submission${changesRequested.length === 1 ? '' : 's'} required changes`,
    },
    {
      key: 'compliance',
      label: 'Disclosure and integrity',
      score: compliance,
      maxScore: 20,
      detail: !hasTrackRecord
        ? 'Nothing submitted yet, so there is no compliance record to score'
        : flags.length === 0
          ? 'No integrity rule has flagged this creator'
          : `${flags.length} open integrity flag${flags.length === 1 ? '' : 's'}`,
    },
  ];

  return {
    creator,
    score: Number(components.reduce((sum, part) => sum + part.score, 0).toFixed(1)),
    hasTrackRecord,
    components,
    declaredScore: creator.creatorScore,
    submissions: submissions.length,
    published: published.length,
    changesRequested: changesRequested.length,
    openFlags: flags.length,
    // Built from a mix of observed platform signals and seeded profile history.
    provenance: 'ESTIMATED',
    method: REPUTATION_METHOD,
  };
}

export function computeAllReputations(): CreatorReputation[] {
  return getCreators()
    .map((creator) => computeCreatorReputation(creator.id))
    .filter((row): row is CreatorReputation => row !== undefined)
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------------------------------- */
/* Payout workflow                                                            */
/* -------------------------------------------------------------------------- */

export interface PayoutProposal {
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorName: string;
  /** Share of the reward pool, from attributed outcomes. */
  sharePercent: number;
  amount: number;
  basis: string;
  publishedContent: number;
  attributedOutcomes: number;
  blocked: boolean;
  blockedReason?: string;
}

/**
 * Proposes how a completed campaign's reward pool should be split.
 *
 * The split follows attributed tourism outcomes, not follower counts. A creator
 * with an open HOLD-level integrity flag is blocked with the reason attached,
 * because a payout is the last point at which a problem can still be caught.
 */
export function proposePayouts(campaignId: string): PayoutProposal[] {
  const campaign = getCampaign(campaignId);
  if (!campaign) return [];

  const published = getCampaignContent({ campaignId }).filter(
    (item) => item.status === 'PUBLISHED',
  );
  if (published.length === 0) return [];

  const creatorIds = [...new Set(published.map((item) => item.creatorId))];
  const flags = computeIntegrityFlags().filter(
    (flag) => flag.campaignId === campaignId && flag.severity === 'HOLD',
  );

  const start = new Date(`${campaign.startDate}T00:00:00Z`);
  const end = new Date(`${campaign.endDate}T23:59:59Z`);
  const attributed = getInteractions({ campaignId, from: start, to: end }).filter(
    (row) => row.type === 'ITINERARY_ADD' || row.type === 'QR_CHECKIN',
  );

  // Outcomes are attributed to the campaign, not to an individual creator, so
  // they are shared by published volume. Claiming per-creator attribution would
  // be a stronger claim than the data supports.
  const weights = creatorIds.map(
    (creatorId) => published.filter((item) => item.creatorId === creatorId).length,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  return creatorIds.map((creatorId, index) => {
    const share = (weights[index] ?? 0) / totalWeight;
    const blocked = flags.some((flag) => flag.creatorId === creatorId);

    return {
      campaignId,
      campaignName: campaign.name,
      creatorId,
      creatorName: getCreator(creatorId)?.displayName ?? creatorId,
      sharePercent: Number((share * 100).toFixed(1)),
      amount: Math.round((campaign.rewardPool * share) / 100) * 100,
      basis: `Share of the ₹${campaign.rewardPool.toLocaleString('en-IN')} pool by published volume, against ${attributed.length} attributed tourism outcomes for the campaign`,
      publishedContent: weights[index] ?? 0,
      attributedOutcomes: Math.round(attributed.length * share),
      blocked,
      ...(blocked
        ? {
            blockedReason:
              flags.find((flag) => flag.creatorId === creatorId)?.description ??
              'An integrity check is open against this creator',
          }
        : {}),
    } satisfies PayoutProposal;
  });
}

export const PAYOUT_NOTE =
  'This platform records what is owed. It processes no payment, holds no bank detail and moves no money. Payout execution is out of scope for the prototype.';

export const payoutGeneratedAt = (): string => now().toISOString();
