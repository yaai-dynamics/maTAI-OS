'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { can, refusalMessage } from '@/lib/roles';
import { creatorSchema, platformSchema, type Creator } from '@/lib/types';
import { getCreator, getDistricts } from '@/server/data/repository';
import { isEmailRegistered } from '@/server/auth/accounts';
import { credentialsSchema, openAccountAndSignIn } from '@/server/auth/registration';
import { getGovernmentRole } from '@/server/auth/session';
import { nextId, registerCreator, updateCreator } from '@/server/data/store';

/**
 * Verified creator onboarding — roadmap Phase 3.
 *
 * A new creator starts unverified with a declared score of zero. Reputation on
 * this platform is earned from delivery (see analytics/integrity.ts), so a
 * creator cannot arrive with one, and a creator awaiting verification is not
 * shortlisted for a campaign: shortlisting is a departmental endorsement and
 * should not precede the check.
 *
 * Onboarding opens the creator's account and signs them in, bound to the
 * profile it just created. The email is the account's, not the public profile's,
 * and is never shown to the department alongside campaign analytics.
 */

const onboardingInput = z.object({
  displayName: z.string().min(3).max(120),
  homeDistrict: z.string().min(2).max(60),
  bio: z.string().max(400).optional(),
  categories: z.array(z.string()).min(1),
  languages: z.array(z.string()).min(1),
  platforms: z.array(platformSchema).min(1),
  audienceSummary: z.string().min(5).max(200),
  audienceAgeBand: z.string().min(3).max(20),
}).merge(credentialsSchema.omit({ contactName: true }));

export async function onboardCreator(
  input: unknown,
): Promise<{ ok: boolean; error?: string; creator?: Creator }> {
  const parsed = onboardingInput.safeParse(input);
  if (!parsed.success) {
    const credentialIssue = parsed.error.issues.find((issue) =>
      ['email', 'password'].includes(String(issue.path[0])),
    );
    return {
      ok: false,
      error:
        credentialIssue?.message ??
        'Enter a name, your district, at least one category, language and platform.',
    };
  }

  const districts = getDistricts().map((district) => district.name.toLowerCase());
  if (!districts.includes(parsed.data.homeDistrict.toLowerCase())) {
    return { ok: false, error: 'Choose a district of Manipur.' };
  }

  if (await isEmailRegistered(parsed.data.email)) {
    return { ok: false, error: 'An account with that email already exists. Sign in instead.' };
  }

  const { email, password, ...profile } = parsed.data;

  const creator = creatorSchema.parse({
    ...profile,
    id: nextId('creator-live'),
    // Reputation is earned from delivery, so a new creator starts at zero.
    creatorScore: 0,
    campaignsCompleted: 0,
    medianItineraryAdds: 0,
    audienceRegions: [],
    status: 'PENDING_VERIFICATION',
    verified: false,
    provenance: 'PARTNER_REPORTED',
  });

  await registerCreator(creator);

  const opened = await openAccountAndSignIn({
    kind: 'CREATOR',
    email,
    password,
    displayName: creator.displayName,
    creatorId: creator.id,
  });
  if (!opened.ok) return { ok: false, error: opened.error };

  revalidatePath('/creator', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, creator };
}

export async function verifyCreator(
  creatorId: string,
  decision: 'VERIFY' | 'REJECT',
): Promise<{ ok: boolean; error?: string; creator?: Creator }> {
  const role = await getGovernmentRole();
  if (!can(role, 'creator:verify')) {
    return { ok: false, error: refusalMessage(role, 'creator:verify') };
  }

  if (!getCreator(creatorId)) return { ok: false, error: 'That creator is not on the platform.' };

  const updated = await updateCreator(creatorId, {
    verified: decision === 'VERIFY',
    status: decision === 'VERIFY' ? 'ACTIVE' : 'INACTIVE',
  });

  revalidatePath('/creator', 'layout');
  revalidatePath('/gov', 'layout');
  return updated ? { ok: true, creator: updated } : { ok: false, error: 'Could not update.' };
}
