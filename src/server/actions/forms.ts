'use server';

import { redirect } from 'next/navigation';

import { applyToCampaign, submitCampaignContent } from '@/server/actions/creator';
import { createNewCampaign, inviteCreator, launchCampaign } from '@/server/actions/government';
import {
  onboardBusiness,
  reportAvailability,
  respondToEnquiry,
  reviewCampaignContent,
  verifyBusiness,
} from '@/server/actions/partner';
import { onboardCreator, verifyCreator } from '@/server/actions/creator-onboarding';
import { approvePayout } from '@/server/actions/payouts';
import {
  checkIn,
  chooseAnalytics,
  deleteJourney,
  deleteMyJourneys,
  forgetMyVisits,
  sendEnquiry,
  submitTouristFeedback,
} from '@/server/actions/tourist';
import { cancelMyBooking, requestBooking, requestEventPlace, requestStay } from '@/server/actions/bookings';
import { answerBookingRequest, cancelBookingAsHost, markBookingCompleted } from '@/server/actions/partner-bookings';
import {
  changeMyPassword,
  changeRole,
  issueAccount,
  resetPassword,
  setDisabled,
  unlock,
} from '@/server/actions/accounts';
import {
  createCampaignLandingPage,
  generateBusinessLandingPage,
  publishBusinessLandingPage,
  publishCampaignLandingPage,
  deleteCampaignLandingPage,
  updateBusinessLandingPage,
} from '@/server/actions/landing-pages';
import { formatIndiaDateTime } from '@/lib/date';
import type { SocialPlatform } from '@/lib/types';
import type { FormState } from '@/lib/form-state';

/**
 * FormData adapters for the typed actions.
 *
 * Forms post progressively: every one of these works without client JavaScript,
 * and the client components layer pending and error states on top with
 * useActionState rather than replacing the mechanism.
 */

const text = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
const list = (data: FormData, key: string): string[] =>
  data.getAll(key).map((value) => String(value)).filter(Boolean);

/* ------------------------------- Government ------------------------------- */

export async function launchCampaignForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await launchCampaign(text(data, 'campaignId'));
  return result.ok
    ? { status: 'ok', message: `${result.campaign?.name} is live. Creators can see it now.` }
    : { status: 'error', message: result.error ?? 'Could not launch the campaign.' };
}

export async function inviteCreatorForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await inviteCreator(text(data, 'campaignId'), text(data, 'creatorId'));
  return result.ok
    ? { status: 'ok', message: 'Invitation recorded.' }
    : { status: 'error', message: result.error ?? 'Could not invite this creator.' };
}

export async function createCampaignForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await createNewCampaign({
    name: text(data, 'name'),
    objective: text(data, 'objective'),
    destinationId: text(data, 'destinationId'),
    targetAudience: text(data, 'targetAudience'),
    audienceAgeBand: text(data, 'audienceAgeBand') || '18-35',
    platforms: list(data, 'platforms') as SocialPlatform[],
    rewardPool: Number(text(data, 'rewardPool') || 0),
    startDate: text(data, 'startDate'),
    endDate: text(data, 'endDate'),
    contentRequirement: text(data, 'contentRequirement'),
    themes: list(data, 'themes'),
    preferredLanguages: list(data, 'preferredLanguages'),
  });

  return result.ok
    ? { status: 'ok', message: `${result.campaign?.name} created and open to creators.` }
    : { status: 'error', message: result.error ?? 'Could not create the campaign.' };
}

/* --------------------------------- Creator -------------------------------- */

export async function applyToCampaignForm(_prev: FormState, data: FormData): Promise<FormState> {
  const concept = text(data, 'proposedConcept');
  const result = await applyToCampaign(
    text(data, 'campaignId'),
    concept || undefined,
  );
  return result.ok
    ? { status: 'ok', message: 'Application submitted. The department can see it immediately.' }
    : { status: 'error', message: result.error ?? 'Could not apply.' };
}

export async function submitContentForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await submitCampaignContent({
    campaignId: text(data, 'campaignId'),
    title: text(data, 'title'),
    platform: text(data, 'platform'),
    contentUrl: text(data, 'contentUrl'),
    caption: text(data, 'caption'),
    disclosure: text(data, 'disclosure'),
  });
  return result.ok
    ? { status: 'ok', message: 'Submitted for review.' }
    : { status: 'error', message: result.error ?? 'Could not submit this content.' };
}

/* --------------------------------- Tourist -------------------------------- */

export async function submitFeedbackForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await submitTouristFeedback({
    destinationId: text(data, 'destinationId'),
    rating: Number(text(data, 'rating') || 0),
    category: text(data, 'category'),
    text: text(data, 'text'),
  });
  return result.ok
    ? {
        status: 'ok',
        message:
          'Thank you. That is now an anonymised tourism signal, and the department can already see it.',
      }
    : { status: 'error', message: result.error ?? 'Could not record that feedback.' };
}

export async function checkInForm(_prev: FormState, data: FormData): Promise<FormState> {
  const consent = text(data, 'consent') === 'on';
  const result = await checkIn(text(data, 'destinationId'), consent);
  return result.ok
    ? { status: 'ok', message: 'Checked in. The visit is counted, your identity is not recorded.' }
    : { status: 'error', message: result.error ?? 'Could not check in.' };
}

export async function sendEnquiryForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await sendEnquiry({
    experienceId: text(data, 'experienceId'),
    partySize: Number(text(data, 'partySize') || 1),
    preferredDate: text(data, 'preferredDate'),
    note: text(data, 'note') || undefined,
  });
  return result.ok
    ? { status: 'ok', message: 'Enquiry sent to the provider. They will confirm directly.' }
    : { status: 'error', message: result.error ?? 'Could not send the enquiry.' };
}

/* --------------------------- Partner (Phase 1) ---------------------------- */

export async function reportAvailabilityForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await reportAvailability({
    date: text(data, 'date'),
    totalCapacity: Number(text(data, 'totalCapacity') || 0),
    availableCapacity: Number(text(data, 'availableCapacity') || 0),
  });
  return result.ok
    ? {
        status: 'ok',
        message:
          'Availability recorded. It is now part of the capacity figures the department sees, marked as partner reported.',
      }
    : { status: 'error', message: result.error ?? 'Could not record that.' };
}

export async function respondToEnquiryForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await respondToEnquiry({
    enquiryId: text(data, 'enquiryId'),
    status: text(data, 'status'),
  });
  return result.ok
    ? { status: 'ok', message: `Enquiry marked ${result.enquiry?.status.toLowerCase()}.` }
    : { status: 'error', message: result.error ?? 'Could not update the enquiry.' };
}

export async function onboardBusinessForm(_prev: FormState, data: FormData): Promise<FormState> {
  const capacity = text(data, 'reportedCapacity');
  const result = await onboardBusiness({
    name: text(data, 'name'),
    businessType: text(data, 'businessType'),
    destinationId: text(data, 'destinationId'),
    description: text(data, 'description') || undefined,
    reportedCapacity: capacity === '' ? undefined : Number(capacity),
    contactVisibility: text(data, 'contactVisibility') || 'ON_ENQUIRY',
    contactName: text(data, 'contactName'),
    email: text(data, 'email'),
    // Passed through untrimmed: a password is exactly what was typed.
    password: typeof data.get('password') === 'string' ? (data.get('password') as string) : '',
  });
  return result.ok
    ? {
        status: 'ok',
        message: `${result.business?.name} registered and awaiting verification. Nothing it reports counts as participating capacity until the department verifies it.`,
      }
    : { status: 'error', message: result.error ?? 'Could not register the business.' };
}

export async function verifyBusinessForm(_prev: FormState, data: FormData): Promise<FormState> {
  const decision = text(data, 'decision') === 'REJECT' ? 'REJECT' : 'VERIFY';
  const result = await verifyBusiness(text(data, 'businessId'), decision);
  return result.ok
    ? {
        status: 'ok',
        message:
          decision === 'VERIFY'
            ? `${result.business?.name} is verified and now counts as participating supply.`
            : `${result.business?.name} was not verified and is marked inactive.`,
      }
    : { status: 'error', message: result.error ?? 'Could not record the decision.' };
}

export async function reviewContentForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await reviewCampaignContent({
    contentId: text(data, 'contentId'),
    decision: text(data, 'decision'),
    note: text(data, 'note') || undefined,
  });
  return result.ok
    ? { status: 'ok', message: `Marked ${result.content?.status.replace('_', ' ').toLowerCase()}.` }
    : { status: 'error', message: result.error ?? 'Could not record the review.' };
}

export async function approvePayoutForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await approvePayout(text(data, 'campaignId'), text(data, 'creatorId'));
  return result.ok
    ? {
        status: 'ok',
        message: `Approved ₹${result.payout?.amount.toLocaleString('en-IN')}. The platform records what is owed; it moves no money.`,
      }
    : { status: 'error', message: result.error ?? 'Could not approve the payout.' };
}

export async function onboardCreatorForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await onboardCreator({
    displayName: text(data, 'displayName'),
    homeDistrict: text(data, 'homeDistrict'),
    bio: text(data, 'bio') || undefined,
    categories: list(data, 'categories'),
    languages: list(data, 'languages'),
    platforms: list(data, 'platforms') as SocialPlatform[],
    audienceSummary: text(data, 'audienceSummary'),
    audienceAgeBand: text(data, 'audienceAgeBand') || '18-35',
    email: text(data, 'email'),
    password: typeof data.get('password') === 'string' ? (data.get('password') as string) : '',
  });
  return result.ok
    ? {
        status: 'ok',
        message: `${result.creator?.displayName} registered and awaiting verification. Reputation on this platform starts at zero and is earned from delivered campaigns.`,
      }
    : { status: 'error', message: result.error ?? 'Could not register.' };
}

export async function verifyCreatorForm(_prev: FormState, data: FormData): Promise<FormState> {
  const decision = text(data, 'decision') === 'REJECT' ? 'REJECT' : 'VERIFY';
  const result = await verifyCreator(text(data, 'creatorId'), decision);
  return result.ok
    ? {
        status: 'ok',
        message:
          decision === 'VERIFY'
            ? `${result.creator?.displayName} is verified and can be shortlisted.`
            : `${result.creator?.displayName} was not verified and is marked inactive.`,
      }
    : { status: 'error', message: result.error ?? 'Could not record the decision.' };
}

/* -------------------------------- Bookings -------------------------------- */

export async function requestBookingForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await requestBooking({
    experienceId: text(data, 'experienceId'),
    partySize: text(data, 'partySize'),
    date: text(data, 'date'),
    guestName: text(data, 'guestName'),
    guestPhone: text(data, 'guestPhone'),
    guestEmail: text(data, 'guestEmail'),
    note: text(data, 'note') || undefined,
    consent: data.get('consent') === 'on',
  });
  if (!result.ok) return { status: 'error', message: result.error };
  // The key is in the link so the booking can be reopened on another device.
  redirect(`/explore/bookings/${result.reference}?key=${encodeURIComponent(result.accessKey)}&new=1`);
}

export async function requestEventPlaceForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await requestEventPlace({
    eventId: text(data, 'eventId'),
    partySize: text(data, 'partySize'),
    guestName: text(data, 'guestName'),
    guestPhone: text(data, 'guestPhone'),
    guestEmail: text(data, 'guestEmail'),
    note: text(data, 'note') || undefined,
    consent: data.get('consent') === 'on',
  });
  if (!result.ok) return { status: 'error', message: result.error };
  redirect(`/explore/bookings/${result.reference}?key=${encodeURIComponent(result.accessKey)}&new=1`);
}

export async function requestStayForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await requestStay({
    businessId: text(data, 'businessId'),
    checkIn: text(data, 'checkIn'),
    checkOut: text(data, 'checkOut'),
    rooms: text(data, 'rooms'),
    partySize: text(data, 'partySize'),
    guestName: text(data, 'guestName'),
    guestPhone: text(data, 'guestPhone'),
    guestEmail: text(data, 'guestEmail'),
    note: text(data, 'note') || undefined,
    consent: data.get('consent') === 'on',
  });
  if (!result.ok) return { status: 'error', message: result.error };
  redirect(`/explore/bookings/${result.reference}?key=${encodeURIComponent(result.accessKey)}&new=1`);
}

export async function cancelMyBookingForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await cancelMyBooking({
    reference: text(data, 'reference'),
    key: text(data, 'key') || undefined,
  });
  return result.ok
    ? { status: 'ok', message: result.message ?? 'Cancelled.' }
    : { status: 'error', message: result.error ?? 'Could not cancel the booking.' };
}

export async function answerBookingForm(_prev: FormState, data: FormData): Promise<FormState> {
  const decision = text(data, 'decision');
  const result = await answerBookingRequest({
    bookingId: text(data, 'bookingId'),
    decision,
    message: text(data, 'message') || undefined,
  });
  return result.ok
    ? {
        status: 'ok',
        message:
          decision === 'ACCEPT'
            ? 'Accepted. The traveller has been asked to pay; it is confirmed once they do.'
            : 'Declined. The traveller can see your reply.',
      }
    : { status: 'error', message: result.error ?? 'Could not record your answer.' };
}

export async function cancelBookingAsHostForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await cancelBookingAsHost({ bookingId: text(data, 'bookingId'), reason: text(data, 'reason') });
  return result.ok
    ? { status: 'ok', message: 'Cancelled. Anything the traveller paid is being refunded in full.' }
    : { status: 'error', message: result.error ?? 'Could not cancel the booking.' };
}

export async function completeBookingForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await markBookingCompleted(text(data, 'bookingId'));
  return result.ok
    ? { status: 'ok', message: 'Marked as completed.' }
    : { status: 'error', message: result.error ?? 'Could not update the booking.' };
}

/* -------------------------------- Analytics ------------------------------- */

export async function chooseAnalyticsForm(_prev: FormState, data: FormData): Promise<FormState> {
  const choice = text(data, 'choice') === 'yes' ? 'yes' : 'no';
  await chooseAnalytics(choice);
  return {
    status: 'ok',
    message:
      choice === 'yes'
        ? 'Thank you. Your visits are counted anonymously.'
        : 'Done. Your visits are no longer recorded. Check-ins and feedback you choose to send still are.',
  };
}

export async function forgetMyVisitsForm(): Promise<FormState> {
  const { removed } = await forgetMyVisits();
  return {
    status: 'ok',
    message: `Done. ${removed} recorded ${removed === 1 ? 'signal was' : 'signals were'} deleted, and nothing more will be counted.`,
  };
}

/* -------------------------------- Journeys -------------------------------- */

export async function deleteJourneyForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await deleteJourney(text(data, 'tripId'));
  return result.ok
    ? { status: 'ok', message: 'Trip deleted.' }
    : { status: 'error', message: result.error ?? 'Could not delete that trip.' };
}

export async function deleteMyJourneysForm(): Promise<FormState> {
  const { removed } = await deleteMyJourneys();
  return {
    status: 'ok',
    message:
      removed === 0
        ? 'There were no trips to delete.'
        : `Done. ${removed} ${removed === 1 ? 'trip was' : 'trips were'} deleted.`,
  };
}

/* ----------------------------- Landing pages ------------------------------- */

export async function generateBusinessLandingPageForm(): Promise<FormState> {
  const result = await generateBusinessLandingPage();
  return result.ok
    ? { status: 'ok', message: `Draft generated for ${result.page?.title}. Review it, then publish when it's ready.` }
    : { status: 'error', message: result.error ?? 'Could not generate a page.' };
}

export async function updateBusinessLandingPageForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await updateBusinessLandingPage({
    title: text(data, 'title'),
    tagline: text(data, 'tagline'),
    about: text(data, 'about'),
    highlights: text(data, 'highlights') || undefined,
    practical: text(data, 'practical') || undefined,
    bookingUrl: text(data, 'bookingUrl') || undefined,
  });
  return result.ok
    ? { status: 'ok', message: 'Saved.' }
    : { status: 'error', message: result.error ?? 'Could not save these changes.' };
}

export async function publishBusinessLandingPageForm(_prev: FormState, data: FormData): Promise<FormState> {
  const published = text(data, 'published') === 'true';
  const result = await publishBusinessLandingPage(published);
  return result.ok
    ? {
        status: 'ok',
        message: published
          ? 'Published. Anyone with the link can see it now.'
          : 'Unpublished. The link no longer shows this page.',
      }
    : { status: 'error', message: result.error ?? 'Could not update the page.' };
}

export async function createCampaignLandingPageForm(_prev: FormState, data: FormData): Promise<FormState> {
  const linkTo = text(data, 'linkTo');
  const [kind, id] = linkTo.split(':');
  const result = await createCampaignLandingPage({
    campaignId: kind === 'campaign' ? id : undefined,
    eventId: kind === 'event' ? id : undefined,
    title: text(data, 'title') || undefined,
    bookingUrl: text(data, 'bookingUrl') || undefined,
  });
  return result.ok
    ? { status: 'ok', message: `Draft generated: ${result.page?.title}. Review it, then publish when it's ready.` }
    : { status: 'error', message: result.error ?? 'Could not generate a page.' };
}

export async function publishCampaignLandingPageForm(_prev: FormState, data: FormData): Promise<FormState> {
  const published = text(data, 'published') === 'true';
  const result = await publishCampaignLandingPage(text(data, 'landingPageId'), published);
  return result.ok
    ? {
        status: 'ok',
        message: published
          ? 'Published. Anyone with the link can see it now.'
          : 'Unpublished. The link no longer shows this page.',
      }
    : { status: 'error', message: result.error ?? 'Could not update the page.' };
}

export async function deleteCampaignLandingPageForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await deleteCampaignLandingPage(text(data, 'landingPageId'));
  return result.ok ? { status: 'ok' } : { status: 'error', message: result.error ?? 'Could not delete.' };
}

/* -------------------------------- Accounts -------------------------------- */

const handOver = (email: string, password: string, expiresAt: string) =>
  `Temporary password for ${email}: ${password} — hand it over in person. It works until ${formatIndiaDateTime(expiresAt)}, must be changed at first sign-in, and is not shown again.`;

export async function issueAccountForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await issueAccount({
    email: text(data, 'email'),
    displayName: text(data, 'displayName'),
    role: text(data, 'role'),
  });
  return result.ok
    ? { status: 'ok', message: handOver(result.value.email, result.value.temporaryPassword, result.value.expiresAt) }
    : { status: 'error', message: result.error };
}

export async function changeRoleForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await changeRole({ accountId: text(data, 'accountId'), role: text(data, 'role') });
  return result.ok ? { status: 'ok', message: 'Role changed. It applies from their next page load.' } : { status: 'error', message: result.error };
}

export async function setDisabledForm(_prev: FormState, data: FormData): Promise<FormState> {
  const disabled = text(data, 'disabled') === 'true';
  const result = await setDisabled({ accountId: text(data, 'accountId'), disabled, reason: text(data, 'reason') || undefined });
  return result.ok
    ? { status: 'ok', message: disabled ? 'Disabled. Every session of this account has ended.' : 'Enabled. They can sign in again.' }
    : { status: 'error', message: result.error };
}

export async function unlockForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await unlock({ accountId: text(data, 'accountId') });
  return result.ok ? { status: 'ok', message: 'Unlocked.' } : { status: 'error', message: result.error };
}

export async function resetPasswordForm(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await resetPassword({ accountId: text(data, 'accountId') });
  return result.ok
    ? { status: 'ok', message: handOver(result.value.email, result.value.temporaryPassword, result.value.expiresAt) }
    : { status: 'error', message: result.error };
}

export async function changeMyPasswordForm(_prev: FormState, data: FormData): Promise<FormState> {
  const raw = (key: string) => (typeof data.get(key) === 'string' ? (data.get(key) as string) : '');
  const result = await changeMyPassword({
    currentPassword: raw('currentPassword'),
    newPassword: raw('newPassword'),
    confirmPassword: raw('confirmPassword'),
  });
  if (!result.ok) return { status: 'error', message: result.error };
  if (result.home) redirect(result.home);
  return { status: 'ok', message: 'Password changed. Your other sessions have been signed out.' };
}
