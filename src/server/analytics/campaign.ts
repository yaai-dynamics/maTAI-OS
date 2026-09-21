import { deriveConfidence, weakestProvenance, type Confidence, type Provenance } from '@/lib/provenance';
import { daysBetween } from '@/lib/date';
import { now } from '@/lib/config';
import type { Campaign, CampaignMetricName } from '@/lib/types';
import {
  getCampaign,
  getCampaignContent,
  getDestination,
  getEnquiries,
  getInteractions,
  getSeededCampaignMetrics,
} from '@/server/data/repository';
import { isSessionRecord } from '@/server/data/store';
import { makeWindow, percentChange, roundTo } from '@/server/analytics/windows';

/**
 * Campaign funnel.
 *
 * Reported in two blocks that are deliberately never divided into one another.
 *
 * Off-platform reach (views, watch time, clicks) is reported by the publishing
 * platform and is at real world social scale. Everything from the destination
 * page onwards is counted from platform interactions tagged with the campaign,
 * and covers only people who used this platform, which in a prototype is a very
 * small user base. Drawing them as a single continuous funnel would imply a
 * conversion rate that does not exist, so `block` keeps them apart and each is
 * scaled within itself.
 *
 * Movement during a campaign window is association, not causation. The
 * evaluation standard is documented as doc-007 in the knowledge base.
 */

export interface FunnelStep {
  metric: CampaignMetricName;
  label: string;
  value: number;
  provenance: Provenance;
  source: string;
  /** Which of the two scales this step belongs to. */
  block: 'REACH' | 'PLATFORM';
  /** How many of these were captured during the current session. */
  capturedThisSession: number;
}

export interface CampaignFunnel {
  campaign: Campaign;
  destinationName: string;
  steps: FunnelStep[];
  publishedContent: number;
  contentInReview: number;
  daysElapsed: number;
  daysTotal: number;
  /** Change in weighted destination activity vs the same length window before the campaign. */
  destinationActivityChangePercent: number | null;
  attributionStatement: string;
  scaleNote: string;
  provenance: Provenance;
  confidence: Confidence;
  caveats: string[];
}

const REACH_METRICS: CampaignMetricName[] = ['VIEWS', 'WATCH_TIME', 'CLICKS'];

const REACH_LABEL: Record<string, string> = {
  VIEWS: 'Content views',
  WATCH_TIME: 'Watch time (minutes)',
  CLICKS: 'Link clicks',
};

export function computeCampaignFunnel(campaignId: string): CampaignFunnel | undefined {
  const campaign = getCampaign(campaignId);
  if (!campaign) return undefined;

  const destination = getDestination(campaign.destinationId);
  const content = getCampaignContent({ campaignId });
  const seededMetrics = getSeededCampaignMetrics(campaignId);

  const start = new Date(`${campaign.startDate}T00:00:00Z`);
  const end = new Date(`${campaign.endDate}T23:59:59Z`);
  const today = now();
  const effectiveEnd = today < end ? today : end;

  const steps: FunnelStep[] = [];

  for (const metric of REACH_METRICS) {
    const value = seededMetrics
      .filter((m) => m.metric === metric)
      .reduce((sum, m) => sum + m.value, 0);
    steps.push({
      metric,
      label: REACH_LABEL[metric] ?? metric,
      value,
      provenance: 'DEMO_SYNTHETIC',
      source: 'Publishing platform reporting (synthetic in the prototype)',
      block: 'REACH',
      capturedThisSession: 0,
    });
  }

  const attributed = getInteractions({ campaignId, from: start, to: effectiveEnd });
  const platformSteps: { metric: CampaignMetricName; label: string; types: string[] }[] = [
    { metric: 'DESTINATION_PAGE_VISITS', label: 'Destination page visits', types: ['DESTINATION_VIEW'] },
    { metric: 'ITINERARY_ADDS', label: 'Itinerary additions', types: ['ITINERARY_ADD'] },
    { metric: 'CHECKINS', label: 'Verified check-ins', types: ['QR_CHECKIN'] },
    { metric: 'BOOKINGS', label: 'Booking requests and enquiries', types: ['BOOKING'] },
    // Every booking that was paid for, including any later cancelled: the
    // campaign did produce the sale, whatever happened afterwards.
    { metric: 'PAID_BOOKINGS', label: 'Paid bookings', types: ['BOOKING_CONFIRMED'] },
  ];

  const provenances: Provenance[] = ['DEMO_SYNTHETIC'];

  for (const step of platformSteps) {
    const matching = attributed.filter((i) => step.types.includes(i.type));
    for (const interaction of matching) provenances.push(interaction.provenance);
    steps.push({
      metric: step.metric,
      label: step.label,
      value: matching.length,
      provenance: matching.length > 0 ? weakestProvenance(matching.map((i) => i.provenance)) : 'DEMO_SYNTHETIC',
      source: 'Platform interactions tagged with this campaign',
      block: 'PLATFORM',
      capturedThisSession: matching.filter((i) => isSessionRecord(i.id)).length,
    });
  }

  // Destination activity before and during the campaign, for context only.
  const elapsedDays = Math.max(1, daysBetween(start, effectiveEnd) + 1);
  const duringWindow = makeWindow(elapsedDays, effectiveEnd);
  const beforeWindow = makeWindow(elapsedDays, new Date(start.getTime() - 1));
  const during = getInteractions({
    destinationId: campaign.destinationId,
    from: duringWindow.from,
    to: duringWindow.to,
  }).length;
  const before = getInteractions({
    destinationId: campaign.destinationId,
    from: beforeWindow.from,
    to: beforeWindow.to,
  }).length;
  const change = percentChange(during, before);

  const totalPlatformSignals = steps
    .filter((step) => !REACH_METRICS.includes(step.metric))
    .reduce((sum, step) => sum + step.value, 0);

  const provenance = weakestProvenance(provenances);

  const caveats = [
    'Movement during a campaign window is association, not attribution. No comparison destination or holdout period has been run.',
    'Content reach figures are synthetic in the prototype and would come from the publishing platform in a pilot.',
    'Platform steps count only people who used this platform, which is a small prototype user base, so they cannot be read as a share of reach.',
  ];
  if (campaign.status === 'DRAFT') {
    caveats.unshift('This campaign is still a draft and has not been launched, so no content has been published.');
  } else if (elapsedDays < 7) {
    caveats.unshift(
      `The campaign has been running for ${elapsedDays} day${elapsedDays === 1 ? '' : 's'}, which is too short a window to separate it from ordinary variation.`,
    );
  }

  return {
    campaign,
    destinationName: destination?.name ?? campaign.destinationId,
    steps,
    publishedContent: content.filter((c) => c.status === 'PUBLISHED').length,
    contentInReview: content.filter((c) => c.status === 'IN_REVIEW' || c.status === 'SUBMITTED').length,
    daysElapsed: campaign.status === 'DRAFT' ? 0 : elapsedDays,
    daysTotal: Math.max(1, daysBetween(start, end) + 1),
    destinationActivityChangePercent: change === null ? null : roundTo(change, 1),
    attributionStatement:
      'Reported as a funnel. The platform does not claim that the campaign caused the change.',
    scaleNote:
      'Reach is reported by the publishing platforms at real world scale. Platform steps cover only people who used this prototype. The two are shown separately and must not be divided into a conversion rate.',
    provenance,
    confidence: deriveConfidence({
      sources: [provenance],
      sampleSize: totalPlatformSignals,
      consistent: before > 0 && elapsedDays >= 7,
    }),
    caveats,
  };
}

/** Enquiries raised against businesses at the campaign destination during its window. */
export function countCampaignEnquiries(campaign: Campaign): number {
  const start = `${campaign.startDate}T00:00:00Z`;
  const end = `${campaign.endDate}T23:59:59Z`;
  return getEnquiries().filter((enquiry) => {
    if (enquiry.createdAt < start || enquiry.createdAt > end) return false;
    return true;
  }).length;
}
