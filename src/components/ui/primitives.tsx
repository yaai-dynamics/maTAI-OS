import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** Joins class names, dropping falsy values. */
export const cn = (...values: (string | false | null | undefined)[]): string =>
  values.filter(Boolean).join(' ');

/* ---------------------------------- Card ---------------------------------- */

export function Card({
  children,
  className,
  tone = 'surface',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'surface' | 'muted' | 'outline';
  as?: 'section' | 'div' | 'article' | 'li';
}) {
  const tones = {
    surface: 'bg-surface border border-line shadow-card',
    muted: 'bg-surface-2 border border-line',
    outline: 'bg-transparent border border-line-strong border-dashed',
  } as const;
  return <Tag className={cn('rounded-lg', tones[tone], className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  eyebrow,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3', className)}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-prose text-[13px] text-ink-600">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export const CardBody = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('px-4 pb-4', className)}>{children}</div>
);

export const CardFooter = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('border-t border-line bg-surface-2/60 px-4 py-3 text-[13px]', className)}>
    {children}
  </div>
);

/* --------------------------------- Badge ---------------------------------- */

export type BadgeTone = 'neutral' | 'brand' | 'lake' | 'good' | 'warn' | 'risk' | 'info' | 'lily';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-700 border-line-strong',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  lake: 'bg-lake-50 text-lake-700 border-lake-200',
  good: 'bg-good-100 text-good-700 border-good-500/25',
  warn: 'bg-warn-100 text-warn-700 border-warn-500/25',
  risk: 'bg-risk-100 text-risk-700 border-risk-500/25',
  info: 'bg-info-100 text-info-700 border-info-500/25',
  lily: 'bg-lily-100 text-lily-600 border-lily-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-600 border-transparent',
  secondary: 'bg-surface text-ink-800 border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-700 border-transparent hover:bg-surface-2',
  danger: 'bg-risk-500 text-white border-transparent hover:bg-risk-700',
  // For dark hero surfaces. A variant, not a className override: cn() joins
  // classes without resolving conflicts, so an override can lose to the variant.
  inverse: 'bg-white text-brand-800 border-transparent hover:bg-white/90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

const buttonClass = (variant: ButtonVariant, size: ButtonSize, className?: string) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ---------------------------------- Chip ---------------------------------- */

export function Chip({
  children,
  selected = false,
  className,
  ...props
}: ComponentProps<'button'> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
        selected
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Section parts ------------------------------ */

export function SectionHeading({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 max-w-prose text-[13px] text-ink-600">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------- State blocks ------------------------------ */

export function EmptyState({
  title,
  description,
  action,
  icon = '·',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface-2/50 px-5 py-8 text-center">
      <div
        aria-hidden
        className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-400 shadow-card"
      >
        {icon}
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-600">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-risk-500/30 bg-risk-100/60 px-4 py-4">
      <p className="text-sm font-semibold text-risk-700">{title}</p>
      {description ? <p className="mt-1 text-[13px] text-ink-700">{description}</p> : null}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn('shimmer rounded-md', className)} />
);

/* ---------------------------------- Meter --------------------------------- */

/** Single ratio against a limit. Track is a lighter step of the fill ramp. */
export function Meter({
  value,
  label,
  valueLabel,
  tone = 'brand',
}: {
  value: number;
  label: string;
  valueLabel: string;
  tone?: 'brand' | 'good' | 'warn' | 'risk';
}) {
  const fills = {
    brand: 'bg-brand-500',
    good: 'bg-good-500',
    warn: 'bg-warn-500',
    risk: 'bg-risk-500',
  } as const;
  const tracks = {
    brand: 'bg-brand-100',
    good: 'bg-good-100',
    warn: 'bg-warn-100',
    risk: 'bg-risk-100',
  } as const;
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-ink-600">{label}</span>
        <span className="num text-[13px] font-semibold text-ink-800">{valueLabel}</span>
      </div>
      <div
        className={cn('h-2 w-full overflow-hidden rounded-full', tracks[tone])}
        role="meter"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${valueLabel}`}
      >
        <div
          className={cn('h-full rounded-full', fills[tone])}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------- Definition -------------------------------- */

export function DefinitionRow({
  term,
  children,
  className,
}: {
  term: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', className)}>
      <dt className="text-[13px] text-ink-600">{term}</dt>
      <dd className="num text-right text-[13px] font-medium text-ink-900">{children}</dd>
    </div>
  );
}
