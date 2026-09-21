import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate } from '@/lib/date';
import { now } from '@/lib/config';
import { ROLE_DESCRIPTOR } from '@/lib/roles';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { RoleSwitcher, SectionNav } from '@/components/shell/RoleNav';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = {
  title: { default: 'Decision Room', template: '%s — Decision Room' },
};

const SECTIONS = [
  { href: '/gov', label: 'Pulse' },
  { href: '/gov/destinations', label: 'Destinations' },
  { href: '/gov/issues', label: 'Issues' },
  { href: '/gov/campaigns', label: 'Campaigns' },
  { href: '/gov/partners', label: 'Partners' },
  { href: '/gov/bookings', label: 'Bookings' },
  { href: '/gov/integrity', label: 'Integrity' },
  { href: '/gov/districts', label: 'Districts' },
  { href: '/gov/history', label: 'History' },
  { href: '/gov/intelligence', label: 'Intelligence' },
  { href: '/gov/briefing', label: 'Briefing' },
  { href: '/gov/sources', label: 'Sources' },
  { href: '/gov/accounts', label: 'Accounts' },
  { href: '/gov/ask', label: 'Ask AI' },
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
  const user = await getCurrentUser();
  const role = user?.kind === 'GOVERNMENT' ? user.governmentRole : undefined;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/gov" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-[13px] font-semibold text-white"
            >
              M
            </span>
            <span>
              <span className="block text-[14px] font-semibold leading-tight text-ink-900">
                Decision Room
              </span>
              <span className="block text-[11px] leading-tight text-ink-500">
                {role ? ROLE_DESCRIPTOR[role].who : 'Tourism Department'}
              </span>
            </span>
          </Link>

          <SectionNav items={SECTIONS} className="order-3 w-full lg:order-2 lg:w-auto lg:pl-6" />

          <div className="order-2 ml-auto flex items-center gap-3 lg:order-3">
            <span className="hidden text-[11px] text-ink-500 2xl:inline">{formatLongDate(now())}</span>
            <AccountMenu user={user} />
            <RoleSwitcher compact />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1600px] px-4 py-6">
        {children}
      </main>
    </div>
  );
}
