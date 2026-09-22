import { beforeEach, describe, expect, it } from 'vitest';

import { factsPrompt, readGroundedAnswer } from '@/lib/ai/web-media';
import { runDiscoverChat } from '@/server/ai/discover';
import { buildItinerary, extractTripProfile } from '@/server/ai/trip-planner';
import { resetState } from '@/server/data/store';

/**
 * The Discover chat's routing and the web lookup's filtering. The provider is
 * mock (vitest.config.mts), so replies are the deterministic drafts, and no
 * test here reaches the network.
 */

beforeEach(() => resetState());

describe('Discover chat routing', () => {
  it('introduces a named place once, with its artwork and no repeated cards', async () => {
    const answer = await runDiscoverChat('Tell me about Loktak Lake');
    expect(answer.kind).toBe('place');
    expect(answer.hero).toBe('dest-loktak');
    expect(answer.destinationIds).toEqual([]);
    expect(answer.focus).toEqual({ destinationId: 'dest-loktak' });
  });

  it('answers a nameless follow-up about the place in focus, without its cards again', async () => {
    const answer = await runDiscoverChat('when should I go?', { destinationId: 'dest-loktak' });
    expect(answer.kind).toBe('practical');
    expect(answer.hero).toBeUndefined();
    expect(answer.destinationIds).toEqual([]);
    expect(answer.focus).toEqual({ destinationId: 'dest-loktak' });
  });

  it('reads "how long should I stay" as timing, not as booking a stay', async () => {
    const answer = await runDiscoverChat('how long should I stay?', { destinationId: 'dest-loktak' });
    expect(answer.kind).toBe('practical');
  });

  it('sends a request for photos or videos to the web lookup, for the known place only', async () => {
    const answer = await runDiscoverChat('show me photos and videos online', { destinationId: 'dest-loktak' });
    expect(answer.kind).toBe('online');
    expect(answer.lookUpOnline).toEqual({ destinationId: 'dest-loktak' });
  });

  it('lists what can be done at the place in focus', async () => {
    const answer = await runDiscoverChat('what can I do there?', { destinationId: 'dest-loktak' });
    expect(answer.kind).toBe('experiences');
    expect(answer.experienceIds.length).toBeGreaterThan(0);
  });

  it('moves every place reply towards planning a trip that includes it', async () => {
    const answer = await runDiscoverChat('Tell me about Loktak Lake');
    const plan = answer.actions.find((action) => action.kind === 'link' && action.value.startsWith('/explore?plan='));
    expect(plan).toBeDefined();
    expect(decodeURIComponent(plan!.value)).toContain('Loktak Lake');
    expect(answer.actions.some((action) => action.kind === 'online' && action.destinationId === 'dest-loktak')).toBe(true);
  });

  it('falls back to a list for an open question', async () => {
    const answer = await runDiscoverChat('craft and weaving near Imphal');
    expect(answer.kind).toBe('list');
    expect(answer.destinationIds.length + answer.experienceIds.length).toBeGreaterThan(0);
  });
});

describe('trip planner and a place asked for by name', () => {
  it('includes the named place and says why', () => {
    const { trip } = buildItinerary(extractTripProfile('A trip that includes Ukhrul'), 'sess-named');
    const stop = trip.items.find((item) => item.destinationId === 'dest-ukhrul');
    expect(stop).toBeDefined();
    expect(stop!.rationale).toContain('Included because you asked for Ukhrul');
  });

  it('does not treat a common word as a place name', () => {
    const { trip } = buildItinerary(extractTripProfile('three days by a lake, nature and food'), 'sess-generic');
    expect(trip.items.every((item) => !item.rationale.startsWith('Included because you asked for'))).toBe(true);
  });
});

describe('web lookup filtering', () => {
  const chunks = [
    { web: { uri: 'https://example.org/loktak', title: 'example.org' } },
    { web: { uri: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'youtube.com' } },
  ];

  const payload = (lines: string[], grounded: string[]) => ({
    candidates: [
      {
        content: { parts: [{ text: 'thinking', thought: true }, { text: lines.join('\n') }] },
        groundingMetadata: {
          groundingChunks: chunks,
          groundingSupports: grounded.map((text) => ({ segment: { text }, groundingChunkIndices: [0] })),
        },
      },
    ],
  });

  it('keeps a fact only when grounding backs it, with its sources', () => {
    const { facts } = readGroundedAnswer(
      payload(
        [
          'FACT | Loktak Lake is known for its floating phumdis.',
          'FACT | The lake glows purple on full moon nights.',
        ],
        ['Loktak Lake is known for its floating phumdis.'],
      ),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]!.text).toContain('phumdis');
    expect(facts[0]!.sources[0]!.uri).toBe('https://example.org/loktak');
  });

  it('drops a fact that carries a price, even when grounded', () => {
    const line = 'Boat rides on the lake cost ₹300 per person.';
    const { facts } = readGroundedAnswer(payload([`FACT | ${line}`], [line]));
    expect(facts).toEqual([]);
  });

  it('extracts video ids without trusting them (oEmbed checks each later)', () => {
    const { videoIds } = readGroundedAnswer(
      payload(
        [
          'VIDEO | https://www.youtube.com/watch?v=FF5xSgnPjuY',
          'VIDEO | https://youtu.be/oeiT85Y38tY',
          'VIDEO | https://www.youtube.com/watch?v=FF5xSgnPjuY',
          'VIDEO | not a link',
        ],
        [],
      ),
    );
    expect(videoIds).toEqual(['FF5xSgnPjuY', 'oeiT85Y38tY']);
  });

  it('sends only the place and district, never a visitor message', () => {
    const prompt = factsPrompt('Loktak Lake', 'Bishnupur');
    expect(prompt).toContain('Loktak Lake, Bishnupur district');
    expect(prompt).not.toMatch(/visitor asked|message/i);
  });
});
