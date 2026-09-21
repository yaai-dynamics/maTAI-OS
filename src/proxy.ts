import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/server/auth/tokens';

/**
 * Optimistic sign-in redirect.
 *
 * This only asks whether a session cookie is present, so an obviously signed
 * out visitor goes straight to the sign-in page instead of rendering a
 * protected page first. It deliberately does not touch the database: proxy
 * runs on every matching request including prefetches, and the Next.js
 * authentication guide is explicit that it must not be the only line of
 * defence. Whether the cookie is valid, unexpired and of the right kind is
 * decided in every page and Server Action by src/server/auth/session.ts.
 */

const PROTECTED: { prefix: string; as: string }[] = [
  { prefix: '/gov', as: 'government' },
  { prefix: '/partner', as: 'partner' },
  { prefix: '/creator', as: 'creator' },
];

/** Registration has to be reachable before an account exists. */
const PUBLIC = ['/partner/onboarding', '/creator/onboarding'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const area = PROTECTED.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!area || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('as', area.as);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/gov/:path*', '/partner/:path*', '/creator/:path*'],
};
