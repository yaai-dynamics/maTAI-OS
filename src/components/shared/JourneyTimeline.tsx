import { formatTripDay } from '@/lib/journey';
import { formatDuration } from '@/lib/geo';
import type { Destination, Trip } from '@/lib/types';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import { DEFAULT_ASK_PROMPTS } from '@/server/ai/storyteller';
import {
  getBusiness,
  getDataSource,
  getDestination,
  getDestinations,
  getEventsFor,
  getExperience,
  getExperiencesFor,
  getFactsFor,
  getHeritageExperience,
} from '@/server/data/repository';
import { Badge, Card, cn } from '@/components/ui/primitives';
import { DestinationPreviewLink } from '@/components/shared/DestinationPreview';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { DestinationSwatch } from '@/components/shared/DestinationVisual';

type AskFn = (
  destinationId: string,
  question: string,
) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;

/**
 * The itinerary, day by day.
 *
 * Every stop carries the reason it was chosen, phrased against the stated
 * preferences. That is the difference between a plan and a list.
 */
export function JourneyTimeline({ trip, ask }: { trip: Trip; ask: AskFn }) {
  // Every day of the trip, including one with no stops (a late arrival, say).
  const last = Math.max(trip.preferences.durationDays, ...trip.items.map((item) => item.day));
  const days = Array.from({ length: last }, (_, index) => index + 1);

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
              <h3 className="text-[15px] font-semibold text-ink-900">
                Day {day}
                {trip.startDate ? (
                  <span className="ml-2 text-[13px] font-normal text-ink-500">{formatTripDay(trip.startDate, day)}</span>
                ) : null}
              </h3>
              <span className="num text-[12px] text-ink-500">
                about {formatDuration(dayMinutes)} including travel
              </span>
            </div>

            {day === 1 && trip.arriveTime ? (
              <p className="mb-2 text-[12px] text-ink-600">Arrive in Imphal at {trip.arriveTime}.</p>
            ) : null}
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-strong px-3 py-2 text-[12px] text-ink-500">
                {day === 1 ? 'Arrival and settling in: nothing else fits after landing.' : 'A travel day, with no stop that fits.'}
              </p>
            ) : null}
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
                            <DestinationPreviewLink
                              destination={previewOf(destination)}
                              ask={ask}
                              className="ml-auto"
                            >
                              Explore
                            </DestinationPreviewLink>
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
            <NightLine trip={trip} day={day} last={day === last} />
          </li>
        );
      })}
    </ol>
  );
}

/** Everything the destination's own page shows, gathered for the "Explore" popup. */
function previewOf(destination: Destination): DestinationDetailsData {
  const facts = getFactsFor(destination.id);
  const heritage = getHeritageExperience(destination.id);
  return {
    destination,
    narrative: facts.filter((fact) => fact.factType !== 'PRACTICAL'),
    practical: facts.filter((fact) => fact.factType === 'PRACTICAL'),
    source: getDataSource(facts[0]?.sourceId ?? 'src-curated-knowledge'),
    heritage,
    experiences: getExperiencesFor(destination.id).map((experience) => ({
      experience,
      businessName: getBusiness(experience.businessId)?.name ?? 'Local provider',
    })),
    events: getEventsFor(destination.id),
    nearby: getDestinations()
      .filter((entry) => entry.id !== destination.id && entry.district === destination.district)
      .slice(0, 3),
    prompts: heritage ? heritage.askPrompts : DEFAULT_ASK_PROMPTS,
  };
}

/** Where the day ends: the night's stay, or the flight out. */
function NightLine({ trip, day, last }: { trip: Trip; day: number; last: boolean }) {
  if (last) {
    return (
      <p className="mt-2.5 text-[12px] text-ink-600">
        {trip.departTime ? `Back in Imphal to leave at ${trip.departTime}.` : 'The trip ends back in Imphal.'}
      </p>
    );
  }
  const stay = trip.logistics?.stays.find((row) => row.night === day);
  if (!stay) return null;
  const partner = stay.businessId ? getBusiness(stay.businessId) : undefined;
  const place = getDestination(stay.destinationId)?.name ?? stay.destinationId;
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-600">
      <span aria-hidden>☾</span>
      Night {day}:{' '}
      {partner ? (
        <>
          <span className="font-medium text-ink-800">{partner.name}</span>, {place}
          <Badge tone="lake">maTAI partner</Badge>
        </>
      ) : (
        <>near {place}, no partner stay yet</>
      )}
    </p>
  );
}
