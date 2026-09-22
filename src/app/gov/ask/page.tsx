import type { Metadata } from 'next';

import { resolveProvider } from '@/lib/ai/provider';
import { PROMPTS, PROMPT_VERSION } from '@/lib/ai/prompts';
import { SUGGESTED_QUESTIONS } from '@/server/ai/government-analyst';
import { AUTHORISED_TOOLS } from '@/server/ai/tools';
import { getDestination, getOfficialStatistics } from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { AskPanel } from '@/components/shared/AskPanel';
import { askQuestion } from '@/server/actions/government';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Ask the Decision Room' };
export const dynamic = 'force-dynamic';

/** Deep links from the demo panel and from other screens. */
const PRESETS: Record<string, string> = {
  promote:
    'Which destination should we promote to diversify tourism away from the most concentrated destinations?',
  growing: 'Which destinations are growing fastest?',
  complaints: 'What are tourists complaining about?',
  capacity: 'Which destinations have spare capacity?',
  creators: 'Which creators are best for the Discover Ukhrul campaign?',
  campaign: 'Did the Ukhrul Autumn Trails campaign improve tourism interest?',
  simulate: 'What happens if we promote Ukhrul to an additional 5,000 visitors?',
  concentration: 'Are tourists becoming too concentrated in a few destinations?',
  forecast: 'What will demand look like over the next two weeks?',
  opportunity: 'Where should we invest in tourism infrastructure?',
};

export default async function AskPage(props: {
  searchParams: Promise<{ q?: string; destination?: string; campaign?: string }>;
}) {
  await requireGovernment();
  const { q, destination, campaign } = await props.searchParams;

  let initialQuestion = q ? (PRESETS[q] ?? q) : undefined;
  if (initialQuestion && destination) {
    const name = getDestination(destination)?.name;
    if (name) initialQuestion = `${initialQuestion.replace(/\?$/, '')} at ${name}?`;
  }
  if (q === 'campaign' && campaign) {
    initialQuestion = `Did the ${campaign} campaign improve tourism interest?`;
  }

  const provider = resolveProvider();
  const official = getOfficialStatistics();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            Ask the Decision Room
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            An internal analyst, not a chatbot. Each question is routed to a fixed set of authorised
            tools, the figures are computed in code, and the model writes only the answer paragraph.
          </p>
        </div>
        <Badge tone={provider === 'mock' ? 'neutral' : 'brand'}>
          Provider: {provider === 'mock' ? 'deterministic (offline)' : provider}
        </Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AskPanel
          ask={askQuestion}
          suggestions={SUGGESTED_QUESTIONS}
          {...(initialQuestion ? { initialQuestion, autoRun: true } : {})}
        />

        <aside className="space-y-5">
          <Card>
            <CardHeader
              title="What this assistant may do"
              subtitle="It will not answer outside this set."
            />
            <CardBody>
              <ul className="space-y-2">
                {AUTHORISED_TOOLS.map((tool) => (
                  <li key={tool.name} className="rounded-md border border-line bg-surface p-2.5">
                    <p className="font-mono text-[12px] text-brand-700">{tool.name}</p>
                    <p className="mt-0.5 text-[12px] text-ink-600">{tool.description}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Rules it works under" />
            <CardBody>
              <ul className="space-y-1.5 text-[12px] text-ink-700">
                <li>· Figures come from the analytics engine. The model never calculates.</li>
                <li>· Synthetic prototype data is never described as official or observed.</li>
                <li>· Movement is reported as association, never as cause.</li>
                <li>· Confidence is derived from sample size and source, not chosen.</li>
                <li>· Every answer carries the audit trail of the tools that produced it.</li>
              </ul>
              <Disclosure summary="Prompt version" className="mt-3">
                <p className="font-mono text-[12px]">
                  {PROMPTS.governmentAnalyst.id}@{PROMPT_VERSION}
                </p>
              </Disclosure>
            </CardBody>
          </Card>

          <Card tone="outline">
            <CardBody className="pt-4">
              <p className="text-[12px] font-semibold text-ink-800">Official data is not connected</p>
              <p className="mt-1 text-[12px] text-ink-600">
                {official.sourceName} is not integrated with this prototype, and no figure is generated
                in place of one. Answers are built from platform signals, partner reports and curated
                knowledge.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
