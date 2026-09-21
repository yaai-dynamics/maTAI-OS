import type { Metadata } from 'next';

import { PROVENANCE, PROVENANCE_VALUES, isQuotableExternally } from '@/lib/provenance';
import { can, PERMISSION_LABEL, ROLE_DESCRIPTOR } from '@/lib/roles';
import { getDataSources, getInteractions, getKnowledgeDocuments, getOfficialStatistics } from '@/server/data/repository';
import { intakeSummary, observedVisitorCount, OUTCOME_LABEL } from '@/server/telemetry/ingest';
import { requireGovernment } from '@/server/auth/session';
import { Badge, Card, CardBody, CardHeader, cn } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';

export const metadata: Metadata = { title: 'Data source governance' };
export const dynamic = 'force-dynamic';

/**
 * Source governance — roadmap Phase 2.
 *
 * Every figure in this product resolves to a source. This is the register of
 * those sources, and the contract the official tier would have to satisfy
 * before it could be switched on. It is deliberately explicit that the official
 * tier is empty: the alternative — showing a plausible number — is the failure
 * mode this whole design exists to avoid.
 */
export default async function SourcesPage() {
  const sources = getDataSources();
  const documents = getKnowledgeDocuments();
  const official = getOfficialStatistics();
  const { governmentRole: role } = await requireGovernment();
  const allowed = can(role, 'source:govern');

  const intake = await intakeSummary(7);
  const interactions = getInteractions();
  const observed = interactions.filter((row) => row.provenance === 'PLATFORM_OBSERVED').length;
  const synthetic = interactions.filter((row) => row.provenance === 'DEMO_SYNTHETIC').length;
  const visitors = observedVisitorCount();

  const byProvenance = PROVENANCE_VALUES.map((provenance) => ({
    provenance,
    sources: sources.filter((source) => source.defaultProvenance === provenance),
  })).filter((group) => group.sources.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            Data source governance
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
            Every figure in this platform resolves to one of these sources, and the category a source
            carries decides how its figures may be used.
          </p>
        </div>
        <Badge tone={allowed ? 'good' : 'neutral'}>
          {allowed
            ? `${ROLE_DESCRIPTOR[role].label} may govern sources`
            : `${ROLE_DESCRIPTOR[role].label} has read access`}
        </Badge>
      </div>

      {/* The official tier, and why it is empty. */}
      <Card className={cn('border-dashed', official.connected ? 'border-line' : 'border-info-500/40')}>
        <CardHeader
          title="Official tier"
          subtitle={official.sourceName}
          action={<ProvenanceBadge provenance="OFFICIAL" />}
        />
        <CardBody className="space-y-4">
          <div className="rounded-md border border-info-500/30 bg-info-100/50 p-3.5">
            <p className="text-[13px] font-medium text-info-700">
              {official.connected ? 'Connected' : 'Not connected'}
            </p>
            <p className="mt-1 max-w-3xl text-[13px] text-ink-700">
              This prototype has no integration with the Department of Tourism. No official figure is
              loaded, and none is generated in its place. Everywhere an official figure would appear,
              the interface shows this state instead.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              What would be loaded
            </h3>
            <ul className="space-y-2">
              {official.expectedMetrics.map((metric) => (
                <li
                  key={metric.metric}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line bg-surface p-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-900">{metric.label}</p>
                    <p className="mt-0.5 text-[12px] text-ink-600">{metric.description}</p>
                    <p className="mt-1 text-[11px] text-ink-500">
                      Unit {metric.unit.toLowerCase()} · {metric.period}
                    </p>
                  </div>
                  <span className="num shrink-0 text-[13px] font-medium text-ink-500">
                    {metric.value === null ? 'no value' : metric.value.toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              What connecting it requires
            </h3>
            <ol className="space-y-2">
              {official.integrationSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-700"
                  >
                    {index + 1}
                  </span>
                  <span className="text-[13px] text-ink-700">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[12px] text-ink-600">
              {allowed
                ? 'Ingestion is an administrator action. No dataset can be loaded from this prototype, because the arrangement in step one does not exist.'
                : `${PERMISSION_LABEL['source:govern']} is restricted to an administrator.`}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* The platform's own telemetry: what real use of the platform recorded. */}
      <Card>
        <CardHeader
          title="Live signal intake"
          subtitle="Tourist signals recorded from real use of the platform, and what the intake refused. Every signal passes the same checks: the visitor has not opted out, it names real places, it is not a repeat, and no one visitor is flooding the intake."
          eyebrow="Last 7 days"
          action={<ProvenanceBadge provenance="PLATFORM_OBSERVED" />}
        />
        <CardBody className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-4">
            {[
              ['Recorded', intake.accepted.toLocaleString('en-IN')],
              ['Dropped', intake.dropped.toLocaleString('en-IN')],
              ['Anonymous visitors observed', visitors.toLocaleString('en-IN')],
              [
                'Observed share of all signals',
                interactions.length > 0 ? `${((observed / interactions.length) * 100).toFixed(1)}%` : '—',
              ],
            ].map(([term, value]) => (
              <div key={term} className="rounded-md border border-line bg-surface-2/50 p-3">
                <dt className="text-[12px] text-ink-600">{term}</dt>
                <dd className="num mt-1 text-[18px] font-semibold text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
          {intake.byOutcome.length > 0 ? (
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Intake outcomes, last 7 days</caption>
              <thead className="border-b border-line text-[12px] text-ink-600">
                <tr>
                  <th scope="col" className="py-1.5 font-medium">Outcome</th>
                  <th scope="col" className="num py-1.5 text-right font-medium">Signals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {intake.byOutcome.map((row) => (
                  <tr key={row.outcome}>
                    <td className="py-1.5 text-ink-800">{OUTCOME_LABEL[row.outcome] ?? row.outcome}</td>
                    <td className="num py-1.5 text-right">{row.count.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-ink-600">Nothing has reached the intake in the last 7 days.</p>
          )}
          {synthetic > 0 ? (
            <p className="text-[12px] text-ink-600">
              {synthetic.toLocaleString('en-IN')} further signals in the working set are demonstration data
              (DEMO_SYNTHETIC), generated to give the analytics a realistic history. They did not pass through the intake
              and are labelled wherever they contribute to a figure.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Source register"
          subtitle="Owner, refresh cadence, reliability and the provenance category each source confers."
          eyebrow={`${sources.length} sources`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] uppercase tracking-[0.06em] text-ink-500">
                <th className="px-4 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Owner</th>
                <th className="px-3 py-2 font-semibold">Refresh</th>
                <th className="px-3 py-2 font-semibold">Reliability</th>
                <th className="px-3 py-2 font-semibold">Confers</th>
                <th className="px-4 py-2 font-semibold">Quotable externally</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => {
                const quotable = isQuotableExternally(source.defaultProvenance);
                return (
                  <tr key={source.id} className="border-b border-line/70 align-top">
                    <td className="max-w-[300px] px-4 py-2.5">
                      <span className="font-medium text-ink-900">{source.name}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-600">
                        {source.description}
                      </span>
                      {source.url ? (
                        <span className="mt-0.5 block break-all font-mono text-[10px] text-ink-400">
                          {source.url}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-700">{source.owner}</td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-700">{source.refreshFrequency}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        tone={
                          source.reliabilityLevel === 'HIGH'
                            ? 'good'
                            : source.reliabilityLevel === 'MEDIUM'
                              ? 'warn'
                              : 'neutral'
                        }
                      >
                        {source.reliabilityLevel.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <ProvenanceBadge provenance={source.defaultProvenance} />
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      {quotable ? (
                        <span className="text-good-700">Yes, with its period and coverage</span>
                      ) : (
                        <span className="text-risk-700">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="What each category permits"
            subtitle="Enforced in code. The weakest input decides how a combined figure is labelled."
          />
          <CardBody>
            <ul className="space-y-2.5">
              {byProvenance.map(({ provenance, sources: group }) => (
                <li key={provenance} className="rounded-md border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ProvenanceBadge provenance={provenance} />
                    <span className="text-[11px] text-ink-500">
                      {group.length} source{group.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-ink-700">
                    {PROVENANCE[provenance].description}
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-ink-800">
                    {PROVENANCE[provenance].trustNote}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Method and policy documents"
            subtitle="What the analyst cites when it explains how a figure was produced."
            eyebrow={`${documents.length} documents`}
          />
          <CardBody>
            <ul className="space-y-2">
              {documents.map((document) => (
                <li key={document.id} className="rounded-md border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink-900">{document.title}</p>
                    <Badge tone="neutral">{document.documentType.replace(/_/g, ' ').toLowerCase()}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500">{document.sourceAuthority}</p>
                  <Disclosure summary="Read it" className="mt-1.5">
                    {document.text}
                  </Disclosure>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
