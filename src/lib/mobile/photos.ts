import credits from '@data/destination-photos.json';

/**
 * Real photographs for the mobile app, downloaded once from Wikimedia Commons
 * by scripts/fetch-destination-photos.mjs and served from public/photos, so
 * they work offline and never depend on Wikipedia's rate limits.
 *
 * Every photograph carries its author, licence and file page, which the app
 * shows as a credit. A team-supplied photograph (no file page) is credited
 * in data/destination-photos.json by hand. A destination with no suitable
 * photograph has none here, and keeps its generated artwork.
 */

export interface PhotoCredit {
  article: string;
  file: string;
  author: string;
  license: string;
  /** The file page on Commons. Empty for a photograph the team supplied. */
  source: string;
}

export interface DestinationPhoto {
  /** 1280px wide, for heroes. */
  hd: string;
  /** 500px wide, for cards and rows. */
  sm: string;
  credit: PhotoCredit;
}

const CREDITS = credits as Record<string, PhotoCredit>;

export function photoFor(destinationId: string): DestinationPhoto | undefined {
  const credit = CREDITS[destinationId];
  if (!credit) return undefined;
  return { hd: `/photos/${destinationId}.jpg`, sm: `/photos/${destinationId}-sm.jpg`, credit };
}

/** "Photo: Haoreima, CC BY-SA 4.0" */
export const creditLine = (credit: PhotoCredit): string => `Photo: ${credit.author}, ${credit.license}`;
