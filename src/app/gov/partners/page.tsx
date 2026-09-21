import Link from 'next/link';
import type { Metadata } from 'next';

import { BUSINESS_TYPE_LABEL, type BusinessType } from '@/lib/types';
import { formatLongDate } from '@/lib/date';
import { computeCapacity, computeStateCapacity } from '@/server/analytics/capacity';
import { computeDemand } from '@/server/analytics/demand';
import { currentWindow } from '@/server/analytics/windows';
import {
  getAccommodationFor,
  getBusinesses,
  getCampaignContent,
  getCampaigns,
  getCreator,
  getCreators,
  getDestination,
} from '@/server/data/repository';
import { isSessionRecord } from '@/server/data/store';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { RankedBars } from '@/components/charts/RankedBars';
import { ActionForm, Field, Select, TextArea } from '@/components/shared/ActionForm';
import { reviewContentForm, verifyBusinessForm, verifyCreatorForm } from '@/server/actions/forms';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Partners and review' };
export const dynamic = 'force-dynamic';

/**
 * Departmental queues added in roadmap Phase 1.
 *
 * Two things a pilot needs that the MVP left open: deciding which businesses
 * count as participating supply, and reviewing what creators actually publish.
 * Both are government decisions, so neither belongs in the partner or creator
 * interface.
 */
export default async function PartnersPage() {
  await requireGovernment();
  const pendingCreators = getCreators().filter(
    (creator) => creator.status === 'PENDING_VERIFICATION',
  );
  const businesses = getBusinesses();
  const pending = businesses.filter(
    (business) => business.status === 'PENDING_VERIFICATION' || business.status === 'INVITED',
  );
  const participating = businesses.filter((business) => business.status === 'PARTICIPATING');
  const state = computeStateCapacity();
  const capacity = computeCapacity();

  const submissions = getCampaignContent().filter(
    (content) => content.status === 'SUBMITTED' || content.status === 'IN_REVIEW',
  );

  const window = currentWindow();
  const demand = new Map(computeDemand(window).map((row) => [row.destinationId, row]));

  // Where interest is rising but nobody is reporting supply: the onboarding
  // priority list, and the thing that makes promotion possible later.
  const gaps = capacity
    .map((row) => ({ row, interest: demand.get(row.destinationId) }))
    .filter(({ row, interest }) => (interest?.demandIndex ?? 0) > 5 && row.reportingProperties === 0)
    .sort((a, b) => (b.interest?.demandIndex ?? 0) - (a.interest?.demandIndex ?? 0));

  const mix = businesses.reduce<Partial<Record<BusinessType, number>>>((counts, business) => {
    counts[business.businessType] = (counts[business.businessType] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
          Partners and content review
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          Verification decides which businesses count as participating supply, and content review
          decides what is published under a departmental campaign. Both are government decisions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Participating', value: participating.length, note: `of ${businesses.length} onboarded` },
          { label: 'Verified', value: state.verifiedBusinesses, note: 'checked before listing' },
          { label: 'Awaiting verification', value: pending.length, note: 'in the queue below' },
          { label: 'Content awaiting review', value: submissions.length, note: 'submitted by creators' },
          {
            label: 'Creators awaiting verification',
            value: pendingCreators.length,
            note: 'not shortlisted until verified',
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-[12px] text-ink-600">{stat.label}</p>
            <p className="mt-1 text-[28px] font-semibold leading-none text-ink-900">{stat.value}</p>
            <p className="mt-1 text-[12px] text-ink-500">{stat.note}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Verification queue"
            subtitle="Until a business is verified, nothing it reports is counted as participating capacity."
            eyebrow={`${pending.length} waiting`}
          />
          <CardBody>
            {pending.length === 0 ? (
              <EmptyState
                icon="✓"
                title="Queue is clear"
                description="New registrations from the partner portal appear here."
              />
            ) : (
              <ul className="space-y-3">
                {pending.map((business) => {
                  const destination = getDestination(business.destinationId);
                  const reports = getAccommodationFor(business.id);
                  return (
                    <li key={business.id} className="rounded-md border border-line bg-surface p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink-900">
                            {business.name}
                            {isSessionRecord(business.id) ? (
                              <span className="ml-1.5 text-[10px] font-normal text-lake-700">
                                registered in this session
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-ink-500">
                            {BUSINESS_TYPE_LABEL[business.businessType]} · {destination?.name} ·{' '}
                            {business.district}
                          </p>
                        </div>
                        <Badge tone="warn">{business.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                      </div>

                      {business.description ? (
                        <p className="mt-1.5 text-[12px] text-ink-700">{business.description}</p>
                      ) : null}

                      <p className="num mt-1.5 text-[11px] text-ink-500">
                        Declared capacity {business.reportedCapacity ?? 'not stated'} ·{' '}
                        {reports.length} availability report{reports.length === 1 ? '' : 's'}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                        <ActionForm
                          action={verifyBusinessForm}
                          submitLabel="Verify"
                          pendingLabel="Verifying…"
                          size="sm"
                          className="space-y-2"
                          hiddenFields={{ businessId: business.id, decision: 'VERIFY' }}
                        />
                        <ActionForm
                          action={verifyBusinessForm}
                          submitLabel="Do not verify"
                          pendingLabel="Saving…"
                          variant="ghost"
                          size="sm"
                          className="space-y-2"
                          hiddenFields={{ businessId: business.id, decision: 'REJECT' }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Content review"
            subtitle="A rejection has to say what needs to change. Approval without a reason is not review either way."
            eyebrow={`${submissions.length} submitted`}
          />
          <CardBody>
            {submissions.length === 0 ? (
              <EmptyState
                icon="✓"
                title="Nothing to review"
                description="Creator submissions appear here."
              />
            ) : (
              <ul className="space-y-3">
                {submissions.map((content) => {
                  const campaign = getCampaigns().find((entry) => entry.id === content.campaignId);
                  const creator = getCreator(content.creatorId);
                  return (
                    <li key={content.id} className="rounded-md border border-line bg-surface p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink-900">{content.title}</p>
                          <p className="text-[11px] text-ink-500">
                            {creator?.displayName} · {campaign?.name} · {content.platform} ·{' '}
                            {formatLongDate(content.submittedAt)}
                          </p>
                        </div>
                        <Badge tone="info">{content.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                      </div>

                      <p className="mt-2 text-[12px] text-ink-700">{content.caption}</p>
                      <p className="mt-1.5 font-mono text-[11px] text-ink-500">{content.contentUrl}</p>
                      <p className="mt-1.5 rounded-md border border-warn-500/25 bg-warn-100/50 px-2.5 py-1.5 text-[11px] text-warn-700">
                        {content.disclosure}
                      </p>

                      <div className="mt-3 border-t border-line pt-3">
                        <ActionForm
                          action={reviewContentForm}
                          submitLabel="Record decision"
                          pendingLabel="Recording…"
                          size="sm"
                          hiddenFields={{ contentId: content.id }}
                        >
                          <Field label="Decision" name={`decision-${content.id}`}>
                            <Select id={`decision-${content.id}`} name="decision" defaultValue="APPROVED">
                              <option value="APPROVED">Approve</option>
                              <option value="PUBLISHED">Approve and mark published</option>
                              <option value="CHANGES_REQUESTED">Request changes</option>
                            </Select>
                          </Field>
                          <Field
                            label="Note to the creator"
                            name={`note-${content.id}`}
                            hint="Required when requesting changes."
                          >
                            <TextArea id={`note-${content.id}`} name="note" maxLength={400} />
                          </Field>
                        </ActionForm>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {pendingCreators.length > 0 ? (
        <Card>
          <CardHeader
            title="Creator verification queue"
            subtitle="A creator awaiting verification is not shortlisted for any campaign, because a shortlist is a departmental endorsement."
            eyebrow={`${pendingCreators.length} waiting`}
          />
          <CardBody>
            <ul className="space-y-3">
              {pendingCreators.map((creator) => (
                <li key={creator.id} className="rounded-md border border-line bg-surface p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink-900">
                        {creator.displayName}
                        {isSessionRecord(creator.id) ? (
                          <span className="ml-1.5 text-[10px] font-normal text-lake-700">
                            registered in this session
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-ink-500">
                        {creator.homeDistrict} · {creator.platforms.join(', ')} ·{' '}
                        {creator.languages.join(', ')}
                      </p>
                    </div>
                    <Badge tone="warn">awaiting verification</Badge>
                  </div>

                  {creator.bio ? (
                    <p className="mt-1.5 text-[12px] text-ink-700">{creator.bio}</p>
                  ) : null}
                  <p className="mt-1.5 text-[12px] text-ink-600">
                    Covers {creator.categories.join(', ')} · reaches {creator.audienceSummary} (
                    {creator.audienceAgeBand})
                  </p>
                  <p className="mt-1 text-[11px] text-ink-500">
                    Platform reputation starts at zero and is earned from delivered campaigns.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    <ActionForm
                      action={verifyCreatorForm}
                      submitLabel="Verify"
                      pendingLabel="Verifying…"
                      size="sm"
                      className="space-y-2"
                      hiddenFields={{ creatorId: creator.id, decision: 'VERIFY' }}
                    />
                    <ActionForm
                      action={verifyCreatorForm}
                      submitLabel="Do not verify"
                      pendingLabel="Saving…"
                      variant="ghost"
                      size="sm"
                      className="space-y-2"
                      hiddenFields={{ creatorId: creator.id, decision: 'REJECT' }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Supply gaps"
            subtitle="Destinations with visitor interest and no participating property reporting. Onboarding here is what makes promotion possible later."
            action={<ProvenanceBadge provenance="PARTNER_REPORTED" />}
          />
          <CardBody>
            {gaps.length === 0 ? (
              <EmptyState icon="✓" title="Every destination with interest has reporting supply" />
            ) : (
              <ul className="space-y-2">
                {gaps.map(({ row, interest }) => (
                  <li
                    key={row.destinationId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink-900">{row.name}</p>
                      <p className="text-[11px] text-ink-500">
                        {row.district} · {row.totalBusinesses} business
                        {row.totalBusinesses === 1 ? '' : 'es'} onboarded, none reporting
                      </p>
                    </div>
                    <span className="num text-[15px] font-semibold text-ink-900">
                      {interest?.demandIndex ?? 0}
                      <span className="ml-1 text-[10px] font-normal text-ink-500">interest</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-ink-500">{state.coverageNote}</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="pt-4">
            <ChartFrame
              title="Participating supply by type"
              provenance="PARTNER_REPORTED"
              method="Count of businesses onboarded onto the platform, by the type they registered under."
              table={{
                columns: ['Type', 'Businesses'],
                rows: Object.entries(mix).map(([type, count]) => [
                  BUSINESS_TYPE_LABEL[type as BusinessType],
                  count ?? 0,
                ]),
              }}
            >
              <RankedBars
                labelWidth="lg"
                data={Object.entries(mix)
                  .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                  .map(([type, count]) => ({
                    id: type,
                    label: BUSINESS_TYPE_LABEL[type as BusinessType],
                    value: count ?? 0,
                  }))}
              />
            </ChartFrame>

            <Disclosure summary="Why verification gates capacity" className="mt-3">
              A business can declare any number it likes. Counting an unverified self-report as
              participating capacity would let a destination look ready for a campaign it cannot
              absorb, which is the specific failure the capacity view exists to prevent.
            </Disclosure>

            <Link
              href="/partner/onboarding"
              className="mt-3 inline-block text-[12px] font-medium text-brand-700 underline"
            >
              See the partner registration form
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
