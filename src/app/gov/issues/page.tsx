import Link from 'next/link';
import type { Metadata } from 'next';

import { ISSUE_CATEGORY_LABEL, type IssueCategory } from '@/lib/types';
import { currentWindow } from '@/server/analytics/windows';
import {
  computeDistrictSentiment,
  computeIssueTrend,
  computeIssues,
  computeSatisfaction,
} from '@/server/analytics/sentiment';
import { getDestination, getDestinations, getFeedback } from '@/server/data/repository';
import { isSessionRecord } from '@/server/data/store';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfidenceBadge, DemoDataNote, ProvenanceBadge, TrendChip } from '@/components/shared/badges';
import { FeedbackCard } from '@/components/shared/cards';
import { InsightCard } from '@/components/shared/AnswerCard';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { RankedBars } from '@/components/charts/RankedBars';
import { LineChart } from '@/components/charts/LineChart';
import { requireGovernment } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Issues and Sentiment' };
export const dynamic = 'force-dynamic';

export default async function IssuesPage(props: {
  searchParams: Promise<{ destination?: string; category?: string }>;
}) {
  await requireGovernment();
  const { destination: destinationFilter, category } = await props.searchParams;
  const window = currentWindow();

  const analysis = computeIssues(window, destinationFilter);
  const satisfaction = computeSatisfaction(window, destinationFilter);
  const destinations = getDestinations();
  const destinationNames = new Map(destinations.map((d) => [d.id, d.name]));
  const scopeName = destinationFilter
    ? (getDestination(destinationFilter)?.name ?? destinationFilter)
    : 'Manipur';

  const selectedCategory = category as IssueCategory | undefined;
  const focus = selectedCategory
    ? analysis.issues.find((issue) => issue.category === selectedCategory)
    : analysis.issues[0];

  // Supporting feedback is anonymised before it reaches this view.
  const supporting = getFeedback({
    from: window.from,
    to: window.to,
    ...(destinationFilter ? { destinationId: destinationFilter } : {}),
  })
    .filter((entry) => (focus ? entry.category === focus.category : entry.rating <= 3))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const rising = analysis.issues
    .filter((issue) => issue.changePercent !== null && issue.changePercent > 20 && issue.count >= 4)
    .slice(0, 3);

  // Phase 1: a single window comparison cannot tell a trend from one bad week.
  const trend = computeIssueTrend(window, {
    ...(destinationFilter ? { destinationId: destinationFilter } : {}),
    ...(focus ? { category: focus.category } : {}),
  });
  const districts = computeDistrictSentiment(window).filter((row) => row.responses > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            Issues and Sentiment
          </h1>
          <p className="mt-1 text-[13px] text-ink-600">
            What tourists reported at {scopeName} in the {window.days} days to {window.label.split(' to ')[1]}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={analysis.confidence} />
          <ProvenanceBadge provenance={analysis.provenance} />
        </div>
      </div>

      {/* Destination filter (docs/02-mvp-spec.md, G3). */}
      <nav aria-label="Filter by destination" className="flex flex-wrap gap-1.5">
        <Link
          href="/gov/issues"
          className={cn(
            'rounded-full border px-3 py-1 text-[12px] font-medium',
            !destinationFilter
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
          )}
        >
          All destinations
        </Link>
        {destinations.map((entry) => (
          <Link
            key={entry.id}
            href={`/gov/issues?destination=${entry.id}`}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] font-medium',
              destinationFilter === entry.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
            )}
          >
            {entry.name}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[12px] text-ink-600">Issue reports</p>
          <p className="mt-1 text-[28px] font-semibold leading-none text-ink-900">
            {analysis.totalIssueReports.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[12px] text-ink-500">
            of {analysis.totalResponses.toLocaleString('en-IN')} responses in the window
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-ink-600">Average rating</p>
          <p className="mt-1 text-[28px] font-semibold leading-none text-ink-900">
            {satisfaction.averageRating?.toFixed(2) ?? '—'}
          </p>
          <div className="mt-1.5">
            <TrendChip
              percent={
                satisfaction.ratingChange === null ? null : satisfaction.ratingChange * 20
              }
              label="rating points against the previous window, shown as a percentage of the scale"
            />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-ink-600">Rated 4 or above</p>
          <p className="mt-1 text-[28px] font-semibold leading-none text-ink-900">
            {satisfaction.positiveShare}%
          </p>
          <p className="mt-1 text-[12px] text-ink-500">{satisfaction.negativeShare}% rated 2 or below</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-ink-600">Categories reported</p>
          <p className="mt-1 text-[28px] font-semibold leading-none text-ink-900">
            {analysis.issues.length}
          </p>
          <p className="mt-1 text-[12px] text-ink-500">
            {rising.length} rising against the previous window
          </p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Reports by category"
            subtitle="Select a category to see the anonymised feedback behind it."
          />
          <CardBody>
            {analysis.issues.length === 0 ? (
              <EmptyState
                icon="✓"
                title="No issue reports in this window"
                description="Either nothing went wrong, or nobody told us. Feedback is voluntary."
              />
            ) : (
              <ChartFrame
                title={`Issue reports, ${scopeName}`}
                provenance="PLATFORM_OBSERVED"
                method={analysis.method}
                table={{
                  columns: ['Category', 'Reports', 'Previous window', 'Change'],
                  rows: analysis.issues.map((issue) => [
                    issue.label,
                    issue.count,
                    issue.previousCount,
                    issue.changePercent === null ? 'no baseline' : `${issue.changePercent}%`,
                  ]),
                }}
              >
                <RankedBars
                  labelWidth="lg"
                  data={analysis.issues.map((issue) => ({
                    id: issue.category,
                    label: issue.label,
                    value: issue.count,
                    caption:
                      issue.hotspots[0] !== undefined
                        ? `mostly ${issue.hotspots[0].name}`
                        : undefined,
                    emphasis: focus?.category === issue.category,
                    href: `/gov/issues?${destinationFilter ? `destination=${destinationFilter}&` : ''}category=${issue.category}`,
                  }))}
                />
              </ChartFrame>
            )}

            {analysis.issues.length > 0 ? (
              <nav aria-label="Filter by category" className="mt-3 flex flex-wrap gap-1.5">
                {analysis.issues.map((issue) => (
                  <Link
                    key={issue.category}
                    href={`/gov/issues?${destinationFilter ? `destination=${destinationFilter}&` : ''}category=${issue.category}`}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                      focus?.category === issue.category
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-line-strong bg-surface text-ink-600 hover:bg-surface-2',
                    )}
                  >
                    {ISSUE_CATEGORY_LABEL[issue.category]} ({issue.count})
                  </Link>
                ))}
              </nav>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Summary"
              subtitle="Counts and hotspots are computed from the recorded category on each feedback item."
            />
            <CardBody className="space-y-2.5">
              {focus ? (
                <InsightCard
                  title={`${focus.label}: ${focus.count} reports`}
                  tone={focus.changePercent !== null && focus.changePercent > 20 ? 'action' : 'watch'}
                  body={
                    <>
                      <p>
                        {focus.sharePercent} percent of issue reports at {scopeName}, against{' '}
                        {focus.previousCount} in the previous window
                        {focus.changePercent !== null
                          ? ` (${focus.changePercent > 0 ? '+' : ''}${focus.changePercent}%)`
                          : ''}
                        .
                      </p>
                      {focus.hotspots.length > 0 ? (
                        <p className="mt-1.5">
                          Concentrated at{' '}
                          {focus.hotspots
                            .map((hotspot) => `${hotspot.name} (${hotspot.count})`)
                            .join(', ')}
                          .
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-ink-600">
                        Average rating on these reports:{' '}
                        {focus.averageRating?.toFixed(2) ?? 'not available'}. This is an operational
                        fix rather than a promotion question.
                      </p>
                    </>
                  }
                />
              ) : null}

              {rising.map((issue) => (
                <InsightCard
                  key={issue.category}
                  title={`${issue.label} is rising`}
                  tone="watch"
                  body={
                    <>
                      Up {issue.changePercent}% against the previous window, from {issue.previousCount}{' '}
                      to {issue.count} reports.
                    </>
                  }
                />
              ))}

              <Disclosure summary="How this is calculated">{analysis.method}</Disclosure>
              <DemoDataNote>
                Most feedback here is prototype demo data. Items marked as new in this session were
                submitted through the tourist interface during this run and are platform observed.
              </DemoDataNote>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={focus ? `Feedback: ${focus.label}` : 'Supporting feedback'}
              subtitle="Anonymised before it reaches this view. No tourist identity is stored."
              eyebrow={`${supporting.length} shown`}
            />
            <CardBody>
              {supporting.length === 0 ? (
                <EmptyState
                  icon="—"
                  title="No feedback for this filter"
                  description="Try a different category or destination."
                />
              ) : (
                <ul className="space-y-2.5">
                  {supporting.map((entry) => (
                    <li key={entry.id}>
                      <FeedbackCard
                        feedback={entry}
                        destinationName={destinationNames.get(entry.destinationId) ?? entry.destinationId}
                        isNew={isSessionRecord(entry.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardBody className="pt-4">
            <ChartFrame
              title={focus ? `${focus.label} by week` : 'Issue reports by week'}
              subtitle={`${scopeName}, ${window.label}. One window comparison cannot separate a trend from a single bad week.`}
              provenance="PLATFORM_OBSERVED"
              method="Feedback items in the window carrying a service or infrastructure category, bucketed into seven day periods from the start of the window."
              table={{
                columns: ['Week beginning', 'Reports'],
                rows: trend.map((point) => [point.weekStart, point.total]),
              }}
            >
              <LineChart
                points={trend.map((point) => ({ label: point.weekStart, value: point.total }))}
                unit="reports"
                emptyLabel="No issue reports in this window"
              />
            </ChartFrame>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="By district"
            subtitle="Where a problem is a district problem rather than a single site problem."
            action={<ProvenanceBadge provenance="PLATFORM_OBSERVED" />}
          />
          <CardBody>
            {districts.length === 0 ? (
              <EmptyState icon="—" title="No feedback in any district for this window" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] uppercase tracking-[0.06em] text-ink-500">
                      <th className="px-3 py-2 font-semibold">District</th>
                      <th className="px-3 py-2 text-right font-semibold">Rating</th>
                      <th className="px-3 py-2 text-right font-semibold">Issues</th>
                      <th className="px-3 py-2 font-semibold">Most reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {districts.map((row) => (
                      <tr key={row.districtId} className="border-b border-line/70">
                        <td className="px-3 py-2">
                          <span className="font-medium text-ink-900">{row.district}</span>
                          <span className="block text-[11px] text-ink-500">
                            {row.destinations} destination{row.destinations === 1 ? '' : 's'} ·{' '}
                            {row.responses} responses
                          </span>
                        </td>
                        <td className="num px-3 py-2 text-right">
                          {row.averageRating?.toFixed(2) ?? '—'}
                        </td>
                        <td className="num px-3 py-2 text-right">{row.issueReports}</td>
                        <td className="px-3 py-2 text-[12px] text-ink-700">
                          {row.topIssue ? `${row.topIssue.label} (${row.topIssue.count})` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <p className="text-[13px] text-ink-700">
            An issue is evidence about a service, not about a destination being bad.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{window.label}</Badge>
            <Link
              href={`/gov/ask?q=complaints${destinationFilter ? `&destination=${destinationFilter}` : ''}`}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
            >
              Ask what tourists are complaining about
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
