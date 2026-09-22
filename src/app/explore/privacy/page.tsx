import type { Metadata } from 'next';

import { chooseAnalyticsForm, deleteMyJourneysForm, forgetMyVisitsForm } from '@/server/actions/forms';
import { countTrips } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { ActionForm } from '@/components/shared/ActionForm';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Your data' };
export const dynamic = 'force-dynamic';

const COUNTED = [
  ['Opening a destination page', 'Once per half hour per place, so a reload is not a second visit.'],
  ['Following "Get directions"', 'That you set off, not where from. No location is read.'],
  ['Planning a trip', 'The places on the plan and the interests you chose.'],
  ['Asking about a place', 'The question, so the department can see what visitors want to know.'],
  ['Requesting a booking', 'That a request was made for that experience — not your name or phone number.'],
] as const;

const ALWAYS = [
  ['Check-ins', 'Only when you press "Check in", after reading what it records.'],
  ['Feedback', 'Only what you write and send, stored without your identity.'],
  ['Bookings', 'Your name and phone number go to the host you book with, and to nobody else.'],
] as const;

export default async function PrivacyPage() {
  const visitor = await readVisitor();
  const journeys = await countTrips(visitor.sessionId);
  const state = visitor.analyticsAllowed
    ? { label: 'Your visits are counted', tone: 'good' as const }
    : { label: 'Your visits are not recorded', tone: 'neutral' as const };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Your data and visit counting</h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Explore Manipur needs no account. The Tourism Department sees totals per place — how many people looked at
          Loktak this week — and never an individual.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Visit counting"
          action={<Badge tone={state.tone}>{state.label}</Badge>}
          subtitle={
            visitor.gpc && visitor.choice === 'unset'
              ? 'Your browser sends Global Privacy Control, so nothing below is recorded unless you choose otherwise.'
              : 'Counted under a random identifier held in a cookie in this browser. It is not linked to you, and clearing your cookies starts a new one.'
          }
        />
        <CardBody className="space-y-4">
          <ul className="space-y-2">
            {COUNTED.map(([what, detail]) => (
              <li key={what} className="text-[13px]">
                <span className="font-medium text-ink-900">{what}.</span>{' '}
                <span className="text-ink-600">{detail}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {visitor.analyticsAllowed ? (
              <ActionForm
                action={chooseAnalyticsForm}
                submitLabel="Stop counting my visits"
                pendingLabel="Saving…"
                variant="secondary"
                hiddenFields={{ choice: 'no' }}
              />
            ) : (
              <ActionForm
                action={chooseAnalyticsForm}
                submitLabel="Count my visits"
                pendingLabel="Saving…"
                hiddenFields={{ choice: 'yes' }}
              />
            )}
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-[12px] text-ink-600">
              Stopping applies from now on. What was already counted is held under this browser&rsquo;s random
              identifier, and you can have it deleted as well.
            </p>
            <ActionForm
              action={forgetMyVisitsForm}
              submitLabel="Stop counting and delete my visits"
              pendingLabel="Deleting…"
              variant="ghost"
              size="sm"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Your trips"
          action={<Badge tone="neutral">{journeys === 0 ? 'None stored' : `${journeys} stored`}</Badge>}
          subtitle="Plans you make are kept so the trip page still shows them when you come back. They are not visit counts, the department does not see them, and they stay whatever you choose above."
        />
        <CardBody className="space-y-2">
          <p className="text-[12px] text-ink-600">
            A plan you have not saved is replaced by the next one you make. Saved trips stay until you delete them,
            here or on the trip page. Deleting them does not remove the visit counts above.
          </p>
          {journeys > 0 ? (
            <ActionForm
              action={deleteMyJourneysForm}
              submitLabel="Delete all my trips"
              pendingLabel="Deleting…"
              variant="ghost"
              size="sm"
            />
          ) : null}
        </CardBody>
      </Card>

      <Card tone="outline">
        <CardHeader title="Recorded whatever you choose above" subtitle="Each of these is something you send on purpose." />
        <CardBody>
          <ul className="space-y-2">
            {ALWAYS.map(([what, detail]) => (
              <li key={what} className="text-[13px]">
                <span className="font-medium text-ink-900">{what}.</span>{' '}
                <span className="text-ink-600">{detail}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
