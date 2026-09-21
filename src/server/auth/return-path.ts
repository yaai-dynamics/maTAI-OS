import type { AccountKind } from '@/server/auth/accounts';

/** Where each kind of account lands after signing in. */
export const HOME: Record<AccountKind, string> = {
  GOVERNMENT: '/gov',
  PARTNER: '/partner',
  CREATOR: '/creator',
};

/**
 * The return address after sign-in.
 *
 * Only a same-origin path inside the account's own interface is accepted.
 * "//evil.example" and "/\evil.example" are protocol-relative to a browser, so
 * both are refused along with anything absolute — otherwise the sign-in page
 * becomes a trusted-looking hop to a phishing site. A path into another
 * interface is refused too: a partner sent to /gov would only bounce back to
 * the sign-in page.
 */
export function safeReturnPath(value: string, kind: AccountKind): string {
  const home = HOME[kind];
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return home;
  if (value !== home && !value.startsWith(`${home}/`) && !value.startsWith(`${home}?`)) return home;
  return value;
}
