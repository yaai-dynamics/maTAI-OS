import Link from 'next/link';
import type { Metadata } from 'next';

import { AppShell } from '@/components/shell/AppShell';
import type { NavItem, TabItem } from '@/components/shell/RoleNav';
import { AnalyticsNotice } from '@/components/telemetry/AnalyticsNotice';
import { readVisitor } from '@/server/telemetry/visitor';

export const metadata: Metadata = {
  title: { default: 'Explore Manipur', template: '%s — Explore Manipur' },
};

// No separate home: the planner and the visitor's journeys are one screen at
// /explore, and a journey's details open beneath it at /explore/journey/[id].
const SECTIONS: NavItem[] = [
  { href: '/explore', label: 'Trip Planner', icon: 'Route', tone: 'lake', also: ['/explore/journey'] },
  { href: '/explore/destinations', label: 'Destinations', icon: 'MapPin', tone: 'lily' },
  { href: '/explore/experiences', label: 'Experiences', icon: 'HeartHandshake', tone: 'brand' },
  { href: '/explore/trip', label: 'Live trip', icon: 'Navigation', tone: 'good' },
  { href: '/explore/bookings', label: 'Bookings', icon: 'Ticket', tone: 'info' },
];

const TABS: TabItem[] = [
  { href: '/explore', label: 'Plan', icon: 'Route', also: ['/explore/journey'] },
  { href: '/explore/destinations', label: 'Places', icon: 'MapPin' },
  { href: '/explore/experiences', label: 'Local', icon: 'HeartHandshake' },
  { href: '/explore/trip', label: 'Trip', icon: 'Navigation' },
  { href: '/explore/bookings', label: 'Booked', icon: 'Ticket' },
];

const PRIVACY = (
  <Link href="/explore/privacy" className="hover:text-ink-800 hover:underline">
    Your data and visit counting
  </Link>
);

/** Mobile-first: optimised for 360 to 430px, with a desktop fallback. */
export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  // Asked once. A browser sending Global Privacy Control has already answered.
  const visitor = await readVisitor();
  const ask = visitor.choice === 'unset' && !visitor.gpc;

  return (
    <AppShell
      portal={{
        href: '/explore',
        title: 'Explore Manipur',
        subtitle: 'Plan, discover, book',
        letter: 'E',
        accent: 'bg-lake-600',
      }}
      sections={SECTIONS}
      tabs={TABS}
      sidebarFooter={PRIVACY}
    >
      {ask ? <AnalyticsNotice /> : null}
      {children}
      {/* The sidebar carries this link from lg up; below that it sits at the foot. */}
      <footer className="mt-8 text-[12px] text-ink-500 lg:hidden">{PRIVACY}</footer>
    </AppShell>
  );
}
