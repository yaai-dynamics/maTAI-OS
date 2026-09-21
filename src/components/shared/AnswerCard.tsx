import type { AnswerChart, EvidenceItem, GovernmentAnswer } from '@/lib/types';
import { PROVENANCE } from '@/lib/provenance';
import { Badge, Card, cn } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfidenceBadge, ProvenanceBadge } from '@/components/shared/badges';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { RankedBars } from '@/components/charts/RankedBars';
import { FunnelBars } from '@/components/charts/FunnelBars';

/**
 * The government answer contract, rendered.
 *
 * docs/06-design-system.md requires answer, evidence, recommendation,
 * confidence and sources to be visually separate, so a reader can check the
 * reasoning rather than trusting the paragraph.
 */

export function EvidenceCard({ item }: { item: EvidenceItem }) {
  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-900">{item.label}</p>
        <ProvenanceBadge provenance={item.provenance} />
      </div>
      <p className="num mt-1 text-[13px] text-ink-800">{item.value}</p>
      <p className="mt-1.5 text-[11px] text-ink-500">
        {item.source}
        {item.period ? ` · ${item.period}` : ''}
      </p>
      {item.method ? (
        <Disclosure summary="Method" className="mt-1.5">
          {item.method}
        </Disclosure>
      ) : null}
    </li>
  );
}

function AnswerChartView({ chart }: { chart: AnswerChart }) {
  if (chart.kind === 'FUNNEL') {
    return (
      <ChartFrame
        title={chart.title}
        provenance={chart.provenance}
        table={{
          columns: ['Stage', chart.unit],
          rows: chart.points.map((point) => [point.label, point.value.toLocaleString('en-IN')]),
        }}
      >
        <FunnelBars
          stages={chart.points.map((point, index) => ({
            id: `${chart.title}-${index}`,
            label: point.label,
            value: point.value,
          }))}
        />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={chart.title}
      provenance={chart.provenance}
      table={{
        columns: ['Item', chart.unit],
        rows: chart.points.map((point) => [
          point.label,
          typeof point.value === 'number' ? point.value.toLocaleString('en-IN') : point.value,
        ]),
      }}
    >
      <RankedBars
        labelWidth="lg"
        data={chart.points.map((point, index) => ({
          id: `${chart.title}-${index}`,
          label: point.label,
          value: point.value,
          valueLabel:
            chart.unit === '%'
              ? `${point.value > 0 ? '+' : ''}${point.value.toFixed(1)}%`
              : point.value.toLocaleString('en-IN'),
          ...(point.highlight ? { emphasis: true } : {}),
        }))}
      />
    </ChartFrame>
  );
}

export function AnswerCard({ answer }: { answer: GovernmentAnswer }) {
  const provenances = [...new Set(answer.evidence.map((item) => item.provenance))];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-surface-2/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{answer.intent}</Badge>
          <ConfidenceBadge confidence={answer.confidence} reason={answer.confidenceReason} />
          {answer.usesSyntheticData ? (
            <Badge tone="warn" title="At least one input is prototype demo data">
              ▧ Includes demo data
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-[13px] text-ink-600">{answer.question}</p>
      </div>

      <div className="space-y-5 p-4">
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Answer
          </h3>
          <p className="text-[15px] leading-relaxed text-ink-900">{answer.answer}</p>
        </section>

        {answer.charts.map((chart, index) => (
          <section key={index}>{<AnswerChartView chart={chart} />}</section>
        ))}

        {answer.evidence.length > 0 ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Evidence
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {answer.evidence.map((item, index) => (
                <EvidenceCard key={`${item.label}-${index}`} item={item} />
              ))}
            </ul>
          </section>
        ) : null}

        {answer.recommendation ? (
          <section className="rounded-md border border-brand-200 bg-brand-50 p-3.5">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
              Recommendation
            </h3>
            <p className="text-[14px] leading-relaxed text-ink-900">{answer.recommendation}</p>
          </section>
        ) : null}

        {answer.nextActions.length > 0 ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Next actions
            </h3>
            <ul className="space-y-1.5">
              {answer.nextActions.map((action, index) => (
                <li key={index} className="flex gap-2 text-[13px] text-ink-800">
                  <span aria-hidden className="text-brand-500">
                    →
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-surface-2/50 p-3">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Confidence
            </h3>
            <p className="text-[13px] text-ink-800">{answer.confidenceReason}</p>
            {answer.caveats.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {answer.caveats.map((caveat, index) => (
                  <li key={index} className="flex gap-1.5 text-[12px] text-ink-600">
                    <span aria-hidden>·</span>
                    <span>{caveat}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-md border border-line bg-surface-2/50 p-3">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Sources
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {provenances.map((provenance) => (
                <ProvenanceBadge key={provenance} provenance={provenance} />
              ))}
              {provenances.length === 0 ? (
                <span className="text-[12px] text-ink-500">No tool was run for this response.</span>
              ) : null}
            </div>
            <dl className="mt-2 space-y-1">
              {provenances.map((provenance) => (
                <div key={provenance} className="text-[11px] text-ink-600">
                  <dt className="inline font-medium text-ink-700">{PROVENANCE[provenance].label}: </dt>
                  <dd className="inline">{PROVENANCE[provenance].trustNote}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section>
          <Disclosure summary={`Audit trail — ${answer.toolTrace.length} tool call${answer.toolTrace.length === 1 ? '' : 's'}`}>
            <ol className="space-y-2">
              {answer.toolTrace.map((entry, index) => (
                <li key={index} className="rounded-md border border-line bg-surface p-2.5">
                  <p className="font-mono text-[12px] text-brand-700">{entry.tool}</p>
                  <p className="mt-0.5 text-[12px] text-ink-700">{entry.summary}</p>
                  <p className="num mt-0.5 text-[11px] text-ink-500">
                    input: {entry.input} · {entry.rowsConsidered.toLocaleString('en-IN')} records
                    {entry.durationMs !== undefined ? ` · ${entry.durationMs} ms` : ''}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-ink-500">
              Generated by {answer.generatedBy}. Figures come from these tools, not from the language
              model.
            </p>
          </Disclosure>
        </section>
      </div>
    </Card>
  );
}

export function InsightCard({
  title,
  body,
  tone = 'neutral',
  action,
}: {
  title: string;
  body: React.ReactNode;
  tone?: 'neutral' | 'watch' | 'action';
  action?: React.ReactNode;
}) {
  const tones = {
    neutral: 'border-line bg-surface',
    watch: 'border-warn-500/30 bg-warn-100/50',
    action: 'border-risk-500/30 bg-risk-100/50',
  } as const;

  return (
    <div className={cn('rounded-md border p-3.5', tones[tone])}>
      <p className="text-[13px] font-semibold text-ink-900">{title}</p>
      <div className="mt-1 text-[13px] text-ink-700">{body}</div>
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}
