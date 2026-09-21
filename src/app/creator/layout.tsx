import Link from 'next/link';
import type { Metadata } from 'next';

import { getCreator } from '@/server/data/repository';
import { getCurrentUser } from '@/server/auth/session';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { RoleSwitcher, SectionNav } from '@/components/shell/RoleNav';

export const metadata: Metadata = {
  title: { default: 'Create for Manipur', template: '%s — Create for Manipur' },
};

const SECTIONS = [
  { href: '/creator', label: 'Dashboard' },
  { href: '/creator/campaigns', label: 'Campaigns' },
  { href: '/creator/studio', label: 'Studio' },
  { href: '/creator/submissions', label: 'Submissions' },
  { href: '/creator/analytics', label: 'Analytics' },
  { href: '/creator/onboarding', label: 'Join' },
];

/** Responsive dashboard: campaign status and earnings must be easy to scan. */
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  // Labels the header only; each page checks the session itself.
  const user = await getCurrentUser();
  const creator = user?.creatorId ? getCreator(user.creatorId) : undefined;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/creator" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-md bg-lily-500 text-[13px] font-semibold text-white"
            >
              C
            </span>
            <span>
              <span className="block text-[14px] font-semibold leading-tight text-ink-900">
                Create for Manipur
              </span>
              <span className="block text-[11px] leading-tight text-ink-500">
                {creator ? `Signed in as ${creator.displayName}` : 'Creator hub'}
              </span>
            </span>
          </Link>

          <SectionNav items={SECTIONS} className="order-3 w-full lg:order-2 lg:w-auto lg:pl-6" />

          <div className="order-2 ml-auto flex items-center gap-3 lg:order-3">
            <RoleSwitcher compact />
            <AccountMenu user={user?.kind === 'CREATOR' ? user : null} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1400px] px-4 py-6">
        {children}
      </main>
    </div>
  );
}
