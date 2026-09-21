import Link from 'next/link';
import type { Metadata } from 'next';

import { PASSWORD_MIN_LENGTH } from '@/server/auth/password';
import { HOME } from '@/server/auth/return-path';
import { requireSignedIn } from '@/server/auth/session';
import { changeMyPasswordForm } from '@/server/actions/forms';
import { signOut } from '@/server/actions/auth';
import { ActionForm, Field, TextInput } from '@/components/shared/ActionForm';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Change password', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage(props: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireSignedIn();
  const { required } = await props.searchParams;
  const mustChange = user.mustChangePassword || required === '1';

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div>
        {!user.mustChangePassword ? (
          <Link href={HOME[user.kind]} className="text-[12px] font-medium text-brand-700 hover:underline">
            ← Back
          </Link>
        ) : null}
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-ink-900">
          {mustChange ? 'Choose your own password' : 'Change password'}
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          {user.mustChangePassword
            ? 'You signed in with a temporary password from an administrator. Replace it before continuing: someone else has seen it.'
            : `Signed in as ${user.email}. Changing your password signs you out everywhere else.`}
        </p>
      </div>

      <Card>
        <CardHeader title={user.displayName} subtitle={user.email} />
        <CardBody>
          <ActionForm action={changeMyPasswordForm} submitLabel="Save password" pendingLabel="Saving…" fullWidthSubmit>
            <Field label={user.mustChangePassword ? 'Temporary password' : 'Current password'} name="currentPassword" required>
              <TextInput
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field
              label="New password"
              name="newPassword"
              hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easier to remember than symbols.`}
              required
            >
              <TextInput
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                required
              />
            </Field>
            <Field label="New password again" name="confirmPassword" required>
              <TextInput
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                required
              />
            </Field>
          </ActionForm>
        </CardBody>
      </Card>

      {user.mustChangePassword ? (
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out instead
          </Button>
        </form>
      ) : null}
    </main>
  );
}
