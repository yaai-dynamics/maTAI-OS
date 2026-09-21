import { now } from '@/lib/config';
import { formatLongDate } from '@/lib/date';
import { isQuotableExternally, PROVENANCE, type Provenance } from '@/lib/provenance';
import { computePulse } from '@/server/analytics/pulse';
import { computeDistrictIntelligence } from '@/server/analytics/districts';
import { recommendCampaignTargets } from '@/server/analytics/recommend';
import { getOfficialStatistics } from '@/server/data/repository';

/**
 * Exportable tourism briefing — roadmap Phase 2.
 *
 * The point of this is not formatting. It is the export gate: a briefing leaves
 * the platform and lands in a meeting, an email or a press note, where the
 * provenance badge does not travel with it. So every line carries its category
 * in the text itself, and lines that may not be quoted externally are marked
 * inline rather than footnoted.
 *
 * `isQuotableExternally` is the same predicate the provenance contract uses, so
 * the rule cannot drift between the screen and the export.
 */

export interface BriefingLine {
  label: string;
  value: string;
  provenance: Provenance;
  /** False for synthetic, estimated and forecast figures. */
  quotable: boolean;
  note?: string;
}

export interface BriefingSection {
  heading: string;
  lines: BriefingLine[];
  commentary?: string;
}

export interface Briefing {
  title: string;
  preparedAt: string;
  period: string;
  sections: BriefingSection[];
  /** Lines that must not leave the platform as facts. */
  notQuotableCount: number;
  caveats: string[];
}

const line = (
  label: string,
  value: string,
  provenance: Provenance,
  note?: string,
): BriefingLine => ({
  label,
  value,
  provenance,
  quotable: isQuotableExternally(provenance),
  ...(note ? { note } : {}),
});

export function buildBriefing(): Briefing {
  const pulse = computePulse();
  const districts = computeDistrictIntelligence(pulse.window, {
    demand: pulse.demand,
    capacity: pulse.capacity,
    alerts: pulse.alerts,
  });
  const targets = recommendCampaignTargets({
    demand: pulse.demand,
    capacity: pulse.capacity,
    sentiment: pulse.sentiment,
    alerts: pulse.alerts,
    concentration: pulse.concentration,
  });
  const official = getOfficialStatistics();

  const topDemand = pulse.demand[0];
  const topIssue = pulse.issues.issues[0];
  const topTarget = targets.recommended[0];
  const actionAlerts = pulse.alerts.filter((alert) => alert.severity === 'ACTION');
  const topDistrict = districts.find((row) => !row.notCovered);

  const sections: BriefingSection[] = [
    {
      heading: 'Position',
      lines: [
        line(
          'Official tourist arrivals',
          'Not connected',
          'OFFICIAL',
          `${official.sourceName} is not integrated with this platform. No figure is generated in its place.`,
        ),
        line(
          'Platform observed activity',
          `${pulse.totals.interactions.toLocaleString('en-IN')} interactions in ${pulse.window.days} days`,
          'PLATFORM_OBSERVED',
          'Measures interest expressed on this platform, not visitor volume.',
        ),
        line(
          'Visitor satisfaction',
          pulse.satisfaction.averageRating === null
            ? 'No responses'
            : `${pulse.satisfaction.averageRating.toFixed(2)} of 5 across ${pulse.satisfaction.responses} responses`,
          pulse.satisfaction.provenance,
        ),
        line(
          'Tourism concentration',
          `${pulse.concentration.topThreeSharePercent}% of activity in the top three destinations (${pulse.concentration.topThree.map((row) => row.name).join(', ')})`,
          'ESTIMATED',
        ),
      ],
      commentary: topDemand
        ? `${topDemand.name} leads on platform interest with a demand index of ${topDemand.demandIndex} of 100.`
        : undefined,
    },
    {
      heading: 'Where action is needed',
      lines: [
        line(
          'Open issues at action severity',
          `${actionAlerts.length}`,
          'PLATFORM_OBSERVED',
        ),
        ...(topIssue
          ? [
              line(
                'Most reported issue',
                `${topIssue.label}, ${topIssue.count} reports${topIssue.hotspots[0] ? `, most often at ${topIssue.hotspots[0].name}` : ''}`,
                'PLATFORM_OBSERVED',
              ),
            ]
          : []),
        ...actionAlerts.slice(0, 3).map((alert) =>
          line(alert.entityName, alert.title, alert.provenance, alert.rule),
        ),
      ],
      commentary:
        actionAlerts.length > 0
          ? 'These are service problems rather than promotion problems. Fixing them is cheaper than promoting around them.'
          : 'No alert reached action severity in this window.',
    },
    {
      heading: 'Promotion',
      lines: topTarget
        ? [
            line(
              'Recommended target',
              `${topTarget.name} (${topTarget.district}), score ${topTarget.score}`,
              'ESTIMATED',
              targets.method,
            ),
            line(
              'Interest trend there',
              topTarget.trendPercent === null
                ? 'No baseline'
                : `${topTarget.trendPercent > 0 ? '+' : ''}${topTarget.trendPercent.toFixed(1)}% against the preceding window`,
              'PLATFORM_OBSERVED',
            ),
            line(
              'Reported spare capacity there',
              `${topTarget.spareCapacity} of ${topTarget.totalCapacity} places`,
              'PARTNER_REPORTED',
              'Verified participating partners only.',
            ),
            ...topTarget.conditions.map((condition, index) =>
              line(`Condition ${index + 1}`, condition, 'ESTIMATED'),
            ),
          ]
        : [line('Recommended target', 'No destination satisfies the promotion conditions', 'ESTIMATED')],
      commentary: targets.excluded[0]?.exclusionReason
        ? `Excluded from the ranking: ${targets.excluded
            .slice(0, 2)
            .map((entry) => `${entry.name} (${entry.exclusionReason})`)
            .join('; ')}`
        : undefined,
    },
    {
      heading: 'Supply',
      lines: [
        line(
          'Participating businesses',
          `${pulse.capacity.reduce((sum, row) => sum + row.totalBusinesses, 0)} onboarded, ${pulse.capacity.reduce((sum, row) => sum + row.verifiedBusinesses, 0)} verified`,
          'PARTNER_REPORTED',
        ),
        line(
          'Reported places free',
          `${pulse.capacity.reduce((sum, row) => sum + row.availableCapacity, 0)} of ${pulse.capacity.reduce((sum, row) => sum + row.totalCapacity, 0)}`,
          'PARTNER_REPORTED',
          'Verified participating partners only. Not a measure of total tourism supply.',
        ),
        ...(topDistrict
          ? [
              line(
                'Leading district',
                `${topDistrict.district}, ${topDistrict.sharePercent}% of state activity`,
                'PLATFORM_OBSERVED',
              ),
            ]
          : []),
        line(
          'Districts with no destination on the platform',
          `${districts.filter((row) => row.notCovered).length} of ${districts.length}`,
          'PLATFORM_OBSERVED',
          'A coverage gap in the platform, not a statement about tourism in those districts.',
        ),
      ],
    },
  ];

  const notQuotableCount = sections
    .flatMap((section) => section.lines)
    .filter((entry) => !entry.quotable).length;

  return {
    title: 'Manipur tourism briefing',
    preparedAt: now().toISOString(),
    period: pulse.window.label,
    sections,
    notQuotableCount,
    caveats: [
      'This briefing is generated from a prototype dataset. Figures marked as demo data, estimated or forecast must not be quoted as tourism statistics.',
      'No official arrivals series is connected to this platform.',
      'Platform observed figures measure interest on this platform and cannot be converted into visitor numbers.',
      'Capacity figures cover verified participating partners only.',
    ],
  };
}

/**
 * Plain text rendering for an export.
 *
 * Each line carries its provenance inline, because the badge does not survive a
 * copy and paste into an email.
 */
export function renderBriefingText(briefing: Briefing): string {
  const out: string[] = [];

  out.push(briefing.title.toUpperCase());
  out.push(`Prepared ${formatLongDate(briefing.preparedAt)} · Period ${briefing.period}`);
  out.push('');
  out.push('PROTOTYPE OUTPUT. Not an official publication of the Department of Tourism.');
  out.push('');

  for (const section of briefing.sections) {
    out.push(section.heading.toUpperCase());
    for (const entry of section.lines) {
      const label = PROVENANCE[entry.provenance].label;
      const marker = entry.quotable ? '' : '  [NOT FOR EXTERNAL QUOTATION]';
      out.push(`- ${entry.label}: ${entry.value}  [${label}]${marker}`);
      if (entry.note) out.push(`    note: ${entry.note}`);
    }
    if (section.commentary) {
      out.push(`  ${section.commentary}`);
    }
    out.push('');
  }

  out.push('CAVEATS');
  for (const caveat of briefing.caveats) out.push(`- ${caveat}`);
  out.push('');
  out.push(
    `${briefing.notQuotableCount} line${briefing.notQuotableCount === 1 ? ' is' : 's are'} marked as not for external quotation. Remove or re-source before any public use.`,
  );

  return out.join('\n');
}
