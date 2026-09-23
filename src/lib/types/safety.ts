import { z } from 'zod';
import { provenanceSchema } from '@/lib/types/core';

/**
 * Emergency and safety reference data.
 *
 * Only numbers that genuinely exist are listed. India's short codes (112, 108,
 * 100 …) are national and verifiable, so they carry OFFICIAL. A facility with
 * no published number carries none: the page sends the visitor to 112 rather
 * than to a number nobody answers. Coordinates are district-level and are
 * labelled as approximate wherever a distance is shown.
 */

export const emergencyServiceSchema = z.enum([
  'ALL',
  'POLICE',
  'MEDICAL',
  'FIRE',
  'TOURIST',
  'WOMEN',
  'CHILD',
  'DISASTER',
]);
export type EmergencyService = z.infer<typeof emergencyServiceSchema>;

export const EMERGENCY_SERVICE_LABEL: Record<EmergencyService, string> = {
  ALL: 'All emergencies',
  POLICE: 'Police',
  MEDICAL: 'Ambulance',
  FIRE: 'Fire',
  TOURIST: 'Tourist helpline',
  WOMEN: 'Women',
  CHILD: 'Child',
  DISASTER: 'Disaster',
};

export const emergencyContactSchema = z.object({
  id: z.string(),
  service: emergencyServiceSchema,
  name: z.string(),
  /** Dialled as given. Short codes work from any phone, including without a SIM. */
  number: z.string(),
  description: z.string(),
  /** NATIONAL numbers work anywhere in India; STATE numbers are Manipur's own. */
  scope: z.enum(['NATIONAL', 'STATE']),
  /** Listed first, and rendered as the primary action. */
  primary: z.boolean().default(false),
  languages: z.array(z.string()).default([]),
  provenance: provenanceSchema,
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const facilityKindSchema = z.enum(['HOSPITAL', 'POLICE', 'TOURIST_OFFICE']);
export type FacilityKind = z.infer<typeof facilityKindSchema>;

export const FACILITY_KIND_LABEL: Record<FacilityKind, string> = {
  HOSPITAL: 'Hospital',
  POLICE: 'Police',
  TOURIST_OFFICE: 'Tourist office',
};

export const safetyFacilitySchema = z.object({
  id: z.string(),
  kind: facilityKindSchema,
  name: z.string(),
  districtId: z.string(),
  /** Approximate: good enough to sort by distance and to open directions. */
  latitude: z.number(),
  longitude: z.number(),
  /** Where the coordinate came from, so the UI can say how precise it is. */
  precision: z.enum(['MAPPED', 'DISTRICT_CENTRE']),
  note: z.string().optional(),
  provenance: provenanceSchema,
});
export type SafetyFacility = z.infer<typeof safetyFacilitySchema>;
