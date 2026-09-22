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
        Login
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
    <details className="group relative">
      <summary
        className="flex list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
      >
        <span className="hidden text-right leading-tight sm:block">
          <span className="block max-w-[180px] truncate text-[12px] font-medium text-ink-900">{user.displayName}</span>
          <span className="block text-[11px] text-ink-500">{detail}</span>
        </span>
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-line-strong text-[12px] font-medium text-ink-700 sm:hidden"
        >
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5 shrink-0 text-ink-500 transition-transform group-open:rotate-180"
        >
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-md border border-line-strong bg-surface shadow-lg">
        <div className="border-b border-line px-3 py-2 sm:hidden">
          <span className="block truncate text-[12px] font-medium text-ink-900">{user.displayName}</span>
          <span className="block text-[11px] text-ink-500">{detail}</span>
        </div>
        <Link
          href="/account/password"
          className="block px-3 py-2 text-[12px] font-medium text-ink-700 hover:bg-surface-2"
        >
          Change password
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="block w-full px-3 py-2 text-left text-[12px] font-medium text-ink-700 hover:bg-surface-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
