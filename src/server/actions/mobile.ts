'use server';

import { redirect } from 'next/navigation';

import { requestBooking } from '@/server/actions/bookings';
import { getDestination } from '@/server/data/repository';
import { creditLine, photoFor } from '@/lib/mobile/photos';
import type { PlaceSnapshot } from '@/lib/ai/web-media';
import type { FormState } from '@/lib/form-state';

/**
 * Form adapters for the mobile app (/m). Same typed actions as
 * src/server/actions/forms.ts; only where they lead afterwards differs, so a
 * visitor on the mobile app stays in it.
 */

const text = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();

export async function requestBookingMobileForm(_prev: FormState, data: FormData): Promise<FormState> {
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
  redirect(`/m/bookings/${result.reference}?key=${encodeURIComponent(result.accessKey)}&new=1`);
}

/**
 * A place's photograph for the map cards (PlaceCard), from the photographs
 * the app ships in public/photos rather than a live Wikipedia lookup: fast,
 * offline, and the picture chosen for the place by hand. Same shape as
 * mapPlaceSnapshot, so the shared map components take either.
 */
export async function mobilePlaceSnapshot(destinationId: unknown): Promise<{ ok: boolean; snapshot?: PlaceSnapshot }> {
  const destination = typeof destinationId === 'string' ? getDestination(destinationId) : undefined;
  if (!destination) return { ok: false };
  const photo = photoFor(destination.id);
  if (!photo) return { ok: true, snapshot: {} };
  return {
    ok: true,
    snapshot: {
      image: {
        src: photo.sm,
        // The credit link: the Commons file page, or the place page for a team-supplied photo.
        href: photo.credit.source || `/m/place/${destination.id}`,
        alt: `${destination.name}. ${creditLine(photo.credit)}`,
      },
    },
  };
}
