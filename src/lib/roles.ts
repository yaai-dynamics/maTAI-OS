/**
 * Government access model.
 *
 * The role belongs to the signed-in government account and is read server side
 * from the session (src/server/auth/session.ts); it cannot be chosen by the
 * caller. Every restricted action checks it and refuses, rather than the
 * interface merely hiding a button.
 *
 * Enterprise SSO remains out of scope (CLAUDE.md §11). Local accounts stand in
 * for it; wiring an identity provider later replaces how an account signs in,
 * not what its role permits.
 *
 * Restricted actions are shown to everyone and refuse with a reason, because an
 * officer needs to know a capability exists before they can ask for it.
 */

export const GOVERNMENT_ROLES = ['VIEWER', 'OFFICER', 'ADMINISTRATOR'] as const;
export type GovernmentRole = (typeof GOVERNMENT_ROLES)[number];

export interface RoleDescriptor {
  label: string;
  summary: string;
  /** Who this corresponds to in a department. */
  who: string;
}

export const ROLE_DESCRIPTOR: Record<GovernmentRole, RoleDescriptor> = {
  VIEWER: {
    label: 'Viewer',
    summary: 'Reads everything. Changes nothing.',
    who: 'Leadership, district offices, partner agencies',
  },
  OFFICER: {
    label: 'Tourism officer',
    summary: 'Runs campaigns, verifies partners and reviews creator content.',
    who: 'Departmental staff responsible for promotion and partners',
  },
  ADMINISTRATOR: {
    label: 'Administrator',
    summary: 'Everything an officer can do, plus data source governance, exports and staff accounts.',
    who: 'Platform owner within the department',
  },
};

export const PERMISSIONS = [
  'campaign:create',
  'campaign:launch',
  'creator:invite',
  'content:review',
  'partner:verify',
  'creator:verify',
  'source:govern',
  'briefing:export',
  'payout:approve',
  'account:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<GovernmentRole, readonly Permission[]> = {
  VIEWER: [],
  OFFICER: [
    'campaign:create',
    'campaign:launch',
    'creator:invite',
    'content:review',
    'partner:verify',
    'creator:verify',
  ],
  ADMINISTRATOR: [...PERMISSIONS],
};

/** null is an anonymous or non-government caller, and is granted nothing. */
export const can = (role: GovernmentRole | null, permission: Permission): boolean =>
  role !== null && GRANTS[role].includes(permission);

export const permissionsFor = (role: GovernmentRole): readonly Permission[] => GRANTS[role];

export const PERMISSION_LABEL: Record<Permission, string> = {
  'campaign:create': 'Create campaigns',
  'campaign:launch': 'Launch campaigns',
  'creator:invite': 'Invite creators',
  'content:review': 'Review creator content',
  'partner:verify': 'Verify tourism businesses',
  'creator:verify': 'Verify creators',
  'source:govern': 'Govern data sources',
  'briefing:export': 'Export briefings',
  'payout:approve': 'Approve creator payouts',
  'account:manage': 'Manage accounts',
};

/** The message shown when an action is refused. Says who can do it, not just no. */
export function refusalMessage(role: GovernmentRole | null, permission: Permission): string {
  if (role === null) {
    return `Sign in with a government account to ${PERMISSION_LABEL[permission].toLowerCase()}.`;
  }
  const allowed = GOVERNMENT_ROLES.filter((candidate) => can(candidate, permission)).map(
    (candidate) => ROLE_DESCRIPTOR[candidate].label.toLowerCase(),
  );
  return `${ROLE_DESCRIPTOR[role].label} cannot ${PERMISSION_LABEL[permission].toLowerCase()}. This needs ${allowed.join(' or ')}.`;
}

export const isGovernmentRole = (value: unknown): value is GovernmentRole =>
  typeof value === 'string' && (GOVERNMENT_ROLES as readonly string[]).includes(value);
