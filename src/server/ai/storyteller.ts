import { narrate } from '@/lib/ai/provider';
import type { VerifiedFact } from '@/lib/types';
import { PROMPTS } from '@/lib/ai/prompts';
import { getDataSource, getDestination, getFactsFor } from '@/server/data/repository';

/**
 * Destination storyteller, the engine behind "Ask the Place".
 *
 * Retrieval is deterministic term matching over the curated knowledge base. If
 * nothing matches well enough, the answer says what is not known rather than
 * letting a model fill the gap (docs/05-ai-spec.md: do not invent claims).
 */

export interface GroundedAnswer {
  question: string;
  answer: string;
  facts: VerifiedFact[];
  /** True when nothing in the knowledge base answered the question. */
  unanswered: boolean;
  sourceName: string;
  provider: string;
  generatedAt: string;
}

const STOP_WORDS = new Set([
  'what', 'when', 'where', 'which', 'who', 'why', 'how', 'the', 'this', 'that', 'there',
  'about', 'tell', 'more', 'most', 'some', 'here', 'with', 'from', 'into', 'have', 'does',
  'know', 'first', 'time', 'visitors', 'visitor', 'place', 'anything', 'something', 'should',
  'would', 'could', 'like', 'much', 'many', 'and', 'for', 'you', 'can', 'are', 'was', 'were',
]);

const terms = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));

/** Questions asking to be surprised want the least obvious fact, not the closest match. */
const SURPRISE_PATTERNS = [
  'most first time visitors',
  'first time visitors',
  'do not know',
  "don't know",
  'surprise',
  'interesting',
  'tell me something',
  'not obvious',
];

function scoreFact(fact: VerifiedFact, questionTerms: string[]): number {
  const haystack = `${fact.title} ${fact.text} ${fact.tags.join(' ')}`.toLowerCase();
  let score = questionTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0), 0);
  // A title hit is a stronger signal than a body hit.
  score += questionTerms.reduce((sum, term) => sum + (fact.title.toLowerCase().includes(term) ? 2 : 0), 0);
  return score;
}

export async function askAboutDestination(
  destinationId: string,
  question: string,
): Promise<GroundedAnswer> {
  const destination = getDestination(destinationId);
  const facts = getFactsFor(destinationId);
  const questionTerms = terms(question);
  const wantsSurprise = SURPRISE_PATTERNS.some((pattern) => question.toLowerCase().includes(pattern));

  let selected: VerifiedFact[];
  let unanswered = false;

  if (wantsSurprise) {
    // Prefer documented detail and oral tradition over practical logistics,
    // which is what "something I would not know" actually means.
    const ranked = [...facts].sort((a, b) => {
      const weight = (fact: VerifiedFact) =>
        fact.factType === 'DOCUMENTED' ? 3 : fact.factType === 'ORAL_TRADITION' ? 2.5 : fact.factType === 'INTERPRETATION' ? 2 : 0.5;
      return weight(b) - weight(a);
    });
    selected = ranked.slice(0, 3);
  } else {
    const scored = facts
      .map((fact) => ({ fact, score: scoreFact(fact, questionTerms) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      unanswered = true;
      selected = facts.slice(0, 2);
    } else {
      selected = scored.slice(0, 3).map((row) => row.fact);
    }
  }

  const sourceName =
    getDataSource(selected[0]?.sourceId ?? 'src-curated-knowledge')?.name ??
    'Curated Manipur tourism knowledge base';

  const deterministicText = unanswered
    ? [
        `The curated knowledge base does not hold an answer to that for ${destination?.name ?? 'this destination'}.`,
        selected.length > 0
          ? `What it does cover here: ${selected.map((fact) => fact.title.toLowerCase()).join('; ')}.`
          : '',
        'Rather than guess, the platform leaves this open until a verified record is added.',
      ]
        .filter(Boolean)
        .join(' ')
    : selected
        .map((fact) => {
          const qualifier =
            fact.factType === 'ORAL_TRADITION'
              ? ' This is carried as tradition rather than documented event history.'
              : fact.factType === 'INTERPRETATION'
                ? ' This is a reading of the evidence rather than a settled conclusion.'
                : '';
          return `${fact.text}${qualifier}`;
        })
        .join(' ');

  const narration = await narrate({
    promptId: PROMPTS.destinationStoryteller.id,
    system: PROMPTS.destinationStoryteller.system,
    deterministicText,
    evidence: {
      destination: destination?.name,
      question,
      facts: selected.map((fact) => ({
        title: fact.title,
        text: fact.text,
        factType: fact.factType,
      })),
      unanswered,
    },
    task: unanswered
      ? 'Say plainly that the knowledge base does not cover this, and offer what it does cover. Do not answer from general knowledge.'
      : 'Answer the visitor question using only these facts.',
    maxTokens: 420,
  });

  return {
    question,
    answer: narration.text,
    facts: selected,
    unanswered,
    sourceName,
    provider: narration.fallback ? `${narration.provider} (fallback)` : narration.provider,
    generatedAt: new Date().toISOString(),
  };
}

/** Prompts offered on E3 when a destination has no heritage experience of its own. */
export const DEFAULT_ASK_PROMPTS = [
  'Tell me something most first-time visitors do not know about this place',
  'What should I know before I visit?',
  'How much time should I give it?',
  'What is the respectful way to visit?',
];
