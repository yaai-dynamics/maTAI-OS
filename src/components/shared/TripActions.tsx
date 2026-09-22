'use client';

import { Check, Flag, Globe, Navigation } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { JourneyPhase } from '@/lib/journey';
import type { OnlineSearchResult } from '@/server/actions/tourist';
import { Button } from '@/components/ui/primitives';

type Result = { ok: boolean; error?: string };

/**
 * What the visitor can do with a plan, given where it stands: choose an
 * option, start a chosen journey, or end the one under way.
 */
export function TripActions({
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
    <div className="space-y-2">
      {status === 'DRAFT' ? (
        <>
          <Button disabled={pending} onClick={() => run(choose)} className="w-full">
            <Check aria-hidden size={16} />
            {pending ? 'Choosing…' : 'Choose this plan'}
          </Button>
          <p className="text-[12px] text-ink-500">
            Choosing keeps this plan as a trip and removes the other options from the same request.
          </p>
        </>
      ) : status === 'ACTIVE' || phase === 'IN_PROGRESS' ? (
        <>
          <Link
            href="/explore/trip"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-700 text-sm font-medium text-white hover:bg-brand-600"
          >
            <Navigation aria-hidden size={16} />
            Open the live trip
          </Link>
          {status === 'ACTIVE' ? (
            <Button variant="secondary" disabled={pending} onClick={() => run(end)} className="w-full">
              <Flag aria-hidden size={15} />
              {pending ? 'Ending…' : 'End this trip'}
            </Button>
          ) : (
            <p className="text-[12px] text-ink-500">Current, because today falls within its dates.</p>
          )}
        </>
      ) : status === 'COMPLETED' ? (
        <p className="text-[13px] text-ink-600">This trip has ended.</p>
      ) : (
        <>
          <Button disabled={pending} onClick={() => run(start, '/explore/trip')} className="w-full">
            <Navigation aria-hidden size={16} />
            {pending ? 'Starting…' : 'Start this trip'}
          </Button>
          <p className="text-[12px] text-ink-500">
            {phase === 'UPCOMING'
              ? 'It becomes your current trip on its first day. Start it now if you are already travelling.'
              : 'Starting makes it your current trip, for check-ins and feedback as you travel.'}
          </p>
        </>
      )}
      {error ? (
        <p role="alert" className="text-[12px] text-risk-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Runs, or re-runs, the web search for one journey. */
export function SearchOnlineButton({
  tripId,
  search,
  label = 'Search online',
}: {
  tripId: string;
  search: (tripId: string) => Promise<OnlineSearchResult>;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await search(tripId);
            setNote(
              result.error ??
                (result.status === 'FOUND'
                  ? null
                  : result.status === 'NONE_FOUND'
                    ? 'Nothing beyond the partners turned up.'
                    : result.status === 'OFF'
                      ? 'Online search is off.'
                      : 'The search did not finish. Try again in a moment.'),
            );
            router.refresh();
          })
        }
      >
        <Globe aria-hidden size={14} />
        {pending ? 'Searching…' : label}
      </Button>
      {note ? <span className="text-[12px] text-ink-500">{note}</span> : null}
    </span>
  );
}

/** One action button with its own pending and error state. */
export function TripButton({
  tripId,
  action,
  label,
  pendingLabel,
  variant = 'primary',
}: {
  tripId: string;
  action: (tripId: string) => Promise<Result>;
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action(tripId);
            setError(result.ok ? null : (result.error ?? 'That did not work. Try again.'));
            router.refresh();
          })
        }
      >
        {pending ? pendingLabel : label}
      </Button>
      {error ? (
        <span role="alert" className="text-[12px] text-risk-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
