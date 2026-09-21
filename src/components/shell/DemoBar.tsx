'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { DEMO_STEPS } from '@/lib/demo-script';
import { usePersistentStep } from '@/lib/use-persistent-step';
import { cn } from '@/components/ui/primitives';

/**
 * Demo controller.
 *
 * Two jobs: keep the DEMO DATA label permanently visible so no figure on
 * screen can be mistaken for an official statistic, and walk the five-minute
 * running order without the presenter having to remember URLs.
 */
export function DemoBar({ onReset }: { onReset: () => Promise<{ ok: boolean }> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resetAt, setResetAt] = useState<string | null>(null);

  // The position in the running order survives navigation between roles.
  const [stepIndex, setStepIndex] = usePersistentStep('manipur-demo-step', 0);

  const move = (next: number) => {
    setStepIndex(Math.max(0, Math.min(DEMO_STEPS.length - 1, next)));
  };

  const step = DEMO_STEPS[stepIndex]!;

  return (
    <div className="sticky top-0 z-40 border-b border-warn-500/25 bg-warn-100/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-warn-700">
          <span aria-hidden>▧</span>
          DEMO DATA
        </span>
        <span className="hidden text-ink-700 sm:inline">
          Prototype figures. Not official tourism statistics.
        </span>

        <div className="ml-auto flex items-center gap-2">
          {resetAt ? <span className="text-ink-600">Reset at {resetAt}</span> : null}
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await onReset();
                setResetAt(new Date().toLocaleTimeString());
                move(0);
              })
            }
            disabled={pending}
            className="rounded-md border border-warn-500/30 bg-surface px-2 py-0.5 font-medium text-ink-700 hover:bg-surface-2 disabled:opacity-60"
          >
            {pending ? 'Resetting…' : 'Reset demo'}
          </button>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="rounded-md border border-warn-500/30 bg-surface px-2 py-0.5 font-medium text-ink-700 hover:bg-surface-2"
          >
            {open ? 'Hide script' : 'Demo script'}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-warn-500/20 bg-surface">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => move(stepIndex - 1)}
                disabled={stepIndex === 0}
                className="rounded-md border border-line-strong px-2 py-1 text-[12px] disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <span className="num w-14 text-center text-[12px] font-semibold text-ink-700">
                {stepIndex + 1} / {DEMO_STEPS.length}
              </span>
              <button
                type="button"
                onClick={() => move(stepIndex + 1)}
                disabled={stepIndex === DEMO_STEPS.length - 1}
                className="rounded-md border border-line-strong px-2 py-1 text-[12px] disabled:opacity-40"
              >
                Next ›
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-ink-900">
                <span className="num mr-2 text-ink-500">{step.timing}</span>
                {step.screen} — {step.title}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-700">{step.action}</p>
              <p className="mt-1 max-w-3xl text-[12px] italic text-ink-600">“{step.say}”</p>
            </div>

            <Link
              href={step.href}
              className="shrink-0 rounded-md bg-brand-700 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600"
            >
              Go to {step.screen}
            </Link>
          </div>

          <ol className="mx-auto flex max-w-[1600px] flex-wrap gap-1 px-4 pb-3">
            {DEMO_STEPS.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => move(index)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px]',
                    index === stepIndex
                      ? 'bg-brand-700 text-white'
                      : 'bg-surface-2 text-ink-600 hover:bg-surface-3',
                  )}
                >
                  {entry.screen}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
