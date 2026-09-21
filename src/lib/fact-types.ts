import type { FactType } from '@/lib/types';

/**
 * How a verified fact is described to a reader.
 *
 * These live in lib rather than beside the storyteller because three client
 * components render them. A client component importing them from
 * src/server/ai/storyteller would pull the whole server data layer — and now
 * the database driver — into the browser bundle.
 *
 * The distinction they carry is a product rule, not decoration: a visitor is
 * told whether something is documented, carried as oral tradition, or a
 * reading of the evidence, and the platform never flattens those into one
 * confident voice.
 */

export const FACT_TYPE_LABEL: Record<FactType, string> = {
  DOCUMENTED: 'Documented',
  ORAL_TRADITION: 'Oral tradition',
  INTERPRETATION: 'Interpretation',
  PRACTICAL: 'Practical',
};

export const FACT_TYPE_NOTE: Record<FactType, string> = {
  DOCUMENTED: 'Recorded in written or published sources.',
  ORAL_TRADITION: 'Carried as community tradition rather than documented event history.',
  INTERPRETATION: 'A reading of the evidence, not a settled conclusion.',
  PRACTICAL: 'Visiting guidance, subject to change on the day.',
};
