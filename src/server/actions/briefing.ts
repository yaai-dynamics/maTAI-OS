'use server';

import { can, refusalMessage } from '@/lib/roles';
import { buildBriefing, renderBriefingText } from '@/server/analytics/briefing';
import { getGovernmentRole } from '@/server/auth/session';

/**
 * Exports the briefing as plain text — roadmap Phase 2.
 *
 * Gated on the briefing:export permission, because an export is the moment a
 * prototype figure can escape the interface that labels it. The rendered text
 * carries every provenance label inline and marks anything that must not be
 * quoted externally.
 */
export async function exportBriefing(): Promise<{
  ok: boolean;
  error?: string;
  text?: string;
  notQuotableCount?: number;
}> {
  const role = await getGovernmentRole();
  if (!can(role, 'briefing:export')) {
    return { ok: false, error: refusalMessage(role, 'briefing:export') };
  }

  const briefing = buildBriefing();
  return {
    ok: true,
    text: renderBriefingText(briefing),
    notQuotableCount: briefing.notQuotableCount,
  };
}
