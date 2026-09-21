import Link from 'next/link';
import type { Metadata } from 'next';

import { getApplications, getCampaigns, getDestination } from '@/server/data/repository';
import { Card, CardBody, cn, EmptyState } from '@/components/ui/primitives';
import { StudioPanel } from '@/components/shared/StudioPanel';
import { buildBrief } from '@/server/actions/creator';
import { requireCreator } from '@/server/auth/session';

export const metadata: Metadata = { title: 'AI Creator Studio' };
export const dynamic = 'force-dynamic';

export default async function CreatorStudioPage(props: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { creatorId } = await requireCreator();
  const { campaign: campaignParam } = await props.searchParams;

  const applications = getApplications({ creatorId: creatorId });
  const appliedIds = new Set(applications.map((application) => application.campaignId));

  // The studio works for any launched campaign, and defaults to one the creator
  // has actually applied to.
  const available = getCampaigns().filter((campaign) => campaign.status !== 'DRAFT');
  const selected =
    available.find((campaign) => campaign.id === campaignParam) ??
    available.find((campaign) => appliedIds.has(campaign.id)) ??
    available.find((campaign) => campaign.status === 'OPEN') ??
    available[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">AI Creator Studio</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          A content brief built from the campaign objective and the verified tourism knowledge for its
          destination, so you can produce quickly without inventing claims.
        </p>
      </div>

      {available.length === 0 ? (
        <EmptyState
          title="No launched campaign"
          description="The studio works against a live campaign. Ask the Tourism Department to launch one."
          action={
            <Link href="/creator/campaigns" className="text-[13px] font-medium text-brand-700 underline">
              Campaign discovery
            </Link>
          }
        />
      ) : (
        <>
          <nav aria-label="Choose a campaign" className="flex flex-wrap gap-1.5">
            {available.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/creator/studio?campaign=${campaign.id}`}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12px] font-medium',
                  selected?.id === campaign.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
                )}
              >
                {campaign.name}
                {appliedIds.has(campaign.id) ? (
                  <span className="ml-1.5 text-[10px] text-good-700">applied</span>
                ) : null}
              </Link>
            ))}
          </nav>

          {selected ? (
            <>
              <StudioPanel
                campaignId={selected.id}
                campaignName={`${selected.name} — ${getDestination(selected.destinationId)?.name ?? ''}`}
                generate={buildBrief}
              />
              <Card tone="outline">
                <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
                  <p className="text-[13px] text-ink-700">Ready to publish? Submit it for review.</p>
                  <Link
                    href={`/creator/submissions?campaign=${selected.id}`}
                    className="rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
                  >
                    Go to submissions
                  </Link>
                </CardBody>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
