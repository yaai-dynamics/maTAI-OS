import Link from 'next/link';
import type { Metadata } from 'next';

import { getBusiness } from '@/server/data/repository';
import { getCurrentUser } from '@/server/auth/session';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { RoleSwitcher, SectionNav } from '@/components/shell/RoleNav';

export const metadata: Metadata = {
  title: { default: 'Manipur Tourism Partners', template: '%s — Manipur Tourism Partners' },
};

const SECTIONS = [
  { href: '/partner', label: 'Dashboard' },
  { href: '/partner/availability', label: 'Availability' },
  { href: '/partner/bookings', label: 'Bookings' },
  { href: '/partner/enquiries', label: 'Enquiries' },
  { href: '/partner/onboarding', label: 'Register' },
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
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/partner" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-md bg-lake-700 text-[13px] font-semibold text-white"
            >
              P
            </span>
            <span>
              <span className="block text-[14px] font-semibold leading-tight text-ink-900">
                Tourism Partners
              </span>
              <span className="block text-[11px] leading-tight text-ink-500">
                {business ? business.name : 'Homestays, guides, operators and artisans'}
              </span>
            </span>
          </Link>

          <SectionNav items={SECTIONS} className="order-3 w-full sm:order-2 sm:w-auto sm:pl-4" />

          <div className="order-2 ml-auto flex items-center gap-3 sm:order-3">
            <RoleSwitcher compact />
            <AccountMenu user={user?.kind === 'PARTNER' ? user : null} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1100px] px-4 py-6">
        {children}
      </main>
    </div>
  );
}
