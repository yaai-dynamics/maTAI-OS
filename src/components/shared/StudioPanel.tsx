'use client';

import { useState, useTransition } from 'react';
import type { ContentBrief } from '@/server/ai/creator-studio';
import { Badge, Button, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/interactive';
import { FACT_TYPE_LABEL, FACT_TYPE_NOTE } from '@/lib/fact-types';

/**
 * AI Creator Studio.
 *
 * The brief is assembled from the campaign record and the verified knowledge
 * base, so a creator is never handed a claim the department has not verified.
 * Facts are shown with their type, so oral tradition is never presented as
 * documented history.
 */
export function StudioPanel({
  campaignId,
  campaignName,
  generate,
}: {
  campaignId: string;
  campaignName: string;
  /** The creator is taken from the session on the server, never passed from here. */
  generate: (campaignId: string) => Promise<{ ok: boolean; error?: string; brief?: ContentBrief }>;
}) {
  const [brief, setBrief] = useState<ContentBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await generate(campaignId);
      if (!result.ok || !result.brief) {
        setError(result.error ?? 'Could not generate a brief.');
        return;
      }
      setBrief(result.brief);
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div>
            <p className="text-[14px] font-semibold text-ink-900">{campaignName}</p>
            <p className="text-[12px] text-ink-600">
              The brief is grounded in the Tourism Department knowledge base for this destination.
            </p>
          </div>
          <Button onClick={run} disabled={pending}>
            {pending ? 'Generating…' : brief ? 'Regenerate brief' : 'Generate content brief'}
          </Button>
        </CardBody>
      </Card>

      {error ? <ErrorState title="Could not generate the brief" description={error} /> : null}

      {pending ? (
        <Card>
          <CardBody className="space-y-3 pt-4">
            <p className="text-[13px] text-ink-600">
              Reading the campaign objective, the destination record and the verified facts…
            </p>
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24" />
          </CardBody>
        </Card>
      ) : null}

      {brief && !pending ? (
        <div className="space-y-5 rise">
          <Card>
            <CardHeader title="Campaign concept" subtitle={brief.angle} />
            <CardBody>
              <p className="text-[15px] leading-relaxed text-ink-900">{brief.concept}</p>
            </CardBody>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Hooks" subtitle="First three seconds. Pick one, do not use all three." />
              <CardBody>
                <ul className="space-y-2">
                  {brief.hooks.map((hook, index) => (
                    <li
                      key={index}
                      className="flex items-start justify-between gap-2 rounded-md border border-line bg-surface p-2.5"
                    >
                      <span className="text-[13px] text-ink-800">{hook}</span>
                      <CopyButton value={hook} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Story structure" subtitle="Beat by beat, with a time budget." />
              <CardBody>
                <ol className="space-y-2">
                  {brief.storyStructure.map((beat) => (
                    <li key={beat.beat} className="rounded-md border border-line bg-surface p-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink-900">{beat.beat}</span>
                        <span className="num text-[11px] text-ink-500">{beat.seconds}s</span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-700">{beat.direction}</p>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Verified facts you may use"
              subtitle="Each one is labelled. Documented history and oral tradition are not the same claim."
            />
            <CardBody>
              <ul className="space-y-2">
                {brief.verifiedFacts.map((fact) => (
                  <li key={fact.id} className="rounded-md border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink-900">{fact.title}</p>
                      <Badge tone={fact.factType === 'DOCUMENTED' ? 'lake' : 'neutral'} title={FACT_TYPE_NOTE[fact.factType]}>
                        {FACT_TYPE_LABEL[fact.factType]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-700">{fact.text}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Caption and call to action" />
              <CardBody className="space-y-3">
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] text-ink-800">{brief.caption}</p>
                    <CopyButton value={brief.caption} />
                  </div>
                </div>
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                    Call to action
                  </p>
                  <p className="mt-1 text-[13px] text-ink-800">{brief.callToAction}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {brief.hashtags.map((hashtag) => (
                    <Badge key={hashtag} tone="brand">
                      {hashtag}
                    </Badge>
                  ))}
                </div>
                <div className="rounded-md border border-warn-500/30 bg-warn-100/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warn-700">
                    Required disclosure
                  </p>
                  <p className="mt-1 text-[13px] text-ink-900">{brief.disclosure}</p>
                </div>
              </CardBody>
            </Card>

            <div className="space-y-5">
              {brief.responsibleGuidance.length > 0 ? (
                <Card>
                  <CardHeader title="Responsible visit guidance" subtitle="Put this in the content, not only the caption." />
                  <CardBody>
                    <ul className="space-y-1.5">
                      {brief.responsibleGuidance.map((line, index) => (
                        <li key={index} className="flex gap-1.5 text-[13px] text-ink-800">
                          <span aria-hidden className="text-good-500">
                            ✓
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}

              <Card>
                <CardHeader title="Do not claim" />
                <CardBody>
                  <ul className="space-y-1.5">
                    {brief.doNotClaim.map((line, index) => (
                      <li key={index} className="flex gap-1.5 text-[13px] text-risk-700">
                        <span aria-hidden>×</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>

              {brief.localBusinessesToFeature.length > 0 ? (
                <Card>
                  <CardHeader
                    title="Local providers worth featuring"
                    subtitle="Verified, bookable, and able to host the people who watch this."
                  />
                  <CardBody>
                    <ul className="space-y-2">
                      {brief.localBusinessesToFeature.map((business) => (
                        <li key={business.name} className="rounded-md border border-line bg-surface p-2.5">
                          <p className="text-[13px] font-medium text-ink-900">{business.name}</p>
                          <p className="mt-0.5 text-[12px] text-ink-600">{business.why}</p>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}
            </div>
          </div>

          <Card tone="outline">
            <CardBody className="pt-4">
              <p className="text-[11px] text-ink-500">
                Generated by {brief.generatedBy}. Facts come from the curated knowledge base, not from
                the language model.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {!brief && !pending && !error ? (
        <Card>
          <CardBody className="pt-4">
            <p className="text-[13px] text-ink-600">
              The brief will include a concept, hooks, a beat-by-beat structure, verified facts, a
              caption, hashtags, the required disclosure and the responsible visit guidance for the
              destination.
            </p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
