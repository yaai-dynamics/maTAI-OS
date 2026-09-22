import { ArrowRight, CalendarDays, Clock, Route } from 'lucide-react';

import { now } from '@/lib/config';
import { formatPlanFor, formatPlannedOn, journeyPhase, PHASE_LABEL, type JourneyPhase } from '@/lib/journey';
import { formatRupees } from '@/lib/money';
import type { Trip } from '@/lib/types';
import { deleteJourneyForm } from '@/server/actions/forms';
import { costTrip, summariseTrip } from '@/server/ai/trip-logistics';
import { ActionForm } from '@/components/shared/ActionForm';
import { CompareButton } from '@/components/shared/CompareOptions';
import { Badge, ButtonLink, Card, type BadgeTone } from '@/components/ui/primitives';

const PHASE_TONE: Record<JourneyPhase, BadgeTone> = {
  OPTION: 'neutral',
  IN_PROGRESS: 'lake',
  UPCOMING: 'info',
  FINALISED: 'good',
  PAST: 'neutral',
};

/**
 * The visitor's journeys, beside the planner: options still waiting for a
 * choice, then the journeys they kept, current first.
 */
export function JourneyList({ trips, limit }: { trips: Trip[]; limit: number }) {
  const at = now();
  const options = trips.filter((trip) => trip.status === 'DRAFT');
  const kept = trips
    .filter((trip) => trip.status !== 'DRAFT')
    .map((trip) => ({ trip, phase: journeyPhase(trip, at) }))
    .sort((a, b) => rank(a.phase) - rank(b.phase));

  const groups = [...new Map(options.map((trip) => [trip.optionGroupId ?? trip.id, [] as Trip[]])).entries()].map(
    ([key]) => ({ key, trips: options.filter((trip) => (trip.optionGroupId ?? trip.id) === key) }),
  );

  return (
    <section aria-labelledby="journeys-heading" className="space-y-5">
      {groups.length > 0 ? (
        <div className="space-y-2.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink-900">Waiting for your choice</h2>
          {groups.map((group) => (
            <Card key={group.key} as="article" className="p-4">
              <div className="flex items-start justify-between gap-2">
                {group.trips[0]?.preferences.rawRequest ? (
                  <p className="line-clamp-2 text-[12px] italic text-ink-600">“{group.trips[0].preferences.rawRequest}”</p>
                ) : (
                  <span />
                )}
                <CompareButton
                  options={group.trips.map((trip) => ({
                    tripId: trip.id,
                    label: trip.optionLabel ?? 'Option',
                    theme: trip.theme,
                    days: trip.preferences.durationDays,
                    ...summariseTrip(trip),
                  }))}
                />
              </div>
              <ul className="mt-2 divide-y divide-line">
                {group.trips.map((trip) => (
                  <li key={trip.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-lake-700">
                        {trip.optionLabel ?? 'Option'}
                      </p>
                      <p className="truncate text-[13px] font-medium text-ink-900">{trip.theme}</p>
                      <p className="text-[12px] text-ink-500">
                        {trip.preferences.durationDays} days · {formatRupees(costTrip(trip).total)} estimated
                      </p>
                    </div>
                    <ButtonLink href={`/explore/journey/${trip.id}`} size="sm" variant="secondary">
                      View
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="journeys-heading" className="text-[17px] font-semibold tracking-tight text-ink-900">
              Your trips
            </h2>
            <p className="text-[12px] text-ink-600">Kept in this browser, without an account.</p>
          </div>
          {kept.length > 0 ? (
            <span className="text-[12px] text-ink-500">
              {kept.length} of {limit} kept
            </span>
          ) : null}
        </div>

        {kept.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-5 py-8 text-center">
            <span
              aria-hidden
              className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-lake-100 text-lake-700"
            >
              <Route size={20} />
            </span>
            <p className="text-sm font-semibold text-ink-800">No trips yet</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-600">
              Plan a trip, then choose one of its options to keep it here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {kept.map(({ trip, phase }) => {
              const planFor = formatPlanFor(trip);
              const stops = trip.items.filter((item) => item.kind === 'DESTINATION').length;
              return (
                <li key={trip.id}>
                  <Card as="article" className={phase === 'IN_PROGRESS' ? 'border-lake-300 p-4' : 'p-4'}>
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lake-100 text-lake-700"
                      >
                        <Route size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-[14px] font-semibold leading-snug text-ink-900">{trip.theme}</h3>
                          <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
                        </div>
                        <p className="mt-0.5 text-[12px] text-ink-500">
                          {trip.preferences.durationDays} days · {stops} {stops === 1 ? 'place' : 'places'} ·{' '}
                          {formatRupees(costTrip(trip).total)} estimated
                        </p>
                        <dl className="mt-2 space-y-0.5 text-[12px]">
                          <div className="flex items-center gap-1.5 text-ink-600">
                            <CalendarDays aria-hidden size={13} className="text-ink-400" />
                            <dt className="text-ink-500">Plan for</dt>
                            <dd className="text-ink-800">{planFor ?? 'Dates not set'}</dd>
                          </div>
                          <div className="flex items-center gap-1.5 text-ink-600">
                            <Clock aria-hidden size={13} className="text-ink-400" />
                            <dt className="text-ink-500">Planned on</dt>
                            <dd className="text-ink-800">{formatPlannedOn(trip.createdAt)}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
                      <ButtonLink href={`/explore/journey/${trip.id}`} size="sm">
                        View trip
                        <ArrowRight aria-hidden size={15} />
                      </ButtonLink>
                      <ActionForm
                        action={deleteJourneyForm}
                        submitLabel="Delete"
                        pendingLabel="Deleting…"
                        variant="ghost"
                        size="sm"
                        className="space-y-1"
                        hiddenFields={{ tripId: trip.id }}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** In progress first, then upcoming, finalised without dates, and past. */
const rank = (phase: JourneyPhase) => ['IN_PROGRESS', 'UPCOMING', 'FINALISED', 'PAST', 'OPTION'].indexOf(phase);
