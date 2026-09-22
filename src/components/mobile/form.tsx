'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { Star } from 'lucide-react';

import { IDLE, type FormState } from '@/lib/form-state';
import { cn } from '@/components/ui/primitives';

/**
 * Mobile form parts. Inputs are 16px so iOS does not zoom on focus, and
 * 48px tall for touch. The submit button spans the width.
 */

export const mobileInput =
  'block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[16px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500';

export function MobileForm({
  action,
  submitLabel,
  pendingLabel,
  hiddenFields = {},
  children,
  after,
  refreshOnSuccess = false,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  hiddenFields?: Record<string, string>;
  children?: ReactNode;
  /** Shown under the submit button. */
  after?: ReactNode;
  /** Re-render the page after a successful submit, for pages showing its effect. */
  refreshOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, IDLE);
  useEffect(() => {
    // The shared actions revalidate /explore, not /m, so this page asks itself.
    if (refreshOnSuccess && state.status === 'ok') router.refresh();
  }, [refreshOnSuccess, router, state]);
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state.status !== 'idle' && state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'rounded-xl border px-3.5 py-2.5 text-[13px]',
            state.status === 'ok'
              ? 'border-good-500/30 bg-good-100 text-good-700'
              : 'border-risk-500/30 bg-risk-100 text-risk-700',
          )}
        >
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-brand-700 text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? (pendingLabel ?? 'Working…') : submitLabel}
      </button>
      {after}
    </form>
  );
}

export function MobileField({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-700">
        {label}
        {required ? <span className="ml-0.5 text-risk-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[12px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

/** Five large tappable stars, posted as a radio group named `name`. */
export function StarRating({ name, defaultValue = 4 }: { name: string; defaultValue?: number }) {
  const [value, setValue] = useState(defaultValue);
  const words = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent'];
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-ink-700">
        Rating<span className="ml-0.5 text-risk-500">*</span>
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label key={star} className="cursor-pointer p-1">
            <input
              type="radio"
              name={name}
              value={star}
              required
              checked={value === star}
              onChange={() => setValue(star)}
              className="sr-only"
            />
            <Star
              aria-hidden
              size={34}
              className={star <= value ? 'fill-warn-500 text-warn-500' : 'text-line-strong'}
            />
            <span className="sr-only">
              {star} out of 5
            </span>
          </label>
        ))}
        <span className="ml-2 text-[13px] font-medium text-ink-600">{words[value]}</span>
      </div>
    </fieldset>
  );
}
