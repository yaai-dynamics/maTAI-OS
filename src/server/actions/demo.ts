'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/server/data/client';
import { seedDatabase } from '@/server/data/seed-database';
import { getState, reloadState, resetState } from '@/server/data/store';

/**
 * Returns the platform to its deterministic seeded state.
 *
 * With MySQL behind the store this has to restore the database, not just the
 * cache. Rebuilding the cache from the seed files alone would leave the written
 * rows in place and — worse — replace the database-backed state with one whose
 * writes never reach MySQL again. A demo that silently stopped persisting while
 * still looking correct is exactly the failure this product argues against.
 *
 * Re-seeding also restores the seeded rows a demo run modifies: a business that
 * was verified, an enquiry that was answered, availability that was reported.
 */
export async function resetDemo(): Promise<{ ok: boolean; error?: string }> {
  if (!getState().persistent) {
    // No database behind this process — rebuild the in-memory state.
    resetState();
    revalidatePath('/', 'layout');
    return { ok: true };
  }

  try {
    await seedDatabase(prisma);
    await reloadState();
  } catch (error) {
    console.error('[demo] reset failed', error);
    return { ok: false, error: 'Could not reset the demo data. Is the database reachable?' };
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}
