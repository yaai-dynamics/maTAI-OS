'use server';

import { revalidatePath } from 'next/cache';

import { now } from '@/lib/config';
import { can, refusalMessage } from '@/lib/roles';
import type { Payout } from '@/lib/types';
import { proposePayouts } from '@/server/analytics/integrity';
import { getGovernmentRole } from '@/server/auth/session';
import { getPayouts } from '@/server/data/repository';
import { getState, nextId } from '@/server/data/store';

/**
 * Payout workflow — roadmap Phase 3.
 *
 * The platform records what is owed and who approved it. It processes no
 * payment, holds no bank detail and moves no money; payout execution is out of
 * scope for the prototype and would sit behind the department's own financial
 * controls in any case.
 *
 * A proposal with an open HOLD-level integrity flag cannot be approved, because
 * approval is the last point at which a problem can still be caught.
 */

export async function approvePayout(
  campaignId: string,
  creatorId: string,
): Promise<{ ok: boolean; error?: string; payout?: Payout }> {
  const role = await getGovernmentRole();
  if (!can(role, 'payout:approve')) {
    return { ok: false, error: refusalMessage(role, 'payout:approve') };
  }

  const proposal = proposePayouts(campaignId).find((row) => row.creatorId === creatorId);
  if (!proposal) return { ok: false, error: 'There is nothing to approve for this creator.' };
  if (proposal.blocked) {
    return {
      ok: false,
      error: `Blocked: ${proposal.blockedReason}. Resolve the integrity check before approving.`,
    };
  }

  const existing = getPayouts(creatorId).find((row) => row.campaignId === campaignId);
  if (existing && existing.status !== 'PENDING_REVIEW') {
    return { ok: false, error: `This payout is already ${existing.status.toLowerCase()}.` };
  }

  const state = getState();
  const payout: Payout = {
    id: existing?.id ?? nextId('pay-live'),
    campaignId,
    creatorId,
    amount: proposal.amount,
    basis: proposal.basis,
    status: 'APPROVED',
    recordedAt: now().toISOString(),
    provenance: 'DEMO_SYNTHETIC',
  };

  const index = state.payouts.findIndex((row) => row.id === payout.id);
  if (index >= 0) state.payouts[index] = payout;
  else state.payouts.push(payout);
  state.sessionRecordIds.add(payout.id);

  revalidatePath('/gov', 'layout');
  revalidatePath('/creator', 'layout');
  return { ok: true, payout };
}
