import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, Clock, MapPin, type LucideIcon } from 'lucide-react';

import { formatDuration } from '@/lib/geo';
import { formatRupees } from '@/lib/money';
import { EXPERIENCE_CATEGORY_LABEL, type Destination, type Experience } from '@/lib/types';
import { cn } from '@/components/ui/primitives';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { BackLink } from '@/components/mobile/BackLink';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { creditLine, photoFor, type DestinationPhoto } from '@/lib/mobile/photos';
import { TAB_BAR_CLEARANCE } from '@/components/mobile/metrics';
import { IconTile, type Tone } from '@/components/mobile/IconTile';

/**
 * Building blocks for the mobile tourist app (/m). Phone-first: large touch
 * targets, full-bleed media, horizontal rails instead of grids.
 */

/**
 * An iOS large-title header that scrolls away with the page, as Home does.
 * Pages with a hero image draw their own instead.
 *
 * Never sticky: a full-width element pinned to the top makes iOS 26 Safari
 * paint a solid strip behind the status bar. Without one, content scrolls
 * under the status bar and Safari blurs it there itself. A back link is the
 * floating glass button, which is small enough not to count as a bar.
 */
export function MobileHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Shows a back button that falls back to this path. */
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <header
      className={cn(
        'mb-5',
        // With a back button, the title starts below it.
        backHref ? 'pt-[calc(env(safe-area-inset-top)+3.75rem)]' : 'pt-[calc(env(safe-area-inset-top)+0.75rem)]',
      )}
    >
      {backHref ? <BackLink fallbackHref={backHref} /> : null}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0 pb-1">{action}</div> : null}
      </div>
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-7', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * An iOS Weather-style panel: one rounded card per section, a small
 * uppercase caption with its glyph at the top, then rows divided by
 * hairlines inside the same card. Translucent, so a page backdrop (Home's
 * blurred cover) shows through.
 */
export function Panel({
  icon,
  title,
  action,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('glass-panel mt-4 overflow-hidden rounded-3xl shadow-card', className)}>
      <div className="flex items-center gap-1.5 px-4 pb-2.5 pt-3">
        <span className="text-ink-400">{icon}</span>
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

/** The rows inside a Panel, divided by hairlines. */
export function PanelRows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line">
      {children}
    </ul>
  );
}

export function SeeAll({ href, label = 'See all' }: { href: string; label?: string }) {
  return (
    <Link href={href} className="flex items-center text-[13px] font-medium text-brand-700">
      {label}
      <ChevronRight aria-hidden size={16} />
    </Link>
  );
}

/** A horizontally scrolling rail that bleeds to the screen edge. */
export function Rail({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </ul>
  );
}

/** Portrait destination card for rails. */
export function PlaceTile({
  destination,
  href,
  badge,
}: {
  destination: Destination;
  href: string;
  badge?: ReactNode;
}) {
  return (
    <li className="w-[68%] max-w-[260px] shrink-0 snap-start">
      <Link href={href} className="group block overflow-hidden rounded-2xl bg-surface shadow-card active:scale-[0.98]">
        <div className="relative">
          <PlacePhoto
            src={photoFor(destination.id)?.sm}
            alt={destination.name}
            overlay
            className="h-56"
            fallback={<DestinationVisual destination={destination} height="lg" overlay />}
          />
          {badge ? <div className="absolute right-2.5 top-2.5">{badge}</div> : null}
          <div className="absolute inset-x-0 bottom-0 p-3.5">
            <p className="text-[16px] font-semibold leading-tight text-white">{destination.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-white/80">
              <MapPin aria-hidden size={12} />
              {destination.district}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** Compact list row for a destination. */
export function PlaceRow({
  destination,
  href,
  meta,
}: {
  destination: Destination;
  href: string;
  meta?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-card active:scale-[0.99]"
    >
      <PlacePhoto
        src={photoFor(destination.id)?.sm}
        alt={destination.name}
        className="h-24 w-24 shrink-0 rounded-xl"
        fallback={<DestinationVisual destination={destination} height="sm" />}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink-900">{destination.name}</p>
        <p className="truncate text-[12px] text-ink-500">
          {destination.district} · {destination.category.slice(0, 2).join(', ')}
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-600">{destination.summary}</p>
      </div>
      {meta ? <div className="shrink-0 pr-1">{meta}</div> : null}
    </Link>
  );
}

/** List row for a local experience. */
export function ExperienceRow({
  experience,
  businessName,
  destinationName,
  href,
}: {
  experience: Experience;
  businessName: string;
  destinationName: string;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-2xl bg-surface p-4 shadow-card active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-lily-500">
            {EXPERIENCE_CATEGORY_LABEL[experience.category]}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink-900">{experience.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-ink-500">
            {businessName} · {destinationName}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[15px] font-semibold text-ink-900">{formatRupees(experience.price)}</p>
          <p className="text-[10px] text-ink-500">per person</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-ink-600">
          <Clock aria-hidden size={11} />
          {formatDuration(experience.durationMinutes)}
        </span>
        {experience.verified ? (
          <span className="rounded-full bg-good-100 px-2 py-0.5 font-medium text-good-700">Verified</span>
        ) : null}
        <AvailabilityPill status={experience.availabilityStatus} />
      </div>
    </Link>
  );
}

/** One experience as a row inside a Panel. */
export function ExperienceLine({
  experience,
  businessName,
  destinationName,
  href,
}: {
  experience: Experience;
  businessName: string;
  destinationName: string;
  href: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-start gap-3 px-4 py-3 active:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-400">
            {EXPERIENCE_CATEGORY_LABEL[experience.category]}
          </span>
          <span className="mt-0.5 block text-[14.5px] font-semibold leading-snug text-ink-900">{experience.title}</span>
          <span className="block truncate text-[12px] text-ink-500">
            {businessName} · {destinationName}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-ink-600">
              <Clock aria-hidden size={11} />
              {formatDuration(experience.durationMinutes)}
            </span>
            {experience.verified ? (
              <span className="rounded-full bg-good-100 px-2 py-0.5 font-medium text-good-700">Verified</span>
            ) : null}
            <AvailabilityPill status={experience.availabilityStatus} />
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-[15px] font-semibold text-ink-900">{formatRupees(experience.price)}</span>
          <span className="block text-[10px] text-ink-500">per person</span>
        </span>
      </Link>
    </li>
  );
}

export function AvailabilityPill({ status }: { status: Experience['availabilityStatus'] }) {
  const map = {
    AVAILABLE: ['Available', 'bg-lake-50 text-lake-700'],
    LIMITED: ['Limited', 'bg-warn-100 text-warn-700'],
    UNAVAILABLE: ['Not yet bookable', 'bg-surface-2 text-ink-500'],
  } as const;
  const [label, tone] = map[status];
  return <span className={cn('rounded-full px-2 py-0.5 font-medium', tone)}>{label}</span>;
}

/** Horizontally scrolling filter pills, as links so filters survive a reload. */
export function PillBar({
  options,
  active,
  label,
}: {
  options: { value: string; label: string; href: string; icon?: ReactNode }[];
  active: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.href}
          replace
          scroll={false}
          aria-current={active === option.value ? 'true' : undefined}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
            active === option.value
              ? 'bg-ink-900 text-white'
              : 'border border-line-strong bg-surface text-ink-700 active:bg-surface-2',
          )}
        >
          {option.icon}
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** Two-way switch drawn as a segmented control. */
export function Segmented({
  options,
  active,
  label,
}: {
  options: { value: string; label: string; href: string }[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-surface-3/70 p-1">
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.href}
          replace
          scroll={false}
          aria-current={active === option.value ? 'true' : undefined}
          className={cn(
            'rounded-lg py-2 text-center text-[13px] font-semibold transition-colors',
            active === option.value ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500',
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** A floating glass bar above the tab bar, for a page's main action. */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-3"
      style={{ bottom: TAB_BAR_CLEARANCE }}
    >
      <div className="glass-bar rounded-[1.75rem] px-3 py-2.5">{children}</div>
    </div>
  );
}

/** Space so the last content clears a StickyActions bar. */
export const StickySpacer = () => <div aria-hidden className="h-24" />;

export function MobileEmpty({
  icon,
  tone = 'graphite',
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-surface px-6 py-10 text-center shadow-card">
      <IconTile icon={icon} tone={tone} size="lg" />
      <p className="mt-4 text-[16px] font-semibold text-ink-900">{title}</p>
      {description ? <p className="mt-1.5 max-w-[30ch] text-[13px] text-ink-600">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PrimaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-[15px] font-semibold text-white active:scale-[0.98] active:bg-brand-800',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Who took a destination's photograph, under which licence, linked to its
 * file page. Shown as a caption rather than over the photo, which now runs
 * under the status bar.
 */
export function PhotoCredit({ photo }: { photo: DestinationPhoto | undefined }) {
  if (!photo) {
    return <p className="text-[11px] text-ink-500">No photograph yet: the artwork is generated, not photographed.</p>;
  }
  const line = creditLine(photo.credit);
  return (
    <p className="text-[11px] text-ink-500">
      {photo.credit.source ? (
        <a href={photo.credit.source} target="_blank" rel="noopener noreferrer" className="underline">
          {line}
        </a>
      ) : (
        line
      )}
      {photo.credit.source ? ', via Wikimedia Commons.' : '.'}
    </p>
  );
}

/** Marks prototype numbers, as CLAUDE.md requires. */
export function DemoChip() {
  return (
    <span className="rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-warn-700">
      Demo data
    </span>
  );
}
