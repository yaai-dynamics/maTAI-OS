import { describe, expect, it } from 'vitest';

import { DEMO_NOW, HISTORY_DAYS } from '@/lib/config';
import { seed } from '@/server/data/seed';
import { generateSignals } from '@/server/data/generate';

/**
 * Referential integrity and volume checks on the seeded dataset.
 * Prototype volumes follow docs/04-data-model.md.
 */

const signals = generateSignals(seed);

describe('seed referential integrity', () => {
  const destinationIds = new Set(seed.destinations.map((d) => d.id));
  const districtIds = new Set(seed.districts.map((d) => d.id));
  const businessIds = new Set(seed.businesses.map((b) => b.id));
  const creatorIds = new Set(seed.creators.map((c) => c.id));
  const campaignIds = new Set(seed.campaigns.map((c) => c.id));
  const contentIds = new Set(seed.campaignContent.map((c) => c.id));
  const sourceIds = new Set(seed.dataSources.map((s) => s.id));
  const factIds = new Set(seed.verifiedFacts.map((f) => f.id));

  it('links every destination to a known district', () => {
    for (const destination of seed.destinations) {
      expect(districtIds, `${destination.id} districtId`).toContain(destination.districtId);
      expect(seed.districts.find((d) => d.id === destination.districtId)?.name).toBe(
        destination.district,
      );
    }
  });

  it('links every child record to a known destination', () => {
    for (const row of [
      ...seed.verifiedFacts,
      ...seed.experiences,
      ...seed.businesses,
      ...seed.events,
      ...seed.feedback,
      ...seed.heritageExperiences,
    ]) {
      expect(destinationIds, `${row.id} destinationId`).toContain(row.destinationId);
    }
    for (const campaign of seed.campaigns) {
      expect(destinationIds, `${campaign.id} destinationId`).toContain(campaign.destinationId);
    }
  });

  it('links experiences, applications, content and metrics to known parents', () => {
    for (const experience of seed.experiences) {
      expect(businessIds, `${experience.id} businessId`).toContain(experience.businessId);
    }
    for (const application of seed.applications) {
      expect(campaignIds).toContain(application.campaignId);
      expect(creatorIds).toContain(application.creatorId);
    }
    for (const content of seed.campaignContent) {
      expect(campaignIds).toContain(content.campaignId);
      expect(creatorIds).toContain(content.creatorId);
    }
    for (const metric of seed.campaignMetrics) {
      expect(contentIds).toContain(metric.campaignContentId);
      expect(campaignIds).toContain(metric.campaignId);
    }
  });

  it('links every fact and document to a declared data source', () => {
    for (const fact of seed.verifiedFacts) expect(sourceIds).toContain(fact.sourceId);
    for (const document of seed.knowledgeDocuments) expect(sourceIds).toContain(document.sourceId);
    for (const event of seed.events) expect(sourceIds).toContain(event.sourceId);
  });

  it('links every heritage layer to facts that exist', () => {
    for (const experience of seed.heritageExperiences) {
      for (const layer of experience.layers) {
        expect(layer.factIds.length).toBeGreaterThan(0);
        for (const id of layer.factIds) expect(factIds, `${layer.id} factId`).toContain(id);
      }
    }
  });

  it('gives every destination a generation profile', () => {
    const profiled = new Set(seed.signalProfiles.map((p) => p.destinationId));
    for (const destination of seed.destinations) {
      expect(profiled, `${destination.id} profile`).toContain(destination.id);
    }
  });
});

describe('seed volumes follow the prototype guidance', () => {
  it('seeds 10 to 15 destinations', () => {
    expect(seed.destinations.length).toBeGreaterThanOrEqual(10);
    expect(seed.destinations.length).toBeLessThanOrEqual(15);
  });

  it('seeds 20 to 50 businesses', () => {
    expect(seed.businesses.length).toBeGreaterThanOrEqual(20);
    expect(seed.businesses.length).toBeLessThanOrEqual(50);
  });

  it('seeds 15 to 20 creators', () => {
    expect(seed.creators.length).toBeGreaterThanOrEqual(15);
    expect(seed.creators.length).toBeLessThanOrEqual(20);
  });

  it('seeds 4 to 5 campaigns', () => {
    expect(seed.campaigns.length).toBeGreaterThanOrEqual(4);
    expect(seed.campaigns.length).toBeLessThanOrEqual(5);
  });

  /**
   * docs/04-data-model.md suggests 300 to 1000 interactions and 100 to 300
   * feedback items. At that volume a 30 day window holds roughly 20 to 70
   * interactions per destination, where a single quiet week swings the trend by
   * tens of percent: every destination fired a "rising sharply" alert and the
   * promotion ranking was led by small sample artefacts. The dataset is
   * therefore generated an order of magnitude larger so window comparisons are
   * stable, while staying unmistakably a prototype. The doc figure is kept as
   * the floor. See docs/09-implementation-notes.md.
   */
  it('generates enough interactions for stable window comparisons', () => {
    expect(signals.interactions.length).toBeGreaterThanOrEqual(300);
    expect(signals.interactions.length).toBeLessThanOrEqual(12000);
  });

  it('generates enough feedback for issue analysis', () => {
    const total = signals.feedback.length + seed.feedback.length;
    expect(total).toBeGreaterThanOrEqual(100);
    expect(total).toBeLessThanOrEqual(3000);
  });
});

describe('generated signals', () => {
  it('is deterministic across runs', () => {
    const again = generateSignals(seed);
    expect(again.interactions.length).toBe(signals.interactions.length);
    expect(again.interactions[0]).toEqual(signals.interactions[0]);
    expect(again.feedback.at(-1)).toEqual(signals.feedback.at(-1));
  });

  it('labels every generated interaction as demo data', () => {
    for (const interaction of signals.interactions) {
      expect(interaction.provenance).toBe('DEMO_SYNTHETIC');
    }
  });

  it('labels partner availability as partner reported', () => {
    for (const snapshot of signals.accommodationSnapshots) {
      expect(snapshot.provenance).toBe('PARTNER_REPORTED');
      expect(snapshot.availableCapacity).toBeLessThanOrEqual(snapshot.totalCapacity);
    }
  });

  it('keeps every interaction inside the history window', () => {
    const timestamps = signals.interactions.map((i) => new Date(i.timestamp).getTime());
    const spanDays = (Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBeLessThanOrEqual(HISTORY_DAYS);
  });

  /**
   * A platform must not hold records timestamped in the future. Before this was
   * enforced, the generator produced interactions later in the current day than
   * the demo clock, which made any window ending at "now" disagree with the
   * history series.
   */
  it('never timestamps a record after the demo clock', () => {
    for (const interaction of signals.interactions) {
      expect(new Date(interaction.timestamp).getTime(), interaction.id).toBeLessThanOrEqual(
        DEMO_NOW.getTime(),
      );
    }
    for (const entry of signals.feedback) {
      expect(new Date(entry.createdAt).getTime(), entry.id).toBeLessThanOrEqual(DEMO_NOW.getTime());
    }
    for (const enquiry of signals.enquiries) {
      expect(new Date(enquiry.createdAt).getTime(), enquiry.id).toBeLessThanOrEqual(
        DEMO_NOW.getTime(),
      );
    }
  });

  it('attributes some interactions to the completed Ukhrul campaign', () => {
    const attributed = signals.interactions.filter((i) => i.campaignId === 'camp-000');
    expect(attributed.length).toBeGreaterThan(0);
    for (const interaction of attributed) {
      expect(interaction.destinationId).toBe('dest-ukhrul');
    }
  });

  it('never attributes interactions to a draft campaign', () => {
    const draftIds = seed.campaigns.filter((c) => c.status === 'DRAFT').map((c) => c.id);
    const attributed = signals.interactions.filter(
      (i) => i.campaignId !== undefined && draftIds.includes(i.campaignId),
    );
    expect(attributed).toHaveLength(0);
  });
});
