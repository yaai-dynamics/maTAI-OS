import { ANALYSIS_WINDOW_DAYS } from '@/lib/config';
import { formatLongDate } from '@/lib/date';
import type { EvidenceItem, ToolTrace } from '@/lib/types';
import {
  findCampaignByName,
  getDataSource,
  getDestination,
  getDestinations,
  getEventsFor,
  getKnowledgeDocuments,
  getOfficialStatistics,
} from '@/server/data/repository';
import { computeCampaignFunnel } from '@/server/analytics/campaign';
import { computeCapacity, computeStateCapacity } from '@/server/analytics/capacity';
import { computeConcentration, computeDemand, DEMAND_METHOD } from '@/server/analytics/demand';
import {
  computeDestinationSentiment,
  computeIssues,
  computeSatisfaction,
} from '@/server/analytics/sentiment';
import { computeAlerts } from '@/server/analytics/alerts';
import {
  findInfrastructureOpportunities,
  forecastDemand,
  OPPORTUNITY_METHOD,
} from '@/server/analytics/forecast';
import { recommendCampaignTargets, RECOMMENDATION_METHOD } from '@/server/analytics/recommend';
import { simulateCampaign } from '@/server/analytics/simulation';
import { currentWindow, type AnalysisWindow } from '@/server/analytics/windows';

/**
 * The authorised tool set for the Decision Room.
 *
 * Reference: docs/05-ai-spec.md. These are ordinary functions over the
 * deterministic analytics layer. The model never calls them with free-form
 * arithmetic and never sees raw records: it receives the evidence they return.
 *
 * Every tool returns a ToolTrace so an answer can be audited afterwards
 * (master concept document, section 8: auditability).
 */

export interface ToolResult<T> {
  data: T;
  /** One line an officer can read without opening the data. */
  summary: string;
  evidence: EvidenceItem[];
  trace: ToolTrace;
}

const trace = (
  tool: string,
  input: string,
  summary: string,
  rowsConsidered: number,
  startedAt: number,
): ToolTrace => ({
  tool,
  input,
  summary,
  rowsConsidered,
  durationMs: Date.now() - startedAt,
});

const pct = (value: number | null): string =>
  value === null ? 'no baseline' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

/* ------------------------- getDestinationMetrics -------------------------- */

export function getDestinationMetrics(options: { destinationId?: string; windowDays?: number } = {}) {
  const startedAt = Date.now();
  const window = currentWindow(options.windowDays ?? ANALYSIS_WINDOW_DAYS);
  const all = computeDemand(window);
  const rows = options.destinationId
    ? all.filter((row) => row.destinationId === options.destinationId)
    : all;

  const evidence: EvidenceItem[] = rows.slice(0, 6).map((row) => ({
    label: `${row.name} demand index`,
    value: `${row.demandIndex} of 100, ${pct(row.trendPercent)} against the preceding window, ${row.interactions} interactions`,
    source: 'Platform interaction signals',
    provenance: row.provenance,
    period: window.label,
    method: DEMAND_METHOD,
  }));

  const top = rows[0];
  return {
    data: { window, rows },
    summary: top
      ? `${rows.length} destination${rows.length === 1 ? '' : 's'} measured over ${window.days} days. ${top.name} leads on ${top.demandIndex} of 100.`
      : 'No destination activity in the window.',
    evidence,
    trace: trace(
      'getDestinationMetrics',
      options.destinationId ?? 'all destinations',
      `Computed demand, trend and share for ${rows.length} destinations`,
      rows.length,
      startedAt,
    ),
  } satisfies ToolResult<{ window: AnalysisWindow; rows: typeof rows }>;
}

/* --------------------------- compareDestinations -------------------------- */

export function compareDestinations(options: { destinationIds?: string[]; limit?: number } = {}) {
  const startedAt = Date.now();
  const window = currentWindow();
  const demand = computeDemand(window);
  const sentiment = new Map(computeDestinationSentiment(window).map((row) => [row.destinationId, row]));
  const capacity = new Map(computeCapacity().map((row) => [row.destinationId, row]));

  const selected = options.destinationIds
    ? demand.filter((row) => options.destinationIds!.includes(row.destinationId))
    : demand.slice(0, options.limit ?? 6);

  const rows = selected.map((row) => ({
    ...row,
    averageRating: sentiment.get(row.destinationId)?.averageRating ?? null,
    responses: sentiment.get(row.destinationId)?.responses ?? 0,
    topIssue: sentiment.get(row.destinationId)?.topIssue ?? null,
    spareCapacity: capacity.get(row.destinationId)?.availableCapacity ?? 0,
    totalCapacity: capacity.get(row.destinationId)?.totalCapacity ?? 0,
    ecoSensitivity: getDestination(row.destinationId)?.ecoSensitivity ?? 'MEDIUM',
  }));

  const evidence: EvidenceItem[] = rows.map((row) => ({
    label: row.name,
    value: `demand ${row.demandIndex}, trend ${pct(row.trendPercent)}, rating ${row.averageRating?.toFixed(2) ?? 'no responses'}, ${row.spareCapacity} of ${row.totalCapacity} partner places free`,
    source: 'Platform signals and partner reports',
    provenance: row.provenance,
    period: window.label,
  }));

  return {
    data: { window, rows },
    summary: `Compared ${rows.length} destinations on demand, trend, satisfaction and reported partner capacity.`,
    evidence,
    trace: trace(
      'compareDestinations',
      options.destinationIds?.join(', ') ?? `top ${rows.length}`,
      'Joined demand, sentiment and capacity per destination',
      rows.length,
      startedAt,
    ),
  } satisfies ToolResult<{ window: AnalysisWindow; rows: typeof rows }>;
}

/* --------------------------- getSentimentSummary -------------------------- */

export function getSentimentSummary(options: { destinationId?: string; windowDays?: number } = {}) {
  const startedAt = Date.now();
  const window = currentWindow(options.windowDays ?? ANALYSIS_WINDOW_DAYS);
  const satisfaction = computeSatisfaction(window, options.destinationId);
  const issues = computeIssues(window, options.destinationId);
  const scope = options.destinationId
    ? (getDestination(options.destinationId)?.name ?? options.destinationId)
    : 'Manipur';

  const evidence: EvidenceItem[] = [
    {
      label: `${scope} average rating`,
      value:
        satisfaction.averageRating === null
          ? 'No responses in the window'
          : `${satisfaction.averageRating.toFixed(2)} of 5 across ${satisfaction.responses} responses`,
      source: 'Tourist feedback captured by the platform',
      provenance: satisfaction.provenance,
      period: window.label,
      method: satisfaction.method,
    },
    ...issues.issues.slice(0, 4).map((issue) => ({
      label: issue.label,
      value: `${issue.count} reports, ${issue.sharePercent}% of issues, ${pct(issue.changePercent)} against the preceding window${issue.hotspots[0] ? `, most often at ${issue.hotspots[0].name}` : ''}`,
      source: 'Tourist feedback captured by the platform',
      provenance: 'PLATFORM_OBSERVED' as const,
      period: window.label,
    })),
  ];

  return {
    data: { window, satisfaction, issues, scope },
    summary:
      issues.issues.length > 0
        ? `${issues.totalIssueReports} issue reports in ${window.days} days for ${scope}. Most reported: ${issues.issues[0]!.label}.`
        : `No issue reports for ${scope} in the window.`,
    evidence,
    trace: trace(
      'getSentimentSummary',
      options.destinationId ?? 'statewide',
      `Classified ${issues.totalResponses} feedback items by recorded category`,
      issues.totalResponses,
      startedAt,
    ),
  } satisfies ToolResult<{
    window: AnalysisWindow;
    satisfaction: typeof satisfaction;
    issues: typeof issues;
    scope: string;
  }>;
}

/* ------------------------- getAccommodationCapacity ----------------------- */

export function getAccommodationCapacity(options: { destinationId?: string } = {}) {
  const startedAt = Date.now();
  const rows = computeCapacity().filter(
    (row) => !options.destinationId || row.destinationId === options.destinationId,
  );
  const state = computeStateCapacity();
  const withSpare = [...rows]
    .filter((row) => row.totalCapacity > 0)
    .sort((a, b) => b.availableCapacity - a.availableCapacity);

  const evidence: EvidenceItem[] = withSpare.slice(0, 5).map((row) => ({
    label: `${row.name} reported availability`,
    value: `${row.availableCapacity} of ${row.totalCapacity} places free across ${row.reportingProperties} participating propert${row.reportingProperties === 1 ? 'y' : 'ies'}`,
    source: 'Participating partner reports',
    provenance: 'PARTNER_REPORTED',
    method: row.coverageNote,
  }));

  return {
    data: { rows, state, withSpare },
    summary: `${state.availableCapacity} of ${state.totalCapacity} reported places free across ${state.reportingProperties} participating properties. ${state.coverageNote}`,
    evidence,
    trace: trace(
      'getAccommodationCapacity',
      options.destinationId ?? 'statewide',
      'Read latest partner availability snapshots',
      rows.length,
      startedAt,
    ),
  } satisfies ToolResult<{ rows: typeof rows; state: typeof state; withSpare: typeof withSpare }>;
}

/* ---------------------------- getCampaignMetrics -------------------------- */

export function getCampaignMetrics(options: { campaignId?: string; campaignName?: string }) {
  const startedAt = Date.now();
  const campaign = options.campaignId
    ? { id: options.campaignId }
    : options.campaignName
      ? findCampaignByName(options.campaignName)
      : undefined;

  if (!campaign) {
    return {
      data: { funnel: undefined },
      summary: 'No campaign matched that name.',
      evidence: [],
      trace: trace(
        'getCampaignMetrics',
        options.campaignName ?? options.campaignId ?? 'unspecified',
        'No matching campaign',
        0,
        startedAt,
      ),
    } satisfies ToolResult<{ funnel: undefined }>;
  }

  const funnel = computeCampaignFunnel(campaign.id);
  if (!funnel) {
    return {
      data: { funnel: undefined },
      summary: 'No campaign matched that name.',
      evidence: [],
      trace: trace('getCampaignMetrics', campaign.id, 'No matching campaign', 0, startedAt),
    } satisfies ToolResult<{ funnel: undefined }>;
  }

  const evidence: EvidenceItem[] = funnel.steps.map((step) => ({
    label: step.label,
    value:
      step.capturedThisSession > 0
        ? `${step.value.toLocaleString('en-IN')} (${step.capturedThisSession} captured in this session)`
        : step.value.toLocaleString('en-IN'),
    source: step.source,
    provenance: step.provenance,
    period: `${formatLongDate(funnel.campaign.startDate)} to ${formatLongDate(funnel.campaign.endDate)}`,
  }));

  evidence.push({
    label: `${funnel.destinationName} activity during the campaign`,
    value: `${pct(funnel.destinationActivityChangePercent)} against the same length window immediately before it`,
    source: 'Platform interaction signals',
    provenance: 'PLATFORM_OBSERVED',
    method: funnel.attributionStatement,
  });

  return {
    data: { funnel },
    summary: `${funnel.campaign.name}: ${funnel.publishedContent} published item${funnel.publishedContent === 1 ? '' : 's'}, destination activity ${pct(funnel.destinationActivityChangePercent)} during the campaign window.`,
    evidence,
    trace: trace(
      'getCampaignMetrics',
      funnel.campaign.name,
      'Built the campaign funnel from seeded reach and tagged platform interactions',
      funnel.steps.length,
      startedAt,
    ),
  } satisfies ToolResult<{ funnel: typeof funnel }>;
}

/* ------------------------- recommendCampaignTargets ----------------------- */

export function recommendTargets(options: { objective?: 'DIVERSIFY' | 'GROW'; limit?: number } = {}) {
  const startedAt = Date.now();
  const window = currentWindow();
  const demand = computeDemand(window);
  const capacity = computeCapacity();
  const sentiment = computeDestinationSentiment(window);
  const alerts = computeAlerts({ demand, sentiment, capacity });
  const concentration = computeConcentration(demand);

  const result = recommendCampaignTargets({
    demand,
    capacity,
    sentiment,
    alerts,
    concentration,
    objective: options.objective ?? 'DIVERSIFY',
    limit: options.limit ?? 3,
  });

  const evidence: EvidenceItem[] = result.recommended.map((target) => ({
    label: `${target.name} (${target.district})`,
    value: `score ${target.score}, interest ${pct(target.trendPercent)}, ${target.spareCapacity} of ${target.totalCapacity} partner places free, ${target.sharePercent}% of state activity`,
    source: 'Deterministic analytics engine',
    provenance: 'ESTIMATED',
    period: window.label,
    method: RECOMMENDATION_METHOD,
  }));

  const excludedTop = result.excluded.slice(0, 3);
  for (const target of excludedTop) {
    evidence.push({
      label: `Not recommended: ${target.name}`,
      value: target.exclusionReason ?? 'Excluded',
      source: 'Deterministic analytics engine',
      provenance: 'ESTIMATED',
    });
  }

  return {
    data: { window, concentration, result },
    summary:
      result.recommended.length > 0
        ? `${result.recommended[0]!.name} ranks first for a ${result.objective.toLowerCase()} objective, ahead of ${result.recommended[1]?.name ?? 'no other candidate'}.`
        : 'No destination currently satisfies the promotion conditions.',
    evidence,
    trace: trace(
      'recommendCampaignTargets',
      `objective=${result.objective}`,
      `Scored ${demand.length} destinations, excluded ${result.excluded.length}`,
      demand.length,
      startedAt,
    ),
  } satisfies ToolResult<{
    window: AnalysisWindow;
    concentration: typeof concentration;
    result: typeof result;
  }>;
}

/* ----------------------------- simulateCampaign --------------------------- */

export function runSimulation(options: {
  destinationId: string;
  additionalVisitors: number;
  overDays?: number;
}) {
  const startedAt = Date.now();
  const result = simulateCampaign(options);

  if (!result) {
    return {
      data: { simulation: undefined },
      summary: 'That destination is not in the platform.',
      evidence: [],
      trace: trace('simulateCampaign', options.destinationId, 'Unknown destination', 0, startedAt),
    } satisfies ToolResult<{ simulation: undefined }>;
  }

  const evidence: EvidenceItem[] = result.pressures.map((pressure) => ({
    label: pressure.label,
    value: `${pressure.value} (range ${pressure.range})`,
    source: 'Campaign and capacity simulation',
    provenance: 'FORECAST',
    method: pressure.note,
  }));

  evidence.push({
    label: 'Indicative local business demand',
    value: `${result.localBusinessDemand.estimatedExperienceBookings.toLocaleString('en-IN')} experience bookings, about ₹${result.localBusinessDemand.indicativeLocalSpendInr.toLocaleString('en-IN')} (range ₹${result.localBusinessDemand.range})`,
    source: 'Campaign and capacity simulation',
    provenance: 'FORECAST',
    method: `Assumes ${Math.round(result.assumptions.experienceUptake * 100)} percent of incremental visitors book one listed experience.`,
  });

  return {
    data: { simulation: result },
    summary: `Scenario: ${result.additionalVisitors.toLocaleString('en-IN')} additional visitors to ${result.destinationName} over ${result.overDays} days.`,
    evidence,
    trace: trace(
      'simulateCampaign',
      `${options.destinationId}, +${options.additionalVisitors} over ${result.overDays} days`,
      'Projected accommodation, transport and local business pressure under stated assumptions',
      result.pressures.length,
      startedAt,
    ),
  } satisfies ToolResult<{ simulation: typeof result }>;
}

/* ------------------------- searchOfficialDocuments ------------------------ */

export function searchOfficialDocuments(options: { query: string; limit?: number }) {
  const startedAt = Date.now();
  const documents = getKnowledgeDocuments();
  const terms = options.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);

  const scored = documents
    .map((document) => {
      const haystack = `${document.title} ${document.text} ${document.tags.join(' ')}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { document, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 3);

  const official = getOfficialStatistics();

  const evidence: EvidenceItem[] = scored.map(({ document }) => ({
    label: document.title,
    value: `${document.text.slice(0, 220)}${document.text.length > 220 ? '…' : ''}`,
    source: document.sourceAuthority,
    provenance: getDataSource(document.sourceId)?.defaultProvenance ?? 'PUBLIC_EXTERNAL',
    period: formatLongDate(document.publishedAt),
  }));

  return {
    data: { documents: scored.map((row) => row.document), officialConnected: official.connected },
    summary:
      scored.length > 0
        ? `${scored.length} curated document${scored.length === 1 ? '' : 's'} matched. No official document repository is connected to this prototype.`
        : 'No curated document matched, and no official document repository is connected to this prototype.',
    evidence,
    trace: trace(
      'searchOfficialDocuments',
      options.query,
      'Searched the curated knowledge base. The official repository is not connected.',
      documents.length,
      startedAt,
    ),
  } satisfies ToolResult<{ documents: ReturnType<typeof getKnowledgeDocuments>; officialConnected: boolean }>;
}

/* --------------------------------- getEvents ------------------------------ */

export function getEventsNear(options: { destinationId: string; window: AnalysisWindow }) {
  const startedAt = Date.now();
  const events = getEventsFor(options.destinationId, options.window.from, options.window.to);

  const evidence: EvidenceItem[] = events.map((event) => ({
    label: event.name,
    value: `${formatLongDate(event.startAt)} to ${formatLongDate(event.endAt)}${event.expectedAttendance ? `, expected attendance ${event.expectedAttendance.toLocaleString('en-IN')}` : ''}`,
    source: 'Event calendar',
    provenance: event.provenance,
  }));

  return {
    data: { events },
    summary:
      events.length > 0
        ? `${events.length} event${events.length === 1 ? '' : 's'} fall inside the window.`
        : 'No seeded event falls inside the window.',
    evidence,
    trace: trace(
      'getEvents',
      options.destinationId,
      'Checked the event calendar against the analysis window',
      events.length,
      startedAt,
    ),
  } satisfies ToolResult<{ events: typeof events }>;
}

/* ------------------------------ forecastDemand ---------------------------- */

export function runForecast(options: { destinationId?: string; horizonDays?: number } = {}) {
  const startedAt = Date.now();
  const forecast = forecastDemand(options);

  const evidence: EvidenceItem[] = [
    {
      label: `${forecast.scope} projected change`,
      value:
        forecast.projectedChangePercent === null
          ? 'No baseline week to compare against'
          : `${forecast.projectedChangePercent > 0 ? '+' : ''}${forecast.projectedChangePercent}% over ${forecast.horizonDays} days`,
      source: 'Demand forecast',
      provenance: 'FORECAST',
      method: forecast.method,
    },
    {
      label: 'Fit quality',
      value: `The trend explains ${Math.round(forecast.fitQuality * 100)} percent of the variation in the retained history`,
      source: 'Demand forecast',
      provenance: 'FORECAST',
    },
    {
      label: 'Interval',
      value: `Plus or minus ${(forecast.residualStdDev * 2).toFixed(1)} weighted activity at day one, widening with the horizon`,
      source: 'Demand forecast',
      provenance: 'FORECAST',
    },
    ...forecast.eventsInHorizon.map((event) => ({
      label: `Event inside the horizon: ${event.name}`,
      value: 'Not modelled by the forecast',
      source: 'Event calendar',
      provenance: 'DEMO_SYNTHETIC' as const,
    })),
  ];

  return {
    data: { forecast },
    summary: `Projection for ${forecast.scope} over ${forecast.horizonDays} days, from a ninety day trend.`,
    evidence,
    trace: trace(
      'forecastDemand',
      `${options.destinationId ?? 'statewide'}, ${forecast.horizonDays} days`,
      'Fitted a least squares trend with measured weekday and weekend factors',
      forecast.history.length,
      startedAt,
    ),
  } satisfies ToolResult<{ forecast: typeof forecast }>;
}

/* ------------------------- infrastructureOpportunity ---------------------- */

export function runOpportunityAnalysis(options: { limit?: number } = {}) {
  const startedAt = Date.now();
  const window = currentWindow();
  const demand = computeDemand(window);
  const capacity = computeCapacity();
  const opportunities = findInfrastructureOpportunities({ demand, capacity }).slice(
    0,
    options.limit ?? 5,
  );

  const evidence: EvidenceItem[] = opportunities.map((row) => ({
    label: `${row.name} (${row.district})`,
    value: `gap score ${row.gapScore}, interest ${row.demandIndex} of 100, ${row.spareCapacity} places free across ${row.participatingBusinesses} participating business${row.participatingBusinesses === 1 ? '' : 'es'}`,
    source: 'Deterministic analytics engine',
    provenance: 'ESTIMATED',
    period: window.label,
    method: OPPORTUNITY_METHOD,
  }));

  return {
    data: { opportunities },
    summary:
      opportunities.length > 0
        ? `${opportunities[0]!.name} has the widest gap between interest and the supply that could serve it.`
        : 'No destination shows a supply gap in this window.',
    evidence,
    trace: trace(
      'infrastructureOpportunity',
      'statewide',
      `Compared interest against supply readiness for ${demand.length} destinations`,
      demand.length,
      startedAt,
    ),
  } satisfies ToolResult<{ opportunities: typeof opportunities }>;
}

/** Everything the router may call, for display in the interface. */
export const AUTHORISED_TOOLS = [
  { name: 'getDestinationMetrics', description: 'Demand index, trend and interaction mix per destination' },
  { name: 'compareDestinations', description: 'Demand, sentiment and reported capacity side by side' },
  { name: 'getSentimentSummary', description: 'Satisfaction and issue categories from tourist feedback' },
  { name: 'getAccommodationCapacity', description: 'Availability reported by participating partners' },
  { name: 'getCampaignMetrics', description: 'Campaign funnel from reach through to platform signals' },
  { name: 'recommendCampaignTargets', description: 'Ranked promotion candidates under a stated objective' },
  { name: 'simulateCampaign', description: 'Scenario projection of visitor load against reported capacity' },
  { name: 'searchOfficialDocuments', description: 'Curated knowledge base and method documentation' },
  { name: 'getEvents', description: 'Seeded event calendar for a destination' },
  { name: 'forecastDemand', description: 'Projection of platform interest, with its interval and limits' },
  {
    name: 'infrastructureOpportunity',
    description: 'Where interest exceeds the supply that could serve it',
  },
] as const;

export const listDestinationsForPicker = () =>
  getDestinations().map((destination) => ({ id: destination.id, name: destination.name }));
