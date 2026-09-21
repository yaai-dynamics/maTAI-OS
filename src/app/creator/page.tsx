import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import {
  computeCreatorPerformance,
  recommendedCampaignsFor,
} from '@/server/analytics/creator-performance';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { DemoDataNote, ProvenanceBadge } from '@/components/shared/badges';
import { CampaignCard } from '@/components/shared/cards';
import { requireCreator } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Creator Dashboard' };
export const dynamic = 'force-dynamic';

export default async function CreatorDashboardPage() {
  const { creatorId } = await requireCreator();
  const performance = computeCreatorPerformance(creatorId);
  const recommended = recommendedCampaignsFor(creatorId).slice(0, 3);

  if (!performance) {
    return <EmptyState title="Creator not found" description="Check the demo creator configuration." />;
  }

  const { creator, totals, earnings, campaigns } = performance;
  const active = campaigns.filter(
    (row) => row.campaign.status === 'OPEN' || row.campaign.status === 'IN_PROGRESS',
  );

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="immersive px-5 py-6 sm:px-7 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[12px] uppercase tracking-[0.1em] text-white/60">Creator</p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white">
                {creator.displayName}
              </h1>
              <p className="mt-1 max-w-xl text-[13px] text-white/75">{creator.bio}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {creator.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/85"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-right">
              <p className="text-[12px] text-white/60">Creator score</p>
              <p className="text-[40px] font-semibold leading-none text-white">
                {creator.creatorScore}
              </p>
              <p className="mt-1 text-[11px] text-white/60">
                {creator.campaignsCompleted} campaigns delivered
              </p>
            </div>
          </div>
        </div>
      </Card>

      <section aria-label="Performance summary">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {totals
            .filter((metric) =>
              ['VIEWS', 'ITINERARY_ADDS', 'CHECKINS', 'REWARD'].includes(metric.metric),
            )
            .map((metric) => (
              <Card key={metric.metric} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] text-ink-600">{metric.label}</p>
                  <ProvenanceBadge provenance={metric.provenance} />
                </div>
                <p className="mt-1.5 text-[28px] font-semibold leading-none text-ink-900">
                  {metric.metric === 'REWARD'
                    ? `₹${metric.value.toLocaleString('en-IN')}`
                    : metric.value.toLocaleString('en-IN')}
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-ink-500">{metric.note}</p>
              </Card>
            ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Recommended campaigns"
            subtitle="Ranked with the same match score the Tourism Department sees, so there is one number, not two."
            action={
              <Link href="/creator/campaigns" className="text-[12px] font-medium text-brand-700 underline">
                All campaigns
              </Link>
            }
          />
          <CardBody>
            {recommended.length === 0 ? (
              <EmptyState
                icon="—"
                title="No open campaign to apply to"
                description="You have applied to everything currently open. New campaigns appear here as the department launches them."
              />
            ) : (
              <ul className="space-y-3">
                {recommended.map((row) => (
                  <li key={row.campaign.id}>
                    <CampaignCard
                      campaign={row.campaign}
                      destinationName={row.destinationName}
                      href={`/creator/campaigns?campaign=${row.campaign.id}`}
                      action={
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="num text-[15px] font-semibold text-ink-900">
                              {row.score}
                            </span>
                            <span className="text-[11px] text-ink-500">match score of 100</span>
                          </div>
                          {row.highlights.map((highlight, index) => (
                            <p key={index} className="text-[12px] text-ink-700">
                              ✓ {highlight}
                            </p>
                          ))}
                        </div>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Your campaigns"
              subtitle="Applications, published content and what each one has earned."
              eyebrow={`${campaigns.length} total, ${active.length} active`}
            />
            <CardBody>
              {campaigns.length === 0 ? (
                <EmptyState title="No campaigns yet" description="Apply to one to get started." />
              ) : (
                <ul className="space-y-2">
                  {campaigns.map((row) => (
                    <li
                      key={row.campaign.id}
                      className="rounded-md border border-line bg-surface p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink-900">{row.campaign.name}</p>
                          <p className="text-[11px] text-ink-500">
                            {row.destinationName} · closes {formatLongDate(row.campaign.endDate)}
                          </p>
                        </div>
                        <Badge
                          tone={
                            row.campaign.status === 'COMPLETED'
                              ? 'brand'
                              : row.campaign.status === 'OPEN'
                                ? 'good'
                                : 'neutral'
                          }
                        >
                          {row.campaign.status.replace('_', ' ').toLowerCase()}
                        </Badge>
                      </div>
                      <dl className="mt-2 grid grid-cols-4 gap-2 text-[12px]">
                        <div>
                          <dt className="text-ink-500">Views</dt>
                          <dd className="num font-medium">{row.views.toLocaleString('en-IN')}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-500">Itinerary adds</dt>
                          <dd className="num font-medium">{row.itineraryAdds}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-500">Check-ins</dt>
                          <dd className="num font-medium">{row.checkins}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-500">Reward</dt>
                          <dd className="num font-medium">
                            {row.reward > 0 ? `₹${row.reward.toLocaleString('en-IN')}` : '—'}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Earnings" subtitle="Prototype record. No payment is processed here." />
            <CardBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <p className="text-[12px] text-ink-600">Paid</p>
                  <p className="mt-1 text-[24px] font-semibold leading-none text-ink-900">
                    ₹{earnings.paid.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-md border border-line bg-surface-2/50 p-3">
                  <p className="text-[12px] text-ink-600">Pending review</p>
                  <p className="mt-1 text-[24px] font-semibold leading-none text-ink-900">
                    ₹{earnings.pending.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <DemoDataNote>
                  Creator score, reach and earnings are prototype demo data. Payout processing is
                  explicitly out of MVP scope.
                </DemoDataNote>
              </div>
              <Link
                href="/creator/analytics"
                className="mt-3 inline-block text-[12px] font-medium text-brand-700 underline"
              >
                Full analytics and earnings
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
