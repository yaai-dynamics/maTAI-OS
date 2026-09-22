import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groundedPlaces, searchPlacesOnline, type SearchArea } from '@/lib/ai/web-search';
import { findOnlineFor, resetOnlineSearch } from '@/server/ai/online-places';
import { buildItinerary, extractTripProfile } from '@/server/ai/trip-planner';
import { resetState } from '@/server/data/store';

/**
 * Web search for places that are not partners, against a stubbed network.
 * Nothing here calls Google: each test answers fetch the way Gemini with
 * Search grounding does, and checks what was sent and what is kept.
 */

const AREAS: SearchArea[] = [
  { id: 'dest-loktak', name: 'Loktak Lake', district: 'Bishnupur' },
  { id: 'dest-ukhrul', name: 'Ukhrul', district: 'Ukhrul' },
];

/** A grounded answer: the text, and the parts of it Google tied to results. */
function answer(lines: string[], grounded: { text: string; sources: number[] }[]) {
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: 'let me think', thought: true }, { text: lines.join('\n') }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://example.org/lakeside', title: 'example.org' } },
            { web: { uri: 'https://travel.example.com/ukhrul', title: 'travel.example.com' } },
            { web: { uri: 'not a url', title: 'broken' } },
          ],
          groundingSupports: grounded.map((row) => ({ segment: { text: row.text }, groundingChunkIndices: row.sources })),
        },
      },
    ],
  };
}

describe('what a grounded answer yields', () => {
  it('keeps only places a grounded segment names, with those results as sources', () => {
    const places = groundedPlaces(
      answer(
        [
          'dest-loktak | STAY | Lakeview Retreat | Cottages on the lake road',
          'dest-loktak | STAY | Invented Palace | Luxury suites',
          'dest-ukhrul | TRANSPORT | Hill Cabs Ukhrul | Taxi service in town',
        ],
        [
          { text: 'dest-loktak | STAY | Lakeview Retreat | Cottages on the lake road', sources: [0] },
          { text: 'Hill Cabs Ukhrul', sources: [1, 2] },
        ],
      ),
      AREAS,
    );
    expect(places.map((place) => place.name)).toEqual(['Lakeview Retreat', 'Hill Cabs Ukhrul']);
    expect(places[0]).toMatchObject({ kind: 'STAY', areaId: 'dest-loktak', note: 'Cottages on the lake road' });
    // The malformed chunk is dropped rather than shown as a link.
    expect(places[1]!.sources).toEqual([{ uri: 'https://travel.example.com/ukhrul', title: 'travel.example.com' }]);
  });

  it('refuses unknown areas and kinds, links as names, partners, and any note with a figure in it', () => {
    const lines = [
      'dest-moreh | STAY | Border Inn | Near the gate',
      'dest-loktak | RESTAURANT | Fish House | Local food',
      'dest-loktak | STAY | www.book-here.example | A site',
      'dest-loktak | STAY | Loktak Lakeside Homestay | A partner already',
      'dest-ukhrul | GUIDE | Ridge Walkers | ₹1,500 a day',
    ];
    const places = groundedPlaces(
      answer(lines, lines.map((text) => ({ text, sources: [0] }))),
      AREAS,
      ['Loktak Lakeside Homestay'],
    );
    expect(places).toEqual([
      { kind: 'GUIDE', areaId: 'dest-ukhrul', name: 'Ridge Walkers', sources: [{ uri: 'https://example.org/lakeside', title: 'example.org' }] },
    ]);
  });

  it('keeps at most three of a kind per area', () => {
    const lines = ['A', 'B', 'C', 'D'].map((letter) => `dest-loktak | STAY | Stay ${letter} | On the lake`);
    const places = groundedPlaces(answer(lines, lines.map((text) => ({ text, sources: [0] }))), AREAS);
    expect(places.map((place) => place.name)).toEqual(['Stay A', 'Stay B', 'Stay C']);
  });
});

describe('the search call', () => {
  beforeEach(() => resetOnlineSearch());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is off unless Gemini is the provider', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await searchPlacesOnline(AREAS)).toMatchObject({ ok: false, reason: 'OFF' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks Google Search about area names only, with the key in a header', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-key-not-real');
    const sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(answer([], [])), { status: 200 });
      }),
    );

    const outcome = await searchPlacesOnline(AREAS);
    expect(outcome).toMatchObject({ ok: true, places: [] });
    expect(sent[0]!.url).not.toContain('test-key');
    expect(sent[0]!.headers['x-goog-api-key']).toBe('test-key-not-real');
    expect(sent[0]!.body.tools).toEqual([{ google_search: {} }]);
    const prompt = JSON.stringify(sent[0]!.body.contents);
    expect(prompt).toContain('dest-loktak = Loktak Lake, Bishnupur district');
    expect(prompt).not.toMatch(/love nature|less crowded/);
  });

  it('reports a failure rather than throwing', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-key-not-real');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429 })));
    expect(await searchPlacesOnline(AREAS)).toMatchObject({ ok: false, reason: 'FAILED', detail: 'Search responded 429' });
  });

  it('searches once for the same places, and limits how often one visitor can search', async () => {
    resetState();
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-key-not-real');
    const line = 'dest-loktak | STAY | Lakeview Retreat | Cottages on the lake road';
    const fetch = vi.fn(async () => new Response(JSON.stringify(answer([line], [{ text: line, sources: [0] }])), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const trip = buildItinerary(extractTripProfile('3 days around Loktak Lake, nature and wildlife'), 'sess-w').trip;
    const first = await findOnlineFor('sess-w', [trip]);
    const again = await findOnlineFor('sess-w', [trip]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(again.places).toEqual(first.places);

    // Different places each time: a new search, until the hourly allowance runs out.
    const places = ['dest-ukhrul', 'dest-andro', 'dest-moirang', 'dest-shirui', 'dest-keibul', 'dest-dzukou', 'dest-tamenglong'];
    const statuses: string[] = [];
    for (const destinationId of places) {
      const elsewhere = { items: [{ ...trip.items[0]!, destinationId }] };
      statuses.push((await findOnlineFor('sess-w', [elsewhere])).status);
    }
    expect(statuses.filter((status) => status === 'LIMITED').length).toBeGreaterThan(0);
  });
});
