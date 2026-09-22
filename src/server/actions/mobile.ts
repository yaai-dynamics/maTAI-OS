'use server';

import { redirect } from 'next/navigation';

import { requestBooking } from '@/server/actions/bookings';
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
