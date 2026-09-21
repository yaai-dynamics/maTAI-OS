import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isQuotableExternally } from '@/lib/provenance';
import {
  can,
  GOVERNMENT_ROLES,
  permissionsFor,
  refusalMessage,
} from '@/lib/roles';
import { buildBriefing, renderBriefingText } from '@/server/analytics/briefing';
import { computeDistrictIntelligence, computeHistory } from '@/server/analytics/districts';
import { computePulse } from '@/server/analytics/pulse';
import { getDistricts } from '@/server/data/repository';
import { resetState } from '@/server/data/store';

/**
 * Roadmap Phase 2 — government integration.
 *
 * The acting role is stubbed at the identity layer (tests/support/identity.ts)
 * — the same value a signed-in government account supplies. Everything the
 * permission model then does runs for real.
 */

vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock('@/server/auth/session', async () => (await import('./support/identity')).sessionModule);
vi.mock('@/server/auth/accounts', async () => (await import('./support/identity')).accountsModule);
vi.mock('@/server/auth/registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/registration')>()),
  openAccountAndSignIn: (await import('./support/identity')).openAccountAndSignIn,
}));

import { acting } from './support/identity';

acting.role = 'OFFICER';

const { createNewCampaign, launchCampaign } = await import('@/server/actions/government');
const { verifyBusiness } = await import('@/server/actions/partner');
const { exportBriefing } = await import('@/server/actions/briefing');

const campaignDraft = {
  name: 'Test Campaign',
  objective: 'A sufficiently long objective for validation to accept it.',
  destinationId: 'dest-andro',
  targetAudience: '18-35 domestic travellers',
  audienceAgeBand: '18-35',
  platforms: ['Instagram'],
  rewardPool: 5000,
  startDate: '2026-09-16',
  endDate: '2026-09-30',
  contentRequirement: '60 second reel',
  themes: ['culture'],
  preferredLanguages: ['English'],
};

describe('the permission model', () => {
  it('grants nothing to a viewer', () => {
    expect(permissionsFor('VIEWER')).toHaveLength(0);
  });

  it('gives an officer operational permissions but not governance or export', () => {
    expect(can('OFFICER', 'campaign:launch')).toBe(true);
    expect(can('OFFICER', 'partner:verify')).toBe(true);
    expect(can('OFFICER', 'content:review')).toBe(true);
    expect(can('OFFICER', 'source:govern')).toBe(false);
    expect(can('OFFICER', 'briefing:export')).toBe(false);
  });

  it('gives an administrator everything an officer has, and more', () => {
    for (const permission of permissionsFor('OFFICER')) {
      expect(can('ADMINISTRATOR', permission)).toBe(true);
    }
    expect(can('ADMINISTRATOR', 'source:govern')).toBe(true);
    expect(can('ADMINISTRATOR', 'briefing:export')).toBe(true);
  });

  it('says who can do it rather than only refusing', () => {
    const message = refusalMessage('VIEWER', 'campaign:launch');
    expect(message).toMatch(/viewer cannot/i);
    expect(message).toMatch(/tourism officer|administrator/i);
  });

  it('covers every role in the descriptor table', () => {
    for (const role of GOVERNMENT_ROLES) {
      expect(permissionsFor(role)).toBeDefined();
    }
  });
});

describe('permissions are enforced server side, not just hidden', () => {
  beforeEach(() => {
    resetState();
    acting.role = 'OFFICER';
  });

  it('refuses a viewer trying to create a campaign', async () => {
    acting.role = 'VIEWER';
    const result = await createNewCampaign(campaignDraft);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/viewer cannot create campaigns/i);
  });

  it('refuses a viewer trying to launch a campaign', async () => {
    acting.role = 'VIEWER';
    const result = await launchCampaign('camp-001');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/viewer cannot/i);
  });

  it('refuses a viewer trying to verify a business', async () => {
    acting.role = 'VIEWER';
    const result = await verifyBusiness('biz-020', 'VERIFY');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/viewer cannot/i);
  });

  it('allows an officer the same actions', async () => {
    acting.role = 'OFFICER';
    const created = await createNewCampaign(campaignDraft);
    expect(created.ok).toBe(true);

    const launched = await launchCampaign('camp-001');
    expect(launched.ok).toBe(true);
    expect(launched.campaign?.status).toBe('OPEN');
  });

  it('refuses an officer exporting a briefing and allows an administrator', async () => {
    acting.role = 'OFFICER';
    const refused = await exportBriefing();
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/export/i);

    acting.role = 'ADMINISTRATOR';
    const allowed = await exportBriefing();
    expect(allowed.ok).toBe(true);
    expect(allowed.text).toBeTruthy();
  });
});

describe('district analytics', () => {
  beforeEach(() => {
    resetState();
  });

  it('covers every district in the state, including those with no destination', () => {
    const pulse = computePulse();
    const districts = computeDistrictIntelligence(pulse.window, {
      demand: pulse.demand,
      capacity: pulse.capacity,
      alerts: pulse.alerts,
    });

    expect(districts).toHaveLength(getDistricts().length);
    expect(districts.some((row) => row.notCovered)).toBe(true);
    for (const row of districts.filter((entry) => entry.notCovered)) {
      expect(row.destinations).toBe(0);
      expect(row.interactions).toBe(0);
    }
  });

  it('rolls destination activity up without losing or inventing any', () => {
    const pulse = computePulse();
    const districts = computeDistrictIntelligence(pulse.window, {
      demand: pulse.demand,
      capacity: pulse.capacity,
      alerts: pulse.alerts,
    });

    const districtTotal = districts.reduce((sum, row) => sum + row.weightedScore, 0);
    const destinationTotal = pulse.demand.reduce((sum, row) => sum + row.weightedScore, 0);
    expect(districtTotal).toBe(destinationTotal);

    const shares = districts.reduce((sum, row) => sum + row.sharePercent, 0);
    expect(shares).toBeGreaterThan(99);
    expect(shares).toBeLessThan(101);
  });
});

describe('historical series', () => {
  beforeEach(() => {
    resetState();
  });

  it('splits the retained history into complete periods', () => {
    const weekly = computeHistory({ days: 90, periodDays: 7 });
    expect(weekly.length).toBe(Math.ceil(90 / 7));

    const monthly = computeHistory({ days: 90, periodDays: 30 });
    expect(monthly.length).toBe(3);
  });

  it('accounts for every retained interaction exactly once', () => {
    const weekly = computeHistory({ days: 90, periodDays: 7 });
    const counted = weekly.reduce((sum, point) => sum + point.interactions, 0);

    // The window is anchored on the newest record, so everything retained falls
    // inside it. Nothing may be double counted.
    const pulse = computePulse(90);
    expect(counted).toBe(pulse.totals.interactions);
  });
});

describe('the briefing export gate', () => {
  beforeEach(() => {
    resetState();
  });

  it('labels every line with a provenance category', () => {
    const briefing = buildBriefing();
    const lines = briefing.sections.flatMap((section) => section.lines);

    expect(lines.length).toBeGreaterThan(5);
    for (const entry of lines) {
      expect(entry.provenance).toBeTruthy();
      expect(entry.quotable).toBe(isQuotableExternally(entry.provenance));
    }
  });

  it('keeps the official tier present and empty', () => {
    const briefing = buildBriefing();
    const official = briefing.sections
      .flatMap((section) => section.lines)
      .find((entry) => entry.label === 'Official tourist arrivals');

    expect(official).toBeDefined();
    expect(official?.value).toBe('Not connected');
    expect(official?.provenance).toBe('OFFICIAL');
  });

  it('marks the lines that must not be quoted externally', () => {
    const briefing = buildBriefing();
    expect(briefing.notQuotableCount).toBeGreaterThan(0);
  });

  it('writes the provenance into the exported text, because a badge does not survive a copy', () => {
    const briefing = buildBriefing();
    const text = renderBriefingText(briefing);

    expect(text).toContain('PROTOTYPE OUTPUT');
    expect(text).toContain('[Platform observed]');
    expect(text).toContain('[NOT FOR EXTERNAL QUOTATION]');
    expect(text).toContain('CAVEATS');
    expect(text).toMatch(/not for external quotation\. Remove or re-source/i);
  });

  it('never writes a number in place of the missing official figure', () => {
    const text = renderBriefingText(buildBriefing());
    expect(text).toMatch(/Official tourist arrivals: Not connected/);
  });
});
