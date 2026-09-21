'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { now } from '@/lib/config';
import { campaignContentSchema, platformSchema, type CampaignContent } from '@/lib/types';
import { generateContentBrief, type ContentBrief } from '@/server/ai/creator-studio';
import { getActingCreatorId, NOT_SIGNED_IN } from '@/server/auth/session';
import { getApplications, getCampaign, getCreator } from '@/server/data/repository';
import { nextId, submitContent, upsertApplication } from '@/server/data/store';

/**
 * Creator-side writes.
 *
 * The acting creator is always the signed-in account's creator profile. None of
 * these accept a creator id from the caller: an id in a request is a claim
 * anyone can make.
 */

export async function applyToCampaign(
  campaignId: string,
  proposedConcept?: string,
): Promise<{ ok: boolean; error?: string }> {
  const creatorId = await getActingCreatorId();
  if (!creatorId) return { ok: false, error: NOT_SIGNED_IN };

  const campaign = getCampaign(campaignId);
  const creator = getCreator(creatorId);
  if (!campaign || !creator) return { ok: false, error: 'Campaign or creator not found.' };
  if (campaign.status === 'DRAFT') {
    return { ok: false, error: 'This campaign has not been launched yet.' };
  }
  if (campaign.status === 'COMPLETED' || campaign.status === 'CLOSED') {
    return { ok: false, error: 'This campaign is closed to new applications.' };
  }

  await upsertApplication({
    id: nextId('app-live'),
    campaignId,
    creatorId,
    status: 'APPLIED',
    submittedAt: now().toISOString(),
    provenance: 'DEMO_SYNTHETIC',
    ...(proposedConcept ? { proposedConcept } : {}),
  });

  revalidatePath('/creator', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true };
}

export async function buildBrief(
  campaignId: string,
): Promise<{ ok: boolean; error?: string; brief?: ContentBrief }> {
  const creatorId = await getActingCreatorId();
  if (!creatorId) return { ok: false, error: NOT_SIGNED_IN };

  const brief = await generateContentBrief(campaignId, creatorId);
  if (!brief) return { ok: false, error: 'That campaign is no longer available.' };
  return { ok: true, brief };
}

const contentInput = z.object({
  campaignId: z.string().min(1),
  title: z.string().min(3).max(140),
  platform: platformSchema,
  contentUrl: z.string().min(3).max(400),
  caption: z.string().min(10).max(2200),
  disclosure: z.string().min(3).max(200),
});

export async function submitCampaignContent(
  input: unknown,
): Promise<{ ok: boolean; error?: string; content?: CampaignContent }> {
  const creatorId = await getActingCreatorId();
  if (!creatorId) return { ok: false, error: NOT_SIGNED_IN };

  const parsed = contentInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Add a title, a content link, a caption and the paid-partnership disclosure.',
    };
  }

  // Disclosure is a review gate, not a formality: content without it is not
  // accepted, because a government campaign must be identifiable as one.
  if (!/partnership|paid|sponsor|collaboration|manipur tourism/i.test(parsed.data.disclosure)) {
    return {
      ok: false,
      error: 'The disclosure must state that this is a paid partnership with Manipur Tourism.',
    };
  }

  // Content is only accepted against a campaign the creator is actually on.
  // Without this, a signed-in creator could post into any campaign's review
  // queue — and eventually its payout proposals.
  const joined = getApplications({ campaignId: parsed.data.campaignId, creatorId }).some(
    (application) => application.status !== 'DECLINED' && application.status !== 'WITHDRAWN',
  );
  if (!joined) {
    return { ok: false, error: 'Apply to this campaign before submitting content for it.' };
  }

  const content = campaignContentSchema.parse({
    ...parsed.data,
    creatorId,
    id: nextId('content-live'),
    status: 'SUBMITTED',
    submittedAt: now().toISOString(),
    provenance: 'DEMO_SYNTHETIC',
  });

  await submitContent(content);
  revalidatePath('/creator', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, content };
}
