/**
 * Deterministic pseudo random helpers.
 *
 * The prototype must reset to a known state for the demo, so no generated
 * record may depend on Math.random or on wall clock time.
 */

/** FNV-1a, used to turn a string seed into a 32 bit state. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks a key from a weight map, proportional to its weight. */
  weighted<T extends string>(weights: Readonly<Record<T, number>>): T;
  /** Small non negative integer count around a mean, via inverse transform. */
  poisson(mean: number): number;
}

/** mulberry32: small, fast and adequate for seeded demo data. */
export function createRng(seed: string | number): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    float: (min, max) => next() * (max - min) + min,
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick called with an empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (weights) => {
      const entries = Object.entries(weights) as [Extract<keyof typeof weights, string>, number][];
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      if (total <= 0) return entries[0]![0];
      let roll = next() * total;
      for (const [key, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return key;
      }
      return entries[entries.length - 1]![0];
    },
    poisson: (mean) => {
      if (mean <= 0) return 0;
      // Knuth's method. Means here are small, so the loop is short.
      const limit = Math.exp(-mean);
      let count = 0;
      let product = next();
      while (product > limit && count < 64) {
        count += 1;
        product *= next();
      }
      return count;
    },
  };

  return rng;
}
