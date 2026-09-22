'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/primitives';
import { NAV_ICONS, NAV_TONES, type NavIconName, type NavTone } from './nav-icons';

/**
 * The interfaces are one product, so the switch between them sits in the top
 * bar of every screen, and each interface's own sections sit in its sidebar.
 */

export const ROLES = [
  { key: 'explore', href: '/explore', label: 'Explore Manipur', who: 'Tourist' },
  { key: 'gov', href: '/gov', label: 'Decision Room', who: 'Department' },
  { key: 'creator', href: '/creator', label: 'Create for Manipur', who: 'Creator' },
  // Added in roadmap Phase 1: the supply side needs its own surface to report
  // availability, handle enquiries and register for verification.
  { key: 'partner', href: '/partner', label: 'Tourism Partners', who: 'Partner' },
] as const;

export type NavItem = {
  href: string;
  label: string;
  icon?: NavIconName;
  tone?: NavTone;
  /** Other paths this section is current on, such as its detail pages. */
  also?: string[];
};
export type TabItem = { href: string; label: string; icon: NavIconName; also?: string[] };

const within = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * A section is current on its own page and on the pages beneath it. The first
 * section is the interface's home, whose href prefixes all the others, so it is
 * current only on exactly its own page, or on a path it names in also.
 */
const sectionActive = (
  pathname: string,
  item: { href: string; also?: string[] },
  home: string,
) =>
  (item.href === home ? pathname === item.href : within(pathname, item.href)) ||
  (item.also ?? []).some((path) => within(pathname, path));

/** Tourist, Department, Creator, Partner, then About. */
export function InterfaceNav({
  vertical = false,
  onNavigate,
  className,
}: {
  vertical?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  const link = (href: string, short: string, full: string) => {
    const active = within(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        title={vertical ? undefined : full}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'rounded-md font-medium transition-colors',
          vertical ? 'flex items-baseline gap-2 px-3 py-2 text-[13px]' : 'px-2.5 py-1.5 text-[13px]',
          active ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-surface-2 hover:text-ink-900',
        )}
      >
        {short}
        {vertical && full !== short ? (
          <span className={cn('text-[12px] font-normal', active ? 'text-white/75' : 'text-ink-500')}>
            {full}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Interfaces"
      className={cn(vertical ? 'flex flex-col gap-0.5' : 'flex items-center gap-1', className)}
    >
      {ROLES.map((role) => link(role.href, role.who, role.label))}
      {vertical ? null : <span aria-hidden className="mx-1.5 h-4 w-px bg-line-strong" />}
      {link('/about', vertical ? 'About maTAI' : 'About', 'About maTAI')}
    </nav>
  );
}

/** The current interface's sections, as a vertical list for the sidebar. */
export function SectionList({
  items,
  label,
  onNavigate,
}: {
  items: NavItem[];
  label: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const home = items[0]?.href ?? '';

  return (
    <nav aria-label={label}>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = sectionActive(pathname, item, home);
          const Icon = item.icon ? NAV_ICONS[item.icon] : undefined;
          const tone = NAV_TONES[item.tone ?? 'brand'];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-[14px] font-medium transition-colors',
                  active
                    ? 'bg-surface-3 text-ink-900'
                    : 'text-ink-600 hover:bg-surface-2 hover:text-ink-900',
                )}
              >
                {Icon ? (
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                      active ? tone.active : tone.idle,
                    )}
                  >
                    <Icon size={18} strokeWidth={2} />
                  </span>
                ) : null}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bottom bar for the mobile-first tourist interface, below the sidebar breakpoint. */
export function TouristTabBar({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  const home = items[0]?.href ?? '';

  return (
    <nav
      aria-label="Explore Manipur"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = sectionActive(pathname, item, home);
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
                  active ? 'text-brand-700' : 'text-ink-500',
                )}
              >
                <Icon aria-hidden size={20} strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
