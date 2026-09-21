import Link from 'next/link';
import type { Metadata } from 'next';

import { RoleSwitcher, SectionNav, TouristTabBar } from '@/components/shell/RoleNav';
import { AnalyticsNotice } from '@/components/telemetry/AnalyticsNotice';
import { readVisitor } from '@/server/telemetry/visitor';

export const metadata: Metadata = {
  title: { default: 'Explore Manipur', template: '%s — Explore Manipur' },
};

const SECTIONS = [
  { href: '/explore', label: 'Home' },
  { href: '/explore/journey', label: 'Journey' },
  { href: '/explore/destinations', label: 'Destinations' },
  { href: '/explore/experiences', label: 'Experiences' },
  { href: '/explore/trip', label: 'Live trip' },
  { href: '/explore/bookings', label: 'Bookings' },
];

const TABS = [
  { href: '/explore', label: 'Home', glyph: '◆' },
  { href: '/explore/journey', label: 'Journey', glyph: '⟿' },
  { href: '/explore/destinations', label: 'Places', glyph: '◎' },
  { href: '/explore/experiences', label: 'Local', glyph: '⌂' },
  { href: '/explore/trip', label: 'Trip', glyph: '✓' },
  { href: '/explore/bookings', label: 'Booked', glyph: '▤' },
];

/** Mobile-first: optimised for 360 to 430px, with a desktop fallback. */
export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  // Asked once. A browser sending Global Privacy Control has already answered.
  const visitor = await readVisitor();
  const ask = visitor.choice === 'unset' && !visitor.gpc;

  return (
    <div className="min-h-dvh bg-paper pb-16 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-2.5">
          <Link href="/explore" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-md bg-lake-600 text-[13px] font-semibold text-white"
            >
              m
            </span>
            <span>
              <span className="block text-[14px] font-semibold leading-tight text-ink-900">maTAI</span>
              <span className="block text-[11px] leading-tight text-ink-500">Explore Manipur</span>
            </span>
          </Link>

          <SectionNav items={SECTIONS} className="ml-4 hidden sm:flex" />

          <div className="ml-auto">
            <RoleSwitcher compact />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1100px] px-4 py-5">
        {ask ? <AnalyticsNotice /> : null}
        {children}
      </main>

      <footer className="mx-auto flex max-w-[1100px] flex-wrap gap-x-4 gap-y-1 px-4 pb-6 text-[12px] text-ink-500">
        <Link href="/about" className="hover:underline">
          About maTAI
        </Link>
        <Link href="/explore/privacy" className="hover:underline">
          Your data and visit counting
        </Link>
      </footer>

      <TouristTabBar items={TABS} />
    </div>
  );
}
