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

/** The app's bottom navigation. The planner sits in the middle, raised. */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = matches(pathname, tab);
          const Icon = tab.icon;
          const centre = tab.href === '/m/plan';
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
              >
                {centre ? (
                  <span
                    className={cn(
                      '-mt-5 grid h-12 w-12 place-items-center rounded-2xl text-white shadow-raised transition-transform active:scale-95',
                      active ? 'bg-brand-700' : 'bg-gradient-to-br from-brand-600 to-lake-600',
                    )}
                  >
                    <Icon aria-hidden size={22} />
                  </span>
                ) : (
                  <span
                    className={cn(
                      'grid h-8 w-12 place-items-center rounded-full transition-colors',
                      active ? 'bg-brand-50 text-brand-700' : 'text-ink-500',
                    )}
                  >
                    <Icon aria-hidden size={20} strokeWidth={active ? 2.4 : 2} />
                  </span>
                )}
                <span className={active ? 'text-brand-700' : 'text-ink-500'}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
