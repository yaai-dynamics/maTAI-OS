import { now } from '@/lib/config';
import { narrate, providerModel, resolveProvider } from '@/lib/ai/provider';
import { PROMPTS } from '@/lib/ai/prompts';
import { deriveConfidence, isSynthetic, type Confidence } from '@/lib/provenance';
import type { AnswerChart, EvidenceItem, GovernmentAnswer, ToolTrace } from '@/lib/types';
import { getCampaigns, getDestinations, findCampaignByName, getCampaign } from '@/server/data/repository';
import { matchCreators, MATCHING_METHOD } from '@/server/analytics/matching';
import { currentWindow } from '@/server/analytics/windows';
import {
  compareDestinations,
  getAccommodationCapacity,
  runForecast,
  runOpportunityAnalysis,
  getCampaignMetrics,
  getDestinationMetrics,
  getEventsNear,
  getSentimentSummary,
  recommendTargets,
  runSimulation,
  searchOfficialDocuments,
} from '@/server/ai/tools';

/**
 * Ask the Decision Room: question to evidence-backed answer.
 *
 * The routing is deterministic. The question picks an intent, the intent picks
 * a fixed set of authorised tools, the tools produce the evidence, and code
 * assembles the answer contract from docs/05-ai-spec.md. Only the answer
 * paragraph passes through the AI provider, and only with the evidence in hand.
 *
 * Nothing here can produce a KPI, because nothing here does arithmetic.
 */

export type Intent =
  | 'FASTEST_GROWING'
  | 'PROMOTE_NEXT'
  | 'WHY_CHANGED'
  | 'COMPLAINTS'
  | 'SPARE_CAPACITY'
  | 'CONCENTRATION'
  | 'BEST_CREATORS'
  | 'CAMPAIGN_RESULT'
  | 'SIMULATION'
  | 'FORECAST'
  | 'OPPORTUNITY'
  | 'UNSUPPORTED';

export const INTENT_LABEL: Record<Intent, string> = {
  FASTEST_GROWING: 'Growth ranking',
  PROMOTE_NEXT: 'Promotion recommendation',
  WHY_CHANGED: 'Change explanation',
  COMPLAINTS: 'Issue analysis',
  SPARE_CAPACITY: 'Capacity check',
  CONCENTRATION: 'Concentration analysis',
  BEST_CREATORS: 'Creator matching',
  CAMPAIGN_RESULT: 'Campaign evaluation',
  SIMULATION: 'Scenario simulation',
  FORECAST: 'Demand projection',
  OPPORTUNITY: 'Supply gap analysis',
  UNSUPPORTED: 'Out of scope',
};

/** Suggested questions shown on G5, matching docs/02-mvp-spec.md. */
export const SUGGESTED_QUESTIONS = [
  'Which destination should we promote to diversify tourism away from the most concentrated destinations?',
  'Which destinations are growing fastest?',
  'Why did destination demand change this month?',
  'What are tourists complaining about?',
  'Which destinations have spare capacity?',
  'Which creators are best for the Discover Ukhrul campaign?',
  'Did the Ukhrul Autumn Trails campaign improve tourism interest?',
  'What happens if we promote Ukhrul to an additional 5,000 visitors?',
  'What will demand look like over the next two weeks?',
  'Where should we invest in tourism infrastructure?',
] as const;

interface Entities {
  destinationId?: string;
  destinationName?: string;
  campaignId?: string;
  campaignName?: string;
  visitorCount?: number;
}

function extractEntities(question: string): Entities {
  const lowered = question.toLowerCase();
  const entities: Entities = {};

  // Longest name first so "Keibul Lamjao National Park" beats a shorter match.
  const destinations = [...getDestinations()].sort((a, b) => b.name.length - a.name.length);
  for (const destination of destinations) {
    if (lowered.includes(destination.name.toLowerCase())) {
      entities.destinationId = destination.id;
      entities.destinationName = destination.name;
      break;
    }
  }

  const campaigns = [...getCampaigns()].sort((a, b) => b.name.length - a.name.length);
  for (const campaign of campaigns) {
    if (lowered.includes(campaign.name.toLowerCase())) {
      entities.campaignId = campaign.id;
      entities.campaignName = campaign.name;
      break;
    }
  }

  const numberMatch = /(\d[\d,]{1,9})/.exec(question.replace(/\s/g, ''));
  if (numberMatch) {
    const value = Number(numberMatch[1]!.replace(/,/g, ''));
    if (Number.isFinite(value) && value >= 100) entities.visitorCount = value;
  }

  return entities;
}

const has = (text: string, ...terms: string[]): boolean => terms.some((term) => text.includes(term));

export function classifyIntent(question: string): Intent {
  const q = question.toLowerCase();

  if (has(q, 'what if', 'what happens if', 'simulate', 'scenario', 'additional') && /\d/.test(q)) {
    return 'SIMULATION';
  }
  if (has(q, 'did the', 'did it work', 'campaign work', 'campaign perform', 'improve tourism interest')) {
    return 'CAMPAIGN_RESULT';
  }
  if (has(q, 'creator', 'influencer')) return 'BEST_CREATORS';
  if (has(q, 'complain', 'issue', 'problem', 'sentiment', 'unhappy', 'negative feedback')) {
    return 'COMPLAINTS';
  }
  if (has(q, 'spare capacity', 'availability', 'available capacity', 'accommodation', 'room', 'beds')) {
    return 'SPARE_CAPACITY';
  }
  if (has(q, 'concentrat', 'distribut', 'spread', 'over-tourism', 'overtourism')) {
    if (has(q, 'promote', 'campaign', 'should we')) return 'PROMOTE_NEXT';
    return 'CONCENTRATION';
  }
  if (has(q, 'promote', 'should we push', 'where should we focus', 'campaign target')) {
    return 'PROMOTE_NEXT';
  }
  if (
    has(q, 'forecast', 'predict', 'projection', 'next two weeks', 'next week', 'look like', 'expect')
  ) {
    return 'FORECAST';
  }
  if (
    has(q, 'infrastructure', 'invest', 'supply gap', 'development', 'build capacity')
  ) {
    return 'OPPORTUNITY';
  }
  if (has(q, 'why did', 'why has', 'what caused', 'explain the change', 'why is')) return 'WHY_CHANGED';
  if (has(q, 'growing', 'fastest', 'rising', 'trending', 'growth')) return 'FASTEST_GROWING';

  return 'UNSUPPORTED';
}

interface Assembly {
  answer: string;
  evidence: EvidenceItem[];
  recommendation?: string;
  caveats: string[];
  nextActions: string[];
  charts: AnswerChart[];
  toolTrace: ToolTrace[];
  confidence: Confidence;
  confidenceReason: string;
}

const NOT_CAUSAL =
  'Movement in platform signals is association, not proof of cause. No comparison destination or holdout period has been run.';
const COVERAGE =
  'Platform signals measure interest expressed on this platform, not total visitor volume. No official arrivals series is connected.';

function confidenceFrom(evidence: EvidenceItem[], sampleSize: number, consistent: boolean) {
  const sources = evidence.map((item) => item.provenance);
  const confidence = deriveConfidence({ sources, sampleSize, consistent });
  const synthetic = sources.some(isSynthetic);
  const reason = synthetic
    ? `Derived from ${sampleSize.toLocaleString('en-IN')} records, some of which are prototype demo data, so confidence is capped.`
    : `Derived from ${sampleSize.toLocaleString('en-IN')} records with a comparable preceding window.`;
  return { confidence, confidenceReason: reason };
}

/* -------------------------------------------------------------------------- */

function assemble(intent: Intent, question: string, entities: Entities): Assembly {
  switch (intent) {
    case 'PROMOTE_NEXT': {
      const targets = recommendTargets({ objective: 'DIVERSIFY', limit: 3 });
      const documents = searchOfficialDocuments({ query: 'diversification concentration capacity' });
      const { result, concentration, window } = targets.data;
      const top = result.recommended[0];

      const evidence = [...targets.evidence, ...documents.evidence];
      const { confidence, confidenceReason } = confidenceFrom(
        evidence,
        result.recommended.length + result.excluded.length,
        true,
      );

      const answer = top
        ? [
            `${top.name} in ${top.district} is the strongest promotion candidate for diversifying demand.`,
            `Interest there is ${top.trendPercent === null ? 'without a baseline' : `${top.trendPercent > 0 ? 'up ' : 'down '}${Math.abs(top.trendPercent).toFixed(1)} percent`} against the preceding ${window.days} days, while it holds only ${top.sharePercent} percent of state activity.`,
            `Participating partners report ${top.spareCapacity} of ${top.totalCapacity} places free, and there are ${top.supplyBusinesses} participating businesses for visitors to spend into.`,
            `The three destinations that already hold ${concentration.topThreeSharePercent} percent of activity are excluded from this ranking, because promoting them would concentrate demand further rather than spread it.`,
          ].join(' ')
        : 'No destination currently satisfies all of the promotion conditions in this window.';

      return {
        answer,
        evidence,
        recommendation: top
          ? [
              `Run a creator campaign for ${top.name} targeting the ${window.days} day window ahead.`,
              top.conditions.length > 0
                ? `Conditions: ${top.conditions.join(' ')}`
                : 'No blocking conditions were found.',
            ].join(' ')
          : undefined,
        caveats: [COVERAGE, NOT_CAUSAL, targets.data.result.method],
        nextActions: top
          ? [
              `Open Campaign and Creator Command and launch the ${top.name} brief.`,
              `Check reported partner capacity at ${top.name} before setting the campaign size.`,
              ...top.conditions.map((condition) => condition),
            ]
          : ['Review destinations with a growing signal but no participating business, as supply development candidates.'],
        charts: [
          {
            kind: 'RANKED_BAR',
            title: 'Promotion score by destination',
            unit: 'score',
            provenance: 'ESTIMATED',
            points: result.recommended.map((target, index) => ({
              label: target.name,
              value: target.score,
              highlight: index === 0,
            })),
          },
        ],
        toolTrace: [targets.trace, documents.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'FASTEST_GROWING': {
      const metrics = getDestinationMetrics();
      const { rows, window } = metrics.data;
      const ranked = rows
        .filter((row) => row.trendPercent !== null && row.interactions >= 40)
        .sort((a, b) => (b.trendPercent ?? 0) - (a.trendPercent ?? 0))
        .slice(0, 5);
      const top = ranked[0];

      const evidence: EvidenceItem[] = ranked.map((row) => ({
        label: row.name,
        value: `${row.trendPercent! > 0 ? '+' : ''}${row.trendPercent!.toFixed(1)}% on ${row.interactions} interactions, demand index ${row.demandIndex}`,
        source: 'Platform interaction signals',
        provenance: row.provenance,
        period: window.label,
      }));

      const { confidence, confidenceReason } = confidenceFrom(
        evidence,
        rows.reduce((sum, row) => sum + row.interactions, 0),
        true,
      );

      return {
        answer: top
          ? `${top.name} is growing fastest, up ${top.trendPercent!.toFixed(1)} percent in weighted activity against the preceding ${window.days} days on ${top.interactions} interactions. ${ranked[1] ? `${ranked[1].name} follows at ${ranked[1].trendPercent!.toFixed(1)} percent.` : ''} Destinations with fewer than 40 interactions in the window are left out of this ranking, because a large percentage on a handful of records is noise rather than growth.`
          : 'No destination has enough interactions in this window to support a growth ranking.',
        evidence,
        caveats: [COVERAGE, 'Seeded events inside the window lift the destinations they belong to. Check the event calendar before reading a rise as underlying demand.'],
        nextActions: top
          ? [
              `Open ${top.name} in Destination Intelligence to see what is behind the rise.`,
              'Check reported partner capacity before acting on the growth.',
            ]
          : [],
        charts: [
          {
            kind: 'RANKED_BAR',
            title: 'Change in weighted activity against the preceding window',
            unit: '%',
            provenance: 'PLATFORM_OBSERVED',
            points: ranked.map((row, index) => ({
              label: row.name,
              value: row.trendPercent ?? 0,
              highlight: index === 0,
            })),
          },
        ],
        toolTrace: [metrics.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'WHY_CHANGED': {
      const window = currentWindow();
      const metrics = getDestinationMetrics({ destinationId: entities.destinationId });
      const target =
        metrics.data.rows.find((row) => row.destinationId === entities.destinationId) ??
        metrics.data.rows[0];

      if (!target) {
        return unsupported(question, 'No destination activity is available for this window.');
      }

      const events = getEventsNear({ destinationId: target.destinationId, window });
      const sentiment = getSentimentSummary({ destinationId: target.destinationId });
      const campaigns = getCampaigns().filter(
        (campaign) =>
          campaign.destinationId === target.destinationId &&
          campaign.status !== 'DRAFT' &&
          campaign.endDate >= window.from.toISOString().slice(0, 10),
      );

      const evidence: EvidenceItem[] = [
        {
          label: `${target.name} weighted activity`,
          value: `${target.weightedScore} against ${target.previousWeightedScore} in the preceding window (${target.trendPercent === null ? 'no baseline' : `${target.trendPercent > 0 ? '+' : ''}${target.trendPercent.toFixed(1)}%`})`,
          source: 'Platform interaction signals',
          provenance: target.provenance,
          period: window.label,
        },
        ...events.evidence,
        ...campaigns.map((campaign) => ({
          label: `Campaign running: ${campaign.name}`,
          value: `${campaign.startDate} to ${campaign.endDate}, status ${campaign.status.toLowerCase()}`,
          source: 'Campaign records',
          provenance: campaign.provenance,
        })),
        sentiment.evidence[0]!,
      ];

      const drivers: string[] = [];
      if (events.data.events.length > 0) {
        drivers.push(
          `${events.data.events.map((event) => event.name).join(' and ')} fell inside the window, which is associated with the rise`,
        );
      }
      if (campaigns.length > 0) {
        drivers.push(`${campaigns[0]!.name} was running over part of the window`);
      }
      if (drivers.length === 0) {
        drivers.push('no seeded event or campaign falls inside the window, so there is insufficient evidence to determine a cause');
      }

      const { confidence, confidenceReason } = confidenceFrom(evidence, target.interactions, true);

      return {
        answer: `Weighted activity at ${target.name} moved from ${target.previousWeightedScore} to ${target.weightedScore}, ${target.trendPercent === null ? 'with no comparable baseline' : `a change of ${target.trendPercent > 0 ? '+' : ''}${target.trendPercent.toFixed(1)} percent`}. Looking at what overlapped the window: ${drivers.join('; ')}. These are associations. Separating them would need a comparison destination that was not promoted, or a longer before and after window.`,
        evidence,
        caveats: [NOT_CAUSAL, COVERAGE],
        nextActions: [
          `Compare ${target.name} against a similar destination that had no event or campaign in the window.`,
          'Extend the comparison window once more history is available.',
        ],
        charts: [],
        toolTrace: [metrics.trace, events.trace, sentiment.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'COMPLAINTS': {
      const sentiment = getSentimentSummary({ destinationId: entities.destinationId });
      const { issues, satisfaction, scope, window } = sentiment.data;
      const top = issues.issues[0];

      const { confidence, confidenceReason } = confidenceFrom(
        sentiment.evidence,
        issues.totalIssueReports,
        true,
      );

      return {
        answer: top
          ? `${top.label.toLowerCase()} is the most reported issue for ${scope}, with ${top.count} reports in ${window.days} days, ${top.sharePercent} percent of all issue reports${top.hotspots[0] ? ` and concentrated at ${top.hotspots[0].name} with ${top.hotspots[0].count}` : ''}. Overall satisfaction is ${satisfaction.averageRating?.toFixed(2) ?? 'unmeasured'} of 5 across ${satisfaction.responses} responses, so this is a specific service problem rather than general dissatisfaction.`
          : `No issue reports were recorded for ${scope} in the last ${window.days} days.`,
        evidence: sentiment.evidence,
        recommendation: top
          ? `Treat ${top.label.toLowerCase()} at ${top.hotspots[0]?.name ?? scope} as an operational fix. Publishing clear, current information is usually cheaper than a campaign and improves every future visit.`
          : undefined,
        caveats: [
          'Feedback is voluntary, so it over-represents visitors who felt strongly either way.',
          COVERAGE,
        ],
        nextActions: top
          ? [
              `Open Issues and Sentiment filtered to ${top.hotspots[0]?.name ?? scope}.`,
              'Check whether the same category is rising at other destinations before treating it as local.',
            ]
          : [],
        charts: [
          {
            kind: 'RANKED_BAR',
            title: `Issue reports by category, ${scope}`,
            unit: 'reports',
            provenance: 'PLATFORM_OBSERVED',
            points: issues.issues.slice(0, 6).map((issue, index) => ({
              label: issue.label,
              value: issue.count,
              highlight: index === 0,
            })),
          },
        ],
        toolTrace: [sentiment.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'SPARE_CAPACITY': {
      const capacity = getAccommodationCapacity({ destinationId: entities.destinationId });
      const { withSpare, state } = capacity.data;
      const top = withSpare[0];

      const { confidence, confidenceReason } = confidenceFrom(
        capacity.evidence,
        state.reportingProperties,
        true,
      );

      return {
        answer: top
          ? `${top.name} has the most reported spare capacity, ${top.availableCapacity} of ${top.totalCapacity} places free across ${top.reportingProperties} participating propert${top.reportingProperties === 1 ? 'y' : 'ies'}. Across the state, participating partners report ${state.availableCapacity} of ${state.totalCapacity} places free. ${state.coverageNote}`
          : 'No participating property is currently reporting availability.',
        evidence: capacity.evidence,
        recommendation:
          state.destinationsWithNoSupply.length > 0
            ? `${state.destinationsWithNoSupply.length} destination${state.destinationsWithNoSupply.length === 1 ? ' has' : 's have'} no participating business at all (${state.destinationsWithNoSupply.join(', ')}). Onboarding there would widen where demand can be sent.`
            : undefined,
        caveats: [
          state.coverageNote,
          'Absence of a reported figure means no partner reported, not that no accommodation exists.',
        ],
        nextActions: [
          'Review participating partner coverage by district in Destination Intelligence.',
          'Invite unregistered accommodation at destinations with rising interest.',
        ],
        charts: [
          {
            kind: 'RANKED_BAR',
            title: 'Reported places free among participating partners',
            unit: 'places',
            provenance: 'PARTNER_REPORTED',
            points: withSpare.slice(0, 6).map((row, index) => ({
              label: row.name,
              value: row.availableCapacity,
              highlight: index === 0,
            })),
          },
        ],
        toolTrace: [capacity.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'CONCENTRATION': {
      const comparison = compareDestinations({ limit: 8 });
      const targets = recommendTargets({ objective: 'DIVERSIFY', limit: 3 });
      const { concentration } = targets.data;

      const evidence: EvidenceItem[] = [
        {
          label: 'Share held by the top three destinations',
          value: `${concentration.topThreeSharePercent}% (${concentration.topThree.map((row) => `${row.name} ${row.sharePercent}%`).join(', ')})`,
          source: 'Deterministic analytics engine',
          provenance: 'ESTIMATED',
          period: comparison.data.window.label,
          method: concentration.method,
        },
        {
          label: 'Distribution score',
          value: `${concentration.distributionScore} of 100 across ${concentration.destinationsCovered} destinations, where a higher score means activity is spread more evenly`,
          source: 'Deterministic analytics engine',
          provenance: 'ESTIMATED',
          method: concentration.method,
        },
        ...targets.evidence.slice(0, 3),
      ];

      const { confidence, confidenceReason } = confidenceFrom(evidence, comparison.data.rows.length, true);

      return {
        answer: `The three largest destinations hold ${concentration.topThreeSharePercent} percent of weighted activity, and the distribution score across ${concentration.destinationsCovered} destinations is ${concentration.distributionScore} of 100. ${concentration.topThree[0] ? `${concentration.topThree[0].name} alone accounts for ${concentration.topThree[0].sharePercent} percent.` : ''} That is concentration in platform interest, which is an early indicator, not a measure of people on the ground.`,
        evidence,
        recommendation: targets.data.result.recommended[0]
          ? `Promote ${targets.data.result.recommended[0].name} rather than a destination already in the top three, and pair it with the conditions listed against it.`
          : undefined,
        caveats: [COVERAGE, concentration.method],
        nextActions: [
          'Track the distribution score month on month rather than reading a single value.',
          'Check capacity before redirecting demand to a smaller destination.',
        ],
        charts: [
          {
            kind: 'RANKED_BAR',
            title: 'Share of weighted activity by destination',
            unit: '%',
            provenance: 'ESTIMATED',
            points: comparison.data.rows.map((row) => ({
              label: row.name,
              value: row.sharePercent,
              highlight: concentration.topThree.some((entry) => entry.name === row.name),
            })),
          },
        ],
        toolTrace: [comparison.trace, targets.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'BEST_CREATORS': {
      const campaign = entities.campaignId
        ? getCampaign(entities.campaignId)
        : (findCampaignByName('Discover Ukhrul') ?? getCampaigns()[0]);

      if (!campaign) return unsupported(question, 'No campaign is available to match creators against.');

      const matches = matchCreators(campaign, 5);
      const evidence: EvidenceItem[] = matches.map((match) => ({
        label: match.creator.displayName,
        value: `score ${match.totalScore} of 100 — ${match.factors
          .slice(0, 3)
          .map((factor) => `${factor.label.toLowerCase()} ${factor.score}/${factor.maxScore}`)
          .join(', ')}`,
        source: 'Creator profiles and past campaign outcomes',
        provenance: match.creator.provenance,
        method: MATCHING_METHOD,
      }));

      const top = matches[0];
      const { confidence, confidenceReason } = confidenceFrom(evidence, matches.length * 6, true);

      return {
        answer: top
          ? `${top.creator.displayName} ranks first for ${campaign.name} with ${top.totalScore} of 100. ${top.highlights.join('. ')}. ${matches[1] ? `${matches[1].creator.displayName} follows at ${matches[1].totalScore}.` : ''} The ranking is computed from profile and past-outcome signals, not by a model, so every component is visible in the shortlist.`
          : 'No creator on the platform matches this campaign.',
        evidence,
        recommendation: top
          ? `Shortlist ${matches
              .slice(0, 3)
              .map((match) => match.creator.displayName)
              .join(', ')} and invite them to apply.`
          : undefined,
        caveats: [
          'Creator scores and past outcomes are prototype demo data.',
          top && top.cautions.length > 0 ? `Note on the leading match: ${top.cautions[0]}` : 'No cautions were raised on the leading match.',
        ],
        nextActions: [
          'Open Campaign and Creator Command to send the invitations.',
          'Check the cautions on each shortlisted creator before committing reward budget.',
        ],
        charts: [
          {
            kind: 'RANKED_BAR',
            title: `Match score for ${campaign.name}`,
            unit: 'of 100',
            provenance: 'ESTIMATED',
            points: matches.map((match, index) => ({
              label: match.creator.displayName,
              value: match.totalScore,
              highlight: index === 0,
            })),
          },
        ],
        toolTrace: [
          {
            tool: 'matchCreators',
            input: campaign.name,
            summary: `Scored ${matches.length} creators on six weighted factors`,
            rowsConsidered: matches.length,
          },
        ],
        confidence,
        confidenceReason,
      };
    }

    case 'CAMPAIGN_RESULT': {
      const metrics = getCampaignMetrics({
        ...(entities.campaignId ? { campaignId: entities.campaignId } : {}),
        ...(entities.campaignName ? { campaignName: entities.campaignName } : {}),
      });
      const funnel = metrics.data.funnel;

      if (!funnel) {
        const completed = getCampaigns().filter((campaign) => campaign.status === 'COMPLETED');
        return unsupported(
          question,
          completed.length > 0
            ? `Name the campaign to evaluate. Completed campaigns: ${completed.map((c) => c.name).join(', ')}.`
            : 'No campaign has completed yet.',
        );
      }

      const platformSteps = funnel.steps.filter((step) => step.block === 'PLATFORM');
      const reachSteps = funnel.steps.filter((step) => step.block === 'REACH');
      const liveCaptured = platformSteps.reduce((sum, step) => sum + step.capturedThisSession, 0);
      const totalPlatform = platformSteps.reduce((sum, step) => sum + step.value, 0);

      const { confidence, confidenceReason } = confidenceFrom(
        metrics.evidence,
        totalPlatform,
        funnel.daysElapsed >= 7,
      );

      const answer = [
        `${funnel.campaign.name} published ${funnel.publishedContent} item${funnel.publishedContent === 1 ? '' : 's'} and reached ${(reachSteps[0]?.value ?? 0).toLocaleString('en-IN')} views as reported by the publishing platforms.`,
        `On this platform it is associated with ${platformSteps.map((step) => `${step.value} ${step.label.toLowerCase()}`).join(', ')}.`,
        `Activity at ${funnel.destinationName} moved ${funnel.destinationActivityChangePercent === null ? 'with no comparable baseline' : `${funnel.destinationActivityChangePercent > 0 ? 'up ' : 'down '}${Math.abs(funnel.destinationActivityChangePercent).toFixed(1)} percent`} against the same length window before the campaign.`,
        liveCaptured > 0
          ? `${liveCaptured} of those platform signals were captured during this session, which is the loop working end to end.`
          : '',
        'Reach and platform signals are different scales and are not divided into one another. This is a funnel, not an attribution.',
      ]
        .filter(Boolean)
        .join(' ');

      return {
        answer,
        evidence: metrics.evidence,
        recommendation:
          funnel.daysElapsed < 7
            ? 'Too early to judge. Set a comparison destination now so the next evaluation can separate the campaign from seasonality.'
            : 'Repeat the campaign structure with a comparison destination that is not promoted, so the next run can support an attribution claim.',
        caveats: [funnel.scaleNote, ...funnel.caveats],
        nextActions: [
          'Nominate a comparison destination before the next campaign opens.',
          'Review the issue reports for the destination, since service problems cap what promotion can achieve.',
        ],
        charts: [
          {
            kind: 'FUNNEL',
            title: `${funnel.campaign.name}: signals observed on this platform`,
            unit: 'signals',
            provenance: 'PLATFORM_OBSERVED',
            points: platformSteps.map((step) => ({ label: step.label, value: step.value })),
          },
        ],
        toolTrace: [metrics.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'SIMULATION': {
      const destinationId = entities.destinationId ?? 'dest-ukhrul';
      const visitors = entities.visitorCount ?? 5000;
      const simulation = runSimulation({ destinationId, additionalVisitors: visitors });
      const result = simulation.data.simulation;

      if (!result) return unsupported(question, 'Name a destination in the platform to simulate.');

      const overCapacity = result.pressures.find((pressure) => pressure.reading === 'OVER_CAPACITY');
      const { confidence } = confidenceFrom(simulation.evidence, result.pressures.length, false);

      return {
        answer: [
          `Under the stated assumptions, ${visitors.toLocaleString('en-IN')} additional visitors to ${result.destinationName} over ${result.overDays} days would need about ${result.pressures[0]!.value.toLowerCase()}.`,
          overCapacity
            ? `That exceeds what participating partners currently report, so the scenario is not absorbable as it stands.`
            : 'That sits inside what participating partners currently report.',
          `It would also mean roughly ${result.pressures[1]!.value.toLowerCase()}, and about ${result.localBusinessDemand.estimatedExperienceBookings.toLocaleString('en-IN')} local experience bookings worth an indicative ₹${result.localBusinessDemand.indicativeLocalSpendInr.toLocaleString('en-IN')}.`,
          'This is a forecast under explicit assumptions, not a prediction.',
        ].join(' '),
        evidence: simulation.evidence,
        recommendation: result.mitigations[0],
        caveats: [
          ...result.caveats,
          `Assumptions: ${result.assumptions.averageStayNights} nights per visitor, ${Math.round(result.assumptions.participatingPartnerShare * 100)} percent staying with participating partners, ${result.assumptions.averageGroupSize} people per vehicle, ${Math.round(result.assumptions.experienceUptake * 100)} percent booking an experience, plus or minus ${Math.round(result.assumptions.uncertaintyBand * 100)} percent.`,
        ],
        nextActions: result.mitigations,
        charts: [],
        toolTrace: [simulation.trace],
        // A scenario is never better than LOW confidence: it is not a measurement.
        confidence: confidence === 'HIGH' ? 'MEDIUM' : confidence,
        confidenceReason:
          'A simulation is a scenario under stated assumptions. Confidence reflects the assumptions, not observed outcomes.',
      };
    }

    case 'FORECAST': {
      const result = runForecast({
        ...(entities.destinationId ? { destinationId: entities.destinationId } : {}),
        horizonDays: 14,
      });
      const { forecast } = result.data;

      return {
        answer: [
          `Projected over ${forecast.horizonDays} days, platform interest in ${forecast.scope} ${
            forecast.projectedChangePercent === null
              ? 'has no comparable baseline week'
              : `moves ${forecast.projectedChangePercent > 0 ? 'up ' : 'down '}${Math.abs(forecast.projectedChangePercent).toFixed(1)} percent against the last observed week`
          }.`,
          `The trend explains ${Math.round(forecast.fitQuality * 100)} percent of the variation in the retained history, and the interval is plus or minus ${(forecast.residualStdDev * 2).toFixed(1)} at day one, widening with the horizon.`,
          forecast.eventsInHorizon.length > 0
            ? `${forecast.eventsInHorizon.map((event) => event.name).join(' and ')} falls inside this horizon and is not modelled.`
            : '',
          'This is a projection of a ninety day trend, not a seasonal model. It cannot see annual seasonality, and it measures interest on this platform rather than visitor numbers.',
        ]
          .filter(Boolean)
          .join(' '),
        evidence: result.evidence,
        recommendation:
          'Read it as a direction rather than a number, and re-run it once a longer series exists.',
        caveats: forecast.limits,
        nextActions: [
          'Check the event calendar before acting on a projected rise.',
          'Compare the projection against reported partner capacity before promoting into it.',
        ],
        charts: [],
        toolTrace: [result.trace],
        // A forecast is never a measurement.
        confidence: forecast.confidence,
        confidenceReason: forecast.confidenceReason,
      };
    }

    case 'OPPORTUNITY': {
      const result = runOpportunityAnalysis({ limit: 5 });
      const top = result.data.opportunities[0];
      const { confidence, confidenceReason } = confidenceFrom(
        result.evidence,
        result.data.opportunities.length * 10,
        true,
      );

      return {
        answer: top
          ? `${top.name} in ${top.district} has the widest gap between interest and the supply that could serve it: interest of ${top.demandIndex} of 100 against ${top.spareCapacity} reported places free and ${top.participatingBusinesses} participating business${top.participatingBusinesses === 1 ? '' : 'es'}. ${top.recommendation}`
          : 'No destination shows a supply gap in this window.',
        evidence: result.evidence,
        recommendation: top
          ? `Treat ${top.name} as a development priority rather than a promotion target. Onboarding there is what would make a campaign possible later.`
          : undefined,
        caveats: [
          COVERAGE,
          'Supply is measured from verified participating partners only, so a destination may have accommodation the platform cannot see.',
        ],
        nextActions: [
          'Open Partners to see which destinations have no reporting supply at all.',
          'Invite unregistered accommodation and experience providers at the top ranked destinations.',
        ],
        charts: [
          {
            kind: 'RANKED_BAR',
            title: 'Gap between interest and the supply that could serve it',
            unit: 'gap score',
            provenance: 'ESTIMATED',
            points: result.data.opportunities.map((row, index) => ({
              label: row.name,
              value: row.gapScore,
              highlight: index === 0,
            })),
          },
        ],
        toolTrace: [result.trace],
        confidence,
        confidenceReason,
      };
    }

    case 'UNSUPPORTED':
    default:
      return unsupported(question);
  }
}

function unsupported(question: string, detail?: string): Assembly {
  return {
    answer: [
      'This assistant answers questions it can support with the tourism data in the platform, and it will not answer outside that.',
      detail ?? '',
      'It can rank destination growth, recommend promotion targets, explain a change, summarise complaints, report partner capacity, measure concentration, match creators to a campaign, evaluate a campaign funnel, project demand, find supply gaps and run a capacity scenario.',
    ]
      .filter(Boolean)
      .join(' '),
    evidence: [],
    caveats: ['No tool was run, so there is no evidence behind this response.'],
    nextActions: ['Try one of the suggested questions.'],
    charts: [],
    toolTrace: [
      {
        tool: 'intentClassifier',
        input: question,
        summary: 'No authorised tool covers this question',
        rowsConsidered: 0,
      },
    ],
    confidence: 'LOW',
    confidenceReason: 'No tool was run.',
  };
}

/* -------------------------------------------------------------------------- */

export async function askManipurTourism(question: string): Promise<GovernmentAnswer> {
  const intent = classifyIntent(question);
  const entities = extractEntities(question);
  const assembly = assemble(intent, question, entities);

  const narration = await narrate({
    promptId: PROMPTS.governmentAnalyst.id,
    system: PROMPTS.governmentAnalyst.system,
    deterministicText: assembly.answer,
    evidence: {
      intent,
      question,
      evidence: assembly.evidence,
      recommendation: assembly.recommendation,
      confidence: assembly.confidence,
    },
    task: 'Write the answer paragraph for this tourism officer question.',
    maxTokens: 500,
  });

  const usesSyntheticData = assembly.evidence.some((item) => isSynthetic(item.provenance));

  return {
    question,
    intent: INTENT_LABEL[intent],
    answer: narration.text,
    evidence: assembly.evidence,
    ...(assembly.recommendation ? { recommendation: assembly.recommendation } : {}),
    confidence: assembly.confidence,
    confidenceReason: assembly.confidenceReason,
    caveats: assembly.caveats,
    nextActions: assembly.nextActions,
    charts: assembly.charts,
    toolTrace: assembly.toolTrace,
    usesSyntheticData,
    generatedBy: narration.fallback
      ? `${resolveProvider()} (fell back to deterministic text: ${narration.fallbackReason ?? 'unknown'})`
      : `${resolveProvider()} / ${providerModel()}`,
    generatedAt: now().toISOString(),
  };
}
