import { HISTORY_DAYS, now } from '@/lib/config';
import { addDays, isWeekend, startOfUtcDay, toIsoDate } from '@/lib/date';
import type { Confidence } from '@/lib/provenance';
import { computeActivitySeries, DEMAND_WEIGHTS } from '@/server/analytics/demand';
import { makeWindow, roundTo } from '@/server/analytics/windows';
import { getDestination, getEventsFor, getInteractions } from '@/server/data/repository';

/**
 * Demand forecasting — roadmap Phase 4.
 *
 * Deliberately a simple, fully stated method rather than an opaque model:
 * ordinary least squares on daily weighted activity, plus a weekday and weekend
 * factor measured from the same history, with a prediction interval derived
 * from the residuals of the fit.
 *
 * The important part is what it refuses to do. The platform retains ninety days.
 * That is one season, so the forecast cannot see annual seasonality, festival
 * cycles or a monsoon effect, and it says so rather than projecting a trend line
 * into a period it has never observed. Confidence is capped accordingly and
 * falls away entirely past a short horizon.
 */

export const FORECAST_METHOD =
  'Least squares trend on daily weighted activity over the retained history, adjusted by measured weekday and weekend factors. The interval is plus or minus two standard deviations of the fit residuals, widened with the horizon. It is a projection of a ninety day trend, not a seasonal model.';

export const FORECAST_LIMITS = [
  'The platform retains ninety days, which is one season. The forecast cannot see annual seasonality.',
  'Festivals, weather and access disruption are not modelled. A seeded event inside the history inflates the trend it is fitted to.',
  'It projects interest expressed on this platform, not visitor numbers, and it cannot be converted into them.',
  'Beyond about two weeks the interval is wider than the signal, which is why longer horizons are not offered.',
];

/** Longest horizon the retained history can support without the interval swallowing the estimate. */
export const MAX_HORIZON_DAYS = 14;

export interface ForecastPoint {
  date: string;
  /** Central projection of weighted activity. */
  value: number;
  lower: number;
  upper: number;
}

export interface DemandForecast {
  destinationId?: string;
  scope: string;
  horizonDays: number;
  history: { date: string; value: number }[];
  points: ForecastPoint[];
  /** Change from the last observed week to the final forecast week. */
  projectedChangePercent: number | null;
  /** Slope per day in weighted activity. */
  trendPerDay: number;
  /** Standard deviation of the fit residuals, the basis of the interval. */
  residualStdDev: number;
  /** R squared of the fit, 0 to 1. Low means the trend explains little. */
  fitQuality: number;
  confidence: Confidence;
  confidenceReason: string;
  eventsInHorizon: { name: string; startAt: string }[];
  method: string;
  limits: string[];
}

interface Fit {
  slope: number;
  intercept: number;
  residualStdDev: number;
  rSquared: number;
}

function leastSquares(values: readonly number[]): Fit {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, residualStdDev: 0, rSquared: 0 };

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (i - meanX) * ((values[i] ?? 0) - meanY);
    denominator += (i - meanX) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  let residualSum = 0;
  let totalSum = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * i;
    residualSum += ((values[i] ?? 0) - predicted) ** 2;
    totalSum += ((values[i] ?? 0) - meanY) ** 2;
  }

  return {
    slope,
    intercept,
    residualStdDev: Math.sqrt(residualSum / Math.max(1, n - 2)),
    rSquared: totalSum === 0 ? 0 : Math.max(0, 1 - residualSum / totalSum),
  };
}

export function forecastDemand(options: { destinationId?: string; horizonDays?: number } = {}): DemandForecast {
  const horizonDays = Math.min(MAX_HORIZON_DAYS, Math.max(1, options.horizonDays ?? 14));
  const window = makeWindow(HISTORY_DAYS);
  const history = computeActivitySeries(window, options.destinationId);
  const destination = options.destinationId ? getDestination(options.destinationId) : undefined;

  const values = history.map((point) => point.value);
  const fit = leastSquares(values);

  // Weekday and weekend factors measured from the same history, so the shape of
  // a week is not assumed.
  const weekendValues = history.filter((point) => isWeekend(new Date(point.date))).map((p) => p.value);
  const weekdayValues = history.filter((point) => !isWeekend(new Date(point.date))).map((p) => p.value);
  const mean = (list: number[]) =>
    list.length === 0 ? 0 : list.reduce((sum, value) => sum + value, 0) / list.length;
  const overallMean = mean(values) || 1;
  const weekendFactor = weekendValues.length > 0 ? mean(weekendValues) / overallMean : 1;
  const weekdayFactor = weekdayValues.length > 0 ? mean(weekdayValues) / overallMean : 1;

  const lastIndex = values.length - 1;
  const points: ForecastPoint[] = [];

  for (let step = 1; step <= horizonDays; step += 1) {
    const date = addDays(startOfUtcDay(now()), step);
    const base = fit.intercept + fit.slope * (lastIndex + step);
    const seasonal = isWeekend(date) ? weekendFactor : weekdayFactor;
    const central = Math.max(0, base * seasonal);

    // The interval widens with the horizon: a projection three days out is a
    // far smaller claim than one two weeks out, and the chart should show that.
    const spread = 2 * fit.residualStdDev * Math.sqrt(1 + step / 7);

    points.push({
      date: toIsoDate(date),
      value: roundTo(central, 1),
      lower: roundTo(Math.max(0, central - spread), 1),
      upper: roundTo(central + spread, 1),
    });
  }

  const lastWeek = values.slice(-7).reduce((sum, value) => sum + value, 0);
  const forecastWeek = points.slice(-7).reduce((sum, point) => sum + point.value, 0);
  const projectedChangePercent =
    lastWeek === 0 ? null : roundTo(((forecastWeek - lastWeek) / lastWeek) * 100, 1);

  const sampleSize = getInteractions({
    from: window.from,
    to: window.to,
    ...(options.destinationId ? { destinationId: options.destinationId } : {}),
  }).length;

  // A forecast is never better than MEDIUM: it is a projection, not a
  // measurement, and this history is too short to support a seasonal claim.
  const confidence: Confidence =
    fit.rSquared >= 0.3 && sampleSize >= 400 && horizonDays <= 7 ? 'MEDIUM' : 'LOW';

  const eventsInHorizon = options.destinationId
    ? getEventsFor(options.destinationId, now(), addDays(now(), horizonDays)).map((event) => ({
        name: event.name,
        startAt: event.startAt,
      }))
    : [];

  return {
    ...(options.destinationId ? { destinationId: options.destinationId } : {}),
    scope: destination?.name ?? 'Manipur',
    horizonDays,
    history,
    points,
    projectedChangePercent,
    trendPerDay: roundTo(fit.slope, 3),
    residualStdDev: roundTo(fit.residualStdDev, 2),
    fitQuality: roundTo(fit.rSquared, 3),
    confidence,
    confidenceReason:
      fit.rSquared < 0.3
        ? `The trend explains only ${Math.round(fit.rSquared * 100)} percent of the variation in the history, so day to day noise dominates the projection.`
        : `The trend explains ${Math.round(fit.rSquared * 100)} percent of the variation across ${sampleSize.toLocaleString('en-IN')} interactions, but ninety days cannot support a seasonal claim.`,
    eventsInHorizon,
    method: FORECAST_METHOD,
    limits: FORECAST_LIMITS,
  };
}

/* -------------------------------------------------------------------------- */
/* Infrastructure opportunity analysis                                        */
/* -------------------------------------------------------------------------- */

export interface InfrastructureOpportunity {
  destinationId: string;
  name: string;
  district: string;
  demandIndex: number;
  trendPercent: number | null;
  /** Reported places free among verified partners. */
  spareCapacity: number;
  participatingBusinesses: number;
  bookableExperiences: number;
  /** 0 to 100. Higher means more interest relative to what can serve it. */
  gapScore: number;
  missing: string[];
  recommendation: string;
}

export const OPPORTUNITY_METHOD =
  'Interest expressed on the platform set against the supply that could serve it: reported spare places among verified partners, the number of participating businesses, and the number of bookable experiences. A high score means visitors are looking and there is little for them to arrive to. It is a development priority, not a promotion target.';

export function findInfrastructureOpportunities(input: {
  demand: readonly { destinationId: string; name: string; district: string; demandIndex: number; trendPercent: number | null }[];
  capacity: readonly {
    destinationId: string;
    availableCapacity: number;
    totalBusinesses: number;
    availableExperiences: number;
  }[];
}): InfrastructureOpportunity[] {
  const capacityById = new Map(input.capacity.map((row) => [row.destinationId, row]));

  return input.demand
    .map((row) => {
      const supply = capacityById.get(row.destinationId);
      const spare = supply?.availableCapacity ?? 0;
      const businesses = supply?.totalBusinesses ?? 0;
      const experiences = supply?.availableExperiences ?? 0;

      // Supply readiness on a 0 to 1 scale, saturating so that a well supplied
      // destination cannot score as an opportunity however popular it is.
      const readiness =
        Math.min(1, spare / 20) * 0.5 +
        Math.min(1, businesses / 4) * 0.3 +
        Math.min(1, experiences / 3) * 0.2;

      const gapScore = roundTo(row.demandIndex * (1 - readiness), 1);

      const missing: string[] = [];
      if (spare === 0) missing.push('no verified partner reporting availability');
      else if (spare < 20) missing.push(`only ${spare} reported places free`);
      if (businesses === 0) missing.push('no participating business');
      else if (businesses < 4) missing.push(`only ${businesses} participating business${businesses === 1 ? '' : 'es'}`);
      if (experiences === 0) missing.push('nothing bookable');
      else if (experiences < 3) missing.push(`only ${experiences} bookable experience${experiences === 1 ? '' : 's'}`);

      return {
        destinationId: row.destinationId,
        name: row.name,
        district: row.district,
        demandIndex: row.demandIndex,
        trendPercent: row.trendPercent,
        spareCapacity: spare,
        participatingBusinesses: businesses,
        bookableExperiences: experiences,
        gapScore,
        missing,
        recommendation:
          missing.length === 0
            ? 'Supply here can serve current interest. This is a promotion candidate rather than a development one.'
            : `Onboarding before promotion: ${missing.join(', ')}. Promoting into this gap would send visitors somewhere that cannot host them.`,
      } satisfies InfrastructureOpportunity;
    })
    .filter((row) => row.demandIndex > 0)
    .sort((a, b) => b.gapScore - a.gapScore);
}

/* -------------------------------------------------------------------------- */
/* Campaign optimisation                                                      */
/* -------------------------------------------------------------------------- */

export interface CampaignLever {
  lever: string;
  currentState: string;
  expectedEffect: string;
  /** Relative priority, 0 to 100, from the deterministic comparison below. */
  priority: number;
  rationale: string;
}

export const OPTIMISATION_METHOD =
  'Compares the levers available on a campaign against the state of the destination it targets. Priority is assigned from what is actually constraining the outcome, not from what is easiest to change. Nothing here predicts a result; it ranks what would most likely be limiting one.';

export interface CampaignOptimisation {
  campaignId: string;
  campaignName: string;
  destinationName: string;
  levers: CampaignLever[];
  method: string;
  caveat: string;
}

export function optimiseCampaign(input: {
  campaignId: string;
  campaignName: string;
  destinationName: string;
  publishedContent: number;
  shortlistedCreators: number;
  daysRemaining: number;
  spareCapacity: number;
  openIssue: string | null;
  platformSignals: number;
  reachViews: number;
}): CampaignOptimisation {
  const levers: CampaignLever[] = [];

  if (input.openIssue) {
    levers.push({
      lever: 'Fix the service problem first',
      currentState: input.openIssue,
      expectedEffect:
        'Removes the thing that caps what any promotion can achieve, and improves every future visit rather than only this campaign.',
      priority: 95,
      rationale:
        'An open action-level issue at the destination means spend on promotion is buying arrivals into a known bad experience.',
    });
  }

  if (input.spareCapacity < 10) {
    levers.push({
      lever: 'Onboard more accommodation before scaling',
      currentState: `${input.spareCapacity} reported places free among verified partners`,
      expectedEffect: 'Raises the ceiling on how many additional visitors the destination can absorb.',
      priority: 85,
      rationale:
        'Capacity, not awareness, is the binding constraint. More reach against this supply produces disappointed visitors.',
    });
  }

  if (input.publishedContent === 0) {
    levers.push({
      lever: 'Get the first content published',
      currentState: 'Nothing published yet',
      expectedEffect: 'Until something is published there is nothing for the funnel to measure.',
      priority: 90,
      rationale: 'The campaign cannot be evaluated, let alone optimised, with no published content.',
    });
  } else if (input.reachViews > 0 && input.platformSignals === 0) {
    levers.push({
      lever: 'Add a tracked destination link to the content',
      currentState: `${input.reachViews.toLocaleString('en-IN')} views, no platform signal attributed`,
      expectedEffect: 'Connects reach to tourism outcomes so the campaign can be evaluated at all.',
      priority: 80,
      rationale:
        'Reach without an attributable outcome cannot distinguish a campaign that worked from one that did not.',
    });
  }

  if (input.shortlistedCreators < 3 && input.daysRemaining > 3) {
    levers.push({
      lever: 'Widen the creator shortlist',
      currentState: `${input.shortlistedCreators} creator${input.shortlistedCreators === 1 ? '' : 's'} engaged`,
      expectedEffect: 'More independent audiences rather than more posts to the same one.',
      priority: 60,
      rationale:
        'A single creator reaches one audience repeatedly. Breadth across audiences moves a destination further than frequency within one.',
    });
  }

  if (input.daysRemaining > 0 && input.daysRemaining < 7) {
    levers.push({
      lever: 'Extend the window',
      currentState: `${input.daysRemaining} day${input.daysRemaining === 1 ? '' : 's'} remaining`,
      expectedEffect:
        'A window under a week cannot be separated from ordinary variation, so the campaign cannot be evaluated even if it worked.',
      priority: 55,
      rationale: 'Measurement needs a window long enough to compare against.',
    });
  }

  if (levers.length === 0) {
    levers.push({
      lever: 'Run it as planned and set a comparison',
      currentState: 'No constraint identified',
      expectedEffect:
        'Nominating a comparable destination that is not promoted is what would let the next evaluation support an attribution claim.',
      priority: 50,
      rationale: 'Nothing is obviously limiting this campaign. The limit is on what can be concluded from it.',
    });
  }

  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    destinationName: input.destinationName,
    levers: levers.sort((a, b) => b.priority - a.priority),
    method: OPTIMISATION_METHOD,
    caveat:
      'These are ranked constraints, not predicted uplifts. The platform does not estimate how much a lever would move the outcome, because it has no comparison data that would support such a number.',
  };
}

export const WEIGHTED_ACTIVITY_NOTE = `Weighted activity applies the demand index weighting: views and searches ${DEMAND_WEIGHTS.DESTINATION_VIEW}, navigation starts ${DEMAND_WEIGHTS.NAVIGATION_START}, itinerary additions ${DEMAND_WEIGHTS.ITINERARY_ADD}, check-ins ${DEMAND_WEIGHTS.QR_CHECKIN}.`;
