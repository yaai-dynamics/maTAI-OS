import Link from 'next/link';

import { formatDuration } from '@/lib/geo';
import type { Trip } from '@/lib/types';
import { getDestination, getExperience } from '@/server/data/repository';
import { Badge, Card, cn } from '@/components/ui/primitives';
import { DestinationSwatch } from '@/components/shared/DestinationVisual';

/**
 * The itinerary, day by day.
 *
 * Every stop carries the reason it was chosen, phrased against the stated
 * preferences. That is the difference between a plan and a list.
 */
export function JourneyTimeline({ trip }: { trip: Trip }) {
  const days = [...new Set(trip.items.map((item) => item.day))].sort((a, b) => a - b);

  return (
    <ol className="space-y-6">
      {days.map((day) => {
        const items = trip.items
          .filter((item) => item.day === day)
          .sort((a, b) => a.sequence - b.sequence);
        const dayMinutes = items.reduce(
          (sum, item) => sum + item.durationMinutes + item.travelMinutesFromPrevious,
          0,
        );

        return (
          <li key={day}>
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-ink-900">Day {day}</h3>
              <span className="num text-[12px] text-ink-500">
                about {formatDuration(dayMinutes)} including travel
              </span>
            </div>

            <ol className="space-y-2.5">
              {items.map((item) => {
                const destination = getDestination(item.destinationId);
                const experience = item.experienceId ? getExperience(item.experienceId) : undefined;
                if (!destination) return null;

                const alternative = trip.alternatives.find(
                  (entry) => entry.replacesItemId === item.id,
                );
                const alternativeDestination = alternative
                  ? getDestination(alternative.destinationId)
                  : undefined;

                return (
                  <li key={item.id}>
                    <Card
                      className={cn(
                        'p-3.5',
                        item.kind === 'EXPERIENCE' && 'border-lake-200 bg-lake-50/40',
                      )}
                    >
                      {item.travelMinutesFromPrevious > 0 ? (
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-500">
                          <span aria-hidden>↓</span>
                          about {formatDuration(item.travelMinutesFromPrevious)} travel, estimated from
                          straight-line distance on a hill-adjusted road factor
                        </p>
                      ) : null}

                      <div className="flex items-start gap-3">
                        <DestinationSwatch destination={destination} />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[14px] font-semibold text-ink-900">
                                {experience ? experience.title : destination.name}
                              </p>
                              <p className="text-[11px] text-ink-500">
                                {experience
                                  ? `Local experience at ${destination.name}`
                                  : `${destination.district} district`}
                              </p>
                            </div>
                            <span className="num shrink-0 text-[12px] text-ink-600">
                              {item.startTime} · {formatDuration(item.durationMinutes)}
                            </span>
                          </div>

                          <p className="mt-2 rounded-md border border-line bg-surface-2/60 px-2.5 py-2 text-[12px] text-ink-700">
                            {item.rationale}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {item.matchedInterests.map((interest) => (
                              <Badge key={interest} tone="lake">
                                {interest}
                              </Badge>
                            ))}
                            {experience ? (
                              <Badge tone="neutral">₹{experience.price.toLocaleString('en-IN')}</Badge>
                            ) : null}
                            <Link
                              href={`/explore/destinations/${destination.id}`}
                              className="ml-auto text-[12px] font-medium text-brand-700 underline"
                            >
                              Open {destination.name}
                            </Link>
                          </div>

                          {alternative && alternativeDestination ? (
                            <div className="mt-2.5 rounded-md border border-dashed border-line-strong bg-surface px-2.5 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                                Alternative
                              </p>
                              <p className="mt-0.5 text-[12px] text-ink-700">{alternative.reason}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
