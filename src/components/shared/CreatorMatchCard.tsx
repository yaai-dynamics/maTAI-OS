import type { CreatorMatch } from '@/server/analytics/matching';
import { Badge, Card, cn } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import { ActionForm } from '@/components/shared/ActionForm';
import { inviteCreatorForm } from '@/server/actions/forms';

/**
 * Creator match, with the score broken out.
 *
 * docs/05-ai-spec.md forbids opaque decisions from a model, so the six weighted
 * factors, the highlights and the cautions are all on the card. An officer can
 * disagree with the ranking and see exactly where to disagree.
 */
export function CreatorMatchCard({
  match,
  rank,
  campaignId,
}: {
  match: CreatorMatch;
  rank: number;
  campaignId: string;
}) {
  const { creator } = match;

  return (
    <Card as="article" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
              rank === 1 ? 'bg-brand-700 text-white' : 'bg-surface-3 text-ink-700',
            )}
          >
            {rank}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink-900">{creator.displayName}</h3>
            <p className="text-[12px] text-ink-500">
              {creator.homeDistrict} · {creator.platforms.join(', ')} · {creator.languages.join(', ')}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="num text-[22px] font-semibold leading-none text-ink-900">
            {match.totalScore}
          </p>
          <p className="text-[11px] text-ink-500">of 100</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {match.factors.map((factor) => {
          const width = (factor.score / factor.maxScore) * 100;
          return (
            <li key={factor.key} className="flex items-center gap-2.5">
              <span className="w-32 shrink-0 text-[11px] text-ink-600">{factor.label}</span>
              <span className="h-[10px] min-w-0 flex-1 rounded-r-[4px] bg-chart-grid/70">
                <span
                  className="block h-full rounded-r-[4px] bg-chart-1"
                  style={{ width: `${width}%` }}
                  role="img"
                  aria-label={`${factor.label}: ${factor.score} of ${factor.maxScore}`}
                />
              </span>
              <span className="num w-12 shrink-0 text-right text-[11px] tabular-nums text-ink-700">
                {factor.score}/{factor.maxScore}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="mt-2.5 space-y-1">
        {match.factors.map((factor) => (
          <div key={factor.key} className="text-[11px] text-ink-600">
            <dt className="inline font-medium text-ink-700">{factor.label}: </dt>
            <dd className="inline">{factor.detail}</dd>
          </div>
        ))}
      </dl>

      {match.highlights.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {match.highlights.map((highlight, index) => (
            <li key={index} className="flex gap-1.5 text-[12px] text-ink-800">
              <span aria-hidden className="text-good-500">
                ✓
              </span>
              {highlight}
            </li>
          ))}
        </ul>
      ) : null}

      {match.cautions.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {match.cautions.map((caution, index) => (
            <li key={index} className="flex gap-1.5 text-[12px] text-warn-700">
              <span aria-hidden>!</span>
              {caution}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <ProvenanceBadge provenance={creator.provenance} />
          {match.alreadyApplied ? <Badge tone="good">Already applied</Badge> : null}
        </div>
        {match.alreadyApplied ? null : (
          <ActionForm
            action={inviteCreatorForm}
            submitLabel="Invite"
            pendingLabel="Inviting…"
            variant="secondary"
            size="sm"
            className="space-y-2"
            hiddenFields={{ campaignId, creatorId: creator.id }}
          />
        )}
      </div>
    </Card>
  );
}
