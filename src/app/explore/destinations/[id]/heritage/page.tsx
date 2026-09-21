import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import type { VerifiedFact } from '@/lib/types';
import { getAllFacts, getDestination, getHeritageExperience } from '@/server/data/repository';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import { AskPlacePanel } from '@/components/shared/AskPlacePanel';
import { HeritageExperienceView } from '@/components/shared/HeritageExperienceView';
import { askPlace } from '@/server/actions/tourist';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const experience = getHeritageExperience(id);
  return { title: experience?.title ?? 'Living Heritage' };
}

export default async function HeritagePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const destination = getDestination(id);
  const experience = getHeritageExperience(id);
  if (!destination || !experience) notFound();

  const factsById: Record<string, VerifiedFact> = {};
  for (const fact of getAllFacts()) factsById[fact.id] = fact;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/explore/destinations/${id}`}
            className="text-[12px] font-medium text-brand-700 underline"
          >
            ‹ Back to {destination.name}
          </Link>
          <h1 className="mt-1.5 text-[24px] font-semibold tracking-tight text-ink-900">
            {experience.title}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">{experience.introduction}</p>
        </div>
        <ProvenanceBadge provenance="PUBLIC_EXTERNAL" />
      </div>

      <HeritageExperienceView experience={experience} factsById={factsById} />

      <Card>
        <CardHeader
          title="Ask about what you are looking at"
          subtitle="Answers come from the same knowledge base the layers are built on."
        />
        <CardBody>
          <AskPlacePanel
            destinationId={id}
            destinationName={destination.name}
            prompts={experience.askPrompts}
            ask={askPlace}
          />
        </CardBody>
      </Card>

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className="text-[12px] text-ink-600">
            A production spatial AR build is deliberately out of MVP scope. This is the interpretive
            layer that AR would carry, delivered in a form that works on any device, offline, with no
            camera permission. The camera-based version is a pilot item.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
