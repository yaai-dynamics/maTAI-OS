'use client';

import { useActionState, type ReactNode } from 'react';
import { IDLE, type FormState } from '@/lib/form-state';
import { Button, cn } from '@/components/ui/primitives';

/**
 * Form wrapper with pending, success and error states.
 *
 * docs/06-design-system.md requires loading, empty, error and demo states
 * everywhere, so no form in this prototype submits into silence.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  className,
  variant = 'primary',
  size = 'md',
  hiddenFields = {},
  footer,
  fullWidthSubmit = false,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  hiddenFields?: Record<string, string>;
  footer?: ReactNode;
  fullWidthSubmit?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  return (
    <form action={formAction} className={cn('space-y-3', className)}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {children}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant={variant}
          size={size}
          disabled={pending}
          className={fullWidthSubmit ? 'w-full' : undefined}
        >
          {pending ? (pendingLabel ?? 'Working…') : submitLabel}
        </Button>
        {footer}
      </div>

      {state.status !== 'idle' && state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'rounded-md border px-3 py-2 text-[13px]',
            state.status === 'ok'
              ? 'border-good-500/30 bg-good-100 text-good-700'
              : 'border-risk-500/30 bg-risk-100 text-risk-700',
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/* --------------------------------- Fields --------------------------------- */

export function Field({
  label,
  name,
  hint,
  children,
  required = false,
}: {
  label: string;
  name: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-[12px] font-medium text-ink-700">
        {label}
        {required ? <span className="ml-0.5 text-risk-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500';

export function TextInput(props: React.ComponentProps<'input'>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: React.ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(inputClass, 'min-h-[84px]', props.className)} />;
}

export function Select(props: React.ComponentProps<'select'>) {
  return <select {...props} className={cn(inputClass, props.className)} />;
}

export function CheckboxRow({
  name,
  value,
  label,
  defaultChecked = false,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  const id = `${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] text-ink-800 hover:bg-surface-2"
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="h-3.5 w-3.5 accent-[var(--color-brand-600)]"
      />
      {label}
    </label>
  );
}
