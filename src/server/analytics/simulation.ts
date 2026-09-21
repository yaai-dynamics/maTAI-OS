import type { Provenance } from '@/lib/provenance';
import { getDestination, getExperiencesFor } from '@/server/data/repository';
import { computeCapacity } from '@/server/analytics/capacity';
import { roundTo } from '@/server/analytics/windows';

/**
 * Campaign and capacity simulation.
 *
 * This is a scenario model, not a measurement. Every assumption is returned
 * with the result and shown in the interface, and the output is labelled
 * FORECAST everywhere it appears.
 */

export interface SimulationAssumptions {
  /** Nights an incremental visitor stays in the district. */
  averageStayNights: number;
  /** Share of incremental visitors who use a participating partner property. */
  participatingPartnerShare: number;
  /** People per arriving vehicle. */
  averageGroupSize: number;
  /** Share of incremental visitors who book a local experience. */
  experienceUptake: number;
  /** Plus or minus band applied to every projected figure. */
  uncertaintyBand: number;
}

export const DEFAULT_ASSUMPTIONS: SimulationAssumptions = {
  averageStayNights: 2,
  participatingPartnerShare: 0.35,
  averageGroupSize: 2.6,
  experienceUptake: 0.4,
  uncertaintyBand: 0.35,
};

export interface SimulationInput {
  destinationId: string;
  additionalVisitors: number;
  overDays?: number;
  assumptions?: Partial<SimulationAssumptions>;
}

export interface SimulationPressure {
  label: string;
  value: string;
  range: string;
  /** 0 to 1, where 1 means reported partner supply is fully consumed. */
  utilisation: number | null;
  reading: 'COMFORTABLE' | 'TIGHT' | 'OVER_CAPACITY' | 'UNKNOWN';
  note: string;
}

export interface SimulationResult {
  destinationId: string;
  destinationName: string;
  additionalVisitors: number;
  overDays: number;
  assumptions: SimulationAssumptions;
  pressures: SimulationPressure[];
  localBusinessDemand: {
    estimatedExperienceBookings: number;
    indicativeLocalSpendInr: number;
    range: string;
  };
  mitigations: string[];
  provenance: Provenance;
  caveats: string[];
}

const band = (value: number, uncertainty: number): string =>
  `${Math.round(value * (1 - uncertainty)).toLocaleString('en-IN')} to ${Math.round(value * (1 + uncertainty)).toLocaleString('en-IN')}`;

function reading(utilisation: number | null): SimulationPressure['reading'] {
  if (utilisation === null) return 'UNKNOWN';
  if (utilisation > 1) return 'OVER_CAPACITY';
  if (utilisation > 0.75) return 'TIGHT';
  return 'COMFORTABLE';
}

export function simulateCampaign(input: SimulationInput): SimulationResult | undefined {
  const destination = getDestination(input.destinationId);
  if (!destination) return undefined;

  const overDays = input.overDays ?? 30;
  const assumptions: SimulationAssumptions = { ...DEFAULT_ASSUMPTIONS, ...input.assumptions };
  const capacity = computeCapacity().find((row) => row.destinationId === input.destinationId);

  const visitors = input.additionalVisitors;

  /* Accommodation ------------------------------------------------------- */
  const bedNightsNeeded = visitors * assumptions.averageStayNights * assumptions.participatingPartnerShare;
  const reportedBedNights = (capacity?.totalCapacity ?? 0) * overDays;
  const alreadyOccupied = reportedBedNights * (capacity?.occupancyRate ?? 0);
  const spareBedNights = Math.max(0, reportedBedNights - alreadyOccupied);
  const accommodationUtilisation =
    reportedBedNights === 0 ? null : roundTo(bedNightsNeeded / Math.max(1, spareBedNights), 2);

  /* Transport ----------------------------------------------------------- */
  const vehicles = visitors / assumptions.averageGroupSize;
  const vehiclesPerDay = vehicles / overDays;

  /* Local business ------------------------------------------------------ */
  const experiences = getExperiencesFor(input.destinationId);
  const averagePrice =
    experiences.length === 0
      ? 0
      : Math.round(experiences.reduce((sum, e) => sum + e.price, 0) / experiences.length);
  const bookings = visitors * assumptions.experienceUptake;
  const indicativeSpend = bookings * averagePrice;

  const pressures: SimulationPressure[] = [
    {
      label: 'Accommodation with participating partners',
      value:
        reportedBedNights === 0
          ? 'No participating property reporting'
          : `${Math.round(bedNightsNeeded).toLocaleString('en-IN')} bed nights needed against ${Math.round(spareBedNights).toLocaleString('en-IN')} spare`,
      range: band(bedNightsNeeded, assumptions.uncertaintyBand),
      utilisation: accommodationUtilisation,
      reading: reading(accommodationUtilisation),
      note:
        reportedBedNights === 0
          ? 'No participating accommodation reports availability here, so accommodation pressure cannot be projected. Onboard partners before promoting.'
          : capacity?.coverageNote ?? '',
    },
    {
      label: 'Arriving vehicles',
      value: `${Math.round(vehicles).toLocaleString('en-IN')} vehicles, about ${vehiclesPerDay.toFixed(1)} per day`,
      range: band(vehicles, assumptions.uncertaintyBand),
      utilisation: null,
      reading: 'UNKNOWN',
      note: 'Road capacity is not modelled. This is arrival volume, not congestion.',
    },
    {
      label: 'Bookable experience places',
      value: `${Math.round(bookings).toLocaleString('en-IN')} bookings across ${experiences.length} listed experience${experiences.length === 1 ? '' : 's'}`,
      range: band(bookings, assumptions.uncertaintyBand),
      utilisation: null,
      reading: experiences.length === 0 ? 'UNKNOWN' : 'COMFORTABLE',
      note:
        experiences.length === 0
          ? 'No experiences are listed here yet, so incremental visitors would have nothing bookable to reach.'
          : 'Assumes listed experiences can add sessions. Individual providers may not scale.',
    },
  ];

  const mitigations: string[] = [];
  if (accommodationUtilisation !== null && accommodationUtilisation > 0.75) {
    mitigations.push('Spread the campaign window rather than concentrating arrivals in a single fortnight.');
    mitigations.push('Onboard additional homestays before the campaign opens.');
  }
  if (destination.ecoSensitivity === 'HIGH') {
    mitigations.push('Carry responsible visit guidance inside the creative brief, not as a footnote.');
    mitigations.push('Avoid the peak ecological window and promote the shoulder period instead.');
  }
  if (experiences.length < 3) {
    mitigations.push('List more local experiences so incremental visitors have somewhere to spend locally.');
  }
  if (capacity && capacity.reportingProperties === 0) {
    mitigations.push('Treat this as a capacity development candidate rather than a promotion target.');
  }
  mitigations.push('Pair the campaign with a nearby destination to distribute arrivals across the district.');

  return {
    destinationId: destination.id,
    destinationName: destination.name,
    additionalVisitors: visitors,
    overDays,
    assumptions,
    pressures,
    localBusinessDemand: {
      estimatedExperienceBookings: Math.round(bookings),
      indicativeLocalSpendInr: Math.round(indicativeSpend),
      range: band(indicativeSpend, assumptions.uncertaintyBand),
    },
    mitigations: [...new Set(mitigations)],
    provenance: 'FORECAST',
    caveats: [
      'This is a scenario under stated assumptions, not a prediction of what will happen.',
      'Accommodation pressure covers participating partners only and ignores unregistered supply.',
      'Road, water and waste capacity are not modelled.',
      'The prototype has no official visitor series to calibrate the assumptions against.',
    ],
  };
}
