import type { Metadata } from 'next';

import { getBusiness } from '@/server/data/repository';
import { getCurrentUser } from '@/server/auth/session';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { AppShell } from '@/components/shell/AppShell';
import type { NavItem } from '@/components/shell/RoleNav';

export const metadata: Metadata = {
  title: { default: 'Manipur Tourism Partners', template: '%s — Manipur Tourism Partners' },
};

const SECTIONS: NavItem[] = [
  { href: '/partner', label: 'Dashboard', icon: 'LayoutDashboard', tone: 'lake' },
  { href: '/partner/availability', label: 'Availability', icon: 'CalendarCheck', tone: 'good' },
  { href: '/partner/bookings', label: 'Bookings', icon: 'Ticket', tone: 'info' },
  { href: '/partner/enquiries', label: 'Enquiries', icon: 'Inbox', tone: 'brand' },
  { href: '/partner/onboarding', label: 'Register', icon: 'BadgeCheck', tone: 'lily' },
];

/**
 * The business-facing surface, added in roadmap Phase 1.
 *
 * Built for a homestay owner on a phone with patchy signal: short forms, large
 * targets, no dependency on anything loading from outside.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  // Labels the header only; each page checks the session itself.
  const user = await getCurrentUser();
  const business = user?.businessId ? getBusiness(user.businessId) : undefined;

  return (
    <AppShell
      portal={{
        href: '/partner',
        title: 'Tourism Partners',
        subtitle: business ? business.name : 'Homestays, guides, operators and artisans',
        letter: 'P',
        accent: 'bg-lake-700',
      }}
      sections={SECTIONS}
      actions={<AccountMenu user={user?.kind === 'PARTNER' ? user : null} />}
    >
      {children}
    </AppShell>
  );
}
