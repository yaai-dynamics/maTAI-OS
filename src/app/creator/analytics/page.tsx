import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { computeCreatorPerformance } from '@/server/analytics/creator-performance';
import { computeCreatorReputation, REPUTATION_METHOD } from '@/server/analytics/integrity';
import { getPayouts } from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { DemoDataNote, ProvenanceBadge } from '@/components/shared/badges';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { FunnelBars } from '@/components/charts/FunnelBars';
import { RankedBars } from '@/components/charts/RankedBars';
import { requireCreator } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Analytics and Earnings' };
export const dynamic = 'force-dynamic';

export default async function CreatorAnalyticsPage() {
  const { creatorId } = await requireCreator();
  const performance = computeCreatorPerformance(creatorId);
  if (!performance) {
    return <EmptyState title="Creator not found" description="Check the demo creator configuration." />;
  }

  const { totals, campaigns, earnings } = performance;
  const payouts = getPayouts(creatorId);
  const reputation = computeCreatorReputation(creatorId);

  const reachTotals = totals.filter((metric) => metric.provenance === 'DEMO_SYNTHETIC' && metric.metric !== 'REWARD');
  const tourismTotals = totals.filter((metric) => metric.provenance === 'PLATFORM_OBSERVED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
          Analytics and Earnings
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Reach tells you how many people saw the content. Tourism outcomes tell you how many acted on
          it. The reward is based on the second, which is why the two are reported separately.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody className="pt-4">
            <ChartFrame
              title="Reach reported by the publishing platforms"
              subtitle="Real world scale. Synthetic in the prototype."
              provenance="DEMO_SYNTHETIC"
              table={{
                columns: ['Metric', 'Total'],
                rows: reachTotals.map((metric) => [metric.label, metric.value.toLocaleString('en-IN')]),
              }}
            >
              <FunnelBars
                stages={reachTotals.map((metric) => ({
                  id: metric.metric,
                  label: metric.label,
                  value: metric.value,
                  note: metric.note,
                }))}
              />
            </ChartFrame>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="pt-4">
            <ChartFrame
              title="Tourism outcomes observed on this platform"
              subtitle="Covers only people who used this platform, so it is not a share of reach."
              provenance="PLATFORM_OBSERVED"
              table={{
                columns: ['Outcome', 'Total'],
                rows: tourismTotals.map((metric) => [metric.label, metric.value.toLocaleString('en-IN')]),
              }}
            >
              <FunnelBars
                stages={tourismTotals.map((metric) => ({
                  id: metric.metric,
                  label: metric.label,
                  value: metric.value,
                  note: metric.note,
                  ...(metric.capturedThisSession ? { liveCount: metric.capturedThisSession } : {}),
                }))}
              />
            </ChartFrame>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="By campaign"
          subtitle="Where a campaign had several publishing creators, platform outcomes are shared evenly between them. Nothing here claims one creator caused a given visit."
        />
        <CardBody>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaign activity yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] uppercase tracking-[0.06em] text-ink-500">
                    <th className="px-3 py-2 font-semibold">Campaign</th>
                    <th className="px-3 py-2 text-right font-semibold">Views</th>
                    <th className="px-3 py-2 text-right font-semibold">Clicks</th>
                    <th className="px-3 py-2 text-right font-semibold">Page visits</th>
                    <th className="px-3 py-2 text-right font-semibold">Itinerary adds</th>
                    <th className="px-3 py-2 text-right font-semibold">Check-ins</th>
                    <th className="px-3 py-2 text-right font-semibold">Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((row) => (
                    <tr key={row.campaign.id} className="border-b border-line/70">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-ink-900">{row.campaign.name}</span>
                        <span className="block text-[11px] text-ink-500">
                          {row.destinationName} · {row.content.length} item
                          {row.content.length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="num px-3 py-2.5 text-right">{row.views.toLocaleString('en-IN')}</td>
                      <td className="num px-3 py-2.5 text-right">{row.clicks.toLocaleString('en-IN')}</td>
                      <td className="num px-3 py-2.5 text-right">{row.destinationVisits}</td>
                      <td className="num px-3 py-2.5 text-right">{row.itineraryAdds}</td>
                      <td className="num px-3 py-2.5 text-right">{row.checkins}</td>
                      <td className="num px-3 py-2.5 text-right">
                        {row.reward > 0 ? `₹${row.reward.toLocaleString('en-IN')}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {reputation ? (
        <Card>
          <CardHeader
            title="Your reputation on this platform"
            subtitle="Computed from what you delivered here, not from your declared profile score."
            action={<ProvenanceBadge provenance={reputation.provenance} />}
          />
          <CardBody>
            {!reputation.hasTrackRecord ? (
              <p className="mb-3 rounded-md border border-line bg-surface-2/60 px-3 py-2.5 text-[13px] text-ink-700">
                You have not delivered anything on this platform yet, so there is nothing to score.
                A zero here means no evidence, not a poor record. It moves as soon as your first
                submission is published.
              </p>
            ) : null}

            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-[40px] font-semibold leading-none text-ink-900">
                  {reputation.hasTrackRecord ? reputation.score : '—'}
                </p>
                <p className="mt-1 text-[12px] text-ink-500">
                  {reputation.hasTrackRecord ? 'of 100, computed' : 'no track record yet'}
                </p>
              </div>
              <div>
                <p className="num text-[20px] font-semibold leading-none text-ink-500">
                  {reputation.declaredScore}
                </p>
                <p className="mt-1 text-[12px] text-ink-500">declared on your profile</p>
              </div>
              <div className="min-w-0 flex-1">
                <ul className="space-y-1.5">
                  {reputation.components.map((component) => (
                    <li key={component.key} className="flex items-center gap-2.5">
                      <span className="w-44 shrink-0 text-[11px] text-ink-600">
                        {component.label}
                      </span>
                      <span className="h-[10px] min-w-0 flex-1 rounded-r-[4px] bg-chart-grid/70">
                        <span
                          className="block h-full rounded-r-[4px] bg-chart-1"
                          style={{ width: `${(component.score / component.maxScore) * 100}%` }}
                          role="img"
                          aria-label={`${component.label}: ${component.score} of ${component.maxScore}`}
                        />
                      </span>
                      <span className="num w-14 shrink-0 text-right text-[11px] text-ink-700">
                        {component.score}/{component.maxScore}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <dl className="mt-3 space-y-1 border-t border-line pt-3">
              {reputation.components.map((component) => (
                <div key={component.key} className="text-[12px] text-ink-600">
                  <dt className="inline font-medium text-ink-700">{component.label}: </dt>
                  <dd className="inline">{component.detail}</dd>
                </div>
              ))}
            </dl>

            <Disclosure summary="How this is computed" className="mt-3">
              {REPUTATION_METHOD}
            </Disclosure>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Earnings" subtitle="Prototype record. This platform processes no payments." />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-line bg-surface-2/50 p-3">
                <p className="text-[12px] text-ink-600">Paid</p>
                <p className="mt-1 text-[26px] font-semibold leading-none text-ink-900">
                  ₹{earnings.paid.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="rounded-md border border-line bg-surface-2/50 p-3">
                <p className="text-[12px] text-ink-600">Pending</p>
                <p className="mt-1 text-[26px] font-semibold leading-none text-ink-900">
                  ₹{earnings.pending.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {payouts.length > 0 ? (
              <ul className="space-y-2">
                {payouts.map((payout) => (
                  <li key={payout.id} className="rounded-md border border-line bg-surface p-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="num text-[13px] font-semibold text-ink-900">
                          ₹{payout.amount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {formatLongDate(payout.recordedAt)} · {payout.basis}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={payout.status === 'PAID' ? 'good' : 'warn'}>
                          {payout.status.replace('_', ' ').toLowerCase()}
                        </Badge>
                        <ProvenanceBadge provenance={payout.provenance} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-600">No reward has been recorded yet.</p>
            )}

            <DemoDataNote>
              Payout processing is explicitly out of MVP scope. These are records of what would be
              owed, not transactions.
            </DemoDataNote>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="How the reward is worked out"
            subtitle="The share of the pool follows verified tourism outcomes, not follower count."
          />
          <CardBody>
            <ChartFrame
              title="Itinerary additions by campaign"
              provenance="PLATFORM_OBSERVED"
              table={{
                columns: ['Campaign', 'Itinerary additions'],
                rows: campaigns.map((row) => [row.campaign.name, row.itineraryAdds]),
              }}
            >
              <RankedBars
                labelWidth="lg"
                data={campaigns.map((row) => ({
                  id: row.campaign.id,
                  label: row.campaign.name,
                  value: row.itineraryAdds,
                }))}
                emptyLabel="No itinerary additions attributed yet"
              />
            </ChartFrame>
            <Disclosure summary="Why itinerary additions and not views" className="mt-3">
              A view costs a viewer nothing. Putting a destination on a plan is the first point at
              which someone has decided to go, so it is the earliest signal that actually predicts a
              visit. Rewarding it aligns the creator with the tourism outcome rather than with reach.
            </Disclosure>
          </CardBody>
        </Card>
      </div>

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className="text-[13px] font-medium text-ink-900">
            Publishing platform analytics are not connected
          </p>
          <p className="mt-1 max-w-3xl text-[12px] text-ink-600">
            Views, watch time and clicks would come from the publishing platform where its API allows
            it, and would be labelled public or external accordingly. In this prototype they are
            synthetic, and no account is linked. The tourism outcomes below them are the ones this
            platform actually observes, and they are the ones the reward is based on.
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-ink-600">
            <li>· No social account is linked, and no credential is stored.</li>
            <li>· Reach figures are seeded and marked as demo data wherever they appear.</li>
            <li>
              · Where a platform grants no analytics API, reach would stay self-reported and be
              labelled as such rather than treated as measured.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
