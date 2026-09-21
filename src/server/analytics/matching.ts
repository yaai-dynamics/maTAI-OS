import type { Campaign, Creator } from '@/lib/types';
import { getCreators, getDestination, getApplications } from '@/server/data/repository';
import { roundTo } from '@/server/analytics/windows';

/**
 * Creator matching.
 *
 * Ranking is deterministic and every component is shown to the officer. The
 * model is used afterwards to explain a match in prose, never to produce the
 * ranking itself (docs/05-ai-spec.md: do not make opaque decisions solely from
 * an LLM).
 */

export interface MatchFactor {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

export interface CreatorMatch {
  creator: Creator;
  totalScore: number;
  factors: MatchFactor[];
  /** Short reasons, ordered strongest first, for the shortlist card. */
  highlights: string[];
  /** Things an officer should weigh against the score. */
  cautions: string[];
  alreadyApplied: boolean;
}

const WEIGHTS = {
  category: 30,
  performance: 20,
  platform: 15,
  audience: 15,
  language: 10,
  geography: 10,
} as const;

function parseAgeBand(band: string): [number, number] | null {
  const match = /(\d{2})\s*-\s*(\d{2})/.exec(band);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function ageOverlap(creatorBand: string, campaignBand: string): number {
  const creator = parseAgeBand(creatorBand);
  const campaign = parseAgeBand(campaignBand);
  if (!creator || !campaign) return 0.5;
  const low = Math.max(creator[0], campaign[0]);
  const high = Math.min(creator[1], campaign[1]);
  if (high <= low) return 0;
  const campaignSpan = campaign[1] - campaign[0];
  return campaignSpan === 0 ? 0 : (high - low) / campaignSpan;
}

const overlapCount = (a: readonly string[], b: readonly string[]): string[] => {
  const lowered = new Set(b.map((value) => value.toLowerCase()));
  return a.filter((value) => lowered.has(value.toLowerCase()));
};

/** Highest median itinerary additions across creators, used to normalise performance. */
function performanceCeiling(creators: readonly Creator[]): number {
  return Math.max(1, ...creators.map((creator) => creator.medianItineraryAdds));
}

export function matchCreators(campaign: Campaign, limit = 5): CreatorMatch[] {
  const creators = getCreators();
  const destination = getDestination(campaign.destinationId);
  const ceiling = performanceCeiling(creators);
  const existingApplications = getApplications({ campaignId: campaign.id });

  // Themes the campaign is trying to serve, plus what the destination actually is.
  const targetThemes = [...campaign.themes, ...(destination?.category ?? [])];

  const matches = creators
    // A creator awaiting verification cannot be shortlisted: shortlisting is a
    // departmental endorsement, and it should not precede the check.
    .filter((creator) => creator.status === 'ACTIVE')
    .map((creator) => {
      const factors: MatchFactor[] = [];
      const highlights: string[] = [];
      const cautions: string[] = [];

      const sharedThemes = overlapCount(creator.categories, targetThemes);
      const categoryScore =
        targetThemes.length === 0
          ? WEIGHTS.category * 0.5
          : (Math.min(sharedThemes.length, 3) / 3) * WEIGHTS.category;
      factors.push({
        key: 'category',
        label: 'Content category match',
        score: roundTo(categoryScore, 1),
        maxScore: WEIGHTS.category,
        detail:
          sharedThemes.length > 0
            ? `Covers ${sharedThemes.join(', ')}`
            : 'No overlap with the campaign themes',
      });
      if (sharedThemes.length >= 2) highlights.push(`Covers ${sharedThemes.slice(0, 3).join(', ')}`);

      const performanceScore =
        (creator.medianItineraryAdds / ceiling) * (WEIGHTS.performance * 0.7) +
        Math.min(1, creator.campaignsCompleted / 5) * (WEIGHTS.performance * 0.3);
      factors.push({
        key: 'performance',
        label: 'Past tourism outcomes',
        score: roundTo(performanceScore, 1),
        maxScore: WEIGHTS.performance,
        detail: `${creator.medianItineraryAdds} median itinerary additions across ${creator.campaignsCompleted} completed campaign${creator.campaignsCompleted === 1 ? '' : 's'}`,
      });
      if (creator.medianItineraryAdds >= ceiling * 0.8) {
        highlights.push('Among the strongest past tourism outcomes on the platform');
      }
      if (creator.campaignsCompleted === 0) {
        cautions.push('No completed campaign on the platform yet');
      }

      const sharedPlatforms = overlapCount(creator.platforms, campaign.platforms);
      const platformScore = (sharedPlatforms.length / campaign.platforms.length) * WEIGHTS.platform;
      factors.push({
        key: 'platform',
        label: 'Platform and format fit',
        score: roundTo(platformScore, 1),
        maxScore: WEIGHTS.platform,
        detail:
          sharedPlatforms.length > 0
            ? `Publishes on ${sharedPlatforms.join(' and ')}`
            : `Does not publish on ${campaign.platforms.join(' or ')}`,
      });
      if (sharedPlatforms.length < campaign.platforms.length) {
        cautions.push(
          `Campaign asks for ${campaign.platforms.join(' and ')}; this creator publishes on ${creator.platforms.join(' and ')}`,
        );
      }

      const audienceFit = ageOverlap(creator.audienceAgeBand, campaign.audienceAgeBand);
      factors.push({
        key: 'audience',
        label: 'Target audience match',
        score: roundTo(audienceFit * WEIGHTS.audience, 1),
        maxScore: WEIGHTS.audience,
        detail: `Reaches ${creator.audienceAgeBand} against a target of ${campaign.audienceAgeBand}`,
      });
      if (audienceFit >= 0.8) highlights.push(`Audience sits in the ${campaign.audienceAgeBand} target band`);

      const sharedLanguages = overlapCount(creator.languages, campaign.preferredLanguages);
      const languageScore =
        campaign.preferredLanguages.length === 0
          ? WEIGHTS.language * 0.5
          : (Math.min(sharedLanguages.length, 2) / 2) * WEIGHTS.language;
      factors.push({
        key: 'language',
        label: 'Language match',
        score: roundTo(languageScore, 1),
        maxScore: WEIGHTS.language,
        detail:
          sharedLanguages.length > 0
            ? `Publishes in ${sharedLanguages.join(', ')}`
            : 'No overlap with the preferred languages',
      });

      const sameDistrict = destination !== undefined && creator.homeDistrict === destination.district;
      const geographyScore = sameDistrict ? WEIGHTS.geography : WEIGHTS.geography * 0.35;
      factors.push({
        key: 'geography',
        label: 'Geography',
        score: roundTo(geographyScore, 1),
        maxScore: WEIGHTS.geography,
        detail: sameDistrict
          ? `Based in ${creator.homeDistrict}, the same district as the destination`
          : `Based in ${creator.homeDistrict}`,
      });
      if (sameDistrict) highlights.push(`Based in ${creator.homeDistrict}, so filming access is local`);

      if (!creator.verified) cautions.push('Creator identity is not yet verified');
      if (creator.status === 'PENDING_VERIFICATION') cautions.push('Onboarding is still in progress');

      const totalScore = roundTo(
        factors.reduce((sum, factor) => sum + factor.score, 0),
        1,
      );

      return {
        creator,
        totalScore,
        factors,
        highlights: highlights.slice(0, 3),
        cautions,
        alreadyApplied: existingApplications.some((a) => a.creatorId === creator.id),
      } satisfies CreatorMatch;
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  return matches.slice(0, limit);
}

export const MATCHING_METHOD =
  'Deterministic score out of 100: content category match 30, past tourism outcomes 20, platform and format fit 15, target audience match 15, language match 10, geography 10.';
