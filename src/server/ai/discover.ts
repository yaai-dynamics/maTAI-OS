import { narrate } from '@/lib/ai/provider';
import { PROMPTS } from '@/lib/ai/prompts';
import { formatDuration } from '@/lib/geo';
import { EXPERIENCE_CATEGORY_LABEL, type Destination, type Experience } from '@/lib/types';
import {
  getBusiness,
  getDestination,
  getDestinations,
  getExperience,
  getExperiences,
  getExperiencesFor,
  getFactsFor,
} from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { askAboutDestination } from '@/server/ai/storyteller';

/**
 * The Discover chat, behind the merged Destinations + Experiences screen.
 *
 * There is no vector index: the dataset is a few dozen curated records, so a
 * message is resolved against it directly.
 *
 *   - The message names a destination or experience, or leans on the one the
 *     last turn was about (`focus`). What it asks for (an overview, what to do,
 *     when to go, photos and videos, a plan) picks the reply; a repeat question
 *     about the same place gets an answer, not the same cards again.
 *   - Nothing specific: a list reply from deterministic term matching across
 *     both datasets.
 *
 * The web is asked only for the place's own name (server/ai/online-places.ts),
 * and the model never decides what matched; it only narrates what code found
 * (CLAUDE.md section 7).
 *
 * Every reply ends with next steps that move from finding a place towards
 * doing something about it: its experiences, booking one, planning a trip.
 */

export interface DiscoverAction {
  label: string;
  /** 'ask' sends `value` as the next message; 'link' navigates to it; 'online' looks the place up on the web. */
  kind: 'ask' | 'link' | 'online';
  value: string;
  /** For 'online': the known place to look up, so only its name is ever sent. */
  destinationId?: string;
}

export interface DiscoverFocus {
  destinationId?: string;
  experienceId?: string;
}

export interface DiscoverChatAnswer {
  kind: 'list' | 'place' | 'experiences' | 'experience' | 'practical' | 'online' | 'plan' | 'unmatched';
  text: string;
  provider: string;
  /** A destination whose artwork heads the reply; opens its full details. */
  hero?: string;
  destinationIds: string[];
  experienceIds: string[];
  /** Short, per-item reason, keyed by destination or experience id. */
  reasons: Record<string, string>;
  /** Carried forward to the next turn, so a nameless follow-up still knows what "it" means. */
  focus?: DiscoverFocus;
  actions: DiscoverAction[];
  /** The reply goes on to fetch what the web has about this place. */
  lookUpOnline?: { destinationId: string };
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'near', 'about', 'want', 'looking', 'find',
  'show', 'places', 'place', 'something', 'somewhere', 'good', 'best', 'nice', 'really', 'very',
  'have', 'like', 'would', 'could', 'should', 'give', 'need', 'into', 'over', 'under', 'more', 'some',
]);

const RESULT_LIMIT = 6;

const INTENTS = {
  online: /\b(photos?|pictures?|pics?|images?|videos?|youtube|online|internet|web|google|wikipedia)\b/,
  plan: /\b(plan|itinerary|schedule|trip)\b/,
  experiences: /\b(experiences?|activit(?:y|ies)|things to do|what (?:can|to|should) (?:i|we) do|do there|book(?:ing)?|workshops?|tours?|guides?|stay|homestays?)\b/,
  practical: /\b(best time|when (?:to|should)|season|weather|how long|how much time|access|accessible|reach|get there|getting there|how (?:to|do i) (?:go|get)|open(?:ing)? hours?|before i (?:go|visit))\b/,
} as const;

type Intent = keyof typeof INTENTS | 'overview';

function intentOf(message: string): Intent {
  const text = message.toLowerCase();
  // Practical before experiences: "how long should I stay" is about timing, not booking a stay.
  for (const intent of ['online', 'plan', 'practical', 'experiences'] as const) {
    if (INTENTS[intent].test(text)) return intent;
  }
  return 'overview';
}

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function overlap(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((needle) => lower.includes(needle));
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** The longest known destination name that appears in the message, if any. */
function mentionedDestination(message: string): Destination | undefined {
  const haystack = ` ${normalize(message)} `;
  let best: Destination | undefined;
  for (const destination of getDestinations()) {
    const name = normalize(destination.name);
    if (name.length > 3 && haystack.includes(` ${name} `) && name.length > normalize(best?.name ?? '').length) {
      best = destination;
    }
  }
  return best;
}

/** The longest known experience title that appears in the message, if any. */
function mentionedExperience(message: string): Experience | undefined {
  const haystack = normalize(message);
  let best: Experience | undefined;
  for (const experience of getExperiences()) {
    const title = normalize(experience.title);
    if (title.length > 4 && haystack.includes(title) && title.length > normalize(best?.title ?? '').length) {
      best = experience;
    }
  }
  return best;
}

const FOLLOW_UP_HINTS = ['it', 'there', 'this place', 'that place', 'this one', 'that one', 'more', 'else', 'what about'];

/** A short message, or one that leans on a pronoun, is read against the last focus rather than searched fresh. */
function readsAsFollowUp(message: string): boolean {
  const normalized = normalize(message);
  return normalized.split(' ').length <= 8 || FOLLOW_UP_HINTS.some((hint) => ` ${normalized} `.includes(` ${hint} `));
}

const providerOf = (narration: { provider: string; fallback: boolean }) =>
  narration.fallback ? `${narration.provider} (fallback)` : narration.provider;

/* ------------------------------- Next steps ------------------------------- */

const planHref = (name: string) => `/explore?plan=${encodeURIComponent(`A trip that includes ${name}`)}`;
const experiencesHref = (destinationId: string) => `/explore/discover?mode=experiences&destination=${destinationId}`;

const planStep = (destination: Destination): DiscoverAction => ({
  label: `Plan a trip with ${destination.name}`,
  kind: 'link',
  value: planHref(destination.name),
});

const onlineStep = (destination: Destination): DiscoverAction => ({
  label: `Photos and videos of ${destination.name}`,
  kind: 'online',
  value: destination.name,
  destinationId: destination.id,
});

/** The ladder for a place: see it, what to do there, when to go, book, plan. The client drops steps already taken. */
function placeSteps(destination: Destination, current: Intent): DiscoverAction[] {
  const here = getExperiencesFor(destination.id);
  const steps: DiscoverAction[] = [];
  if (current !== 'online') steps.push(onlineStep(destination));
  if (current !== 'experiences' && here.length > 0) {
    steps.push({ label: `What can I do at ${destination.name}?`, kind: 'ask', value: `What can I do at ${destination.name}?` });
  }
  if (current !== 'practical') {
    steps.push({ label: 'When should I go?', kind: 'ask', value: `When is the best time to visit ${destination.name}?` });
  }
  if (here.length > 0) {
    steps.push({ label: 'Book a local experience here', kind: 'link', value: experiencesHref(destination.id) });
  }
  steps.push(planStep(destination));
  return steps;
}

async function bookable(experience: Experience): Promise<boolean> {
  if (experience.availabilityStatus === 'UNAVAILABLE') return false;
  const accepting = await businessesAcceptingBookings();
  return accepting.has(experience.businessId) && getBusiness(experience.businessId)?.status === 'PARTICIPATING';
}

async function experienceSteps(experience: Experience, destination: Destination | undefined): Promise<DiscoverAction[]> {
  const steps: DiscoverAction[] = [];
  if (await bookable(experience)) {
    steps.push({ label: 'Request to book', kind: 'link', value: `/explore/discover?mode=experiences&book=${experience.id}` });
  } else if (experience.availabilityStatus !== 'UNAVAILABLE') {
    steps.push({ label: 'Send an enquiry', kind: 'link', value: `/explore/discover?mode=experiences&experience=${experience.id}` });
  }
  if (destination) {
    steps.push({ label: `What else is there at ${destination.name}?`, kind: 'ask', value: `What can I do at ${destination.name}?` });
    steps.push(onlineStep(destination));
    steps.push(planStep(destination));
  }
  return steps;
}

/** What follows a web lookup: back towards what the platform can actually arrange. */
export function stepsAfterOnline(destination: Destination): DiscoverAction[] {
  return placeSteps(destination, 'online');
}

/* --------------------------------- Replies --------------------------------- */

function scoreDestination(destination: Destination, queryTerms: string[]): { score: number; hits: string[] } {
  const haystack = `${destination.name} ${destination.summary} ${destination.district} ${destination.category.join(' ')}`;
  const hits = overlap(haystack, queryTerms);
  let score = hits.length * 2;
  score += overlap(destination.category.join(' '), queryTerms).length * 2;
  score += overlap(destination.name, queryTerms).length * 3;
  return { score, hits };
}

function scoreExperience(experience: Experience, queryTerms: string[]): { score: number; hits: string[] } {
  const haystack = `${experience.title} ${experience.description} ${experience.category} ${experience.tags.join(' ')}`;
  const hits = overlap(haystack, queryTerms);
  let score = hits.length * 2;
  score += overlap(experience.category, queryTerms).length * 2;
  score += overlap(experience.title, queryTerms).length * 3;
  return { score, hits };
}

async function listReply(message: string): Promise<DiscoverChatAnswer> {
  const queryTerms = terms(message);
  const reasons: Record<string, string> = {};

  const scoredDestinations = getDestinations()
    .map((destination) => ({ destination, ...scoreDestination(destination, queryTerms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT);

  const scoredExperiences = getExperiences()
    .map((experience) => ({ experience, ...scoreExperience(experience, queryTerms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT);

  if (scoredDestinations.length === 0 && scoredExperiences.length === 0) return unmatchedReply(message);

  for (const row of scoredDestinations) {
    reasons[row.destination.id] = row.hits.length > 0 ? `Matches ${[...new Set(row.hits)].slice(0, 3).join(', ')}` : 'Matches your search';
  }
  for (const row of scoredExperiences) {
    reasons[row.experience.id] = row.hits.length > 0 ? `Matches ${[...new Set(row.hits)].slice(0, 3).join(', ')}` : 'Matches your search';
  }

  const deterministicText = [
    scoredDestinations.length > 0
      ? `${scoredDestinations.length} ${scoredDestinations.length === 1 ? 'destination' : 'destinations'}: ${scoredDestinations.map((row) => row.destination.name).join(', ')}.`
      : '',
    scoredExperiences.length > 0
      ? `${scoredExperiences.length} local ${scoredExperiences.length === 1 ? 'experience' : 'experiences'}: ${scoredExperiences.map((row) => row.experience.title).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const narration = await narrate({
    promptId: PROMPTS.discoverGuide.id,
    system: PROMPTS.discoverGuide.system,
    deterministicText,
    evidence: {
      message,
      destinations: scoredDestinations.map((row) => ({ name: row.destination.name, district: row.destination.district, category: row.destination.category })),
      experiences: scoredExperiences.map((row) => ({
        title: row.experience.title,
        category: EXPERIENCE_CATEGORY_LABEL[row.experience.category],
        destination: getDestination(row.experience.destinationId)?.name,
      })),
    },
    task: 'In one short sentence, introduce these results as the answer to the message. Use only the names given.',
    maxTokens: 160,
  });

  const top = scoredDestinations[0]?.destination;
  const topExperience = scoredExperiences[0]?.experience;
  const actions: DiscoverAction[] = [];
  if (top) actions.push({ label: `Tell me about ${top.name}`, kind: 'ask', value: `Tell me about ${top.name}` });
  if (topExperience) actions.push({ label: `Tell me about ${topExperience.title}`, kind: 'ask', value: `Tell me about ${topExperience.title}` });
  if (top) actions.push(planStep(top));

  return {
    kind: 'list',
    text: narration.text,
    provider: providerOf(narration),
    destinationIds: scoredDestinations.map((row) => row.destination.id),
    experienceIds: scoredExperiences.map((row) => row.experience.id),
    reasons,
    actions,
  };
}

async function unmatchedReply(message: string): Promise<DiscoverChatAnswer> {
  const narration = await narrate({
    promptId: PROMPTS.discoverGuide.id,
    system: PROMPTS.discoverGuide.system,
    deterministicText: `Nothing in maTAI's destinations or local experiences matched "${message}". Try the name of a place, or something you like to do, such as crafts, lakes or food.`,
    evidence: { message, unmatched: true },
    task: 'Say plainly that nothing matched, in one or two short sentences, and suggest trying a place name or an interest. Do not name a place that was not given to you.',
    maxTokens: 120,
  });
  return {
    kind: 'unmatched',
    text: narration.text,
    provider: providerOf(narration),
    destinationIds: [],
    experienceIds: [],
    reasons: {},
    actions: [
      { label: 'Quiet nature spots', kind: 'ask', value: 'Quiet nature spots for a weekend' },
      { label: 'Crafts and weaving', kind: 'ask', value: 'Craft and weaving experiences near Imphal' },
    ],
  };
}

/** First mention of a place: what it is, with its artwork and a way into the full details. */
async function placeOverview(destination: Destination, question: string): Promise<DiscoverChatAnswer> {
  const facts = getFactsFor(destination.id).filter((fact) => fact.factType !== 'PRACTICAL').slice(0, 3);
  const narration = await narrate({
    promptId: PROMPTS.discoverGuide.id,
    system: PROMPTS.discoverGuide.system,
    deterministicText: [destination.summary, ...facts.map((fact) => fact.text)].join(' '),
    evidence: {
      question,
      destination: { name: destination.name, district: destination.district, category: destination.category, summary: destination.summary },
      facts: facts.map((fact) => ({ title: fact.title, text: fact.text, factType: fact.factType })),
    },
    task: 'Introduce this destination to a visitor using only the evidence given. Two or three short sentences.',
    maxTokens: 260,
  });
  return {
    kind: 'place',
    text: narration.text,
    provider: providerOf(narration),
    hero: destination.id,
    destinationIds: [],
    experienceIds: [],
    reasons: {},
    focus: { destinationId: destination.id },
    actions: placeSteps(destination, 'overview'),
  };
}

/** A further question about the place already in focus: answered from its facts, no repeat of its cards. */
async function placeFollowUp(destination: Destination, question: string): Promise<DiscoverChatAnswer> {
  const answer = await askAboutDestination(destination.id, question);
  const actions = placeSteps(destination, 'overview');
  return {
    kind: 'place',
    text: answer.unanswered
      ? `${answer.answer} You can also see what the web has on ${destination.name}.`
      : answer.answer,
    provider: answer.provider,
    destinationIds: [],
    experienceIds: [],
    reasons: {},
    focus: { destinationId: destination.id },
    // When the curated facts run out, the web is the next step.
    actions: answer.unanswered ? [onlineStep(destination), ...actions.filter((action) => action.kind !== 'online')] : actions,
  };
}

async function placeExperiences(destination: Destination, question: string): Promise<DiscoverChatAnswer> {
  const here = getExperiencesFor(destination.id);
  if (here.length === 0) {
    return {
      kind: 'experiences',
      text: `No local host at ${destination.name} has joined maTAI yet, so there is nothing to book here for now. The trip planner can still take you there.`,
      provider: 'deterministic',
      destinationIds: [],
      experienceIds: [],
      reasons: {},
      focus: { destinationId: destination.id },
      actions: [planStep(destination), onlineStep(destination)],
    };
  }
  const narration = await narrate({
    promptId: PROMPTS.discoverGuide.id,
    system: PROMPTS.discoverGuide.system,
    deterministicText: `${here.length} local ${here.length === 1 ? 'experience' : 'experiences'} at ${destination.name}: ${here.map((experience) => experience.title).join(', ')}.`,
    evidence: {
      question,
      destination: destination.name,
      experiences: here.map((experience) => ({ title: experience.title, category: EXPERIENCE_CATEGORY_LABEL[experience.category] })),
    },
    task: 'In one short sentence, introduce what a visitor can do here with local hosts. Use only the titles given.',
    maxTokens: 160,
  });
  return {
    kind: 'experiences',
    text: narration.text,
    provider: providerOf(narration),
    destinationIds: [],
    experienceIds: here.map((experience) => experience.id),
    reasons: {},
    focus: { destinationId: destination.id },
    actions: [
      { label: `Tell me about ${here[0]!.title}`, kind: 'ask', value: `Tell me about ${here[0]!.title}` },
      ...placeSteps(destination, 'experiences'),
    ],
  };
}

async function placePractical(destination: Destination, question: string): Promise<DiscoverChatAnswer> {
  const practical = getFactsFor(destination.id).filter((fact) => fact.factType === 'PRACTICAL');
  const deterministicText = [
    destination.bestSeason ? `Best season: ${destination.bestSeason}.` : '',
    `A typical visit takes about ${formatDuration(destination.typicalVisitMinutes)}.`,
    destination.accessibilityNotes ? `Access: ${destination.accessibilityNotes}` : '',
    ...practical.map((fact) => fact.text),
  ]
    .filter(Boolean)
    .join(' ');
  const narration = await narrate({
    promptId: PROMPTS.discoverGuide.id,
    system: PROMPTS.discoverGuide.system,
    deterministicText,
    evidence: {
      question,
      destination: destination.name,
      bestSeason: destination.bestSeason,
      typicalVisit: formatDuration(destination.typicalVisitMinutes),
      accessibilityNotes: destination.accessibilityNotes,
      practical: practical.map((fact) => fact.text),
    },
    task: 'Answer the practical question using only the evidence given. Two or three short sentences.',
    maxTokens: 220,
  });
  return {
    kind: 'practical',
    text: narration.text,
    provider: providerOf(narration),
    destinationIds: [],
    experienceIds: [],
    reasons: {},
    focus: { destinationId: destination.id },
    actions: placeSteps(destination, 'practical'),
  };
}

function placeOnline(destination: Destination): DiscoverChatAnswer {
  return {
    kind: 'online',
    text: `Here is what the web has on ${destination.name}. It comes from Wikipedia, YouTube and other public sites, not from maTAI's verified records.`,
    provider: 'deterministic',
    destinationIds: [],
    experienceIds: [],
    reasons: {},
    focus: { destinationId: destination.id },
    actions: [],
    lookUpOnline: { destinationId: destination.id },
  };
}

function placePlan(destination: Destination): DiscoverChatAnswer {
  const here = getExperiencesFor(destination.id).length;
  return {
    kind: 'plan',
    text: `The trip planner can build two or three options around ${destination.name}, with partner stays, transport${here > 0 ? ', guides and local experiences' : ' and guides'}, and you choose the one to keep. Add your dates and budget there if you know them.`,
    provider: 'deterministic',
    destinationIds: [],
    experienceIds: [],
    reasons: {},
    focus: { destinationId: destination.id },
    actions: [planStep(destination), ...placeSteps(destination, 'plan').filter((action) => action.value !== planHref(destination.name))],
  };
}

async function experienceReply(experience: Experience, question: string, repeat: boolean): Promise<DiscoverChatAnswer> {
  const destination = getDestination(experience.destinationId);
  const business = getBusiness(experience.businessId);
  const narration = await narrate({
    promptId: PROMPTS.discoverGuide.id,
    system: PROMPTS.discoverGuide.system,
    deterministicText: `${experience.description} It takes about ${formatDuration(experience.durationMinutes)}, from ₹${experience.price.toLocaleString('en-IN')} per person, with ${business?.name ?? 'a local provider'}.`,
    evidence: {
      question,
      experience: {
        title: experience.title,
        category: EXPERIENCE_CATEGORY_LABEL[experience.category],
        description: experience.description,
        destination: destination?.name,
        host: business?.name,
        duration: formatDuration(experience.durationMinutes),
        pricePerPerson: `₹${experience.price.toLocaleString('en-IN')}`,
        effort: experience.accessibility.toLowerCase(),
      },
    },
    task: 'Answer the question about this local experience using only the evidence given. Two short sentences.',
    maxTokens: 220,
  });
  return {
    kind: 'experience',
    text: narration.text,
    provider: providerOf(narration),
    ...(repeat || !destination ? {} : { hero: destination.id }),
    destinationIds: [],
    experienceIds: repeat ? [] : [experience.id],
    reasons: {},
    focus: { experienceId: experience.id, ...(destination ? { destinationId: destination.id } : {}) },
    actions: await experienceSteps(experience, destination),
  };
}

function placeReply(destination: Destination, message: string, repeat: boolean): Promise<DiscoverChatAnswer> | DiscoverChatAnswer {
  switch (intentOf(message)) {
    case 'online':
      return placeOnline(destination);
    case 'plan':
      return placePlan(destination);
    case 'experiences':
      return placeExperiences(destination, message);
    case 'practical':
      return placePractical(destination, message);
    default:
      return repeat ? placeFollowUp(destination, message) : placeOverview(destination, message);
  }
}

/**
 * Resolves one chat message. `focus` is whatever the previous turn returned:
 * carrying it forward is the whole of this chat's cross-turn memory.
 */
export async function runDiscoverChat(message: string, focus?: DiscoverFocus): Promise<DiscoverChatAnswer> {
  const experience = mentionedExperience(message);
  if (experience) return experienceReply(experience, message, focus?.experienceId === experience.id);

  const destination = mentionedDestination(message);
  if (destination) return placeReply(destination, message, focus?.destinationId === destination.id);

  if (focus && readsAsFollowUp(message)) {
    const focusedExperience = focus.experienceId ? getExperience(focus.experienceId) : undefined;
    const focusedDestination = focus.destinationId ? getDestination(focus.destinationId) : undefined;
    // "Photos of it" or "what else is there" after an experience are about its place.
    if (focusedExperience && intentOf(message) === 'overview') return experienceReply(focusedExperience, message, true);
    if (focusedDestination) return placeReply(focusedDestination, message, true);
  }

  return listReply(message);
}
