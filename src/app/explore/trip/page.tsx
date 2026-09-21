import Link from 'next/link';
import type { Metadata } from 'next';

import { ISSUE_CATEGORY_LABEL } from '@/lib/types';
import { formatDuration } from '@/lib/geo';
import { formatLongDate } from '@/lib/date';
import { currentWindow } from '@/server/analytics/windows';
import { computeDestinationSentiment } from '@/server/analytics/sentiment';
import { getDestination, getFeedback, getInteractions } from '@/server/data/repository';
import { getCurrentTrip } from '@/server/data/trips';
import { readVisitor } from '@/server/telemetry/visitor';
import { isSessionRecord } from '@/server/data/store';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { ProvenanceBadge, StatusBadge } from '@/components/shared/badges';
import { FeedbackCard } from '@/components/shared/cards';
import { DestinationSwatch } from '@/components/shared/DestinationVisual';
import { ReplanControls } from '@/components/shared/ReplanControls';
import { ActionForm, Field, Select, TextArea } from '@/components/shared/ActionForm';
import { checkInForm, submitFeedbackForm } from '@/server/actions/forms';
import { replanCurrentTrip } from '@/server/actions/tourist';

export const metadata: Metadata = { title: 'Live trip' };
export const dynamic = 'force-dynamic';

const POSITIVE_THEMES = ['EXPERIENCE', 'NATURE', 'HERITAGE', 'CULTURE', 'FOOD', 'HOSPITALITY'] as const;

export default async function LiveTripPage(props: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const { destination: destinationParam } = await props.searchParams;
  const trip = await getCurrentTrip((await readVisitor()).sessionId);

  if (!trip) {
    return (
      <EmptyState
        icon="✓"
        title="No trip in progress"
        description="Plan a journey first. The live trip view is where you check in and leave feedback as you travel."
        action={
          <Link
            href="/explore"
            className="rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
          >
            Plan a journey
          </Link>
        }
      />
    );
  }

  const stops = trip.items.filter((item) => item.kind === 'DESTINATION');
  const todayStops = stops.filter((item) => item.day === 1);
  const upcoming = stops.filter((item) => item.day > 1);

  const focusId = destinationParam ?? todayStops[0]?.destinationId ?? stops[0]?.destinationId;
  const focus = focusId ? getDestination(focusId) : undefined;

  const sentiment = computeDestinationSentiment(currentWindow());
  const focusSentiment = sentiment.find((row) => row.destinationId === focusId);

  // Anything captured during this session is highlighted, so the loop from
  // tourist action to government view is visible in one screen.
  const myCheckins = getInteractions({ types: ['QR_CHECKIN'] }).filter((row) =>
    isSessionRecord(row.id),
  );
  const myFeedback = getFeedback({}).filter((row) => isSessionRecord(row.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Live trip</h1>
        <p className="mt-1 text-[13px] text-ink-600">
          {trip.theme} · {formatLongDate(trip.startDate)} to {formatLongDate(trip.endDate)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Today"
              subtitle="Day 1 of your plan"
              action={<Badge tone="neutral">{todayStops.length} stops</Badge>}
            />
            <CardBody>
              {todayStops.length === 0 ? (
                <EmptyState icon="—" title="Nothing planned for today" />
              ) : (
                <ul className="space-y-2.5">
                  {todayStops.map((item) => {
                    const destination = getDestination(item.destinationId);
                    if (!destination) return null;
                    const checkedIn = myCheckins.some(
                      (row) => row.destinationId === destination.id,
                    );
                    return (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 rounded-md border border-line bg-surface p-3"
                      >
                        <DestinationSwatch destination={destination} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[14px] font-semibold text-ink-900">
                              {destination.name}
                            </p>
                            <span className="num text-[12px] text-ink-500">
                              {item.startTime} · {formatDuration(item.durationMinutes)}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={destination.status} />
                            {checkedIn ? <Badge tone="good">✓ Checked in</Badge> : null}
                            <Link
                              href={`/explore/trip?destination=${destination.id}`}
                              className="ml-auto text-[12px] font-medium text-brand-700 underline"
                            >
                              Select
                            </Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {upcoming.length > 0 ? (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                    Coming up
                  </p>
                  <ul className="space-y-1.5">
                    {upcoming.map((item) => {
                      const destination = getDestination(item.destinationId);
                      if (!destination) return null;
                      return (
                        <li key={item.id} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="text-ink-800">{destination.name}</span>
                          <span className="text-[11px] text-ink-500">Day {item.day}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Adapt the plan"
              subtitle="One change, and the affected part of the route is rebuilt."
            />
            <CardBody>
              <ReplanControls replan={replanCurrentTrip} />
            </CardBody>
          </Card>

          {focus ? (
            <Card>
              <CardHeader
                title={`Check in at ${focus.name}`}
                subtitle="Counts the visit. Records no identity, and you can decline."
              />
              <CardBody>
                <ActionForm
                  action={checkInForm}
                  submitLabel="Check in"
                  pendingLabel="Checking in…"
                  hiddenFields={{ destinationId: focus.id }}
                >
                  <label className="flex items-start gap-2 rounded-md border border-line bg-surface-2/50 p-3 text-[13px] text-ink-800">
                    <input
                      type="checkbox"
                      name="consent"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 accent-[var(--color-brand-600)]"
                    />
                    <span>
                      I agree to record an anonymous check-in at this destination. It is stored against
                      a random session identifier, never against me, and it is only ever shown to the
                      Tourism Department as part of an aggregate.
                    </span>
                  </label>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {focus ? (
            <Card>
              <CardHeader
                title={`How was ${focus.name}?`}
                subtitle="This is what turns a visit into a signal the department can act on."
              />
              <CardBody>
                <ActionForm
                  action={submitFeedbackForm}
                  submitLabel="Submit feedback"
                  pendingLabel="Submitting…"
                  hiddenFields={{ destinationId: focus.id }}
                >
                  <fieldset>
                    <legend className="mb-1.5 text-[12px] font-medium text-ink-700">
                      Rating<span className="ml-0.5 text-risk-500">*</span>
                    </legend>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <label
                          key={value}
                          htmlFor={`rating-${value}`}
                          className="cursor-pointer rounded-md border border-line-strong bg-surface px-3.5 py-2 text-[14px] font-semibold text-ink-700 hover:bg-surface-2 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                        >
                          <input
                            id={`rating-${value}`}
                            type="radio"
                            name="rating"
                            value={value}
                            required
                            defaultChecked={value === 4}
                            className="sr-only"
                          />
                          {value}
                          <span className="sr-only"> out of 5</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <Field
                    label="What is this about"
                    name="category"
                    required
                    hint="Choosing the category is what makes the feedback usable. It is not inferred by a model."
                  >
                    <Select id="category" name="category" required defaultValue="TRANSPORT">
                      <optgroup label="Something to fix">
                        {(Object.keys(ISSUE_CATEGORY_LABEL) as (keyof typeof ISSUE_CATEGORY_LABEL)[]).map(
                          (category) => (
                            <option key={category} value={category}>
                              {ISSUE_CATEGORY_LABEL[category]}
                            </option>
                          ),
                        )}
                      </optgroup>
                      <optgroup label="Something that worked">
                        {POSITIVE_THEMES.map((theme) => (
                          <option key={theme} value={theme}>
                            {theme.charAt(0) + theme.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                  </Field>

                  <Field label="In your words" name="text" required>
                    <TextArea
                      id="text"
                      name="text"
                      required
                      maxLength={600}
                      placeholder="Beautiful experience, but transport information was confusing."
                    />
                  </Field>
                </ActionForm>

                <p className="mt-3 text-[11px] text-ink-500">
                  Your text is anonymised before it reaches the Tourism Department. No contact details
                  are stored, and nothing identifies you.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {focusSentiment && focusSentiment.responses > 0 ? (
            <Card>
              <CardHeader
                title="What others said here"
                subtitle={`${focusSentiment.responses} responses in the last 30 days, averaging ${focusSentiment.averageRating?.toFixed(2)} of 5.`}
              />
              <CardBody>
                {focusSentiment.topIssue ? (
                  <p className="mb-3 rounded-md border border-warn-500/25 bg-warn-100/50 px-3 py-2 text-[12px] text-warn-700">
                    Most reported issue here: {focusSentiment.topIssue.label} (
                    {focusSentiment.topIssue.count} reports).
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {getFeedback({ destinationId: focusId })
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .slice(0, 3)
                    .map((entry) => (
                      <li key={entry.id}>
                        <FeedbackCard
                          feedback={entry}
                          destinationName={focus?.name ?? ''}
                          isNew={isSessionRecord(entry.id)}
                        />
                      </li>
                    ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {myFeedback.length > 0 || myCheckins.length > 0 ? (
            <Card className="border-lake-200 bg-lake-50/50">
              <CardHeader
                title="What you contributed this session"
                subtitle="These are already visible in the Tourism Department view."
              />
              <CardBody className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="lake">{myCheckins.length} check-ins</Badge>
                  <Badge tone="lake">{myFeedback.length} feedback items</Badge>
                  <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
                </div>
                <Link
                  href={`/gov/issues${focusId ? `?destination=${focusId}` : ''}`}
                  className="inline-block text-[13px] font-medium text-brand-700 underline"
                >
                  See it in Issues and Sentiment
                </Link>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
