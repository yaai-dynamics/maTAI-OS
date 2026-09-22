/**
 * Downloads one real photograph per destination from Wikimedia Commons, for
 * the mobile app (/m), with its author and licence.
 *
 *   node scripts/fetch-destination-photos.mjs          fetch what is missing
 *   node scripts/fetch-destination-photos.mjs --force  fetch everything again
 *   node scripts/fetch-destination-photos.mjs --only=dest-kangla,dest-andro
 *
 * Writes public/photos/<id>.jpg (1280px wide), public/photos/<id>-sm.jpg
 * (500px) and data/destination-photos.json (credits). Run once and commit the
 * result: the app then serves the photos itself, so the demo needs no
 * network and never hits Wikipedia's rate limits.
 *
 * Each destination names its Wikipedia article explicitly (first that exists
 * wins), and the article's own lead image is used, so a search result about
 * somewhere else can never supply the picture. Where the article has no lead
 * image, or a poor one for a visitor (a museum specimen, say), a named
 * Wikimedia Commons search is used instead. Check the results by eye.
 *
 * Wikimedia serves thumbnails only at standard widths (500, 960, 1280...).
 */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = `${ROOT}public/photos`;
const CREDITS = `${ROOT}data/destination-photos.json`;
const UA = 'OneStopManipur/0.1 (Manipur tourism hackathon prototype; photos credited to Wikimedia Commons)';
const PAUSE_MS = 1500;
const FORCE = process.argv.includes('--force');
const ONLY = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');

/**
 * articles: tried in order. search: a Commons query, used first when
 * preferSearch, else as the fallback. file: a Commons file chosen by eye,
 * used as is. none: no suitable photograph; the app keeps its artwork.
 * custom: a photograph the team supplied and credited by hand in
 * data/destination-photos.json; this script never touches it.
 */
const SOURCES = {
  'dest-kangla': {
    file: 'Kangla Sanathong (Kangla Grand Gate or Kangla Royal Gate) - Classical Meitei architecture - in the western side of the Kangla Fort (Kangla Palace) in Imphal West district of Manipur state (Kangleipak) 02.jpg',
  },
  'dest-ima-keithel': { articles: ['Ima Keithel'], search: 'Ima Keithel market Imphal' },
  'dest-loktak': { articles: ['Loktak Lake'], search: 'Loktak Lake phumdi' },
  'dest-keibul': { file: 'THE FLOATING NATIONAL PARK- The Keibul Lamjao National Park, Manipur.jpg' },
  'dest-moirang': { articles: ['Moirang'], search: 'Moirang Manipur' },
  'dest-ukhrul': { articles: ['Ukhrul'], search: 'Ukhrul' },
  'dest-shirui': { articles: ['Shirui Kashong', 'Shirui lily'], search: 'Shirui Ukhrul', preferSearch: true },
  'dest-andro': { file: 'Relief carvings and sculptures in the Cultural Heritage Complex in Andro, Imphal East district, Manipur, India.jpg' },
  'dest-khongjom': { articles: ['Khongjom War Memorial Complex', 'Khongjom'], search: 'Khongjom war memorial' },
  // Team-supplied photograph of the Indo-Myanmar Friendship Gate. The Commons
  // alternative, if it is ever needed: 'MOREH INDO MYANMAY FRIENDSHIP GATE.jpg'.
  'dest-moreh': { custom: true },
  'dest-imphal-war-cemetery': { articles: ['Imphal War Cemetery'], search: 'Imphal War Cemetery' },
  'dest-dzukou': { articles: ['Dzüko Valley', 'Dzukou Valley'], search: 'Dzukou Valley' },
  'dest-tamenglong': { articles: ['Tamenglong'], search: 'Tamenglong' },
  'dest-bishnupur-temple': { articles: ['Vishnu Temple, Bishnupur', 'Bishnupur, Manipur'], search: 'Vishnu temple Bishnupur Manipur' },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, attempt = 1) {
  await sleep(PAUSE_MS);
  const response = await fetch(url, { headers: { 'user-agent': UA } });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 5) throw new Error(`${response.status} for ${url}`);
    const wait = attempt * 10_000;
    console.log(`  rate limited, waiting ${wait / 1000}s`);
    await sleep(wait);
    return request(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response;
}

const json = async (url) => {
  const response = await request(url);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Not JSON (${text.slice(0, 60)}) for ${url}`);
  }
};

const stripHtml = (value = '') =>
  value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

/** The lead image file of the first article that exists and has one. */
async function leadImage(titles) {
  for (const title of titles) {
    const data = await json(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`,
    );
    const page = Object.values(data.query?.pages ?? {})[0];
    if (page && !('missing' in page) && page.pageimage && /\.jpe?g$/i.test(page.pageimage)) {
      return { article: page.title, file: page.pageimage };
    }
  }
  return undefined;
}

/** The first JPEG photograph at least 1280px wide that a Commons search finds. */
async function commonsSearch(query) {
  const data = await json(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(query)}&prop=imageinfo&iiprop=size|mime`,
  );
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const hit = pages.find((page) => {
    const info = page.imageinfo?.[0];
    return info?.mime === 'image/jpeg' && info.width >= 1280 && info.width >= info.height && !/map|logo|flag|emblem|seal|stamp/i.test(page.title);
  });
  return hit ? { article: `Commons search: ${query}`, file: hit.title.replace(/^File:/, '') } : undefined;
}

async function imageInfo(file, width) {
  const data = await json(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=${width}&titles=${encodeURIComponent(`File:${file}`)}`,
  );
  return Object.values(data.query?.pages ?? {})[0]?.imageinfo?.[0];
}

async function download(url, path) {
  const response = await request(url);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

const exists = (path) => access(path).then(() => true, () => false);

await mkdir(OUT_DIR, { recursive: true });
const credits = (await exists(CREDITS)) ? JSON.parse(await readFile(CREDITS, 'utf8')) : {};

for (const [id, source] of Object.entries(SOURCES)) {
  if (ONLY && !ONLY.includes(id)) continue;
  if (source.custom) {
    console.log(`${id}: team-supplied photograph, left as it is`);
    continue;
  }
  if (source.none) {
    delete credits[id];
    await writeFile(CREDITS, `${JSON.stringify(credits, null, 2)}
`);
    await rm(`${OUT_DIR}/${id}.jpg`, { force: true });
    await rm(`${OUT_DIR}/${id}-sm.jpg`, { force: true });
    console.log(`${id}: no suitable photograph, keeping the artwork`);
    continue;
  }
  if (!ONLY && !FORCE && credits[id] && (await exists(`${OUT_DIR}/${id}.jpg`))) {
    console.log(`${id}: already have it`);
    continue;
  }
  try {
    const lead = source.file
      ? { article: 'Chosen on Wikimedia Commons', file: source.file }
      : source.preferSearch
      ? ((await commonsSearch(source.search)) ?? (await leadImage(source.articles)))
      : ((await leadImage(source.articles)) ?? (await commonsSearch(source.search)));
    if (!lead) {
      console.log(`${id}: no photograph found`);
      continue;
    }
    const large = await imageInfo(lead.file, 1280);
    if (!large?.thumburl) {
      console.log(`${id}: no image info for ${lead.file}`);
      continue;
    }
    const small = large.thumburl.replace(/\/\d+px-([^/?]+)(\?.*)?$/, '/500px-$1');
    await download(large.thumburl, `${OUT_DIR}/${id}.jpg`);
    await download(large.width > 500 && small !== large.thumburl ? small : large.thumburl, `${OUT_DIR}/${id}-sm.jpg`);

    const meta = large.extmetadata ?? {};
    credits[id] = {
      article: lead.article,
      file: lead.file,
      author: stripHtml(meta.Artist?.value) || 'Unknown author',
      license: stripHtml(meta.LicenseShortName?.value) || 'See file page',
      source: large.descriptionurl,
    };
    await writeFile(CREDITS, `${JSON.stringify(credits, null, 2)}\n`);
    console.log(`${id}: ${lead.file} (${credits[id].license}, ${credits[id].author})`);
  } catch (error) {
    console.log(`${id}: failed, ${error.message}`);
  }
}

console.log(`\n${Object.keys(credits).length} of ${Object.keys(SOURCES).length} destinations have a photograph.`);
