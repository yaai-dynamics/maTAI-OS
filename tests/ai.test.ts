import { describe, expect, it } from 'vitest';

import { resolveProvider } from '@/lib/ai/provider';
import {
  askManipurTourism,
  classifyIntent,
  SUGGESTED_QUESTIONS,
} from '@/server/ai/government-analyst';
import { generateContentBrief } from '@/server/ai/creator-studio';
import { askAboutDestination } from '@/server/ai/storyteller';
import {
  buildItinerary,
  extractTripProfile,
  replanTrip,
} from '@/server/ai/trip-planner';
import { getDestination } from '@/server/data/repository';

/**
 * AI layer.
 *
 * These tests exist to hold the line that the model is never the thing that
 * produces a figure. They run against the deterministic provider, which is what
 * the hackathon demo runs on.
 */

it('runs on the deterministic provider with no key configured', () => {
  expect(resolveProvider()).toBe('mock');
});

describe('intent routing', () => {
  it('classifies every suggested question to a supported intent', () => {
    for (const question of SUGGESTED_QUESTIONS) {
      expect(classifyIntent(question), question).not.toBe('UNSUPPORTED');
    }
  });

  it('routes the specific questions the MVP spec names', () => {
    expect(classifyIntent('Which destinations are growing fastest?')).toBe('FASTEST_GROWING');
    expect(classifyIntent('What should we promote next month?')).toBe('PROMOTE_NEXT');
    expect(classifyIntent('Why did destination demand change?')).toBe('WHY_CHANGED');
    expect(classifyIntent('What are tourists complaining about?')).toBe('COMPLAINTS');
    expect(classifyIntent('Which destinations have spare capacity?')).toBe('SPARE_CAPACITY');
    expect(classifyIntent('Which creators are best for this campaign?')).toBe('BEST_CREATORS');
    expect(classifyIntent('Did the last campaign work?')).toBe('CAMPAIGN_RESULT');
    expect(
      classifyIntent('What happens if we promote this destination to an additional 5,000 visitors?'),
    ).toBe('SIMULATION');
  });

  it('refuses a question outside the tourism data', () => {
    expect(classifyIntent('What is the capital of France?')).toBe('UNSUPPORTED');
  });
});

describe('the answer contract', () => {
  it('is satisfied by every suggested question', async () => {
    for (const question of SUGGESTED_QUESTIONS) {
      const answer = await askManipurTourism(question);

      expect(answer.answer.length, question).toBeGreaterThan(40);
      expect(answer.evidence.length, question).toBeGreaterThan(0);
      expect(answer.toolTrace.length, question).toBeGreaterThan(0);
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(answer.confidence);
      expect(answer.confidenceReason.length).toBeGreaterThan(10);
      expect(answer.caveats.length).toBeGreaterThan(0);

      for (const item of answer.evidence) {
        expect(item.source.length, `${question} evidence source`).toBeGreaterThan(0);
        expect(item.provenance).toBeTruthy();
      }
    }
  });

  it('records which tool produced the evidence, so an answer can be audited', async () => {
    const answer = await askManipurTourism(
      'Which destination should we promote to diversify tourism away from the most concentrated destinations?',
    );
    const tools = answer.toolTrace.map((entry) => entry.tool);
    expect(tools).toContain('recommendCampaignTargets');
    for (const entry of answer.toolTrace) {
      expect(entry.summary.length).toBeGreaterThan(5);
      expect(entry.rowsConsidered).toBeGreaterThanOrEqual(0);
    }
  });

  it('flags when any input to an answer is prototype demo data', async () => {
    const answer = await askManipurTourism('What are tourists complaining about?');
    expect(typeof answer.usesSyntheticData).toBe('boolean');
  });

  it('never claims a causal link when evaluating a campaign', async () => {
    const answer = await askManipurTourism('Did the Ukhrul Autumn Trails campaign improve tourism interest?');
    expect(answer.answer.toLowerCase()).not.toMatch(/\bcaused\b|\bbecause of the campaign\b/);
    expect(answer.answer.toLowerCase()).toMatch(/associated with|funnel, not an attribution/);
    expect(answer.caveats.join(' ')).toMatch(/association, not attribution/i);
  });

  it('keeps a simulation below high confidence and labels it a scenario', async () => {
    const answer = await askManipurTourism(
      'What happens if we promote Ukhrul to an additional 5,000 visitors?',
    );
    expect(answer.confidence).not.toBe('HIGH');
    expect(answer.answer).toMatch(/forecast|scenario/i);
    expect(answer.evidence.every((item) => item.provenance === 'FORECAST')).toBe(true);
    expect(answer.caveats.join(' ')).toMatch(/assumptions/i);
  });

  it('answers an unsupported question with no evidence and low confidence', async () => {
    const answer = await askManipurTourism('What is the capital of France?');
    expect(answer.evidence).toHaveLength(0);
    expect(answer.confidence).toBe('LOW');
    expect(answer.recommendation).toBeUndefined();
    expect(answer.answer).toMatch(/will not answer outside that/i);
  });

  it('excludes the already concentrated destinations from a promotion answer', async () => {
    const answer = await askManipurTourism(
      'Which destination should we promote to diversify tourism away from the most concentrated destinations?',
    );
    expect(answer.recommendation).toBeTruthy();
    expect(answer.evidence.some((item) => item.label.startsWith('Not recommended:'))).toBe(true);
  });
});

describe('trip profile extraction', () => {
  it('reads the demo persona request correctly', () => {
    const profile = extractTripProfile(
      'I have 3 days, love nature, culture and local food, and prefer less crowded places.',
    );
    expect(profile.durationDays).toBe(3);
    expect(profile.interests).toContain('nature');
    expect(profile.interests).toContain('culture');
    expect(profile.interests).toContain('food');
    expect(profile.crowdPreference).toBe('QUIET');
    expect(profile.travelStyle.length).toBeGreaterThan(0);
  });

  it('reads duration written as a word', () => {
    expect(extractTripProfile('two days of heritage').durationDays).toBe(2);
  });

  it('reads budget, pace and accessibility', () => {
    const profile = extractTripProfile(
      'A relaxed budget trip with my elderly parents, mostly heritage.',
    );
    expect(profile.budget).toBe('BUDGET');
    expect(profile.pace).toBe('RELAXED');
    expect(profile.accessibility).toBe('SENIOR_FRIENDLY');
  });

  it('falls back to sensible interests rather than failing', () => {
    const profile = extractTripProfile('Somewhere nice please');
    expect(profile.interests.length).toBeGreaterThan(0);
    expect(profile.durationDays).toBe(3);
  });
});

describe('itinerary building', () => {
  const profile = extractTripProfile(
    'I have 3 days, love nature, culture and local food, and prefer less crowded places.',
  );
  const { trip, notIncluded } = buildItinerary(profile, 'sess-test');

  it('is deterministic for the same profile', () => {
    const again = buildItinerary(profile, 'sess-test');
    expect(again.trip.items.map((item) => item.destinationId)).toEqual(
      trip.items.map((item) => item.destinationId),
    );
  });

  it('stays inside the requested number of days', () => {
    const days = new Set(trip.items.map((item) => item.day));
    expect(Math.max(...days)).toBeLessThanOrEqual(profile.durationDays);
  });

  it('explains every stop against the stated preferences', () => {
    for (const item of trip.items) {
      expect(item.rationale.length, item.destinationId).toBeGreaterThan(20);
    }
  });

  it('never plans the border destination automatically', () => {
    expect(trip.items.some((item) => item.destinationId === 'dest-moreh')).toBe(false);
  });

  it('offers at least one alternative and says why', () => {
    expect(trip.alternatives.length).toBeGreaterThan(0);
    expect(trip.alternatives[0]!.reason.length).toBeGreaterThan(20);
  });

  it('says what it left out and why', () => {
    expect(notIncluded.length).toBeGreaterThan(0);
    expect(notIncluded[0]!.reason.length).toBeGreaterThan(10);
  });

  it('keeps a low mobility traveller off the demanding treks', () => {
    const accessible = extractTripProfile(
      'Four days of nature and heritage, but I have limited mobility.',
    );
    const built = buildItinerary(accessible, 'sess-access');
    expect(accessible.accessibility).toBe('LOW_MOBILITY');
    expect(built.trip.items.some((item) => item.destinationId === 'dest-dzukou')).toBe(false);
    expect(built.trip.items.some((item) => item.destinationId === 'dest-shirui')).toBe(false);
  });
});

describe('adaptive re-planning', () => {
  const profile = extractTripProfile('3 days of nature and culture, less crowded please');
  const { trip } = buildItinerary(profile, 'sess-replan');

  it('replaces an open-air stop when rain is the condition', () => {
    const replanned = replanTrip(trip, 'RAIN');
    expect(replanned.adaptedReason).toMatch(/rain/i);
    expect(replanned.items.length).toBe(trip.items.length);
  });

  it('removes a stop rather than rushing the day when time is short', () => {
    const replanned = replanTrip(trip, 'SHORT_ON_TIME');
    expect(replanned.items.length).toBeLessThanOrEqual(trip.items.length);
    expect(replanned.adaptedReason).toMatch(/short on time/i);
  });

  it('substitutes a closed site instead of leaving a gap', () => {
    const replanned = replanTrip(trip, 'CLOSURE');
    expect(replanned.items.length).toBe(trip.items.length);
    expect(replanned.adaptedReason).toBeTruthy();
  });
});

describe('destination storyteller', () => {
  it('answers from the curated knowledge base and returns the facts it used', async () => {
    const answer = await askAboutDestination(
      'dest-ukhrul',
      'Tell me something most first-time visitors do not know about this place',
    );
    expect(answer.facts.length).toBeGreaterThan(0);
    expect(answer.unanswered).toBe(false);
    expect(answer.answer.length).toBeGreaterThan(50);
  });

  it('marks oral tradition rather than presenting it as documented history', async () => {
    const answer = await askAboutDestination('dest-moirang', 'Tell me about Khamba and Thoibi');
    const oral = answer.facts.find((fact) => fact.factType === 'ORAL_TRADITION');
    expect(oral).toBeDefined();
    expect(answer.answer.toLowerCase()).toMatch(/tradition/);
  });

  it('says what is not known instead of inventing an answer', async () => {
    const answer = await askAboutDestination(
      'dest-khongjom',
      'What is the average rainfall in millimetres during September?',
    );
    expect(answer.unanswered).toBe(true);
    expect(answer.answer).toMatch(/does not hold an answer|not known|leaves this open/i);
  });
});

describe('creator brief', () => {
  it('is grounded in verified facts and carries the disclosure', async () => {
    const brief = await generateContentBrief('camp-001', 'creator-001');
    expect(brief).toBeDefined();
    expect(brief!.verifiedFacts.length).toBeGreaterThan(0);
    for (const fact of brief!.verifiedFacts) {
      expect(fact.verified).toBe(true);
    }
    expect(brief!.disclosure).toMatch(/paid partnership/i);
    expect(brief!.hooks.length).toBeGreaterThan(0);
    expect(brief!.storyStructure.length).toBeGreaterThan(3);
    expect(brief!.hashtags.length).toBeGreaterThan(3);
  });

  it('attaches responsible visit guidance for an ecologically sensitive destination', async () => {
    const destination = getDestination('dest-ukhrul')!;
    expect(destination.ecoSensitivity).toBe('HIGH');
    const brief = await generateContentBrief('camp-001', 'creator-001');
    expect(brief!.responsibleGuidance.length).toBeGreaterThan(0);
    expect(brief!.responsibleGuidance.join(' ')).toMatch(/sensitive/i);
  });

  it('tells the creator what they may not claim', async () => {
    const brief = await generateContentBrief('camp-001', 'creator-001');
    expect(brief!.doNotClaim.join(' ')).toMatch(/visitor numbers/i);
    expect(brief!.doNotClaim.join(' ')).toMatch(/oral tradition/i);
  });

  it('points the creator at verified local providers', async () => {
    const brief = await generateContentBrief('camp-001', 'creator-001');
    expect(brief!.localBusinessesToFeature.length).toBeGreaterThan(0);
  });

  it('returns nothing for a campaign that does not exist', async () => {
    expect(await generateContentBrief('camp-nope', 'creator-001')).toBeUndefined();
  });
});
