'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getBusiness, getEvent, getExperience, getStay } from '@/server/data/repository';
import { activeCampaignFor } from '@/server/data/attribution';
import { ensureVisitor } from '@/server/telemetry/visitor';
import { ingest } from '@/server/telemetry/ingest';
import { ensureGuestOwner, readGuestOwner } from '@/server/bookings/guest';
import {
  businessesAcceptingBookings,
  cancelByGuest,
  confirmCheckout,
  createBookingRequest,
  placesTaken,
  startPayment,
  type CheckoutSession,
  type SettleResult,
} from '@/server/bookings/ledger';
import { indiaDate, MAX_PARTY_SIZE, MAX_ROOMS, priceFor, stayPriceFor } from '@/server/bookings/policy';

/**
 * Tourist-side booking actions.
 *
 * A tourist has no account. What they can open is decided by the guest cookie
 * of the browser that made the request, or by the key in the private link —
 * never by a reference alone, which is printed on receipts and read out on the
 * phone.
 */

/** Digits, with an optional leading +; 10 to 15 of them. */
const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine((value) => /^\+?\d{10,15}$/.test(value), 'Enter a phone number the host can call.');

const requestInput = z.object({
  experienceId: z.string().min(1),
  partySize: z.coerce.number().int().min(1).max(MAX_PARTY_SIZE),
  date: z.string().min(10).max(10),
  guestName: z.string().trim().min(2, 'Enter your name.').max(120),
  guestPhone: phoneSchema,
  guestEmail: z
    .string()
    .trim()
    .max(191)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || z.string().email().safeParse(value).success, 'Enter a valid email, or leave it blank.'),
  note: z.string().trim().max(400).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Agree to share your name and phone number with the host.' }),
  }),
});

export type RequestResult =
  | { ok: true; reference: string; accessKey: string }
  | { ok: false; error: string };

export async function requestBooking(input: unknown): Promise<RequestResult> {
  const parsed = requestInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }

  const experience = getExperience(parsed.data.experienceId);
  const business = experience ? getBusiness(experience.businessId) : undefined;
  if (!experience || !business || experience.availabilityStatus === 'UNAVAILABLE' || business.status !== 'PARTICIPATING') {
    return { ok: false, error: 'That experience cannot be booked right now.' };
  }
  // A host who is not on the platform could never answer, and the request
  // would sit unread until it expired.
  if (!(await businessesAcceptingBookings()).has(business.id)) {
    return { ok: false, error: 'This host does not take bookings online yet. Send an enquiry instead.' };
  }

  const ownerHash = await ensureGuestOwner();
  const visitor = await ensureVisitor();
  const anonymousSessionId = visitor.sessionId;
  const campaignId = activeCampaignFor(experience.destinationId);

  const created = await createBookingRequest({
    experienceId: experience.id,
    businessId: business.id,
    destinationId: experience.destinationId,
    anonymousSessionId,
    ownerHash,
    guestName: parsed.data.guestName,
    guestPhone: parsed.data.guestPhone,
    partySize: parsed.data.partySize,
    date: parsed.data.date,
    unitPricePaise: priceFor(experience.price, 1).unitPricePaise,
    ...(parsed.data.guestEmail ? { guestEmail: parsed.data.guestEmail } : {}),
    ...(parsed.data.note ? { note: parsed.data.note } : {}),
    ...(campaignId ? { campaignId } : {}),
  });
  if (!created.ok) return created;

  // The request is intent, and counts as such in the demand signals.
  await ingest(visitor, {
    type: 'BOOKING',
    destinationId: experience.destinationId,
    experienceId: experience.id,
    metadata: { request: true, partySize: parsed.data.partySize },
    attribution: 'none',
    ...(campaignId ? { campaignId } : {}),
  });

  revalidatePath('/explore/bookings');
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, reference: created.value.booking.reference, accessKey: created.value.accessKey };
}

/* ---------------------------------- Stays --------------------------------- */

const guestDetails = {
  guestName: z.string().trim().min(2, 'Enter your name.').max(120),
  guestPhone: phoneSchema,
  guestEmail: z
    .string()
    .trim()
    .max(191)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || z.string().email().safeParse(value).success, 'Enter a valid email, or leave it blank.'),
  note: z.string().trim().max(400).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Agree to share your name and phone number with the host.' }),
  }),
};

const stayInput = z.object({
  businessId: z.string().min(1),
  checkIn: z.string().min(10).max(10),
  checkOut: z.string().min(10).max(10),
  rooms: z.coerce.number().int().min(1).max(MAX_ROOMS),
  partySize: z.coerce.number().int().min(1).max(MAX_PARTY_SIZE),
  ...guestDetails,
});

/**
 * A request to stay, which the host answers exactly as they answer a request
 * for an experience. The room rate is read from the property here and never
 * taken from the form, so the page cannot quote a price the host has not set.
 */
export async function requestStay(input: unknown): Promise<RequestResult> {
  const parsed = stayInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }

  const stay = getStay(parsed.data.businessId);
  if (!stay || stay.status !== 'PARTICIPATING' || !stay.rate) {
    return { ok: false, error: 'That stay cannot be booked right now.' };
  }
  if (!(await businessesAcceptingBookings()).has(stay.id)) {
    return { ok: false, error: 'This host does not take bookings online yet. Send an enquiry instead.' };
  }
  if (stay.reportedCapacity !== undefined && parsed.data.rooms > stay.reportedCapacity) {
    return { ok: false, error: `This property has ${stay.reportedCapacity} rooms.` };
  }

  const ownerHash = await ensureGuestOwner();
  const visitor = await ensureVisitor();
  const campaignId = activeCampaignFor(stay.destinationId);

  const created = await createBookingRequest({
    kind: 'STAY',
    businessId: stay.id,
    destinationId: stay.destinationId,
    anonymousSessionId: visitor.sessionId,
    ownerHash,
    guestName: parsed.data.guestName,
    guestPhone: parsed.data.guestPhone,
    partySize: parsed.data.partySize,
    date: parsed.data.checkIn,
    endDate: parsed.data.checkOut,
    rooms: parsed.data.rooms,
    unitPricePaise: stayPriceFor(stay.rate.amount, 1, 1).unitPricePaise,
    ...(parsed.data.guestEmail ? { guestEmail: parsed.data.guestEmail } : {}),
    ...(parsed.data.note ? { note: parsed.data.note } : {}),
    ...(campaignId ? { campaignId } : {}),
  });
  if (!created.ok) return created;

  await ingest(visitor, {
    type: 'BOOKING',
    destinationId: stay.destinationId,
    metadata: { request: true, partySize: parsed.data.partySize, stay: true },
    attribution: 'none',
    ...(campaignId ? { campaignId } : {}),
  });

  revalidatePath('/explore/bookings');
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, reference: created.value.booking.reference, accessKey: created.value.accessKey };
}

/* --------------------------------- Events --------------------------------- */

const eventPlaceInput = z.object({
  eventId: z.string().min(1),
  partySize: z.coerce.number().int().min(1).max(MAX_PARTY_SIZE),
  ...guestDetails,
});

/**
 * A place at an event the organiser runs. The date is the event's own first
 * day, not a day the visitor picks, and the price is the organiser's ticket
 * price — neither is read from the form.
 *
 * A free event takes no booking: there is nothing to hold and nobody to
 * answer, and saying "turn up" is more honest than issuing a ticket for it.
 */
export async function requestEventPlace(input: unknown): Promise<RequestResult> {
  const parsed = eventPlaceInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }

  const event = getEvent(parsed.data.eventId);
  if (!event || event.admission === 'FREE' || !event.organiserBusinessId) {
    return { ok: false, error: 'This event does not take bookings.' };
  }
  const host = getBusiness(event.organiserBusinessId);
  if (!host || host.status !== 'PARTICIPATING') {
    return { ok: false, error: 'This event does not take bookings.' };
  }
  if (!(await businessesAcceptingBookings()).has(host.id)) {
    return { ok: false, error: 'The organiser does not take bookings online yet.' };
  }

  if (event.capacity !== undefined) {
    const taken = await placesTaken(event.id);
    if (taken + parsed.data.partySize > event.capacity) {
      const left = Math.max(0, event.capacity - taken);
      return {
        ok: false,
        error: left === 0 ? 'This event is full.' : `Only ${left} ${left === 1 ? 'place is' : 'places are'} left.`,
      };
    }
  }

  const ownerHash = await ensureGuestOwner();
  const visitor = await ensureVisitor();
  const campaignId = activeCampaignFor(event.destinationId);

  const created = await createBookingRequest({
    kind: 'EVENT',
    eventId: event.id,
    businessId: host.id,
    destinationId: event.destinationId,
    anonymousSessionId: visitor.sessionId,
    ownerHash,
    guestName: parsed.data.guestName,
    guestPhone: parsed.data.guestPhone,
    partySize: parsed.data.partySize,
    date: indiaDate(new Date(event.startAt)),
    // A registration is free; only a ticketed event is charged for.
    unitPricePaise: event.admission === 'TICKETED' ? Math.round((event.ticketPrice ?? 0) * 100) : 0,
    ...(parsed.data.guestEmail ? { guestEmail: parsed.data.guestEmail } : {}),
    ...(parsed.data.note ? { note: parsed.data.note } : {}),
    ...(campaignId ? { campaignId } : {}),
  });
  if (!created.ok) return created;

  await ingest(visitor, {
    type: 'BOOKING',
    destinationId: event.destinationId,
    metadata: { request: true, partySize: parsed.data.partySize, event: event.id },
    attribution: 'none',
    ...(campaignId ? { campaignId } : {}),
  });

  revalidatePath('/explore/bookings');
  revalidatePath(`/explore/events/${event.id}`);
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  return { ok: true, reference: created.value.booking.reference, accessKey: created.value.accessKey };
}

const accessInput = z.object({
  reference: z.string().regex(/^MT-[A-Z0-9]{6}$/),
  key: z.string().max(64).optional(),
});

async function accessFor(key: string | undefined) {
  return { ownerHash: await readGuestOwner(), accessKey: key || null };
}

export async function beginBookingPayment(
  input: unknown,
): Promise<{ ok: true; checkout: CheckoutSession } | { ok: false; error: string }> {
  const parsed = accessInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That booking could not be found.' };

  const started = await startPayment(parsed.data.reference, await accessFor(parsed.data.key));
  return started.ok ? { ok: true, checkout: started.value } : started;
}

const callbackInput = accessInput.extend({
  orderId: z.string().min(1).max(64),
  paymentId: z.string().min(1).max(64),
  signature: z.string().min(1).max(128),
});

export async function completeBookingPayment(
  input: unknown,
): Promise<{ ok: true; result: SettleResult } | { ok: false; error: string }> {
  const parsed = callbackInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'The payment response was incomplete.' };

  const { reference, key, orderId, paymentId, signature } = parsed.data;
  const done = await confirmCheckout(reference, await accessFor(key), { orderId, paymentId, signature });
  revalidatePath('/explore/bookings');
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  return done.ok ? { ok: true, result: done.value } : done;
}

export async function cancelMyBooking(input: unknown): Promise<{ ok: boolean; error?: string; message?: string }> {
  const parsed = accessInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That booking could not be found.' };

  const cancelled = await cancelByGuest(parsed.data.reference, await accessFor(parsed.data.key));
  if (!cancelled.ok) return cancelled;

  revalidatePath('/explore/bookings');
  revalidatePath('/partner', 'layout');
  revalidatePath('/gov', 'layout');
  const refunded = cancelled.value.refunds.at(-1);
  return {
    ok: true,
    message: refunded ? 'Cancelled. Your refund has been started.' : 'Cancelled.',
  };
}
