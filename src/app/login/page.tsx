import Link from 'next/link';
import type { Metadata } from 'next';

import { DEMO_MODE } from '@/lib/config';
import { ROLE_DESCRIPTOR } from '@/lib/roles';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/server/auth/demo-accounts';
import { getCurrentUser } from '@/server/auth/session';
import { signInForm, signOut } from '@/server/actions/auth';
import { ActionForm, Field, TextInput } from '@/components/shared/ActionForm';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

const SURFACE_LABEL: Record<string, string> = {
  government: 'Decision Room — the Tourism Department',
  partner: 'Tourism Partners',
  creator: 'Create for Manipur',
};

const HOME: Record<string, string> = { GOVERNMENT: '/gov', PARTNER: '/partner', CREATOR: '/creator' };

const KIND_LABEL: Record<string, string> = {
  GOVERNMENT: 'government',
  PARTNER: 'partner',
  CREATOR: 'creator',
};

export default async function LoginPage(props: {
  searchParams: Promise<{ as?: string; wrong?: string; next?: string }>;
}) {
  const { as, wrong, next } = await props.searchParams;
  const user = await getCurrentUser();
  const surface = as && SURFACE_LABEL[as] ? as : undefined;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[980px] flex-col justify-center gap-6 px-4 py-10">
      <div>
        <Link href="/" className="text-[12px] font-medium text-brand-700 hover:underline">
          ← maTAI
        </Link>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink-900">Sign in</h1>
        <p className="mt-1 max-w-xl text-[13px] text-ink-600">
          {surface
            ? `${SURFACE_LABEL[surface]} needs a ${surface} account.`
            : 'The department, tourism partners and creators each sign in to their own interface.'}{' '}
          Tourists do not need an account —{' '}
          <Link href="/explore" className="font-medium text-brand-700 hover:underline">
            Explore Manipur
          </Link>{' '}
          is open to everyone.
        </p>
      </div>

      {wrong && surface ? (
        <p role="status" className="rounded-md border border-warn-500/30 bg-warn-100 px-3 py-2 text-[13px] text-warn-700">
          You are signed in with a {wrong} account, which cannot open this interface. Sign in with a{' '}
          {surface} account instead.
        </p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={user ? `Signed in as ${user.displayName}` : 'Account'}
            subtitle={
              user
                ? user.kind === 'GOVERNMENT' && user.governmentRole
                  ? ROLE_DESCRIPTOR[user.governmentRole].label
                  : `${KIND_LABEL[user.kind]} account`
                : 'Use the email and password for your account.'
            }
          />
          <CardBody>
            {user ? (
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href={HOME[user.kind] ?? '/'}>Continue</ButtonLink>
                <form action={signOut}>
                  <Button type="submit" variant="secondary">
                    Sign out
                  </Button>
                </form>
              </div>
            ) : (
              <ActionForm
                action={signInForm}
                submitLabel="Sign in"
                pendingLabel="Checking…"
                hiddenFields={next ? { next } : {}}
                fullWidthSubmit
              >
                <Field label="Email" name="email" required>
                  <TextInput id="email" name="email" type="email" autoComplete="username" required />
                </Field>
                <Field label="Password" name="password" required>
                  <TextInput
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </Field>
              </ActionForm>
            )}

            {!user ? (
              <p className="mt-4 text-[12px] text-ink-600">
                New here?{' '}
                <Link href="/partner/onboarding" className="font-medium text-brand-700 hover:underline">
                  Register a tourism business
                </Link>{' '}
                or{' '}
                <Link href="/creator/onboarding" className="font-medium text-brand-700 hover:underline">
                  join as a creator
                </Link>
                . Government accounts are issued by the department.
              </p>
            ) : null}
          </CardBody>
        </Card>

        {DEMO_MODE ? (
          <Card tone="outline">
            <CardHeader
              title={user ? 'Switch demo account' : 'Demo accounts'}
              subtitle={
                user
                  ? 'The demo moves between interfaces, and each needs its own account. Switching ends the current session.'
                  : 'Seeded for this demonstration only. They sign in through the same password check as any account.'
              }
            />
            <CardBody>
              <ul className="space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink-900">{account.label}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-500">{account.email}</span>
                    </span>
                    <ActionForm
                      action={signInForm}
                      submitLabel="Sign in"
                      pendingLabel="…"
                      size="sm"
                      variant="secondary"
                      className="space-y-1"
                      hiddenFields={{ email: account.email, password: DEMO_PASSWORD, ...(next ? { next } : {}) }}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-ink-600">
                Password for every demo account: <code className="font-mono">{DEMO_PASSWORD}</code>
              </p>
              <p className="mt-2 flex items-start gap-2 text-[12px] text-ink-600">
                <Badge tone="warn">Demo only</Badge>
                These accounts exist only when DEMO_MODE is on. Their password is published, so they must never exist
                alongside real data.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
