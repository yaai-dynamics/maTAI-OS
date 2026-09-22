import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { now } from '@/lib/config';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { AppShell } from '@/components/shell/AppShell';
import type { NavItem } from '@/components/shell/RoleNav';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = {
  title: { default: 'Decision Room', template: '%s — Decision Room' },
};

const SECTIONS: NavItem[] = [
  { href: '/gov', label: 'Pulse', icon: 'Activity', tone: 'brand' },
  { href: '/gov/destinations', label: 'Destinations', icon: 'MapPin', tone: 'lily' },
  { href: '/gov/issues', label: 'Issues', icon: 'TriangleAlert', tone: 'risk' },
  { href: '/gov/campaigns', label: 'Campaigns', icon: 'Megaphone', tone: 'warn' },
  { href: '/gov/partners', label: 'Partners', icon: 'Store', tone: 'lake' },
  { href: '/gov/bookings', label: 'Bookings', icon: 'Ticket', tone: 'info' },
  { href: '/gov/integrity', label: 'Integrity', icon: 'ShieldCheck', tone: 'good' },
  { href: '/gov/districts', label: 'Districts', icon: 'Map', tone: 'lake' },
  { href: '/gov/history', label: 'History', icon: 'History', tone: 'brand' },
  { href: '/gov/intelligence', label: 'Intelligence', icon: 'Lightbulb', tone: 'warn' },
  { href: '/gov/briefing', label: 'Briefing', icon: 'FileText', tone: 'info' },
  { href: '/gov/sources', label: 'Sources', icon: 'Database', tone: 'good' },
  { href: '/gov/accounts', label: 'Accounts', icon: 'UserCog', tone: 'brand' },
  { href: '/gov/ask', label: 'Ask AI', icon: 'Sparkles', tone: 'lily' },
];

/**
 * Desktop-first, information dense, evidence first (docs/06-design-system.md).
 *
 * The layout only reads the account to label the header. It is not the access
 * check: layouts do not re-render on navigation and do not stop nested pages or
 * Server Actions from running, so every page and action verifies the session
 * itself (src/server/auth/session.ts).
 */
export default async function GovernmentLayout({ children }: { children: React.ReactNode }) {
  // The account menu in the top bar states the officer's role.
  const user = await getCurrentUser();

  return (
    <AppShell
      portal={{
        href: '/gov',
        title: 'Decision Room',
        subtitle: 'Tourism Department',
        letter: 'D',
        accent: 'bg-brand-700',
      }}
      sections={SECTIONS}
      actions={<AccountMenu user={user} />}
      sidebarFooter={formatLongDate(now())}
    >
      {children}
    </AppShell>
  );
}
