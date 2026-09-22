import { resolveProvider } from '@/lib/ai/provider';

/**
 * Places found on the web: stays, guides and transport near the areas a plan
 * goes to, for the ones that are not OneStop partners.
 *
 * Gemini with Google Search grounding does the searching. The model is not
 * trusted to name places on its own: a place is kept only when a grounded
 * part of the answer (a segment Google tied to search results) contains it,
 * and it carries those results as its sources. Nothing else from the answer
 * is used, and no price is ever read from it.
 *
 * Only area names are sent, never the visitor's own words.
 */

export type OnlineKind = 'STAY' | 'GUIDE' | 'TRANSPORT';

export interface SearchArea {
  /** The planner's id for the area, echoed back so each place lands where it belongs. */
  id: string;
  name: string;
  district: string;
}

export interface FoundPlace {
  kind: OnlineKind;
  areaId: string;
  name: string;
  note?: string;
  sources: { uri: string; title: string }[];
}

export type SearchOutcome =
  | { ok: true; places: FoundPlace[]; model: string }
  | { ok: false; reason: 'OFF' | 'FAILED'; detail: string };

const SEARCH_TIMEOUT_MS = 25_000;
const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_PER_KIND = 3;

const KINDS: Record<string, OnlineKind> = { STAY: 'STAY', GUIDE: 'GUIDE', TRANSPORT: 'TRANSPORT' };

/** Web search is on only with Gemini configured; every other provider plans from partners alone. */
export const webSearchAvailable = (): boolean => resolveProvider() === 'gemini';

export function searchPrompt(areas: SearchArea[]): string {
  return [
    'Use Google Search to find, in Manipur, India, currently operating places a visitor can use near each area below:',
    'STAY: hotels, homestays or resorts. GUIDE: local or tour guides. TRANSPORT: taxi or car hire services.',
    `Up to ${MAX_PER_KIND} of each kind per area, and only places your search results show. Do not guess.`,
    'Answer with one line per place and nothing else, exactly in this form:',
    'AREA_ID | KIND | NAME | a short factual note from the source, without prices',
    '',
    'Areas:',
    ...areas.map((area) => `${area.id} = ${area.name}, ${area.district} district`),
  ].join('\n');
}

interface GroundedPayload {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
      groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
    };
  }[];
}

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The places in a grounded answer that the grounding supports. Exported for
 * the tests, which feed it recorded answers.
 */
export function groundedPlaces(payload: GroundedPayload, areas: SearchArea[], exclude: string[] = []): FoundPlace[] {
  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const supports = (candidate?.groundingMetadata?.groundingSupports ?? [])
    .map((support) => ({
      text: normalise(support.segment?.text ?? ''),
      sources: (support.groundingChunkIndices ?? [])
        .map((index) => chunks[index]?.web)
        .filter((web): web is { uri: string; title?: string } => typeof web?.uri === 'string' && /^https?:\/\//.test(web.uri))
        .map((web) => ({ uri: web.uri, title: web.title?.trim() || new URL(web.uri).hostname })),
    }))
    .filter((support) => support.text.length > 0 && support.sources.length > 0);

  const areaIds = new Set(areas.map((area) => area.id));
  const excluded = new Set(exclude.map(normalise));
  const perKind = new Map<string, number>();
  const seen = new Set<string>();
  const places: FoundPlace[] = [];

  for (const raw of text.split('\n')) {
    const fields = raw.replace(/^[\s*•-]+/, '').split('|').map((field) => field.trim());
    if (fields.length < 3) continue;
    const [areaId, kindText, name, note] = fields as [string, string, string, string | undefined];
    const kind = KINDS[kindText.toUpperCase()];
    if (!kind || !areaIds.has(areaId)) continue;
    if (name.length < 2 || name.length > 120 || /https?:|www\./i.test(name)) continue;

    const key = normalise(name);
    if (excluded.has(key) || seen.has(`${areaId}:${key}`)) continue;
    // Kept only if a grounded segment names it: the search, not the model, vouches for it.
    const backing = supports.filter((support) => support.text.includes(key));
    if (backing.length === 0) continue;

    const count = perKind.get(`${areaId}:${kind}`) ?? 0;
    if (count >= MAX_PER_KIND) continue;
    perKind.set(`${areaId}:${kind}`, count + 1);
    seen.add(`${areaId}:${key}`);

    const sources = [...new Map(backing.flatMap((support) => support.sources).map((source) => [source.uri, source])).values()].slice(0, 3);
    // A note with a figure in it could be a price, which is never taken from the web.
    const cleanNote = note && !/\d/.test(note) ? note.slice(0, 200) : undefined;
    places.push({ kind, areaId, name: name.slice(0, 120), ...(cleanNote ? { note: cleanNote } : {}), sources });
  }
  return places;
}

/** Searches once for every area of a plan. */
export async function searchPlacesOnline(areas: SearchArea[], exclude: string[] = []): Promise<SearchOutcome> {
  if (!webSearchAvailable()) return { ok: false, reason: 'OFF', detail: 'Web search needs AI_PROVIDER=gemini and a key.' };
  if (areas.length === 0) return { ok: true, places: [], model: 'none' };

  const apiKey = process.env.GEMINI_API_KEY!.trim();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        // The key travels in a header, not the query string, so it stays out of URL logs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: searchPrompt(areas) }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } },
        }),
      },
    );
    if (!response.ok) return { ok: false, reason: 'FAILED', detail: `Search responded ${response.status}` };
    const payload = (await response.json()) as GroundedPayload;
    return { ok: true, places: groundedPlaces(payload, areas, exclude), model };
  } catch (error) {
    return {
      ok: false,
      reason: 'FAILED',
      detail: controller.signal.aborted ? `No response within ${SEARCH_TIMEOUT_MS / 1000} seconds` : (error as Error).message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
