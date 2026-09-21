import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { can, PERMISSION_LABEL, ROLE_DESCRIPTOR } from '@/lib/roles';
import { buildBriefing } from '@/server/analytics/briefing';
import { requireGovernment } from '@/server/auth/session';
import { Badge, Card, CardBody, CardHeader, cn } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import { BriefingExport } from '@/components/shared/BriefingExport';
import { exportBriefing } from '@/server/actions/briefing';

export const metadata: Metadata = { title: 'Tourism briefing' };
export const dynamic = 'force-dynamic';

export default async function BriefingPage() {
  const briefing = buildBriefing();
  const { governmentRole: role } = await requireGovernment();
  const allowed = can(role, 'briefing:export');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">{briefing.title}</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            Prepared {formatLongDate(briefing.preparedAt)} · {briefing.period}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warn">▧ Prototype output</Badge>
          {briefing.notQuotableCount > 0 ? (
            <Badge tone="risk">
              {briefing.notQuotableCount} line{briefing.notQuotableCount === 1 ? '' : 's'} not for
              external quotation
            </Badge>
          ) : null}
        </div>
      </div>

      <Card className="border-warn-500/30 bg-warn-100/40">
        <CardBody className="pt-4">
          <p className="text-[13px] font-medium text-warn-700">
            This is not an official publication of the Department of Tourism
          </p>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-700">
            A briefing is the point at which a figure leaves the interface that labels it and lands
            in a meeting or an email. Every line below therefore carries its provenance in the text
            itself, and anything that may not be quoted outside the platform is marked inline rather
            than footnoted.
          </p>
        </CardBody>
      </Card>

      <div className="space-y-5">
        {briefing.sections.map((section) => (
          <Card key={section.heading}>
            <CardHeader title={section.heading} />
            <CardBody>
              <ul className="space-y-2.5">
                {section.lines.map((entry, index) => (
                  <li
                    key={`${entry.label}-${index}`}
                    className={cn(
                      'rounded-md border p-3',
                      entry.quotable
                        ? 'border-line bg-surface'
                        : 'border-dashed border-risk-500/30 bg-risk-100/30',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-ink-900">{entry.label}</p>
                      <div className="flex items-center gap-1.5">
                        <ProvenanceBadge provenance={entry.provenance} />
                        {entry.quotable ? null : (
                          <Badge tone="risk" title="This category may not be quoted as a measurement">
                            Not for external quotation
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="num mt-1 text-[14px] text-ink-900">{entry.value}</p>
                    {entry.note ? (
                      <p className="mt-1 text-[11px] text-ink-500">{entry.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {section.commentary ? (
                <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-700">
                  {section.commentary}
                </p>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Caveats" subtitle="Carried into the export as well as shown here." />
        <CardBody>
          <ul className="space-y-1.5">
            {briefing.caveats.map((caveat) => (
              <li key={caveat} className="flex gap-2 text-[13px] text-ink-700">
                <span aria-hidden className="text-ink-400">
                  ·
                </span>
                {caveat}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Export"
          subtitle="Plain text, with every provenance label written into the line rather than shown as a badge."
          action={
            <Badge tone={allowed ? 'good' : 'neutral'}>
              {allowed
                ? `${ROLE_DESCRIPTOR[role].label} may export`
                : `${ROLE_DESCRIPTOR[role].label} may not export`}
            </Badge>
          }
        />
        <CardBody>
          <BriefingExport exportAction={exportBriefing} />
          {!allowed ? (
            <p className="mt-3 text-[12px] text-ink-600">
              {PERMISSION_LABEL['briefing:export']} is restricted to an administrator. The control is
              left visible on purpose: an officer needs to know the capability exists in order to ask
              for it.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
