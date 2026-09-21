import { now } from '@/lib/config';
import { toIsoDate } from '@/lib/date';
import { getCampaigns } from '@/server/data/repository';

/**
 * Attributes a tourist signal to a campaign running for that destination today.
 *
 * Shared by the tourist actions and the booking ledger, so a paid booking is
 * credited to the same campaign as the request that led to it.
 */
export function activeCampaignFor(destinationId: string): string | undefined {
  const today = toIsoDate(now());
  return getCampaigns().find(
    (campaign) =>
      campaign.destinationId === destinationId &&
      campaign.status !== 'DRAFT' &&
      campaign.startDate <= today &&
      campaign.endDate >= today,
  )?.id;
}
