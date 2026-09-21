'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/primitives';

/**
 * The three interfaces are one product, so the role switcher is present on
 * every screen. A judge should be able to see the ecosystem without being told.
 */

export const ROLES = [
  { key: 'explore', href: '/explore', label: 'Explore Manipur', who: 'Tourist' },
  { key: 'gov', href: '/gov', label: 'Decision Room', who: 'Department' },
  { key: 'creator', href: '/creator', label: 'Create for Manipur', who: 'Creator' },
  // Added in roadmap Phase 1: the supply side needs its own surface to report
  // availability, handle enquiries and register for verification.
  { key: 'partner', href: '/partner', label: 'Tourism Partners', who: 'Partner' },
] as const;

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Switch role" className="flex items-center gap-1">
      {ROLES.map((role) => {
        const active = pathname.startsWith(role.href);
        return (
          <Link
            key={role.key}
            href={role.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
              active
                ? 'bg-brand-700 text-white'
                : 'text-ink-600 hover:bg-surface-2 hover:text-ink-900',
            )}
          >
            {compact ? role.who : role.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SectionNav({
  items,
  className,
}: {
  items: { href: string; label: string }[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className={cn('flex flex-wrap items-center gap-1', className)}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
              active ? 'bg-surface-3 text-ink-900' : 'text-ink-600 hover:bg-surface-2 hover:text-ink-900',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom bar for the mobile-first tourist interface. */
export function TouristTabBar({ items }: { items: { href: string; label: string; glyph: string }[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Explore Manipur"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/explore' && pathname.startsWith(item.href));
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
                <span aria-hidden className="text-base leading-none">
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
