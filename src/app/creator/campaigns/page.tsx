import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { matchCreators } from '@/server/analytics/matching';
import {
  getApplications,
  getCampaigns,
  getDestination,
  getFactsFor,
} from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';
import { CampaignCard } from '@/components/shared/cards';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { ActionForm, Field, TextArea } from '@/components/shared/ActionForm';
import { applyToCampaignForm } from '@/server/actions/forms';
import { FACT_TYPE_LABEL } from '@/lib/fact-types';
import { requireCreator } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Campaign Discovery' };
export const dynamic = 'force-dynamic';

export default async function CampaignDiscoveryPage(props: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { creatorId } = await requireCreator();
  const { campaign: campaignParam } = await props.searchParams;

  // Drafts are not visible to creators until the department launches them.
  const openCampaigns = getCampaigns().filter((campaign) => campaign.status !== 'DRAFT');
  const selected =
    openCampaigns.find((campaign) => campaign.id === campaignParam) ??
    openCampaigns.find((campaign) => campaign.status === 'OPEN') ??
    openCampaigns[0];

  const destination = selected ? getDestination(selected.destinationId) : undefined;
  const myApplication = selected
    ? getApplications({ campaignId: selected.id, creatorId: creatorId })[0]
    : undefined;
  const match = selected
    ? matchCreators(selected, 20).find((row) => row.creator.id === creatorId)
    : undefined;
  const facts = destination ? getFactsFor(destination.id).slice(0, 4) : [];

  const canApply =
    selected !== undefined &&
    (selected.status === 'OPEN' || selected.status === 'IN_PROGRESS') &&
    myApplication === undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Campaign Discovery</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Tourism Department campaigns, with the objective, audience, content requirement, deadline
          and reward stated up front.
        </p>
      </div>

      {openCampaigns.length === 0 ? (
        <EmptyState
          title="No campaign is open yet"
          description="The Tourism Department has not launched a campaign. Drafts are not visible to creators."
          action={
            <Link href="/gov/campaigns" className="text-[13px] font-medium text-brand-700 underline">
              See the department view
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader title="Open campaigns" eyebrow={`${openCampaigns.length} available`} />
            <CardBody>
              <ul className="space-y-3">
                {openCampaigns.map((campaign) => (
                  <li key={campaign.id}>
                    <CampaignCard
                      campaign={campaign}
                      destinationName={getDestination(campaign.destinationId)?.name ?? ''}
                      highlight={selected?.id === campaign.id}
                      href={`/creator/campaigns?campaign=${campaign.id}`}
                    />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {selected && destination ? (
            <Card className="overflow-hidden">
              <DestinationVisual destination={destination} height="md" overlay />
              <CardHeader
                title={selected.name}
                subtitle={`${destination.name}, ${destination.district} district`}
                action={
                  <Badge tone={selected.status === 'OPEN' ? 'good' : 'info'}>
                    {selected.status.replace('_', ' ').toLowerCase()}
                  </Badge>
                }
              />
              <CardBody className="space-y-4">
                <section>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                    What the department wants to achieve
                  </h3>
                  <p className="text-[14px] text-ink-900">{selected.objective}</p>
                </section>

                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <div className="rounded-md border border-line bg-surface-2/50 p-3">
                    <dt className="text-[12px] text-ink-500">Reward pool</dt>
                    <dd className="num mt-0.5 text-[20px] font-semibold text-ink-900">
                      ₹{selected.rewardPool.toLocaleString('en-IN')}
                    </dd>
                  </div>
                  <div className="rounded-md border border-line bg-surface-2/50 p-3">
                    <dt className="text-[12px] text-ink-500">Deadline</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold text-ink-900">
                      {formatLongDate(selected.endDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-ink-500">Target audience</dt>
                    <dd className="text-ink-900">{selected.targetAudience}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-ink-500">Platforms</dt>
                    <dd className="text-ink-900">{selected.platforms.join(', ')}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[12px] text-ink-500">Content required</dt>
                    <dd className="text-ink-900">{selected.contentRequirement}</dd>
                  </div>
                </dl>

                {match ? (
                  <section className="rounded-md border border-brand-200 bg-brand-50 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[13px] font-semibold text-ink-900">
                        Why you were matched
                      </h3>
                      <span className="num text-[18px] font-semibold text-brand-700">
                        {match.totalScore}
                        <span className="text-[11px] font-normal text-ink-500">/100</span>
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {match.factors.map((factor) => (
                        <li key={factor.key} className="text-[12px] text-ink-700">
                          <span className="font-medium text-ink-900">{factor.label}:</span>{' '}
                          {factor.detail} ({factor.score}/{factor.maxScore})
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                    Approved information you may use
                  </h3>
                  <ul className="space-y-1.5">
                    {facts.map((fact) => (
                      <li key={fact.id} className="rounded-md border border-line bg-surface p-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-[13px] font-medium text-ink-900">{fact.title}</p>
                          <Badge tone={fact.factType === 'DOCUMENTED' ? 'lake' : 'neutral'}>
                            {FACT_TYPE_LABEL[fact.factType]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[12px] text-ink-700">{fact.text}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-ink-500">
                    These are verified by the Tourism Department knowledge base. Anything outside this
                    set is yours to verify before you publish.
                  </p>
                </section>

                <section className="border-t border-line pt-4">
                  {myApplication ? (
                    <div className="rounded-md border border-good-500/30 bg-good-100 p-3.5">
                      <p className="text-[13px] font-medium text-good-700">
                        You applied on {formatLongDate(myApplication.submittedAt)} — status{' '}
                        {myApplication.status.toLowerCase()}.
                      </p>
                      <Link
                        href={`/creator/studio?campaign=${selected.id}`}
                        className="mt-2 inline-block rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
                      >
                        Open the AI Creator Studio
                      </Link>
                    </div>
                  ) : canApply ? (
                    <ActionForm
                      action={applyToCampaignForm}
                      submitLabel="Apply to this campaign"
                      pendingLabel="Applying…"
                      hiddenFields={{ campaignId: selected.id }}
                      footer={
                        <span className="text-[12px] text-ink-500">
                          The department sees your application immediately.
                        </span>
                      }
                    >
                      <Field
                        label="Your concept (optional)"
                        name="proposedConcept"
                        hint="One or two sentences on the angle you would take."
                      >
                        <TextArea
                          id="proposedConcept"
                          name="proposedConcept"
                          maxLength={400}
                          placeholder="Three mornings on the ridge, filmed with the guides who walk it."
                        />
                      </Field>
                    </ActionForm>
                  ) : (
                    <p className="rounded-md border border-line bg-surface-2/50 p-3 text-[13px] text-ink-600">
                      This campaign is {selected.status.replace('_', ' ').toLowerCase()} and not open
                      to new applications.
                    </p>
                  )}
                </section>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <ProvenanceBadge provenance={selected.provenance} />
                  <Disclosure summary="Responsible content note">
                    {destination.ecoSensitivity === 'HIGH'
                      ? 'This destination is flagged as ecologically sensitive. The brief will include responsible visit guidance that must appear in the content itself, not only in the caption.'
                      : 'No special ecological restriction applies here, but local hosting arrangements still do. The brief will name them.'}
                  </Disclosure>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="pt-4">
                <EmptyState title="Select a campaign" description="Choose one from the list." />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className={cn('text-[12px] text-ink-600')}>
            Applying records an application against your creator profile. Live social platform
            integrations are out of MVP scope, so publishing and reach reporting are simulated.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
