import Link from 'next/link';
import type { Metadata } from 'next';

import { now } from '@/lib/config';
import { addDays, formatLongDate, toIsoDate } from '@/lib/date';
import { computeCampaignFunnel } from '@/server/analytics/campaign';
import { matchCreators, MATCHING_METHOD } from '@/server/analytics/matching';
import {
  getApplications,
  getCampaigns,
  getCreator,
  getDestination,
  getDestinations,
} from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfidenceBadge, DemoDataNote, ProvenanceBadge } from '@/components/shared/badges';
import { CampaignCard } from '@/components/shared/cards';
import { CreatorMatchCard } from '@/components/shared/CreatorMatchCard';
import { FunnelBars } from '@/components/charts/FunnelBars';
import { ChartFrame } from '@/components/charts/ChartFrame';
import {
  ActionForm,
  CheckboxRow,
  Field,
  Select,
  TextArea,
  TextInput,
} from '@/components/shared/ActionForm';
import { createCampaignForm, launchCampaignForm } from '@/server/actions/forms';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Campaign and Creator Command' };
export const dynamic = 'force-dynamic';

export default async function CampaignCommandPage(props: {
  searchParams: Promise<{ campaign?: string; view?: string }>;
}) {
  await requireGovernment();
  const { campaign: campaignParam, view } = await props.searchParams;
  const campaigns = getCampaigns();
  const destinations = getDestinations();

  // Default to the drafted campaign waiting for a decision, which is where an
  // officer actually starts.
  const selected =
    campaigns.find((entry) => entry.id === campaignParam) ??
    campaigns.find((entry) => entry.status === 'DRAFT') ??
    campaigns[0];

  const matches = selected ? matchCreators(selected, 5) : [];
  const applications = selected ? getApplications({ campaignId: selected.id }) : [];
  const funnel = selected ? computeCampaignFunnel(selected.id) : undefined;
  const destination = selected ? getDestination(selected.destinationId) : undefined;

  const showComposer = view === 'new';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            Campaign and Creator Command
          </h1>
          <p className="mt-1 text-[13px] text-ink-600">
            Draft a campaign, see which creators the platform matches to it and why, then launch.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/gov/campaigns"
            className={cn(
              'rounded-md border px-3 py-1.5 text-[13px] font-medium',
              !showComposer
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
            )}
          >
            Campaigns
          </Link>
          <Link
            href="/gov/campaigns?view=new"
            className={cn(
              'rounded-md border px-3 py-1.5 text-[13px] font-medium',
              showComposer
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
            )}
          >
            New campaign
          </Link>
        </div>
      </div>

      {showComposer ? (
        <Card>
          <CardHeader
            title="Create a campaign"
            subtitle="The fields here are what the creator sees, so write the objective as you would want it published."
          />
          <CardBody>
            <ActionForm
              action={createCampaignForm}
              submitLabel="Create and open to creators"
              pendingLabel="Creating…"
              footer={
                <span className="text-[12px] text-ink-500">
                  Created campaigns are labelled as prototype data.
                </span>
              }
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Campaign name" name="name" required>
                  <TextInput id="name" name="name" required maxLength={120} placeholder="Discover Ukhrul" />
                </Field>

                <Field label="Destination" name="destinationId" required>
                  <Select id="destinationId" name="destinationId" required defaultValue="dest-ukhrul">
                    {destinations.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} — {entry.district}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Objective"
                  name="objective"
                  required
                  hint="What the department is trying to achieve, not what the content should look like."
                >
                  <TextArea
                    id="objective"
                    name="objective"
                    required
                    maxLength={600}
                    placeholder="Promote nature and culture tourism while diversifying demand away from the most concentrated destinations."
                  />
                </Field>

                <Field label="Target audience" name="targetAudience" required>
                  <TextArea
                    id="targetAudience"
                    name="targetAudience"
                    required
                    maxLength={200}
                    placeholder="18-35 domestic travellers interested in nature and culture"
                  />
                </Field>

                <Field label="Audience age band" name="audienceAgeBand" hint="Used by creator matching.">
                  <TextInput id="audienceAgeBand" name="audienceAgeBand" defaultValue="18-35" />
                </Field>

                <Field label="Reward pool (₹)" name="rewardPool" required>
                  <TextInput
                    id="rewardPool"
                    name="rewardPool"
                    type="number"
                    min={0}
                    step={1000}
                    defaultValue={20000}
                    required
                  />
                </Field>

                <Field label="Start date" name="startDate" required>
                  <TextInput
                    id="startDate"
                    name="startDate"
                    type="date"
                    required
                    defaultValue={toIsoDate(now())}
                  />
                </Field>

                <Field label="End date" name="endDate" required>
                  <TextInput
                    id="endDate"
                    name="endDate"
                    type="date"
                    required
                    defaultValue={toIsoDate(addDays(now(), 14))}
                  />
                </Field>

                <Field label="Content requirement" name="contentRequirement" required>
                  <TextInput
                    id="contentRequirement"
                    name="contentRequirement"
                    required
                    defaultValue="60 second short video or reel plus caption"
                  />
                </Field>

                <Field label="Platforms" name="platforms" required>
                  <div className="flex flex-wrap gap-1.5">
                    <CheckboxRow name="platforms" value="Instagram" label="Instagram" defaultChecked />
                    <CheckboxRow name="platforms" value="YouTube" label="YouTube" defaultChecked />
                    <CheckboxRow name="platforms" value="Facebook" label="Facebook" />
                    <CheckboxRow name="platforms" value="X" label="X" />
                  </div>
                </Field>

                <Field label="Themes" name="themes" hint="Matched against creator content categories.">
                  <div className="flex flex-wrap gap-1.5">
                    <CheckboxRow name="themes" value="nature" label="nature" defaultChecked />
                    <CheckboxRow name="themes" value="culture" label="culture" defaultChecked />
                    <CheckboxRow name="themes" value="heritage" label="heritage" />
                    <CheckboxRow name="themes" value="food" label="food" />
                    <CheckboxRow name="themes" value="eco-tourism" label="eco-tourism" />
                    <CheckboxRow name="themes" value="adventure" label="adventure" />
                  </div>
                </Field>

                <Field label="Preferred languages" name="preferredLanguages">
                  <div className="flex flex-wrap gap-1.5">
                    <CheckboxRow name="preferredLanguages" value="English" label="English" defaultChecked />
                    <CheckboxRow name="preferredLanguages" value="Hindi" label="Hindi" defaultChecked />
                    <CheckboxRow name="preferredLanguages" value="Meitei" label="Meitei" />
                    <CheckboxRow name="preferredLanguages" value="Tangkhul" label="Tangkhul" />
                  </div>
                </Field>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Campaigns"
              subtitle="Select a campaign to see its creator matching and performance."
              eyebrow={`${campaigns.length} total`}
            />
            <CardBody>
              <ul className="space-y-2.5">
                {campaigns.map((entry) => {
                  const entryDestination = getDestination(entry.destinationId);
                  const isSelected = selected?.id === entry.id;
                  return (
                    <li key={entry.id}>
                      <CampaignCard
                        campaign={entry}
                        destinationName={entryDestination?.name ?? entry.destinationId}
                        applicationCount={getApplications({ campaignId: entry.id }).length}
                        highlight={isSelected}
                        href={`/gov/campaigns?campaign=${entry.id}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          {selected ? (
            <>
              <Card>
                <CardHeader
                  title={`AI creator matching: ${selected.name}`}
                  subtitle="Ranked deterministically on six weighted factors. The model explains a match, it does not decide one."
                  action={<Badge tone="brand">{matches.length} shortlisted</Badge>}
                />
                <CardBody className="space-y-3">
                  {selected.status === 'DRAFT' ? (
                    <div className="rounded-md border border-brand-200 bg-brand-50 p-3.5">
                      <p className="text-[13px] font-medium text-ink-900">
                        This campaign is a draft. Creators cannot see it yet.
                      </p>
                      <p className="mt-1 text-[12px] text-ink-700">
                        {destination?.name} · ₹{selected.rewardPool.toLocaleString('en-IN')} reward
                        pool · closes {formatLongDate(selected.endDate)}
                      </p>
                      <div className="mt-3">
                        <ActionForm
                          action={launchCampaignForm}
                          submitLabel="Launch campaign"
                          pendingLabel="Launching…"
                          hiddenFields={{ campaignId: selected.id }}
                          footer={
                            <span className="text-[12px] text-ink-600">
                              Launching opens it to every matched creator.
                            </span>
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  {matches.length === 0 ? (
                    <EmptyState
                      title="No creator matched"
                      description="Widen the themes or platforms on the campaign."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {matches.map((match, index) => (
                        <li key={match.creator.id}>
                          <CreatorMatchCard match={match} rank={index + 1} campaignId={selected.id} />
                        </li>
                      ))}
                    </ul>
                  )}

                  <Disclosure summary="How the match score is calculated">{MATCHING_METHOD}</Disclosure>
                  <DemoDataNote>
                    Creator scores and past campaign outcomes are prototype demo data. In a pilot they
                    would come from delivered campaigns on this platform.
                  </DemoDataNote>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Applications"
                  subtitle="Everything a creator does here is visible to the department immediately."
                  eyebrow={`${applications.length} received`}
                />
                <CardBody>
                  {applications.length === 0 ? (
                    <EmptyState
                      icon="—"
                      title="No applications yet"
                      description="Invite a shortlisted creator, or wait for applications once the campaign is live."
                    />
                  ) : (
                    <ul className="space-y-2">
                      {applications.map((application) => {
                        const creator = getCreator(application.creatorId);
                        return (
                          <li
                            key={application.id}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line bg-surface p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-ink-900">
                                {creator?.displayName ?? application.creatorId}
                              </p>
                              {application.proposedConcept ? (
                                <p className="mt-0.5 text-[12px] text-ink-600">
                                  {application.proposedConcept}
                                </p>
                              ) : null}
                            </div>
                            <Badge
                              tone={
                                application.status === 'ACCEPTED'
                                  ? 'good'
                                  : application.status === 'DECLINED'
                                    ? 'risk'
                                    : 'neutral'
                              }
                            >
                              {application.status.toLowerCase()}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>

              {funnel && selected.status !== 'DRAFT' ? (
                <Card>
                  <CardHeader
                    title="Performance"
                    subtitle={funnel.scaleNote}
                    action={<ConfidenceBadge confidence={funnel.confidence} />}
                  />
                  <CardBody className="space-y-4">
                    <ChartFrame
                      title="Reach reported by the publishing platforms"
                      provenance="DEMO_SYNTHETIC"
                      table={{
                        columns: ['Metric', 'Value'],
                        rows: funnel.steps
                          .filter((step) => step.block === 'REACH')
                          .map((step) => [step.label, step.value.toLocaleString('en-IN')]),
                      }}
                    >
                      <FunnelBars
                        stages={funnel.steps
                          .filter((step) => step.block === 'REACH')
                          .map((step) => ({
                            id: step.metric,
                            label: step.label,
                            value: step.value,
                            provenance: step.provenance,
                          }))}
                      />
                    </ChartFrame>

                    <ChartFrame
                      title="Signals observed on this platform"
                      subtitle="Counted from interactions tagged with this campaign."
                      provenance="PLATFORM_OBSERVED"
                      table={{
                        columns: ['Stage', 'Signals', 'This session'],
                        rows: funnel.steps
                          .filter((step) => step.block === 'PLATFORM')
                          .map((step) => [step.label, step.value, step.capturedThisSession]),
                      }}
                    >
                      <FunnelBars
                        stages={funnel.steps
                          .filter((step) => step.block === 'PLATFORM')
                          .map((step) => ({
                            id: step.metric,
                            label: step.label,
                            value: step.value,
                            provenance: step.provenance,
                            ...(step.capturedThisSession > 0
                              ? { liveCount: step.capturedThisSession }
                              : {}),
                          }))}
                      />
                    </ChartFrame>

                    <div className="rounded-md border border-line bg-surface-2/50 p-3">
                      <p className="text-[12px] font-medium text-ink-900">{funnel.attributionStatement}</p>
                      <ul className="mt-1.5 space-y-1">
                        {funnel.caveats.map((caveat, index) => (
                          <li key={index} className="flex gap-1.5 text-[12px] text-ink-600">
                            <span aria-hidden>·</span>
                            {caveat}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Link
                      href={`/gov/ask?q=campaign&campaign=${encodeURIComponent(selected.name)}`}
                      className="inline-block rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
                    >
                      Ask whether this campaign worked
                    </Link>
                  </CardBody>
                </Card>
              ) : null}

              <Card>
                <CardBody className="pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProvenanceBadge provenance={selected.provenance} />
                    <span className="text-[12px] text-ink-600">
                      Created by {selected.createdBy}
                      {selected.createdAt ? ` on ${formatLongDate(selected.createdAt)}` : ''}
                    </span>
                  </div>
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardBody className="pt-4">
                <EmptyState
                  title="No campaign selected"
                  description="Create a campaign to see creator matching."
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
