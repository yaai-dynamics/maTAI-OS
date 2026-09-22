import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import type { VerifiedFact } from '@/lib/types';
import { getAllFacts, getDestination, getHeritageExperience } from '@/server/data/repository';
import { askPlace } from '@/server/actions/tourist';
import { AskPlacePanel } from '@/components/shared/AskPlacePanel';
import { HeritageExperienceView } from '@/components/shared/HeritageExperienceView';
import { BackLink } from '@/components/mobile/BackLink';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  return { title: getHeritageExperience(id)?.title ?? 'Living Heritage' };
}

/** E4 on mobile: the living-heritage layers, full screen and dark. */
export default async function MobileHeritagePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const destination = getDestination(id);
  const experience = getHeritageExperience(id);
  if (!destination || !experience) notFound();

  const factsById: Record<string, VerifiedFact> = {};
  for (const fact of getAllFacts()) factsById[fact.id] = fact;

  return (
    <div className="-mx-4 -mb-24 min-h-dvh bg-ink-900 px-4 pb-28 text-white">
      <BackLink fallbackHref={`/m/place/${id}`} tone="floating" label={`Back to ${destination.name}`} />
      <header className="flex min-h-11 items-center pb-3 pl-14 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/55">Living heritage · {destination.name}</p>
          <h1 className="truncate text-[17px] font-semibold">{experience.title}</h1>
        </div>
      </header>

      <p className="mb-4 text-[13px] leading-relaxed text-white/70">{experience.introduction}</p>

      <div className="-mx-4">
        <HeritageExperienceView experience={experience} factsById={factsById} />
      </div>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-[15px] font-semibold">Ask about what you are looking at</p>
        <p className="mb-3 mt-0.5 text-[12px] text-white/60">Answers come from the same knowledge base as the layers.</p>
        <AskPlacePanel
          destinationId={id}
          destinationName={destination.name}
          prompts={experience.askPrompts}
          ask={askPlace}
          tone="dark"
        />
      </section>

      <p className="mt-5 text-[11px] leading-relaxed text-white/50">
        Generated views, not photographs. A camera-based spatial AR build is a pilot item; this is the interpretive
        layer it would carry, working offline and with no camera permission. {experience.sourceNote}
      </p>
    </div>
  );
}
