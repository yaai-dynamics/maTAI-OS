import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { can, ROLE_DESCRIPTOR } from '@/lib/roles';
import {
  computeAllReputations,
  computeIntegrityFlags,
  INTEGRITY_RULES,
  PAYOUT_NOTE,
  proposePayouts,
  REPUTATION_METHOD,
} from '@/server/analytics/integrity';
import { getCampaigns, getPayouts } from '@/server/data/repository';
import { requireGovernment } from '@/server/auth/session';
import { Badge, Card, CardBody, CardHeader, cn, EmptyState } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { DemoDataNote, ProvenanceBadge } from '@/components/shared/badges';
import { ActionForm } from '@/components/shared/ActionForm';
import { approvePayoutForm } from '@/server/actions/forms';

export const metadata: Metadata = { title: 'Integrity and payouts' };
export const dynamic = 'force-dynamic';

/**
 * Creator integrity, reputation and payouts — roadmap Phase 3.
 *
 * Everything here is a named deterministic rule with a stated threshold. A flag
 * is a prompt to look at something, never an accusation, and the wording on the
 * screen says so.
 */
export default async function IntegrityPage() {
  const flags = computeIntegrityFlags();
  const reputations = computeAllReputations();
  const { governmentRole: role } = await requireGovernment();
  const mayApprove = can(role, 'payout:approve');

  const campaigns = getCampaigns().filter(
    (campaign) => campaign.status === 'COMPLETED' || campaign.status === 'IN_PROGRESS',
  );
  const proposals = campaigns.flatMap((campaign) => proposePayouts(campaign.id));
  const recorded = getPayouts();

  const holds = flags.filter((flag) => flag.severity === 'HOLD');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            Integrity and payouts
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
            Deterministic checks on submitted content, reputation computed from delivery rather than
            declared, and the reward split that follows from both.
          </p>
        </div>
        <Badge tone={mayApprove ? 'good' : 'neutral'}>
          {mayApprove
            ? `${ROLE_DESCRIPTOR[role].label} may approve payouts`
            : `${ROLE_DESCRIPTOR[role].label} may not approve payouts`}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Open flags', value: flags.length, note: `${holds.length} at hold severity` },
          { label: 'Checks running', value: Object.keys(INTEGRITY_RULES).length, note: 'each with a stated threshold' },
          { label: 'Payout proposals', value: proposals.length, note: 'across active and completed campaigns' },
          {
            label: 'Blocked by a check',
            value: proposals.filter((row) => row.blocked).length,
            note: 'cannot be approved until resolved',
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-[12px] text-ink-600">{stat.label}</p>
            <p className="mt-1 text-[28px] font-semibold leading-none text-ink-900">{stat.value}</p>
            <p className="mt-1 text-[12px] leading-snug text-ink-500">{stat.note}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Integrity checks"
            subtitle="A flag is a prompt to look, not an accusation. Every one names the rule that produced it."
            eyebrow={`${flags.length} open`}
          />
          <CardBody>
            {flags.length === 0 ? (
              <EmptyState icon="✓" title="No check has flagged anything" />
            ) : (
              <ul className="space-y-2.5">
                {flags.map((flag, index) => (
                  <li
                    key={`${flag.contentId}-${flag.rule}-${index}`}
                    className={cn(
                      'rounded-md border p-3',
                      flag.severity === 'HOLD'
                        ? 'border-risk-500/30 bg-risk-100/40'
                        : 'border-warn-500/30 bg-warn-100/40',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink-900">{flag.contentTitle}</p>
                        <p className="text-[11px] text-ink-500">
                          {flag.creatorName} · {flag.campaignName}
                        </p>
                      </div>
                      <Badge tone={flag.severity === 'HOLD' ? 'risk' : 'warn'}>
                        {flag.severity.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] text-ink-800">{flag.description}</p>
                    <p className="num mt-1 text-[11px] text-ink-600">{flag.detail}</p>
                  </li>
                ))}
              </ul>
            )}

            <Disclosure summary="Every rule and its threshold" className="mt-3">
              <ul className="space-y-1">
                {Object.entries(INTEGRITY_RULES).map(([rule, description]) => (
                  <li key={rule} className="text-[12px]">
                    <span className="font-mono text-[11px] text-brand-700">{rule}</span> — {description}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Creator reputation"
            subtitle="Computed from delivery on this platform. Where it differs from the declared profile score, the computed one is the evidence."
            action={<ProvenanceBadge provenance="ESTIMATED" />}
          />
          <CardBody>
            <ul className="space-y-2.5">
              {reputations.slice(0, 8).map((reputation) => {
                const gap = reputation.score - reputation.declaredScore;
                return (
                  <li
                    key={reputation.creator.id}
                    className="rounded-md border border-line bg-surface p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink-900">
                          {reputation.creator.displayName}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {reputation.hasTrackRecord
                            ? `${reputation.published} published of ${reputation.submissions} submitted · ${reputation.openFlags} open flag${reputation.openFlags === 1 ? '' : 's'}`
                            : 'Nothing delivered on this platform yet, so there is no evidence to score'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            'num text-[18px] font-semibold leading-none',
                            reputation.hasTrackRecord ? 'text-ink-900' : 'text-ink-400',
                          )}
                        >
                          {reputation.hasTrackRecord ? reputation.score : 'No record'}
                        </p>
                        <p className="num text-[10px] text-ink-500">
                          declared {reputation.declaredScore}
                          {reputation.hasTrackRecord && Math.abs(gap) >= 10 ? (
                            <span className={gap < 0 ? ' text-risk-700' : ' text-good-700'}>
                              {' '}
                              ({gap > 0 ? '+' : ''}
                              {gap.toFixed(0)})
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    <ul className="mt-2 space-y-1">
                      {reputation.components.map((component) => (
                        <li key={component.key} className="flex items-center gap-2.5">
                          <span className="w-40 shrink-0 text-[11px] text-ink-600">
                            {component.label}
                          </span>
                          <span className="h-[8px] min-w-0 flex-1 rounded-r-[4px] bg-chart-grid/70">
                            <span
                              className="block h-full rounded-r-[4px] bg-chart-1"
                              style={{ width: `${(component.score / component.maxScore) * 100}%` }}
                              role="img"
                              aria-label={`${component.label}: ${component.score} of ${component.maxScore}`}
                            />
                          </span>
                          <span className="num w-12 shrink-0 text-right text-[11px] text-ink-700">
                            {component.score}/{component.maxScore}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>

            <Disclosure summary="How reputation is computed" className="mt-3">
              {REPUTATION_METHOD}
            </Disclosure>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Payout proposals"
          subtitle="The split follows attributed tourism outcomes and published volume, not follower counts."
          eyebrow={`${proposals.length} proposals`}
        />
        <CardBody>
          {proposals.length === 0 ? (
            <EmptyState
              icon="—"
              title="Nothing to propose"
              description="A campaign needs published content before a reward split can be worked out."
            />
          ) : (
            <ul className="space-y-2.5">
              {proposals.map((proposal) => {
                const existing = recorded.find(
                  (row) =>
                    row.campaignId === proposal.campaignId && row.creatorId === proposal.creatorId,
                );
                return (
                  <li
                    key={`${proposal.campaignId}-${proposal.creatorId}`}
                    className={cn(
                      'rounded-md border p-3.5',
                      proposal.blocked ? 'border-risk-500/30 bg-risk-100/30' : 'border-line bg-surface',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink-900">
                          {proposal.creatorName}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {proposal.campaignName} · {proposal.publishedContent} published item
                          {proposal.publishedContent === 1 ? '' : 's'} ·{' '}
                          {proposal.attributedOutcomes} attributed outcomes
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num text-[18px] font-semibold leading-none text-ink-900">
                          ₹{proposal.amount.toLocaleString('en-IN')}
                        </p>
                        <p className="num text-[10px] text-ink-500">
                          {proposal.sharePercent}% of the pool
                        </p>
                      </div>
                    </div>

                    <p className="mt-1.5 text-[11px] text-ink-600">{proposal.basis}</p>

                    {proposal.blocked ? (
                      <p className="mt-2 rounded-md border border-risk-500/30 bg-risk-100/60 px-2.5 py-1.5 text-[12px] text-risk-700">
                        Blocked: {proposal.blockedReason}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      {existing ? (
                        <Badge tone={existing.status === 'PAID' ? 'good' : 'info'}>
                          {existing.status.replace(/_/g, ' ').toLowerCase()} on{' '}
                          {formatLongDate(existing.recordedAt)}
                        </Badge>
                      ) : null}

                      {proposal.blocked ? (
                        <span className="text-[12px] text-ink-600">
                          Resolve the integrity check before approving.
                        </span>
                      ) : (
                        <ActionForm
                          action={approvePayoutForm}
                          submitLabel={existing?.status === 'APPROVED' ? 'Re-approve' : 'Approve'}
                          pendingLabel="Recording…"
                          size="sm"
                          variant="secondary"
                          className="space-y-2"
                          hiddenFields={{
                            campaignId: proposal.campaignId,
                            creatorId: proposal.creatorId,
                          }}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 rounded-md border border-warn-500/30 bg-warn-100/40 p-3">
            <p className="text-[12px] font-medium text-warn-700">{PAYOUT_NOTE}</p>
          </div>
          <div className="mt-2">
            <DemoDataNote />
          </div>
        </CardBody>
      </Card>

      <Card tone="outline">
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <p className="text-[13px] text-ink-700">
            Content review happens before any of this. A submission that has not been reviewed cannot
            reach a payout proposal.
          </p>
          <Link
            href="/gov/partners"
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
          >
            Content review queue
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
