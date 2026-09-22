import type { GovernmentRole } from '@/lib/roles';

/**
 * Demo accounts.
 *
 * Created by the seed only when DEMO_MODE is on, and listed on the sign-in
 * page only when DEMO_MODE is on. They sign in through the ordinary path — the
 * password is checked against its scrypt hash like any other — so the demo
 * exercises real authentication rather than a bypass.
 *
 * The password is published on purpose, which is exactly why these accounts
 * must never exist in a deployment with real data. `.test` is a reserved
 * top-level domain (RFC 2606), so no mail can ever be delivered to them.
 */

export const DEMO_PASSWORD = 'manipur-demo-2026';

export interface DemoAccount {
  email: string;
  displayName: string;
  kind: 'GOVERNMENT' | 'PARTNER' | 'CREATOR';
  governmentRole?: GovernmentRole;
  businessId?: string;
  creatorId?: string;
  /** Shown on the sign-in page. */
  label: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'admin@demo.manipurtourism.test',
    displayName: 'Demo Administrator',
    kind: 'GOVERNMENT',
    governmentRole: 'ADMINISTRATOR',
    label: 'Administrator',
  },
  {
    email: 'partner@demo.manipurtourism.test',
    displayName: 'Demo Partner',
    kind: 'PARTNER',
    businessId: 'biz-013',
    label: 'Tourism partner',
  },
  {
    email: 'creator@demo.manipurtourism.test',
    displayName: 'Demo Creator',
    kind: 'CREATOR',
    creatorId: 'creator-001',
    label: 'Creator',
  },
];
