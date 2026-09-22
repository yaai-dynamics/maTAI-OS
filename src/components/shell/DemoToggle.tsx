'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { DEMO_STEPS } from '@/lib/demo-script';
import { usePersistentStep } from '@/lib/use-persistent-step';
import { resetDemo } from '@/server/actions/demo';
import { cn } from '@/components/ui/primitives';

/**
 * Demo controller, folded into one icon at the right end of the top bar.
 *
 * The icon itself is the demo-data mark: it is on every screen in demo mode,
 * in the same amber and glyph as the DEMO DATA provenance badge. Opening it
 * shows the label in words, resets the prototype, and walks the five-minute
 * running order without the presenter having to remember URLs.
 */
export function DemoToggle() {
  // Both survive navigation, including between interfaces, whose layouts
  // remount: a presenter who opens the script keeps it open while stepping.
  const [openFlag, setOpenFlag] = usePersistentStep('matai-demo-panel', 0);
  const [stepIndex, setStepIndex] = usePersistentStep('manipur-demo-step', 0);
  const [pending, startTransition] = useTransition();
  const [resetAt, setResetAt] = useState<string | null>(null);

  const open = openFlag === 1;
  const close = () => setOpenFlag(0);

  // Escape closes it. A click elsewhere does not: the panel is a presenter's
  // script and has to stay up while they work the screen beneath it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFlag(0);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpenFlag]);

  const move = (next: number) => setStepIndex(Math.max(0, Math.min(DEMO_STEPS.length - 1, next)));
  const step = DEMO_STEPS[Math.min(stepIndex, DEMO_STEPS.length - 1)]!;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpenFlag(open ? 0 : 1)}
        aria-expanded={open}
        aria-controls="demo-panel"
        aria-label="Demo data: prototype figures, not official tourism statistics. Demo controls"
        title="Demo data — prototype figures, not official tourism statistics"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md border text-[13px] leading-none transition-colors',
          open
            ? 'border-warn-500 bg-warn-500 text-white'
            : 'border-warn-500/35 bg-warn-100 text-warn-700 hover:border-warn-500/60',
        )}
      >
        <span aria-hidden>▧</span>
      </button>

      {open ? (
        <div
          id="demo-panel"
          role="region"
          aria-label="Demo controls"
          className="absolute right-0 top-full z-50 mt-2 w-[min(27rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-line bg-surface text-[12px] shadow-lg"
        >
          <div className="flex items-start gap-2 border-b border-warn-500/25 bg-warn-100 px-3 py-2.5">
            <span aria-hidden className="mt-px text-warn-700">
              ▧
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-warn-700">DEMO DATA</p>
              <p className="text-ink-700">Prototype figures. Not official tourism statistics.</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close demo controls"
              className="-mr-1 rounded px-1.5 text-[14px] leading-none text-ink-500 hover:text-ink-900"
            >
              ×
            </button>
          </div>

          <div className="space-y-3 px-3 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => move(stepIndex - 1)}
                disabled={stepIndex === 0}
                className="rounded-md border border-line-strong px-2 py-1 disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <span className="num w-12 text-center font-semibold text-ink-700">
                {stepIndex + 1} / {DEMO_STEPS.length}
              </span>
              <button
                type="button"
                onClick={() => move(stepIndex + 1)}
                disabled={stepIndex === DEMO_STEPS.length - 1}
                className="rounded-md border border-line-strong px-2 py-1 disabled:opacity-40"
              >
                Next ›
              </button>
              <Link
                href={step.href}
                className="ml-auto shrink-0 rounded-md bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-600"
              >
                Go to {step.screen}
              </Link>
            </div>

            <div>
              <p className="font-semibold text-ink-900">
                <span className="num mr-2 text-ink-500">{step.timing}</span>
                {step.screen} — {step.title}
              </p>
              <p className="mt-0.5 text-ink-700">{step.action}</p>
              <p className="mt-1 italic text-ink-600">“{step.say}”</p>
            </div>

            <ol className="flex flex-wrap gap-1">
              {DEMO_STEPS.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => move(index)}
                    aria-current={index === stepIndex ? 'step' : undefined}
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

            <div className="flex items-center gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await resetDemo();
                    setResetAt(new Date().toLocaleTimeString());
                    move(0);
                  })
                }
                disabled={pending}
                className="rounded-md border border-line-strong bg-surface px-2.5 py-1 font-medium text-ink-700 hover:bg-surface-2 disabled:opacity-60"
              >
                {pending ? 'Resetting…' : 'Reset demo'}
              </button>
              <span className="text-ink-500">
                {resetAt ? `Reset at ${resetAt}` : 'Returns every figure to the seeded state.'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
