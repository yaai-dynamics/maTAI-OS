import type { Provenance } from '@/lib/provenance';
import type { Campaign, CampaignContent, CampaignMetricName, Creator, Payout } from '@/lib/types';
import { matchCreators } from '@/server/analytics/matching';
import {
  getApplications,
  getCampaigns,
  getCampaign,
  getCampaignContent,
  getCreator,
  getDestination,
  getInteractions,
  getPayouts,
  getSeededCampaignMetrics,
} from '@/server/data/repository';
import { isSessionRecord } from '@/server/data/store';

/**
 * Creator analytics for C1 and C5.
 *
 * Reach comes from the publishing platforms and is synthetic in the prototype.
 * Tourism outcomes are counted from platform interactions tagged with the
 * creator's campaigns, which is the measure the reward is actually based on:
 * a creator is paid for tourism interest, not for impressions.
 */

export interface CreatorMetric {
  metric: CampaignMetricName | 'REWARD';
  label: string;
  value: number;
  provenance: Provenance;
  note: string;
  capturedThisSession?: number;
}

export interface CampaignPerformance {
  campaign: Campaign;
  destinationName: string;
  content: CampaignContent[];
  views: number;
  clicks: number;
  destinationVisits: number;
  itineraryAdds: number;
  checkins: number;
  enquiries: number;
  reward: number;
  rewardStatus: Payout['status'] | 'NOT_YET_EARNED';
  capturedThisSession: number;
}

export interface CreatorPerformance {
  creator: Creator;
  campaigns: CampaignPerformance[];
  totals: CreatorMetric[];
  earnings: { paid: number; pending: number };
  applicationCount: number;
  publishedCount: number;
  inReviewCount: number;
}

const sumMetric = (campaignId: string, contentIds: Set<string>, metric: CampaignMetricName): number =>
  getSeededCampaignMetrics(campaignId)
    .filter((row) => row.metric === metric && contentIds.has(row.campaignContentId))
    .reduce((sum, row) => sum + row.value, 0);

export function computeCreatorPerformance(creatorId: string): CreatorPerformance | undefined {
  const creator = getCreator(creatorId);
  if (!creator) return undefined;

  const applications = getApplications({ creatorId });
  const payouts = getPayouts(creatorId);
  const campaignIds = [
    ...new Set([
      ...applications.map((application) => application.campaignId),
      ...getCampaignContent({ creatorId }).map((content) => content.campaignId),
    ]),
  ];

  const campaigns: CampaignPerformance[] = [];

  for (const campaignId of campaignIds) {
    const campaign = getCampaign(campaignId);
    if (!campaign) continue;

    const content = getCampaignContent({ campaignId, creatorId });
    const contentIds = new Set(content.map((row) => row.id));
    const published = content.filter((row) => row.status === 'PUBLISHED');

    const start = new Date(`${campaign.startDate}T00:00:00Z`);
    const end = new Date(`${campaign.endDate}T23:59:59Z`);
    const attributed = getInteractions({ campaignId, from: start, to: end });

    // Attribution is shared evenly between the creators who published on the
    // campaign. Nothing here claims an individual creator caused a given visit.
    const publishingCreators = new Set(
      getCampaignContent({ campaignId })
        .filter((row) => row.status === 'PUBLISHED')
        .map((row) => row.creatorId),
    );
    const share = published.length > 0 && publishingCreators.size > 0 ? 1 / publishingCreators.size : 0;

    const countOf = (type: string) =>
      Math.round(attributed.filter((row) => row.type === type).length * share);

    const payout = payouts.find((row) => row.campaignId === campaignId);

    campaigns.push({
      campaign,
      destinationName: getDestination(campaign.destinationId)?.name ?? campaign.destinationId,
      content,
      views: sumMetric(campaignId, contentIds, 'VIEWS'),
      clicks: sumMetric(campaignId, contentIds, 'CLICKS'),
      destinationVisits: countOf('DESTINATION_VIEW'),
      itineraryAdds: countOf('ITINERARY_ADD'),
      checkins: countOf('QR_CHECKIN'),
      enquiries: countOf('BOOKING'),
      reward: payout?.amount ?? 0,
      rewardStatus: payout?.status ?? 'NOT_YET_EARNED',
      capturedThisSession: attributed.filter((row) => isSessionRecord(row.id)).length,
    });
  }

  campaigns.sort((a, b) => b.campaign.startDate.localeCompare(a.campaign.startDate));

  const total = (key: keyof CampaignPerformance) =>
    campaigns.reduce((sum, row) => sum + (typeof row[key] === 'number' ? (row[key] as number) : 0), 0);

  const paid = payouts.filter((row) => row.status === 'PAID').reduce((sum, row) => sum + row.amount, 0);
  const pending = payouts
    .filter((row) => row.status !== 'PAID')
    .reduce((sum, row) => sum + row.amount, 0);

  const allContent = getCampaignContent({ creatorId });
  const liveCaptured = campaigns.reduce((sum, row) => sum + row.capturedThisSession, 0);

  const totals: CreatorMetric[] = [
    {
      metric: 'VIEWS',
      label: 'Views',
      value: total('views'),
      provenance: 'DEMO_SYNTHETIC',
      note: 'Reported by the publishing platform. Synthetic in the prototype.',
    },
    {
      metric: 'CLICKS',
      label: 'Link clicks',
      value: total('clicks'),
      provenance: 'DEMO_SYNTHETIC',
      note: 'Reported by the publishing platform. Synthetic in the prototype.',
    },
    {
      metric: 'DESTINATION_PAGE_VISITS',
      label: 'Destination page visits',
      value: total('destinationVisits'),
      provenance: 'PLATFORM_OBSERVED',
      note: 'Counted on this platform and shared between the creators publishing on the campaign.',
      capturedThisSession: liveCaptured,
    },
    {
      metric: 'ITINERARY_ADDS',
      label: 'Itinerary additions',
      value: total('itineraryAdds'),
      provenance: 'PLATFORM_OBSERVED',
      note: 'A traveller put the destination on a plan. This is the measure rewards are based on.',
    },
    {
      metric: 'CHECKINS',
      label: 'Verified check-ins',
      value: total('checkins'),
      provenance: 'PLATFORM_OBSERVED',
      note: 'A consented check-in at the destination.',
    },
    {
      metric: 'BOOKINGS',
      label: 'Enquiries to local providers',
      value: total('enquiries'),
      provenance: 'PLATFORM_OBSERVED',
      note: 'Enquiries raised with a participating local business.',
    },
    {
      metric: 'REWARD',
      label: 'Earnings',
      value: paid + pending,
      provenance: 'DEMO_SYNTHETIC',
      note: 'Prototype reward record. No payment is processed by this platform.',
    },
  ];

  return {
    creator,
    campaigns,
    totals,
    earnings: { paid, pending },
    applicationCount: applications.length,
    publishedCount: allContent.filter((row) => row.status === 'PUBLISHED').length,
    inReviewCount: allContent.filter((row) => row.status === 'SUBMITTED' || row.status === 'IN_REVIEW')
      .length,
  };
}

/** Campaigns a creator has not applied to, ranked by how well they fit. */
export function recommendedCampaignsFor(creatorId: string): {
  campaign: Campaign;
  destinationName: string;
  score: number;
  highlights: string[];
}[] {
  const creator = getCreator(creatorId);
  if (!creator) return [];

  const applied = new Set(getApplications({ creatorId }).map((application) => application.campaignId));

  return getCampaigns()
    .filter((campaign) => campaign.status === 'OPEN' || campaign.status === 'IN_PROGRESS')
    .filter((campaign) => !applied.has(campaign.id))
    .map((campaign) => {
      // Reuse the same deterministic matcher the department sees, so a creator
      // is never shown a different score from the one used to shortlist them.
      const match = matchCreators(campaign, 20).find((row) => row.creator.id === creatorId);
      return {
        campaign,
        destinationName: getDestination(campaign.destinationId)?.name ?? campaign.destinationId,
        score: match?.totalScore ?? 0,
        highlights: match?.highlights ?? [],
      };
    })
    .sort((a, b) => b.score - a.score);
}
