import type { Destination } from '@/lib/types';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { DEFAULT_ASK_PROMPTS } from '@/server/ai/storyteller';
import {
  getBusiness,
  getDataSource,
  getDestinations,
  getEventsFor,
  getExperiencesFor,
  getFactsFor,
  getHeritageExperience,
} from '@/server/data/repository';

/**
 * Everything a destination's own page shows, gathered in one place.
 *
 * Used by the destination page itself, the "Explore" popup on a trip's stops
 * (components/shared/JourneyTimeline.tsx) and the Discover chat's place
 * cards, so the three do not carry three copies of the same assembly.
 */
export function buildDestinationPreview(destination: Destination): DestinationDetailsData {
  const facts = getFactsFor(destination.id);
  const heritage = getHeritageExperience(destination.id);
  return {
    destination,
    narrative: facts.filter((fact) => fact.factType !== 'PRACTICAL'),
    practical: facts.filter((fact) => fact.factType === 'PRACTICAL'),
    source: getDataSource(facts[0]?.sourceId ?? 'src-curated-knowledge'),
    heritage,
    experiences: getExperiencesFor(destination.id).map((experience) => ({
      experience,
      businessName: getBusiness(experience.businessId)?.name ?? 'Local provider',
    })),
    events: getEventsFor(destination.id),
    nearby: getDestinations()
      .filter((entry) => entry.id !== destination.id && entry.district === destination.district)
      .slice(0, 3),
    prompts: heritage ? heritage.askPrompts : DEFAULT_ASK_PROMPTS,
  };
}
