import { webSearchAvailable } from '@/lib/ai/web-search';

/**
 * What the web has about one place, for the Discover chat: a few facts,
 * photographs and videos.
 *
 * Nothing the model writes is shown on its own authority:
 *   - a fact is kept only when Google's grounding ties it to search results,
 *     and it carries those results as its sources; a fact that mentions a
 *     price is dropped, since prices are never taken from the web;
 *   - a video is kept only when YouTube's oEmbed confirms it exists and its
 *     title names the place, so an invented link never reaches the page;
 *   - the summary and photographs come from Wikipedia and Wikimedia, not
 *     from the model, and each photograph links to its file page for credit
 *     and licence.
 * Only the place's name and district are sent, never the visitor's words.
 */

export interface WebSource {
  uri: string;
  title: string;
}

export interface WebFact {
  text: string;
  sources: WebSource[];
}

export interface WebImage {
  src: string;
  /** The file page, which carries the author and licence. */
  href: string;
  alt: string;
}

export interface WebVideo {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
}

export interface PlaceMedia {
  name: string;
  wiki?: { title: string; extract: string; url: string };
  facts: WebFact[];
  images: WebImage[];
  videos: WebVideo[];
  /** Why the web search part is missing, when it is. Wikipedia can still have answered. */
  searchNote?: string;
}

const USER_AGENT = 'maTAI/0.1 (Manipur tourism prototype)';
const WIKI_TIMEOUT_MS = 8_000;
const SEARCH_TIMEOUT_MS = 25_000;
const OEMBED_TIMEOUT_MS = 6_000;
const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_IMAGES = 6;
const MAX_VIDEOS = 4;
const MAX_FACTS = 5;

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Words too common to show that a title or article is about this place. */
const GENERIC = new Set(['lake', 'park', 'national', 'temple', 'market', 'valley', 'hill', 'hills', 'village', 'river', 'fort', 'palace', 'museum', 'cemetery', 'war', 'district', 'the']);

function placeWords(name: string, district?: string): string[] {
  return normalise(`${name} ${district ?? ''} manipur`)
    .split(' ')
    .filter((word) => word.length > 3 && !GENERIC.has(word));
}

async function getJson<T>(url: string, timeoutMs: number, init: RequestInit = {}): Promise<T | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------- Wikipedia -------------------------------- */

const NOT_A_PHOTO = /map|locator|logo|flag|icon|emblem|seal|symbol|diagram|chart/i;

async function wikipedia(name: string, district?: string): Promise<Pick<PlaceMedia, 'wiki' | 'images'>> {
  const query = `${name} ${district ?? ''} Manipur`.replace(/\s+/g, ' ').trim();
  const search = await getJson<{ query?: { search?: { title: string }[] } }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(query)}`,
    WIKI_TIMEOUT_MS,
  );
  const title = search?.query?.search?.[0]?.title;
  if (!title) return { images: [] };

  const key = encodeURIComponent(title.replace(/ /g, '_'));
  const [summary, media] = await Promise.all([
    getJson<{ type?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${key}`,
      WIKI_TIMEOUT_MS,
    ),
    getJson<{ items?: { title: string; type: string; srcset?: { src: string }[] }[] }>(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${key}`,
      WIKI_TIMEOUT_MS,
    ),
  ]);

  // The top search hit is used only if it is plainly about this place.
  const words = placeWords(name, district);
  const about = normalise(`${title} ${summary?.extract ?? ''}`);
  if (!summary?.extract || summary.type === 'disambiguation' || !words.some((word) => about.includes(word))) {
    return { images: [] };
  }

  const images: WebImage[] = (media?.items ?? [])
    .filter((item) => item.type === 'image' && /\.jpe?g$/i.test(item.title) && !NOT_A_PHOTO.test(item.title))
    .map((item) => {
      const src = item.srcset?.[0]?.src ?? '';
      return {
        src: src.startsWith('//') ? `https:${src}` : src,
        href: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        alt: item.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
      };
    })
    .filter((image) => image.src.startsWith('https://'))
    .slice(0, MAX_IMAGES);

  return {
    wiki: {
      title,
      extract: summary.extract,
      url: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${key}`,
    },
    images,
  };
}

export interface PlaceSnapshot {
  image?: WebImage;
  wiki?: { title: string; extract: string; url: string };
}

/**
 * One photograph and the Wikipedia summary, for a map's place card. Free and
 * quick: no model call, so it is not rationed like the web search.
 */
export async function placeSnapshot(name: string, district?: string): Promise<PlaceSnapshot> {
  const { wiki, images } = await wikipedia(name, district);
  return { ...(images[0] ? { image: images[0] } : {}), ...(wiki ? { wiki } : {}) };
}

/* ---------------------------- Grounded web search -------------------------- */

interface GroundedPayload {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
      groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
    };
  }[];
}

const PRICE = /₹|\brs\.?\s*\d|\binr\b|rupee|price|cost|fee|ticket|charges?\b/i;
const VIDEO_ID = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/;

export function factsPrompt(name: string, district?: string): string {
  return [
    `Use Google Search. About ${name}${district ? `, ${district} district` : ''}, in Manipur, India:`,
    `First, up to ${MAX_FACTS} lines, each starting "FACT | " with one short factual sentence useful to a visitor: what it is, what to see and do, the best time to visit, how to get there. No prices.`,
    `Then up to 6 lines, each "VIDEO | " and a full https://www.youtube.com/watch?v= link to a YouTube video about this place that your search results show.`,
    'Nothing else.',
  ].join('\n');
}

/** Facts backed by grounding, and candidate video ids. Exported for the tests. */
export function readGroundedAnswer(payload: GroundedPayload): { facts: WebFact[]; videoIds: string[] } {
  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const supports = (candidate?.groundingMetadata?.groundingSupports ?? [])
    .map((support) => ({
      text: normalise((support.segment?.text ?? '').replace(/^\s*fact\s*\|/i, '')),
      sources: (support.groundingChunkIndices ?? [])
        .map((index) => chunks[index]?.web)
        .filter((web): web is { uri: string; title?: string } => typeof web?.uri === 'string' && /^https?:\/\//.test(web.uri))
        .map((web) => ({ uri: web.uri, title: web.title?.trim() || new URL(web.uri).hostname })),
    }))
    .filter((support) => support.text.length >= 20 && support.sources.length > 0);

  const facts: WebFact[] = [];
  const videoIds: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^[\s*•-]+/, '');
    const video = /^video\s*\|/i.test(line) ? VIDEO_ID.exec(line) : null;
    if (video) {
      if (!videoIds.includes(video[1]!)) videoIds.push(video[1]!);
      continue;
    }
    if (!/^fact\s*\|/i.test(line)) continue;
    // Markdown emphasis and citation markers are the model's formatting, not the fact.
    const fact = line.replace(/^fact\s*\|/i, '').replace(/\*+|_{2,}|\[\d+(?:,\s*\d+)*\]/g, '').replace(/\s+/g, ' ').trim();
    if (fact.length < 12 || fact.length > 300 || PRICE.test(fact)) continue;

    // Kept only if Google tied this sentence to search results.
    const key = normalise(fact);
    const backing = supports.filter((support) => key.includes(support.text) || support.text.includes(key));
    if (backing.length === 0) continue;
    const sources = [...new Map(backing.flatMap((support) => support.sources).map((source) => [source.uri, source])).values()].slice(0, 3);
    facts.push({ text: fact, sources });
    if (facts.length >= MAX_FACTS) break;
  }
  return { facts, videoIds: videoIds.slice(0, 6) };
}

async function groundedSearch(name: string, district?: string): Promise<{ facts: WebFact[]; videoIds: string[] } | undefined> {
  const apiKey = process.env.GEMINI_API_KEY!.trim();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const payload = await getJson<GroundedPayload>(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    SEARCH_TIMEOUT_MS,
    {
      method: 'POST',
      // The key travels in a header, not the query string, so it stays out of URL logs.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: factsPrompt(name, district) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } },
      }),
    },
  );
  return payload ? readGroundedAnswer(payload) : undefined;
}

/** Keeps the videos YouTube confirms exist and whose titles name the place. */
async function verifyVideos(ids: string[], name: string, district?: string): Promise<WebVideo[]> {
  const words = placeWords(name, district);
  const checked = await Promise.all(
    ids.map(async (id): Promise<WebVideo | undefined> => {
      const data = await getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
        OEMBED_TIMEOUT_MS,
      );
      if (!data?.title) return undefined;
      const title = normalise(data.title);
      if (!words.some((word) => title.includes(word))) return undefined;
      return {
        id,
        title: data.title,
        author: data.author_name ?? '',
        thumbnail: data.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }),
  );
  return checked.filter((video): video is WebVideo => video !== undefined).slice(0, MAX_VIDEOS);
}

/**
 * Looks one place up. Wikipedia is always asked; the web search runs only when
 * Gemini is configured and `allowSearch` is true (the caller rate-limits it).
 * Never throws: whatever part fails is simply missing.
 */
export async function lookUpPlaceOnline(name: string, district: string | undefined, allowSearch: boolean): Promise<PlaceMedia> {
  const searching = allowSearch && webSearchAvailable();
  const [wiki, grounded] = await Promise.all([
    wikipedia(name, district),
    searching ? groundedSearch(name, district) : Promise.resolve(undefined),
  ]);
  const videos = grounded ? await verifyVideos(grounded.videoIds, name, district) : [];

  const searchNote = !webSearchAvailable()
    ? 'Web search is off here, so only Wikipedia was checked.'
    : !allowSearch
      ? 'Web search is paused for this browser for a while; Wikipedia still answered.'
      : !grounded
        ? 'The web search did not finish, so only Wikipedia is shown.'
        : undefined;

  return {
    name,
    ...(wiki.wiki ? { wiki: wiki.wiki } : {}),
    facts: grounded?.facts ?? [],
    images: wiki.images,
    videos,
    ...(searchNote ? { searchNote } : {}),
  };
}
