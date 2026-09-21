'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { now } from '@/lib/config';
import { toIsoDate } from '@/lib/date';
import {
  businessTypeSchema,
  tourismBusinessSchema,
  type AccommodationSnapshot,
  type CampaignContent,
  type Enquiry,
  type TourismBusiness,
} from '@/lib/types';
import { can, refusalMessage } from '@/lib/roles';
import { isEmailRegistered } from '@/server/auth/accounts';
import { credentialsSchema, openAccountAndSignIn } from '@/server/auth/registration';
import { getActingBusinessId, getGovernmentRole, NOT_SIGNED_IN } from '@/server/auth/session';
import {
  getBusiness,
  getCampaignContent,
  getDestination,
  getEnquiries,
} from '@/server/data/repository';
import {
  nextId,
  recordAvailability,
  registerBusiness,
  updateBusiness,
  updateContent,
  updateEnquiry,
} from '@/server/data/store';

/**
 * Partner-side writes — roadmap Phase 1 (pilot).
 *
 * Three of the Phase 1 items need a business-facing surface: hotel and homestay
 * availability reporting, verified business onboarding, and basic enquiry
 * handling. This is that surface.
 *
 * Availability reported here is PARTNER_REPORTED and flows straight into the
 * capacity view the department uses, which is why every aggregate built on it
 * carries the participating-partners-only caveat.
 *
 * The acting business is the one bound to the signed-in partner account. It is
 * never read from the request: a business id in a form is a claim anyone can
 * make, and accepting it would let any caller report capacity for any
 * homestay in the state.
 */

const availabilityInput = z.object({
  date: z.string().min(4),
  totalCapacity: z.coerce.number().int().min(0).max(10_000),
  availableCapacity: z.coerce.number().int().min(0).max(10_000),
});

export async function reportAvailability(
  input: unknown,
): Promise<{ ok: boolean; error?: string; snapshot?: AccommodationSnapshot }> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const parsed = availabilityInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter the total and available places.' };

  const business = getBusiness(businessId);
  if (!business) return { ok: false, error: 'That business is not on the platform.' };

  if (parsed.data.availableCapacity > parsed.data.totalCapacity) {
    return { ok: false, error: 'Available places cannot exceed the total.' };
  }
  if (parsed.data.date > toIsoDate(now())) {
    return { ok: false, error: 'Availability is reported for today or a past date, not the future.' };
  }

  const total = parsed.data.totalCapacity;
  const available = parsed.data.availableCapacity;

  const snapshot = await recordAvailability({
    id: `acc-live-${business.id}-${parsed.data.date}`,
    businessId: business.id,
    destinationId: business.destinationId,
    date: parsed.data.date,
    totalCapacity: total,
    availableCapacity: available,
    occupancyRate: total === 0 ? 0 : Number((1 - available / total).toFixed(3)),
    provenance: 'PARTNER_REPORTED',
  });

  // Keep the declared capacity on the business in step with what is reported.
  if (business.reportedCapacity !== total) {
    await updateBusiness(business.id, { reportedCapacity: total });
  }

  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, snapshot };
}

const enquiryResponseInput = z.object({
  enquiryId: z.string().min(1),
  status: z.enum(['ACKNOWLEDGED', 'CONFIRMED', 'DECLINED']),
});

export async function respondToEnquiry(
  input: unknown,
): Promise<{ ok: boolean; error?: string; enquiry?: Enquiry }> {
  const businessId = await getActingBusinessId();
  if (!businessId) return { ok: false, error: NOT_SIGNED_IN };

  const parsed = enquiryResponseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a response.' };

  // A partner answers its own enquiries only. The same message covers "not
  // yours" and "does not exist", so the response does not confirm which
  // enquiry ids belong to other businesses.
  const existing = getEnquiries().find((row) => row.id === parsed.data.enquiryId);
  if (!existing || existing.businessId !== businessId) {
    return { ok: false, error: 'That enquiry no longer exists.' };
  }

  const enquiry = await updateEnquiry(parsed.data.enquiryId, { status: parsed.data.status });
  if (!enquiry) return { ok: false, error: 'That enquiry no longer exists.' };

  revalidatePath('/partner', 'layout');
  return { ok: true, enquiry };
}

const onboardingInput = z.object({
  name: z.string().min(3).max(120),
  businessType: businessTypeSchema,
  destinationId: z.string().min(1),
  description: z.string().max(400).optional(),
  reportedCapacity: z.coerce.number().int().min(0).max(10_000).optional(),
  contactVisibility: z.enum(['PUBLIC', 'ON_ENQUIRY', 'PRIVATE']),
}).merge(credentialsSchema);

/**
 * Onboards a business.
 *
 * A new partner starts PENDING_VERIFICATION and unverified. Nothing they report
 * is counted as participating capacity until the department verifies them,
 * because an unverified self-report is not evidence.
 *
 * Onboarding also opens the partner's account and signs them in, bound to the
 * business it just created — so the account can act for that business and no
 * other.
 */
export async function onboardBusiness(
  input: unknown,
): Promise<{ ok: boolean; error?: string; business?: TourismBusiness }> {
  const parsed = onboardingInput.safeParse(input);
  if (!parsed.success) {
    const credentialIssue = parsed.error.issues.find((issue) =>
      ['email', 'password', 'contactName'].includes(String(issue.path[0])),
    );
    return {
      ok: false,
      error: credentialIssue?.message ?? 'Enter a name, a type and the destination you operate at.',
    };
  }

  const destination = getDestination(parsed.data.destinationId);
  if (!destination) return { ok: false, error: 'Choose a destination on the platform.' };

  // Refuse a taken email before anything is written, so a failed registration
  // does not leave a business with no account able to act for it.
  if (await isEmailRegistered(parsed.data.email)) {
    return { ok: false, error: 'An account with that email already exists. Sign in instead.' };
  }

  const business = tourismBusinessSchema.parse({
    id: nextId('biz-live'),
    name: parsed.data.name,
    businessType: parsed.data.businessType,
    district: destination.district,
    destinationId: destination.id,
    status: 'PENDING_VERIFICATION',
    contactVisibility: parsed.data.contactVisibility,
    verified: false,
    provenance: 'PARTNER_REPORTED',
    ...(parsed.data.description ? { description: parsed.data.description } : {}),
    ...(parsed.data.reportedCapacity !== undefined
      ? { reportedCapacity: parsed.data.reportedCapacity }
      : {}),
  });

  await registerBusiness(business);

  const opened = await openAccountAndSignIn({
    kind: 'PARTNER',
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.contactName,
    businessId: business.id,
  });
  if (!opened.ok) return { ok: false, error: opened.error };

  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, business };
}

/**
 * Departmental verification of a partner.
 *
 * Verification is what moves a business from self-declared to participating, so
 * it is a government action rather than something a partner can grant itself.
 */
export async function verifyBusiness(
  businessId: string,
  decision: 'VERIFY' | 'REJECT',
): Promise<{ ok: boolean; error?: string; business?: TourismBusiness }> {
  const role = await getGovernmentRole();
  if (!can(role, 'partner:verify')) {
    return { ok: false, error: refusalMessage(role, 'partner:verify') };
  }

  const business = getBusiness(businessId);
  if (!business) return { ok: false, error: 'That business is not on the platform.' };

  const updated = await updateBusiness(businessId, {
    verified: decision === 'VERIFY',
    status: decision === 'VERIFY' ? 'PARTICIPATING' : 'INACTIVE',
  });

  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  revalidatePath('/explore', 'layout');
  return updated ? { ok: true, business: updated } : { ok: false, error: 'Could not update.' };
}

const reviewInput = z.object({
  contentId: z.string().min(1),
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'PUBLISHED']),
  note: z.string().max(400).optional(),
});

/**
 * Departmental review of submitted campaign content — the last open step in the
 * Phase 1 creator campaign workflow.
 */
export async function reviewCampaignContent(
  input: unknown,
): Promise<{ ok: boolean; error?: string; content?: CampaignContent }> {
  const role = await getGovernmentRole();
  if (!can(role, 'content:review')) {
    return { ok: false, error: refusalMessage(role, 'content:review') };
  }

  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a review decision.' };

  const existing = getCampaignContent().find((row) => row.id === parsed.data.contentId);
  if (!existing) return { ok: false, error: 'That submission no longer exists.' };

  if (parsed.data.decision === 'CHANGES_REQUESTED' && !parsed.data.note) {
    return { ok: false, error: 'Say what needs to change. A rejection without a reason is not review.' };
  }

  const updated = await updateContent(parsed.data.contentId, {
    status: parsed.data.decision,
    ...(parsed.data.note ? { reviewNote: parsed.data.note } : {}),
  });

  revalidatePath('/gov', 'layout');
  revalidatePath('/creator', 'layout');
  return updated ? { ok: true, content: updated } : { ok: false, error: 'Could not record the review.' };
}
