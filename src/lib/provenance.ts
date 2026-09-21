/**
 * Data provenance contract.
 *
 * Reference: CLAUDE.md §8, docs/03-user-flows.md §E, docs/04-data-model.md.
 *
 * Every number surfaced in a government view must be attributable to one of
 * these categories. Synthetic prototype data is never presented as official
 * tourism statistics.
 */

export const PROVENANCE_VALUES = [
  'OFFICIAL',
  'PARTNER_REPORTED',
  'PLATFORM_OBSERVED',
  'PUBLIC_EXTERNAL',
  'DEMO_SYNTHETIC',
  'ESTIMATED',
  'FORECAST',
] as const;

export type Provenance = (typeof PROVENANCE_VALUES)[number];

export interface ProvenanceDescriptor {
  /** Short label shown on badges. Text is always present — never colour alone. */
  label: string;
  /** Sentence shown in tooltips and the data source drawer. */
  description: string;
  /** How far a decision may lean on this category. */
  trustNote: string;
}

export const PROVENANCE: Record<Provenance, ProvenanceDescriptor> = {
  OFFICIAL: {
    label: 'Official',
    description:
      'Sourced from an authoritative government dataset or publication, with a stated period and coverage.',
    trustNote: 'Citable as an official figure when the period and coverage are quoted with it.',
  },
  PARTNER_REPORTED: {
    label: 'Partner reported',
    description:
      'Supplied by a participating tourism business such as a homestay, hotel, guide or operator.',
    trustNote: 'Covers participating partners only — not the full tourism supply of the state.',
  },
  PLATFORM_OBSERVED: {
    label: 'Platform observed',
    description:
      'Generated from anonymised interactions with this platform — searches, destination views, itinerary additions and check-ins.',
    trustNote: 'Measures interest and behaviour on this platform, not total visitor volume.',
  },
  PUBLIC_EXTERNAL: {
    label: 'Public / external',
    description: 'Obtained from a third-party public data source, feed or API.',
    trustNote: 'Quality depends on the external source; treat as a supporting signal.',
  },
  DEMO_SYNTHETIC: {
    label: 'Demo data',
    description:
      'Synthetic prototype data seeded for demonstration. It is not a tourism statistic and does not describe real visitors.',
    trustNote: 'Must never be presented, exported or quoted as an official or observed figure.',
  },
  ESTIMATED: {
    label: 'Estimated',
    description: 'Calculated from several underlying signals using a stated method.',
    trustNote: 'Carries the uncertainty of every input signal it combines.',
  },
  FORECAST: {
    label: 'Forecast',
    description: 'Model output projected from historical and current signals under stated assumptions.',
    trustNote: 'A scenario, not a measurement. Always read with its assumptions.',
  },
};

/** Categories that may never be described as measured fact. */
const MODELLED: ReadonlySet<Provenance> = new Set<Provenance>(['ESTIMATED', 'FORECAST']);

/** Categories that exist only because this is a prototype. */
const SYNTHETIC: ReadonlySet<Provenance> = new Set<Provenance>(['DEMO_SYNTHETIC']);

export const isModelled = (p: Provenance): boolean => MODELLED.has(p);
export const isSynthetic = (p: Provenance): boolean => SYNTHETIC.has(p);

/**
 * True when a figure may be quoted outside the platform as a real measurement.
 * Used to gate exports and briefing documents.
 */
export const isQuotableExternally = (p: Provenance): boolean =>
  p === 'OFFICIAL' || p === 'PARTNER_REPORTED' || p === 'PLATFORM_OBSERVED' || p === 'PUBLIC_EXTERNAL';

export const provenanceLabel = (p: Provenance): string => PROVENANCE[p].label;

/**
 * Ordering used when a metric combines several sources: the weakest input
 * determines how the combined figure must be labelled.
 */
const STRENGTH: Record<Provenance, number> = {
  OFFICIAL: 6,
  PARTNER_REPORTED: 5,
  PLATFORM_OBSERVED: 4,
  PUBLIC_EXTERNAL: 3,
  ESTIMATED: 2,
  FORECAST: 1,
  DEMO_SYNTHETIC: 0,
};

export function weakestProvenance(sources: readonly Provenance[]): Provenance {
  if (sources.length === 0) return 'ESTIMATED';
  return sources.reduce((weakest, current) =>
    STRENGTH[current] < STRENGTH[weakest] ? current : weakest,
  );
}

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export const CONFIDENCE_NOTE: Record<Confidence, string> = {
  HIGH: 'Strong verified data, consistent sources and a sufficient sample.',
  MEDIUM: 'Several platform or partner signals, with incomplete coverage.',
  LOW: 'Sparse data, largely inferred or synthetic. Treat as directional only.',
};

/**
 * Confidence is derived, never chosen to make a weak claim look stronger
 * (docs/05-ai-spec.md). A synthetic input caps confidence at MEDIUM.
 */
export function deriveConfidence(input: {
  sources: readonly Provenance[];
  sampleSize: number;
  consistent: boolean;
}): Confidence {
  const { sources, sampleSize, consistent } = input;
  const weakest = weakestProvenance(sources);

  if (sampleSize < 30 || weakest === 'FORECAST') return 'LOW';
  if (isSynthetic(weakest)) return sampleSize >= 120 && consistent ? 'MEDIUM' : 'LOW';
  if (!consistent) return 'MEDIUM';
  if (weakest === 'OFFICIAL' || weakest === 'PARTNER_REPORTED') return 'HIGH';
  return sampleSize >= 250 ? 'HIGH' : 'MEDIUM';
}
