import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import {
  getBusiness,
  getDataSource,
  getDestination,
  getDestinations,
  getEventsFor,
  getExperiencesFor,
  getFactsFor,
  getHeritageExperience,
} from '@/server/data/repository';
import { DestinationDetails } from '@/components/shared/DestinationDetails';
import { BackButton } from '@/components/shared/BackButton';
import { ViewSignal } from '@/components/telemetry/Signals';
import { askPlace } from '@/server/actions/tourist';
import { DEFAULT_ASK_PROMPTS } from '@/server/ai/storyteller';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const destination = getDestination(id);
  return { title: destination?.name ?? 'Destination' };
}

export default async function DestinationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const destination = getDestination(id);
  if (!destination) notFound();

  const facts = getFactsFor(id);
  const experiences = getExperiencesFor(id).map((experience) => ({
    experience,
    businessName: getBusiness(experience.businessId)?.name ?? 'Local provider',
  }));
  const heritage = getHeritageExperience(id);
  const events = getEventsFor(id);

  const narrative = facts.filter((fact) => fact.factType !== 'PRACTICAL');
  const practical = facts.filter((fact) => fact.factType === 'PRACTICAL');
  const source = getDataSource(facts[0]?.sourceId ?? 'src-curated-knowledge');

  const nearby = getDestinations()
    .filter((entry) => entry.id !== id && entry.district === destination.district)
    .slice(0, 3);

  const prompts = heritage ? heritage.askPrompts : DEFAULT_ASK_PROMPTS;

  return (
    <div className="space-y-4">
      {/* Opening the page is itself a tourism signal, recorded anonymously. */}
      <ViewSignal destinationId={id} />

      <BackButton fallbackHref="/explore/destinations" />

      <DestinationDetails
        data={{ destination, narrative, practical, source, heritage, experiences, events, nearby, prompts }}
        ask={askPlace}
      />
    </div>
  );
}
