'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PlanResult } from '@/server/actions/tourist';
import type { TripCondition } from '@/server/ai/trip-planner';
import { Button, cn } from '@/components/ui/primitives';

/**
 * Adaptive re-planning.
 *
 * No weather feed is connected in the prototype, so the condition is chosen
 * explicitly rather than inferred. That is the honest version of the demo: the
 * agent behaviour is real, the sensor is not.
 */

const CONDITIONS: { value: TripCondition; label: string; note: string }[] = [
  {
    value: 'RAIN',
    label: 'Heavy rain tomorrow',
    note: 'Moves an open-air stop out and brings a covered one in.',
  },
  {
    value: 'SHORT_ON_TIME',
    label: 'Short on time',
    note: 'Drops the last stop of the busiest day rather than rushing it.',
  },
  {
    value: 'CLOSURE',
    label: 'A site is closed',
    note: 'Substitutes the closest match instead of leaving a gap.',
  },
];

export function ReplanControls({
  replan,
}: {
  replan: (condition: TripCondition) => Promise<PlanResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<TripCondition | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = (condition: TripCondition) => {
    setActive(condition);
    setMessage(null);
    startTransition(async () => {
      const result = await replan(condition);
      setMessage(
        result.ok
          ? (result.trip?.adaptedReason ?? 'The plan was updated.')
          : (result.error ?? 'Could not re-plan.'),
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-700">
        Conditions change. Tell the planner what happened and it rebuilds the affected part of the
        route rather than the whole trip.
      </p>

      <div className="flex flex-wrap gap-2">
        {CONDITIONS.map((condition) => (
          <button
            key={condition.value}
            type="button"
            onClick={() => run(condition.value)}
            disabled={pending}
            className={cn(
              'rounded-md border px-3 py-2 text-left text-[12px] transition-colors disabled:opacity-60',
              active === condition.value && pending
                ? 'border-brand-500 bg-brand-50'
                : 'border-line-strong bg-surface hover:bg-surface-2',
            )}
          >
            <span className="block font-medium text-ink-900">
              {pending && active === condition.value ? 'Re-planning…' : condition.label}
            </span>
            <span className="block text-[11px] text-ink-500">{condition.note}</span>
          </button>
        ))}
      </div>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-lake-200 bg-lake-50 px-3 py-2 text-[13px] text-lake-800"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function SaveTripButton({
  tripId,
  save,
  saved,
}: {
  tripId: string;
  save: (tripId: string) => Promise<{ ok: boolean; error?: string }>;
  saved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(saved);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <Button
        variant={done ? 'secondary' : 'primary'}
        disabled={pending || done}
        onClick={() =>
          startTransition(async () => {
            const result = await save(tripId);
            setError(result.ok ? null : (result.error ?? 'Could not save this journey.'));
            if (result.ok) setDone(true);
            router.refresh();
          })
        }
      >
        {done ? 'Saved — a new plan will not replace it' : pending ? 'Saving…' : 'Save this journey'}
      </Button>
      {error ? (
        <p role="alert" className="text-[12px] text-risk-700">
          {error}
        </p>
      ) : !done ? (
        <p className="text-[11px] text-ink-500">Not saved yet: the next journey you plan will replace this one.</p>
      ) : null}
    </div>
  );
}
