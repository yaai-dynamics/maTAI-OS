import { roundTo } from '@/server/analytics/windows';
import type { Provenance } from '@/lib/provenance';
import type { BusinessType } from '@/lib/types';
import {
  getBusinesses,
  getDestinations,
  getExperiences,
  getLatestAccommodation,
} from '@/server/data/repository';

/**
 * Supply-side readiness.
 *
 * Every figure here covers participating partners only. That limit is part of
 * the result, not a footnote, because a spare-capacity claim is meaningless
 * without it (knowledge base doc-006).
 */

export const CAPACITY_COVERAGE_NOTE =
  'Covers verified, participating partners only. It is not a measure of the total tourism supply of the district.';

export interface DestinationCapacity {
  destinationId: string;
  name: string;
  district: string;
  /** Participating properties that reported availability. */
  reportingProperties: number;
  /**
   * Places reported by businesses that have registered but are not yet
   * verified. Shown separately so an officer can see what would become
   * available on verification, without it inflating the usable figure.
   */
  pendingVerificationCapacity: number;
  pendingVerificationProperties: number;
  totalProperties: number;
  totalCapacity: number;
  availableCapacity: number;
  occupancyRate: number | null;
  /** Bookable experiences currently marked available. */
  availableExperiences: number;
  totalExperiences: number;
  verifiedBusinesses: number;
  totalBusinesses: number;
  businessMix: Partial<Record<BusinessType, number>>;
  provenance: Provenance;
  coverageNote: string;
}

export function computeCapacity(): DestinationCapacity[] {
  const businesses = getBusinesses();
  const experiences = getExperiences();

  /**
   * Only a verified, participating business counts towards usable capacity.
   * A business can declare any number it likes; counting an unverified
   * self-report would let a destination look ready for a campaign it cannot
   * absorb, which is the exact failure this view exists to prevent.
   */
  const counts = new Set(
    businesses.filter((b) => b.status === 'PARTICIPATING' && b.verified).map((b) => b.id),
  );

  return getDestinations().map((destination) => {
    const destinationBusinesses = businesses.filter((b) => b.destinationId === destination.id);
    const allSnapshots = getLatestAccommodation(destination.id);
    const snapshots = allSnapshots.filter((s) => counts.has(s.businessId));
    const pending = allSnapshots.filter((s) => !counts.has(s.businessId));
    const destinationExperiences = experiences.filter((e) => e.destinationId === destination.id);

    const totalCapacity = snapshots.reduce((sum, s) => sum + s.totalCapacity, 0);
    const availableCapacity = snapshots.reduce((sum, s) => sum + s.availableCapacity, 0);

    const businessMix: Partial<Record<BusinessType, number>> = {};
    for (const business of destinationBusinesses) {
      businessMix[business.businessType] = (businessMix[business.businessType] ?? 0) + 1;
    }

    return {
      destinationId: destination.id,
      name: destination.name,
      district: destination.district,
      reportingProperties: snapshots.length,
      pendingVerificationCapacity: pending.reduce((sum, s) => sum + s.availableCapacity, 0),
      pendingVerificationProperties: pending.length,
      totalProperties: destinationBusinesses.filter(
        (b) => b.businessType === 'HOTEL' || b.businessType === 'HOMESTAY',
      ).length,
      totalCapacity,
      availableCapacity,
      occupancyRate:
        totalCapacity === 0 ? null : roundTo(1 - availableCapacity / totalCapacity, 3),
      availableExperiences: destinationExperiences.filter(
        (e) => e.availabilityStatus === 'AVAILABLE',
      ).length,
      totalExperiences: destinationExperiences.length,
      verifiedBusinesses: destinationBusinesses.filter((b) => b.verified).length,
      totalBusinesses: destinationBusinesses.length,
      businessMix,
      provenance: snapshots.length > 0 ? 'PARTNER_REPORTED' : 'DEMO_SYNTHETIC',
      coverageNote: CAPACITY_COVERAGE_NOTE,
    } satisfies DestinationCapacity;
  });
}

export interface StateCapacitySummary {
  participatingBusinesses: number;
  verifiedBusinesses: number;
  awaitingVerification: number;
  reportingProperties: number;
  totalCapacity: number;
  availableCapacity: number;
  pendingVerificationCapacity: number;
  occupancyRate: number | null;
  destinationsWithNoSupply: string[];
  coverageNote: string;
}

export function computeStateCapacity(): StateCapacitySummary {
  const rows = computeCapacity();
  const businesses = getBusinesses();
  const totalCapacity = rows.reduce((sum, row) => sum + row.totalCapacity, 0);
  const availableCapacity = rows.reduce((sum, row) => sum + row.availableCapacity, 0);

  return {
    participatingBusinesses: businesses.filter((b) => b.status === 'PARTICIPATING').length,
    verifiedBusinesses: businesses.filter((b) => b.verified).length,
    awaitingVerification: businesses.filter(
      (b) => b.status === 'PENDING_VERIFICATION' || b.status === 'INVITED',
    ).length,
    reportingProperties: rows.reduce((sum, row) => sum + row.reportingProperties, 0),
    totalCapacity,
    availableCapacity,
    pendingVerificationCapacity: rows.reduce(
      (sum, row) => sum + row.pendingVerificationCapacity,
      0,
    ),
    occupancyRate: totalCapacity === 0 ? null : roundTo(1 - availableCapacity / totalCapacity, 3),
    destinationsWithNoSupply: rows.filter((row) => row.totalBusinesses === 0).map((row) => row.name),
    coverageNote: CAPACITY_COVERAGE_NOTE,
  };
}
