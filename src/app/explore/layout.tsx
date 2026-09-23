import Link from 'next/link';
import type { Metadata } from 'next';

import { AccountMenu } from '@/components/shell/AccountMenu';
import { AppShell } from '@/components/shell/AppShell';
import type { NavItem, TabItem } from '@/components/shell/RoleNav';
import { AnalyticsNotice } from '@/components/telemetry/AnalyticsNotice';
import { getCurrentUser } from '@/server/auth/session';
import { readVisitor } from '@/server/telemetry/visitor';

export const metadata: Metadata = {
  title: { default: 'Explore Manipur', template: '%s — Explore Manipur' },
};

// No separate home: the planner and the visitor's journeys are one screen at
// /explore, and a journey's details open beneath it at /explore/journey/[id].
// Destinations and Experiences used to be separate sections; they are one
// screen now (/explore/discover), so one search covers both (docs/09 §26).
const SECTIONS: NavItem[] = [
  { href: '/explore', label: 'Trip Planner', icon: 'Route', tone: 'lake', also: ['/explore/journey'] },
  { href: '/explore/discover', label: 'Discover', icon: 'Compass', tone: 'lily', also: ['/explore/destinations', '/explore/experiences'] },
  { href: '/explore/stays', label: 'Stays', icon: 'BedDouble', tone: 'brand' },
  { href: '/explore/events', label: 'Events', icon: 'CalendarCheck', tone: 'warn' },
  { href: '/explore/food', label: 'Food', icon: 'UtensilsCrossed', tone: 'lily' },
  { href: '/explore/trip', label: 'Live trip', icon: 'Navigation', tone: 'good' },
  { href: '/explore/bookings', label: 'Bookings', icon: 'Ticket', tone: 'info' },
  { href: '/explore/emergency', label: 'Emergency help', icon: 'ShieldAlert', tone: 'risk' },
];

const TABS: TabItem[] = [
  { href: '/explore', label: 'Plan', icon: 'Route', also: ['/explore/journey'] },
  { href: '/explore/discover', label: 'Discover', icon: 'Compass', also: ['/explore/destinations', '/explore/experiences'] },
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
  const user = await getCurrentUser();

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
      actions={<AccountMenu user={user} />}
      sidebarFooter={PRIVACY}
    >
      {ask ? <AnalyticsNotice /> : null}
      {children}
      {/* The sidebar carries this link from lg up; below that it sits at the foot. */}
      <footer className="mt-8 text-[12px] text-ink-500 lg:hidden">{PRIVACY}</footer>
    </AppShell>
  );
}
