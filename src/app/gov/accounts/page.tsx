import type { Metadata } from 'next';

import { can, GOVERNMENT_ROLES, refusalMessage, ROLE_DESCRIPTOR } from '@/lib/roles';
import { formatIndiaDateTime } from '@/lib/date';
import { getBusiness, getCreator } from '@/server/data/repository';
import { requireGovernment } from '@/server/auth/session';
import { listAccounts, recentAccountAudit, TEMPORARY_PASSWORD_HOURS, type AccountSummary } from '@/server/auth/admin';
import {
  changeRoleForm,
  issueAccountForm,
  resetPasswordForm,
  setDisabledForm,
  unlockForm,
} from '@/server/actions/forms';
import { ActionForm, Field, Select, TextInput } from '@/components/shared/ActionForm';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Accounts' };
export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  ISSUED: 'Issued',
  ROLE_CHANGED: 'Role changed',
  DISABLED: 'Disabled',
  ENABLED: 'Enabled',
  UNLOCKED: 'Unlocked',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_CHANGED: 'Password changed',
};

/**
 * Staff and partner accounts, for administrators.
 *
 * Other roles see why the page is empty rather than the list itself: the list
 * is staff email addresses, which a viewer has no need for.
 */
export default async function AccountsPage() {
  const me = await requireGovernment();
  const allowed = can(me.governmentRole, 'account:manage');

  if (!allowed) {
    return (
      <div className="space-y-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Accounts</h1>
        <EmptyState
          title="Administrators only"
          description={`${refusalMessage(me.governmentRole, 'account:manage')} Ask an administrator to issue an account, change a role or reset a password.`}
        />
      </div>
    );
  }

  const [accounts, audit] = await Promise.all([listAccounts(), recentAccountAudit(30)]);
  const government = accounts.filter((account) => account.kind === 'GOVERNMENT');
  const others = accounts.filter((account) => account.kind !== 'GOVERNMENT');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Accounts</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          Government accounts are issued here and nowhere else: a role that can launch campaigns and approve payouts
          is not something anyone can register for. Partners and creators register themselves; here they can be
          disabled, unlocked or given a new password.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Issue a government account"
          subtitle={`The person gets a temporary password, shown to you once. Hand it over in person. It works for ${TEMPORARY_PASSWORD_HOURS} hours and must be replaced at first sign-in.`}
        />
        <CardBody>
          <ActionForm action={issueAccountForm} submitLabel="Issue account" pendingLabel="Issuing…">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name" name="displayName" required>
                <TextInput id="displayName" name="displayName" maxLength={120} required />
              </Field>
              <Field label="Work email" name="email" required>
                <TextInput id="email" name="email" type="email" autoComplete="off" required />
              </Field>
              <Field label="Role" name="role" required>
                <Select id="role" name="role" defaultValue="VIEWER" required>
                  {GOVERNMENT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_DESCRIPTOR[role].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Department staff" eyebrow={`${government.length}`} />
        <CardBody>
          <ul className="space-y-2.5">
            {government.map((account) => (
              <li key={account.id}>
                <AccountRow account={account} self={account.id === me.id} />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Partners and creators" eyebrow={`${others.length}`} />
        <CardBody>
          {others.length === 0 ? (
            <EmptyState icon="—" title="No partner or creator accounts" />
          ) : (
            <ul className="space-y-2.5">
              {others.map((account) => (
                <li key={account.id}>
                  <AccountRow account={account} self={false} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Audit trail" subtitle="Every change to an account, and who made it. Passwords are never recorded." />
        <CardBody>
          {audit.length === 0 ? (
            <EmptyState icon="—" title="No changes yet" />
          ) : (
            <ul className="divide-y divide-line">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[13px]">
                  <span className="min-w-0 text-ink-800">
                    <span className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</span> ·{' '}
                    {entry.targetEmail}
                    {entry.detail ? <span className="text-ink-600"> — {entry.detail}</span> : null}
                  </span>
                  <span className="text-[12px] text-ink-500">
                    {entry.actorEmail === entry.targetEmail ? 'by themselves' : `by ${entry.actorEmail}`} ·{' '}
                    {formatIndiaDateTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AccountRow({ account, self }: { account: AccountSummary; self: boolean }) {
  const binding =
    account.kind === 'GOVERNMENT' && account.governmentRole
      ? ROLE_DESCRIPTOR[account.governmentRole].label
      : account.kind === 'PARTNER'
        ? `Partner · ${account.businessId ? (getBusiness(account.businessId)?.name ?? account.businessId) : 'no business'}`
        : `Creator · ${account.creatorId ? (getCreator(account.creatorId)?.displayName ?? account.creatorId) : 'no profile'}`;

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-900">
            {account.displayName}
            {self ? <span className="ml-1.5 text-[11px] font-normal text-ink-500">(you)</span> : null}
          </p>
          <p className="truncate font-mono text-[11px] text-ink-500">{account.email}</p>
          <p className="text-[12px] text-ink-600">
            {binding} · {account.lastLoginAt ? `last signed in ${formatIndiaDateTime(account.lastLoginAt)}` : 'never signed in'}
            {account.openSessions > 0 ? ` · ${account.openSessions} open session${account.openSessions === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {account.disabled ? <Badge tone="risk">Disabled</Badge> : <Badge tone="good">Active</Badge>}
          {account.locked ? <Badge tone="warn">Locked</Badge> : null}
          {account.mustChangePassword ? (
            <Badge tone="info" title={account.passwordExpiresAt ? `Expires ${formatIndiaDateTime(account.passwordExpiresAt)}` : undefined}>
              Temporary password
            </Badge>
          ) : null}
        </div>
      </div>

      {self ? (
        <p className="mt-2 text-[12px] text-ink-500">
          Your own role and status can only be changed by another administrator.
        </p>
      ) : (
        <details className="mt-2 text-[12px]">
          <summary className="cursor-pointer font-medium text-ink-700">Manage</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {account.kind === 'GOVERNMENT' ? (
              <ActionForm
                action={changeRoleForm}
                submitLabel="Change role"
                pendingLabel="Saving…"
                size="sm"
                variant="secondary"
                hiddenFields={{ accountId: account.id }}
              >
                <Field label="Role" name={`role-${account.id}`}>
                  <Select id={`role-${account.id}`} name="role" defaultValue={account.governmentRole ?? 'VIEWER'}>
                    {GOVERNMENT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_DESCRIPTOR[role].label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionForm>
            ) : null}

            <ActionForm
              action={setDisabledForm}
              submitLabel={account.disabled ? 'Enable account' : 'Disable account'}
              pendingLabel="Saving…"
              size="sm"
              variant={account.disabled ? 'secondary' : 'danger'}
              hiddenFields={{ accountId: account.id, disabled: account.disabled ? 'false' : 'true' }}
            >
              {!account.disabled ? (
                <Field label="Reason, for the audit trail" name={`reason-${account.id}`}>
                  <TextInput id={`reason-${account.id}`} name="reason" maxLength={400} placeholder="Left the department" />
                </Field>
              ) : null}
            </ActionForm>

            {!account.disabled ? (
              <ActionForm
                action={resetPasswordForm}
                submitLabel="Reset password"
                pendingLabel="Resetting…"
                size="sm"
                variant="secondary"
                hiddenFields={{ accountId: account.id }}
              />
            ) : null}

            {account.locked ? (
              <ActionForm
                action={unlockForm}
                submitLabel="Unlock"
                pendingLabel="Unlocking…"
                size="sm"
                variant="secondary"
                hiddenFields={{ accountId: account.id }}
              />
            ) : null}
          </div>
        </details>
      )}
    </div>
  );
}
