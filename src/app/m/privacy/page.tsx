import type { Metadata } from 'next';

import { chooseAnalyticsForm, deleteMyJourneysForm, forgetMyVisitsForm } from '@/server/actions/forms';
import { countTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { ActionForm } from '@/components/shared/ActionForm';
import { Badge } from '@/components/ui/primitives';
import { MobileHeader, Section } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Your data' };
export const dynamic = 'force-dynamic';

const COUNTED = [
  ['Opening a destination', 'Once per half hour per place.'],
  ['Following directions', 'That you set off, not where from.'],
  ['Planning a trip', 'The places on the plan and the interests you chose.'],
  ['Asking about a place', 'The question, so the department sees what visitors want to know.'],
  ['Requesting a booking', 'That a request was made, not your name or phone.'],
] as const;

const ALWAYS = [
  ['Check-ins', 'Only when you press "Check in".'],
  ['Feedback', 'Only what you send, stored without your identity.'],
  ['Bookings', 'Your name and phone go to the host you book with, nobody else.'],
] as const;

/** Visit counting and stored trips, with the same controls as the desktop page. */
export default async function MobilePrivacyPage() {
  const visitor = await readVisitor();
  const journeys = await countTrips(visitor.sessionId);

  return (
    <div>
      <MobileHeader title="Your data" backHref="/m" />
      <p className="text-[14px] text-ink-700">
        No account needed. The Tourism Department sees totals per place, never an individual.
      </p>

      <Section title="Visit counting" action={<Badge tone={visitor.analyticsAllowed ? 'good' : 'neutral'}>{visitor.analyticsAllowed ? 'On' : 'Off'}</Badge>}>
        <div className="space-y-4 rounded-2xl bg-surface p-4 shadow-card">
          <ul className="space-y-2">
            {COUNTED.map(([what, detail]) => (
              <li key={what} className="text-[13px]">
                <span className="font-medium text-ink-900">{what}.</span> <span className="text-ink-600">{detail}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line pt-3">
            {visitor.analyticsAllowed ? (
              <ActionForm action={chooseAnalyticsForm} submitLabel="Stop counting my visits" pendingLabel="Saving…" variant="secondary" hiddenFields={{ choice: 'no' }} fullWidthSubmit />
            ) : (
              <ActionForm action={chooseAnalyticsForm} submitLabel="Count my visits" pendingLabel="Saving…" hiddenFields={{ choice: 'yes' }} fullWidthSubmit />
            )}
          </div>
          <ActionForm action={forgetMyVisitsForm} submitLabel="Stop counting and delete my visits" pendingLabel="Deleting…" variant="ghost" size="sm" />
        </div>
      </Section>

      <Section title="Your trips" action={<Badge tone="neutral">{journeys === 0 ? 'None' : `${journeys} stored`}</Badge>}>
        <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-card">
          <p className="text-[13px] text-ink-600">
            Kept so your trips are there when you come back. The department does not see them.
          </p>
          {journeys > 0 ? (
            <ActionForm action={deleteMyJourneysForm} submitLabel="Delete all my trips" pendingLabel="Deleting…" variant="ghost" size="sm" />
          ) : null}
        </div>
      </Section>

      <Section title="Always recorded, because you send it">
        <ul className="space-y-2 rounded-2xl bg-surface p-4 shadow-card">
          {ALWAYS.map(([what, detail]) => (
            <li key={what} className="text-[13px]">
              <span className="font-medium text-ink-900">{what}.</span> <span className="text-ink-600">{detail}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
