'use client';

import { useState } from 'react';
import type { VerifiedFact } from '@/lib/types';
import type { HeritageExperience } from '@/server/data/seed';
import { FACT_TYPE_LABEL, FACT_TYPE_NOTE } from '@/lib/fact-types';
import { Badge, cn } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { HeritageScene, type SceneKind } from '@/components/shared/HeritageScene';

/**
 * E4: the living heritage walkthrough.
 *
 * Every layer names the verified facts it draws on, so the story is traceable
 * back to the knowledge base rather than being atmosphere. The narration text
 * is always on screen, which also serves as the caption track required by the
 * accessibility rules in docs/06-design-system.md.
 */
export function HeritageExperienceView({
  experience,
  factsById,
}: {
  experience: HeritageExperience;
  factsById: Record<string, VerifiedFact>;
}) {
  const [index, setIndex] = useState(0);
  const layer = experience.layers[index]!;
  const facts = layer.factIds.map((id) => factsById[id]).filter((fact): fact is VerifiedFact => !!fact);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-ink-900">
      <div className="relative aspect-[16/9] w-full bg-ink-900">
        <HeritageScene
          scene={experience.scene as SceneKind}
          overlay={layer.overlay}
          label={layer.title}
        />

        <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            Layer {index + 1} of {experience.layers.length}
          </span>
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur">
            Generated view, not a photograph
          </span>
        </div>
      </div>

      {/* Layer selector */}
      <div className="flex gap-1 overflow-x-auto border-t border-white/10 bg-ink-900 px-3 py-2">
        {experience.layers.map((entry, entryIndex) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setIndex(entryIndex)}
            aria-current={entryIndex === index ? 'step' : undefined}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
              entryIndex === index
                ? 'bg-white text-ink-900'
                : 'text-white/65 hover:bg-white/10 hover:text-white',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 bg-ink-900 px-5 py-5 text-white sm:px-7 sm:py-6">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">{layer.title}</h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-white/80">
            {layer.narration}
          </p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
            Drawn from
          </p>
          <ul className="mt-2 space-y-2">
            {facts.map((fact) => (
              <li key={fact.id} className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] font-medium text-white">{fact.title}</p>
                  <Badge
                    tone={fact.factType === 'DOCUMENTED' ? 'lake' : 'neutral'}
                    title={FACT_TYPE_NOTE[fact.factType]}
                  >
                    {FACT_TYPE_LABEL[fact.factType]}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-white/70">{fact.text}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
              className="rounded-md border border-white/20 px-3 py-1.5 text-[12px] text-white/85 hover:bg-white/10 disabled:opacity-40"
            >
              ‹ Previous
            </button>
            <button
              type="button"
              onClick={() => setIndex((value) => Math.min(experience.layers.length - 1, value + 1))}
              disabled={index === experience.layers.length - 1}
              className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-ink-900 hover:bg-white/90 disabled:opacity-40"
            >
              Next layer ›
            </button>
          </div>
          <p className="text-[11px] text-white/45">{experience.sourceNote}</p>
        </div>

        <Disclosure summary={<span className="text-white/70">Narration transcript</span>}>
          <div className="text-white/75">
            <p>{experience.audioTranscript}</p>
            <ol className="mt-2 space-y-2">
              {experience.layers.map((entry) => (
                <li key={entry.id}>
                  <span className="font-medium text-white">{entry.title}. </span>
                  {entry.narration}
                </li>
              ))}
            </ol>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
