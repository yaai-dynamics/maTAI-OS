import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { getCampaignContent, getCampaigns, getDestination } from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import {
  ActionForm,
  Field,
  Select,
  TextArea,
  TextInput,
} from '@/components/shared/ActionForm';
import { submitContentForm } from '@/server/actions/forms';
import { requireCreator } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Campaign Submission' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  IN_REVIEW: 'warn',
  APPROVED: 'good',
  CHANGES_REQUESTED: 'risk',
  PUBLISHED: 'brand',
} as const;

export default async function SubmissionsPage(props: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { creatorId } = await requireCreator();
  const { campaign: campaignParam } = await props.searchParams;

  const available = getCampaigns().filter((campaign) => campaign.status !== 'DRAFT');
  const selected =
    available.find((campaign) => campaign.id === campaignParam) ??
    available.find((campaign) => campaign.status === 'OPEN') ??
    available[0];

  const submissions = getCampaignContent({ creatorId: creatorId }).sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Campaign Submission</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Submit published content for departmental review. The paid-partnership disclosure is a gate,
          not a formality: a government campaign has to be identifiable as one.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Submit content"
            subtitle="Live platform integrations are out of MVP scope, so the content link is recorded rather than fetched."
          />
          <CardBody>
            {selected ? (
              <ActionForm
                action={submitContentForm}
                submitLabel="Submit for review"
                pendingLabel="Submitting…"
              >
                <Field label="Campaign" name="campaignId" required>
                  <Select id="campaignId" name="campaignId" required defaultValue={selected.id}>
                    {available.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} — {getDestination(campaign.destinationId)?.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Title" name="title" required>
                  <TextInput
                    id="title"
                    name="title"
                    required
                    maxLength={140}
                    placeholder="Three mornings above Ukhrul"
                  />
                </Field>

                <Field label="Platform" name="platform" required>
                  <Select id="platform" name="platform" required defaultValue="Instagram">
                    <option value="Instagram">Instagram</option>
                    <option value="YouTube">YouTube</option>
                    <option value="Facebook">Facebook</option>
                    <option value="X">X</option>
                  </Select>
                </Field>

                <Field
                  label="Content link"
                  name="contentUrl"
                  required
                  hint="A public link to the published post, or a placeholder while the prototype has no integration."
                >
                  <TextInput
                    id="contentUrl"
                    name="contentUrl"
                    required
                    placeholder="demo://content/my-reel"
                    defaultValue="demo://content/"
                  />
                </Field>

                <Field label="Caption" name="caption" required>
                  <TextArea
                    id="caption"
                    name="caption"
                    required
                    maxLength={2200}
                    placeholder="Paste the caption exactly as published."
                  />
                </Field>

                <Field
                  label="Paid partnership disclosure"
                  name="disclosure"
                  required
                  hint="Must state that this is a paid partnership with Manipur Tourism."
                >
                  <TextInput
                    id="disclosure"
                    name="disclosure"
                    required
                    defaultValue={`Paid partnership with Manipur Tourism — ${selected.name}`}
                  />
                </Field>
              </ActionForm>
            ) : (
              <EmptyState
                title="No campaign to submit to"
                description="Apply to a campaign first."
                action={
                  <Link href="/creator/campaigns" className="text-[13px] font-medium text-brand-700 underline">
                    Campaign discovery
                  </Link>
                }
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Your submissions"
            subtitle="Status is set by departmental review."
            eyebrow={`${submissions.length} total`}
          />
          <CardBody>
            {submissions.length === 0 ? (
              <EmptyState
                icon="—"
                title="Nothing submitted yet"
                description="Submitted content appears here with its review status."
              />
            ) : (
              <ul className="space-y-2.5">
                {submissions.map((content) => {
                  const campaign = getCampaigns().find((entry) => entry.id === content.campaignId);
                  return (
                    <li key={content.id} className="rounded-md border border-line bg-surface p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink-900">{content.title}</p>
                          <p className="text-[11px] text-ink-500">
                            {campaign?.name} · {content.platform} ·{' '}
                            {formatLongDate(content.submittedAt)}
                          </p>
                        </div>
                        <Badge tone={STATUS_TONE[content.status]}>
                          {content.status.replace('_', ' ').toLowerCase()}
                        </Badge>
                      </div>

                      <p className="mt-2 text-[12px] text-ink-700">{content.caption}</p>

                      <p className="mt-2 font-mono text-[11px] text-ink-500">{content.contentUrl}</p>

                      <div
                        className={cn(
                          'mt-2 rounded-md px-2.5 py-1.5 text-[11px]',
                          'border border-warn-500/25 bg-warn-100/50 text-warn-700',
                        )}
                      >
                        {content.disclosure}
                      </div>

                      {content.reviewNote ? (
                        <p className="mt-2 text-[12px] text-ink-600">
                          <span className="font-medium text-ink-800">Review note: </span>
                          {content.reviewNote}
                        </p>
                      ) : null}

                      <div className="mt-2">
                        <ProvenanceBadge provenance={content.provenance} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
