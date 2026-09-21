'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { now } from '@/lib/config';
import { toIsoDate } from '@/lib/date';
import { addDays } from '@/lib/date';
import { campaignSchema, platformSchema, type Campaign, type GovernmentAnswer } from '@/lib/types';
import { can, refusalMessage } from '@/lib/roles';
import { getGovernmentRole } from '@/server/auth/session';
import { askManipurTourism } from '@/server/ai/government-analyst';
import { getCampaign, getCreator } from '@/server/data/repository';
import { createCampaign, nextId, updateCampaign, upsertApplication } from '@/server/data/store';

/** Government-side writes and the natural-language question entry point. */

export async function askQuestion(
  question: string,
): Promise<{ ok: boolean; error?: string; answer?: GovernmentAnswer }> {
  if (!question.trim()) return { ok: false, error: 'Type a question.' };
  const answer = await askManipurTourism(question.trim());
  return { ok: true, answer };
}

const campaignInput = z.object({
  name: z.string().min(3).max(120),
  objective: z.string().min(10).max(600),
  destinationId: z.string().min(1),
  targetAudience: z.string().min(3).max(200),
  audienceAgeBand: z.string().min(3).max(20),
  platforms: z.array(platformSchema).min(1),
  rewardPool: z.coerce.number().int().min(0).max(10_000_000),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
  contentRequirement: z.string().min(3).max(300),
  themes: z.array(z.string()).default([]),
  preferredLanguages: z.array(z.string()).default([]),
});

export async function createNewCampaign(
  input: unknown,
): Promise<{ ok: boolean; error?: string; campaign?: Campaign }> {
  const role = await getGovernmentRole();
  if (!can(role, 'campaign:create')) {
    return { ok: false, error: refusalMessage(role, 'campaign:create') };
  }

  const parsed = campaignInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the campaign details and try again.',
    };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, error: 'The end date cannot be before the start date.' };
  }

  const campaign = campaignSchema.parse({
    ...parsed.data,
    id: nextId('camp-live'),
    status: 'OPEN',
    createdBy: 'Tourism Department (demo)',
    createdAt: now().toISOString(),
    // A campaign created in the prototype is prototype data, and says so.
    provenance: 'DEMO_SYNTHETIC',
  });

  await createCampaign(campaign);
  revalidatePath('/gov', 'layout');
  revalidatePath('/creator', 'layout');
  return { ok: true, campaign };
}

/**
 * Launches a drafted campaign.
 *
 * The department drafts a brief, reviews the matched creators and then decides.
 * Launching moves it to OPEN so creators can see it, and dates the start from
 * today if the draft start has already passed.
 */
export async function launchCampaign(
  campaignId: string,
): Promise<{ ok: boolean; error?: string; campaign?: Campaign }> {
  const role = await getGovernmentRole();
  if (!can(role, 'campaign:launch')) {
    return { ok: false, error: refusalMessage(role, 'campaign:launch') };
  }

  const campaign = getCampaign(campaignId);
  if (!campaign) return { ok: false, error: 'That campaign no longer exists.' };
  if (campaign.status !== 'DRAFT') {
    return { ok: false, error: `This campaign is already ${campaign.status.toLowerCase()}.` };
  }

  const today = toIsoDate(now());
  const updated = await updateCampaign(campaignId, {
    status: 'OPEN',
    startDate: campaign.startDate < today ? today : campaign.startDate,
    endDate: campaign.endDate < today ? toIsoDate(addDays(now(), 14)) : campaign.endDate,
  });

  revalidatePath('/gov', 'layout');
  revalidatePath('/creator', 'layout');
  return updated ? { ok: true, campaign: updated } : { ok: false, error: 'Could not launch the campaign.' };
}

export async function inviteCreator(
  campaignId: string,
  creatorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const role = await getGovernmentRole();
  if (!can(role, 'creator:invite')) {
    return { ok: false, error: refusalMessage(role, 'creator:invite') };
  }

  const campaign = getCampaign(campaignId);
  const creator = getCreator(creatorId);
  if (!campaign || !creator) return { ok: false, error: 'Campaign or creator not found.' };

  await upsertApplication({
    id: nextId('app-live'),
    campaignId,
    creatorId,
    status: 'INVITED',
    submittedAt: now().toISOString(),
    provenance: 'DEMO_SYNTHETIC',
  });

  revalidatePath('/gov', 'layout');
  revalidatePath('/creator', 'layout');
  return { ok: true };
}
