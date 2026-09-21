import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/server/data/client';
import { loadState } from '@/server/data/load';
import { getFeedback, getInteractions } from '@/server/data/repository';
import { seedDatabase } from '@/server/data/seed-database';
import {
  getState,
  initState,
  recordInteraction,
  reloadState,
  submitFeedback,
} from '@/server/data/store';

/**
 * The MySQL write path.
 *
 * The unit suites run against the seed-built in-memory state, which is right
 * for testing computation but proves nothing about persistence. This suite
 * proves the part that actually changed: that a write survives the process.
 *
 * It skips itself when DATABASE_URL is absent so the rest of the suite stays
 * runnable without a database.
 */

const configured = Boolean(process.env.DATABASE_URL);

describe.skipIf(!configured)('MySQL persistence', () => {
  /** Ids written by this suite, removed afterwards. */
  const written: { interactions: string[]; feedback: string[] } = {
    interactions: [],
    feedback: [],
  };

  /** Row count of the untouched seeded dataset, taken before any write. */
  let seededFeedbackCount = 0;

  beforeAll(async () => {
    await initState();
    seededFeedbackCount = await prisma.feedback.count();
  });

  afterAll(async () => {
    // Leave the seeded database as we found it.
    if (written.feedback.length > 0) {
      await prisma.feedback.deleteMany({ where: { id: { in: written.feedback } } });
    }
    if (written.interactions.length > 0) {
      await prisma.tourismInteraction.deleteMany({ where: { id: { in: written.interactions } } });
    }
    await prisma.$disconnect();
  });

  it('loads the working set out of the database', () => {
    expect(getInteractions().length).toBeGreaterThan(1000);
    expect(getFeedback().length).toBeGreaterThan(100);
  });

  it('writes an interaction through to MySQL, not only to the cache', async () => {
    const interaction = await recordInteraction({
      anonymousSessionId: 'sess-integration',
      type: 'DESTINATION_VIEW',
      destinationId: 'dest-ukhrul',
    });
    written.interactions.push(interaction.id);

    const row = await prisma.tourismInteraction.findUnique({ where: { id: interaction.id } });

    expect(row).not.toBeNull();
    expect(row?.destinationId).toBe('dest-ukhrul');
    // Real use of the platform is observed, never synthetic, even in demo mode.
    expect(row?.provenance).toBe('PLATFORM_OBSERVED');
  });

  it('survives a reload, which is the whole point of the database', async () => {
    const entry = await submitFeedback({
      destinationId: 'dest-ukhrul',
      anonymousSessionId: 'sess-integration',
      rating: 2,
      category: 'TRANSPORT',
      text: 'Integration test: the shared taxi did not run.',
      sentiment: 'NEGATIVE',
    });
    written.feedback.push(entry.id);
    // submitFeedback also records a FEEDBACK interaction.
    const trailing = getInteractions().filter((i) => i.metadata?.['feedbackId'] === entry.id);
    written.interactions.push(...trailing.map((i) => i.id));

    // Re-read from MySQL rather than from the cache the write just updated.
    const reloaded = await loadState();

    expect(reloaded.feedback.some((f) => f.id === entry.id)).toBe(true);
    expect(reloaded.feedback.find((f) => f.id === entry.id)?.text).toContain('shared taxi');
  });

  it('keeps the cache and the database in agreement after a write', async () => {
    const reloaded = await loadState();
    expect(reloaded.feedback.length).toBe(getFeedback().length);
    expect(reloaded.interactions.length).toBe(getInteractions().length);
  });

  it('stays database-backed across a demo reset', async () => {
    const before = await prisma.feedback.count();

    const entry = await submitFeedback({
      destinationId: 'dest-kangla',
      anonymousSessionId: 'sess-integration',
      rating: 1,
      category: 'CLEANLINESS',
      text: 'Integration test: reset should remove this.',
      sentiment: 'NEGATIVE',
    });
    expect(await prisma.feedback.count()).toBe(before + 1);

    // What resetDemo does: restore the dataset, then re-read it.
    await seedDatabase(prisma);
    await reloadState();

    // The written row is gone and the seeded dataset is back. A re-seed clears
    // every row this suite wrote, not only this one, so the cleanup list is
    // now satisfied.
    written.feedback.length = 0;
    written.interactions.length = 0;

    expect(await prisma.feedback.findUnique({ where: { id: entry.id } })).toBeNull();
    expect(await prisma.feedback.count()).toBe(seededFeedbackCount);

    // The critical part: writes must still reach MySQL afterwards. Rebuilding
    // the cache from the seed files instead would leave a state whose writes
    // silently stop persisting.
    expect(getState().persistent).toBe(true);

    const after = await recordInteraction({
      anonymousSessionId: 'sess-integration',
      type: 'DESTINATION_VIEW',
      destinationId: 'dest-kangla',
    });
    written.interactions.push(after.id);
    expect(await prisma.tourismInteraction.findUnique({ where: { id: after.id } })).not.toBeNull();
  });

  it('enforces referential integrity rather than trusting the caller', async () => {
    await expect(
      prisma.feedback.create({
        data: {
          id: 'fb-orphan-test',
          destinationId: 'dest-does-not-exist',
          rating: 5,
          category: 'EXPERIENCE',
          text: 'Orphan',
          language: 'English',
          sentiment: 'POSITIVE',
          anonymized: true,
          createdAt: new Date(),
          provenance: 'DEMO_SYNTHETIC',
        },
      }),
    ).rejects.toThrow();
  });
});
