import type { Metadata } from 'next';

import { getCreator } from '@/server/data/repository';
import { getCurrentUser } from '@/server/auth/session';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { AppShell } from '@/components/shell/AppShell';
import type { NavItem } from '@/components/shell/RoleNav';

export const metadata: Metadata = {
  title: { default: 'Create for Manipur', template: '%s — Create for Manipur' },
};

const SECTIONS: NavItem[] = [
  { href: '/creator', label: 'Dashboard', icon: 'LayoutDashboard', tone: 'lily' },
  { href: '/creator/campaigns', label: 'Campaigns', icon: 'Megaphone', tone: 'warn' },
  { href: '/creator/studio', label: 'Studio', icon: 'WandSparkles', tone: 'brand' },
  { href: '/creator/submissions', label: 'Submissions', icon: 'Upload', tone: 'lake' },
  { href: '/creator/analytics', label: 'Analytics', icon: 'ChartColumn', tone: 'info' },
  { href: '/creator/onboarding', label: 'Join', icon: 'UserPlus', tone: 'good' },
];

/** Responsive dashboard: campaign status and earnings must be easy to scan. */
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  // Labels the header only; each page checks the session itself.
  const user = await getCurrentUser();
  const creator = user?.creatorId ? getCreator(user.creatorId) : undefined;

  return (
    <AppShell
      portal={{
        href: '/creator',
        title: 'Create for Manipur',
        subtitle: creator ? `Signed in as ${creator.displayName}` : 'Creator hub',
        letter: 'C',
        accent: 'bg-lily-500',
      }}
      sections={SECTIONS}
      actions={<AccountMenu user={user?.kind === 'CREATOR' ? user : null} />}
    >
      {children}
    </AppShell>
  );
}
