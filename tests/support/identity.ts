import type { GovernmentRole } from '@/lib/roles';

/**
 * Who is acting, for unit tests.
 *
 * The unit suites exercise the rules inside Server Actions and have no
 * database, so they replace the identity layer rather than the cookie beneath
 * it. Each test states who it is acting as; nothing defaults to a privileged
 * identity, so a test that forgets to set one runs as an anonymous caller and
 * is refused — the same as production.
 *
 * The real session, token and password code is covered by
 * tests/auth.test.ts and tests/integration/auth.test.ts.
 */
export const acting: {
  role: GovernmentRole | null;
  businessId: string | null;
  creatorId: string | null;
} = { role: null, businessId: null, creatorId: null };

export function actAs(identity: Partial<typeof acting>): void {
  acting.role = null;
  acting.businessId = null;
  acting.creatorId = null;
  Object.assign(acting, identity);
}

const NOT_SIGNED_IN = 'Sign in to do that.';

/** Stand-in for src/server/auth/session.ts. */
export const sessionModule = {
  NOT_SIGNED_IN,
  getCurrentUser: async () => null,
  getGovernmentRole: async () => acting.role,
  getActingBusinessId: async () => acting.businessId,
  getActingCreatorId: async () => acting.creatorId,
  requireGovernment: async () => {
    throw new Error('requireGovernment is for pages, not unit tests');
  },
  requirePartner: async () => {
    throw new Error('requirePartner is for pages, not unit tests');
  },
  requireCreator: async () => {
    throw new Error('requireCreator is for pages, not unit tests');
  },
};

/** Emails registered during a test, so duplicate registration is still refused. */
export const registeredEmails = new Set<string>();

/** Stand-in for the database-backed parts of src/server/auth/accounts.ts. */
export const accountsModule = {
  isEmailRegistered: async (email: string) => registeredEmails.has(email.trim().toLowerCase()),
};

/** Stand-in for openAccountAndSignIn: records the email instead of opening a session. */
export const openAccountAndSignIn = async (account: { email: string }) => {
  registeredEmails.add(account.email.trim().toLowerCase());
  return { ok: true as const };
};
