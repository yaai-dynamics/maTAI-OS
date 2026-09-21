import type { IssueCategory, PositiveTheme } from '@/lib/types';
import type { Rng } from '@/server/data/random';

/**
 * Text banks for generated demo feedback.
 *
 * Generated feedback exists so the sentiment and issue analytics have enough
 * volume to be meaningful. Every generated item is DEMO_SYNTHETIC and is
 * labelled as such wherever it is displayed.
 */

const ISSUE_TEXT: Record<IssueCategory, string[]> = {
  TRANSPORT: [
    'Reaching the site was harder than expected. Shared vehicle timings were not published anywhere.',
    'We could not find reliable information about the return journey.',
    'The road was fine but there was no clear guidance on how to get here without a private car.',
    'Transport options were unclear and we lost most of a morning working them out.',
  ],
  CLEANLINESS: [
    'Waste near the main viewpoint took away from an otherwise lovely visit.',
    'More bins and a regular clearing schedule would make a real difference here.',
    'Beautiful place, but litter along the approach path was noticeable.',
  ],
  SIGNAGE: [
    'Very little signage once you leave the main entrance.',
    'We walked the wrong way twice. A simple map board would solve it.',
    'Interpretation boards would help visitors understand what they are looking at.',
  ],
  SAFETY: [
    'We were not sure what was permitted and could not find current guidance.',
    'Some sections felt unsafe without a guide and there was no warning.',
    'Clearer safety instructions at the start would have helped.',
  ],
  CONNECTIVITY: [
    'Mobile data was unreliable, which made following the plan difficult.',
    'No usable signal for most of the visit. An offline map would help.',
    'Connectivity dropped completely, so we could not check timings.',
  ],
  FACILITIES: [
    'Very limited toilet and drinking water facilities for the number of visitors.',
    'Nowhere to sit or shelter during a sudden shower.',
    'Basic visitor facilities need attention given how busy it gets.',
  ],
  PRICING: [
    'Three different prices were quoted for the same thing. A published rate would help.',
    'Pricing was not displayed anywhere, so it came down to negotiation.',
    'We felt the rate was improvised rather than standard.',
  ],
  CROWDING: [
    'Far more crowded than we expected at this time of day.',
    'The viewpoint was congested and it was hard to move around.',
    'A timed entry system would improve the experience at peak hours.',
  ],
  ACCESSIBILITY: [
    'Several sections had steps with no alternative route for my parent.',
    'Not easy for anyone with limited mobility, and nothing says so in advance.',
    'Accessibility information ahead of the visit would have helped us plan.',
  ],
  GUIDE_QUALITY: [
    'Guide quality varied noticeably between groups.',
    'Our guide was knowledgeable but rushed the parts we were most interested in.',
    'Some basic training on interpretation would raise the experience a lot.',
  ],
};

const POSITIVE_TEXT: Record<PositiveTheme, string[]> = {
  EXPERIENCE: [
    'One of the best half days of the whole trip. Well organised and genuinely interesting.',
    'Exactly the kind of experience we came for. Worth the journey.',
    'Memorable from start to finish, and the explanation made it far better.',
  ],
  NATURE: [
    'The landscape is extraordinary and the early start was worth it.',
    'Quiet, beautiful and far less crowded than we expected.',
    'Stunning scenery. Please protect it.',
  ],
  HERITAGE: [
    'The history brought the site alive in a way a plaque never would.',
    'Fascinating layers of history in one place.',
    'Understanding what happened here changed how we saw it.',
  ],
  CULTURE: [
    'Meeting the makers was the highlight. It felt authentic rather than staged.',
    'The cultural context made the visit far more meaningful.',
    'A genuine local experience, not a performance for visitors.',
  ],
  FOOD: [
    'The food was the surprise of the trip. Fresh, local and very well explained.',
    'Cooking with the family was the best hour of the day.',
    'Excellent local food and a lot of it.',
  ],
  HOSPITALITY: [
    'Our hosts went out of their way to make us welcome.',
    'Warm, generous hosts who clearly care about their village.',
    'The hospitality is the reason we would come back.',
  ],
};

export const pickIssueText = (rng: Rng, category: IssueCategory): string =>
  rng.pick(ISSUE_TEXT[category]);

export const pickPositiveText = (rng: Rng, theme: PositiveTheme): string =>
  rng.pick(POSITIVE_TEXT[theme]);

/** Maps a destination category onto the praise theme visitors tend to use. */
export function positiveThemeFor(categories: readonly string[], rng: Rng): PositiveTheme {
  const candidates: PositiveTheme[] = [];
  for (const category of categories) {
    if (category === 'nature' || category === 'wildlife' || category === 'eco-tourism') {
      candidates.push('NATURE');
    }
    if (category === 'heritage' || category === 'history' || category === 'spiritual') {
      candidates.push('HERITAGE');
    }
    if (category === 'culture' || category === 'craft' || category === 'market') {
      candidates.push('CULTURE');
    }
    if (category === 'food' || category === 'commerce') {
      candidates.push('FOOD');
    }
  }
  candidates.push('EXPERIENCE', 'HOSPITALITY');
  return rng.pick(candidates);
}
