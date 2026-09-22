'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Flag, Navigation } from 'lucide-react';

import type { JourneyPhase } from '@/lib/journey';

type Result = { ok: boolean; error?: string };

const primary =
  'flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-60';
const secondary =
  'flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[14px] font-semibold text-ink-800 active:bg-surface-2 disabled:opacity-60';

/** The main action for a plan on mobile: keep it, start it, or end it. */
export function MobileTripActions({
  tripId,
  status,
  phase,
  choose,
  start,
  end,
}: {
  tripId: string;
  status: 'DRAFT' | 'SAVED' | 'ACTIVE' | 'COMPLETED';
  phase: JourneyPhase;
  choose: (tripId: string) => Promise<Result>;
  start: (tripId: string) => Promise<Result>;
  end: (tripId: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (id: string) => Promise<Result>, then?: string) =>
    startTransition(async () => {
      const result = await action(tripId);
      setError(result.ok ? null : (result.error ?? 'That did not work. Try again.'));
      if (result.ok && then) router.push(then);
      else router.refresh();
    });

  return (
    <div>
      {status === 'DRAFT' ? (
        <button type="button" disabled={pending} onClick={() => run(choose)} className={`${primary} w-full`}>
          <Check aria-hidden size={18} />
          {pending ? 'Keeping…' : 'Keep this plan'}
        </button>
      ) : status === 'ACTIVE' || phase === 'IN_PROGRESS' ? (
        <div className="flex gap-2">
          <Link href="/m/trip" className={primary}>
            <Navigation aria-hidden size={18} />
            Live trip
          </Link>
          {status === 'ACTIVE' ? (
            <button type="button" disabled={pending} onClick={() => run(end)} className={secondary}>
              <Flag aria-hidden size={16} />
              {pending ? 'Ending…' : 'End'}
            </button>
          ) : null}
        </div>
      ) : status === 'COMPLETED' ? (
        <p className="py-3 text-center text-[14px] text-ink-600">This trip has ended.</p>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(start, '/m/trip')} className={`${primary} w-full`}>
          <Navigation aria-hidden size={18} />
          {pending ? 'Starting…' : 'Start this trip'}
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-center text-[12px] text-risk-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
