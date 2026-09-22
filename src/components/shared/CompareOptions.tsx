'use client';

import { Columns3 } from 'lucide-react';
import { useState } from 'react';
import { formatRupees } from '@/lib/money';
import { Modal } from '@/components/ui/interactive';
import { Badge, ButtonLink, cn } from '@/components/ui/primitives';

/**
 * Two or three plans, side by side. The same shape a `PlanOptionView` gives
 * the planner reply, so both the chat and the "Waiting for your choice" list
 * can open the same popup with what they already have on hand.
 */
export interface CompareOption {
  tripId: string;
  label: string;
  theme: string;
  summary?: string;
  days: number;
  stopNames: string[];
  experiences: number;
  nights: number;
  partnerNights: number;
  guides: number;
  cost: number;
  fitsBudget?: boolean;
}

export function CompareButton({
  options,
  tone = 'light',
  className,
}: {
  options: CompareOption[];
  /** 'dark' for a button sitting on the planner's dark hero surface. */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Nothing to compare with only one option.
  if (options.length < 2) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
          tone === 'dark'
            ? 'border-white/25 text-white/80 hover:bg-white/10 hover:text-white'
            : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
          className,
        )}
      >
        <Columns3 aria-hidden size={13} />
        Compare
      </button>
      {open ? <CompareModal options={options} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CompareModal({ options, onClose }: { options: CompareOption[]; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Compare these options"
      subtitle={`${options.length} plans from the same request, side by side.`}
      size="xl"
    >
      <div className={cn('grid gap-3', options.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        {options.map((option) => (
          <div key={option.tripId} className="flex flex-col rounded-xl border border-line-strong bg-surface p-3.5">
            <span className="w-fit rounded-full bg-lake-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-lake-700">
              {option.label}
            </span>
            <p className="mt-1.5 text-[14px] font-semibold leading-snug text-ink-900">{option.theme}</p>
            {option.summary ? <p className="mt-0.5 text-[12px] text-ink-600">{option.summary}</p> : null}

            <dl className="mt-3 space-y-1.5 text-[12px]">
              <Row label="Route">{option.stopNames.join(' → ') || 'No stops yet'}</Row>
              <Row label="Length">
                {option.days} {option.days === 1 ? 'day' : 'days'}
              </Row>
              {option.experiences > 0 ? <Row label="Experiences">{option.experiences}</Row> : null}
              {option.nights > 0 ? (
                <Row label="Stays">
                  {option.partnerNights} of {option.nights} {option.nights === 1 ? 'night' : 'nights'} with a partner
                </Row>
              ) : null}
              {option.guides > 0 ? (
                <Row label="Guided">
                  {option.guides} {option.guides === 1 ? 'day' : 'days'}
                </Row>
              ) : null}
            </dl>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
              <div>
                <p className="text-[14px] font-semibold text-ink-900">{formatRupees(option.cost)}</p>
                {option.fitsBudget === undefined ? null : option.fitsBudget ? (
                  <Badge tone="good">within budget</Badge>
                ) : (
                  <Badge tone="warn">over budget</Badge>
                )}
              </div>
              <ButtonLink href={`/explore/journey/${option.tripId}`} size="sm" variant="secondary">
                View details
              </ButtonLink>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[4.5rem] shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 text-ink-800">{children}</dd>
    </div>
  );
}
