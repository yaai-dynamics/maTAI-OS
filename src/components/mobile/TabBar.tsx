'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Home, Navigation, Sparkles, Ticket, type LucideIcon } from 'lucide-react';

import { cn } from '@/components/ui/primitives';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other paths that count as this tab. */
  also?: string[];
}

const TABS: Tab[] = [
  { href: '/m', label: 'Home', icon: Home },
  { href: '/m/discover', label: 'Discover', icon: Compass, also: ['/m/place', '/m/experience'] },
  { href: '/m/plan', label: 'Plan', icon: Sparkles, also: ['/m/journey'] },
  { href: '/m/trip', label: 'Trip', icon: Navigation },
  { href: '/m/bookings', label: 'Booked', icon: Ticket },
];

const matches = (pathname: string, tab: Tab) =>
  tab.href === '/m'
    ? pathname === '/m'
    : [tab.href, ...(tab.also ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * The app's bottom navigation, drawn as a floating glass pill in the manner
 * of iOS: inset from the screen edges, translucent over the content, with a
 * highlight that slides to the active tab.
 *
 * Its footprint (TAB_BAR_CLEARANCE in metrics.ts) is what fixed bars above it
 * and the page's bottom padding leave room for.
 */
export function TabBar() {
  const pathname = usePathname();
  const active = TABS.findIndex((tab) => matches(pathname, tab));

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-[480px] px-3"
    >
      <div className="glass-bar pointer-events-auto relative rounded-full p-1.5">
        {/* The sliding highlight behind the active tab. */}
        {active >= 0 ? (
          <span
            aria-hidden
            className="glass-pill absolute inset-y-1.5 left-1.5 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.22,1.2,0.36,1)]"
            style={{
              width: `calc((100% - 0.75rem) / ${TABS.length})`,
              transform: `translateX(${active * 100}%)`,
            }}
          />
        ) : null}

        <ul className="relative grid grid-cols-5">
          {TABS.map((tab, index) => {
            const on = index === active;
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={on ? 'page' : undefined}
                  className="flex h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full transition-transform active:scale-90"
                >
                  <Icon
                    aria-hidden
                    size={22}
                    strokeWidth={on ? 2.3 : 1.8}
                    className={cn('transition-colors', on ? 'text-ink-900' : 'text-ink-600')}
                  />
                  <span
                    className={cn(
                      'text-[10.5px] leading-none tracking-tight transition-colors',
                      on ? 'font-semibold text-ink-900' : 'font-medium text-ink-600',
                    )}
                  >
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
