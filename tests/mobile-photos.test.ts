import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import credits from '@data/destination-photos.json';
import { creditLine, photoFor } from '@/lib/mobile/photos';
import { getDestination, getDestinations } from '@/server/data/repository';

describe('destination photos', () => {
  const ids = Object.keys(credits);

  it('belong to real destinations and are on disk at both sizes', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getDestination(id), id).toBeDefined();
      const photo = photoFor(id)!;
      expect(existsSync(`public${photo.hd}`), photo.hd).toBe(true);
      expect(existsSync(`public${photo.sm}`), photo.sm).toBe(true);
    }
  });

  it('always carry an author and a licence, and a Commons file page unless the team supplied them', () => {
    for (const id of ids) {
      const { credit } = photoFor(id)!;
      expect(credit.author.length, id).toBeGreaterThan(0);
      expect(credit.license.length, id).toBeGreaterThan(0);
      if (credit.source) expect(credit.source, id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      else expect(credit.author, id).not.toBe('Unknown author');
      expect(creditLine(credit)).toContain(credit.license);
    }
  });

  it('covers every destination, and nothing that is not one', () => {
    expect(ids.sort()).toEqual(getDestinations().map((destination) => destination.id).sort());
    expect(photoFor('dest-not-real')).toBeUndefined();
  });
});
