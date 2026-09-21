'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getActingBusinessId, NOT_SIGNED_IN } from '@/server/auth/session';
import { cancelByHost, completeBooking, respondToBooking } from '@/server/bookings/ledger';

/**
 * Host-side booking actions. The business always comes from the session; a
 * booking id belonging to another business is refused with the same message
 * as one that does not exist.
 */

const respondInput = z.object({
  bookingId: z.string().min(1).max(64),
  decision: z.enum(['ACCEPT', 'DECLINE']),
  message: z.string().trim().max(400).optional(),
});

const refresh = () => {
  revalidatePath('/partner', 'layout');
  revalidatePath('/explore/bookings');
  revalidatePath('/gov', 'layout');
};

export async function answerBookingRequest(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const parsed = respondInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose accept or decline.' };

  const result = await respondToBooking(
    businessId,
    parsed.data.bookingId,
    parsed.data.decision,
    parsed.data.message || undefined,
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

const cancelInput = z.object({
  bookingId: z.string().min(1).max(64),
  reason: z.string().trim().min(5, 'Tell the traveller why, in a few words.').max(400),
});

export async function cancelBookingAsHost(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Give a reason.' };

  const result = await cancelByHost(businessId, parsed.data.bookingId, parsed.data.reason);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

export async function markBookingCompleted(bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const result = await completeBooking(businessId, String(bookingId));
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}
