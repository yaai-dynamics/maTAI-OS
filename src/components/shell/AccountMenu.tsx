import Link from 'next/link';

import { ROLE_DESCRIPTOR } from '@/lib/roles';
import { signOut } from '@/server/actions/auth';
import type { SessionUser } from '@/server/auth/accounts';

/**
 * Who is signed in, shown in every authenticated header.
 *
 * Replaces the old role selector. The role is no longer something the viewer
 * picks: it belongs to the account, so the header states it rather than
 * offering to change it.
 */
export function AccountMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] font-medium text-ink-800 hover:bg-surface-2"
      >
        Sign in
      </Link>
    );
  }

  const detail =
    user.kind === 'GOVERNMENT' && user.governmentRole
      ? ROLE_DESCRIPTOR[user.governmentRole].label
      : user.kind === 'PARTNER'
        ? 'Partner account'
        : 'Creator account';

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-right leading-tight sm:block">
        <span className="block max-w-[180px] truncate text-[12px] font-medium text-ink-900">{user.displayName}</span>
        <span className="block text-[11px] text-ink-500">{detail}</span>
      </span>
      <Link
        href="/account/password"
        className="hidden rounded-md px-2 py-1.5 text-[12px] font-medium text-ink-600 hover:bg-surface-2 sm:inline-block"
      >
        Password
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
