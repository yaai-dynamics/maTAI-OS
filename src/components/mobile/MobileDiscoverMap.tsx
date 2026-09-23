'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarRange, Sparkles } from 'lucide-react';

import { formatDuration } from '@/lib/geo';
import { PALETTE_COLOR, type MapPlace } from '@/lib/map';
import { formatRupees } from '@/lib/money';
import { MapCanvas, type CanvasPin } from '@/components/map/MapCanvas';
import { PinTooltip, PlacePin } from '@/components/map/pins';
import { PlaceCard, type AskPlaceFn, type PreviewFn, type SnapshotFn } from '@/components/map/PlaceCard';
import type { MapExperience } from '@/components/map/DiscoverMap';

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');

/**
 * Discover's map on a phone. The same map, pins and place card as the
 * desktop DiscoverMap, without its side list: that list has a count bar that
 * sticks to the top, which on a phone pins itself over the screen as the page
 * scrolls. Links stay inside /m, and the card's photograph comes from the
 * photographs the app ships (mobilePlaceSnapshot).
 */
export function MobileDiscoverMap({
  mode,
  places,
  experiences,
  snapshot,
  getPreview,
  askPlace,
  fallback,
}: {
  mode: 'places' | 'experiences';
  places: MapPlace[];
  experiences: MapExperience[];
  snapshot: SnapshotFn;
  getPreview: PreviewFn;
  askPlace: AskPlaceFn;
  fallback: ReactNode;
}) {
  const [selected, setSelected] = useState<string | undefined>();

  const byPlace = useMemo(() => {
    const map = new Map<string, MapExperience[]>();
    for (const experience of experiences) map.set(experience.destinationId, [...(map.get(experience.destinationId) ?? []), experience]);
    return map;
  }, [experiences]);

  const pins: CanvasPin[] = useMemo(
    () =>
      places.map((place) => {
        const color = PALETTE_COLOR[place.palette];
        return {
          id: place.id,
          latitude: place.latitude,
          longitude: place.longitude,
          label: `${place.name}, ${place.district}`,
          render: ({ selected: isSelected, hovered }) => (
            <PlacePin
              palette={place.palette}
              color={color}
              name={place.name}
              selected={isSelected}
              hovered={hovered}
              count={place.experienceCount || undefined}
            />
          ),
          tooltip: (
            <PinTooltip
              eyebrow={place.category.slice(0, 3).map(titleCase).join(' · ')}
              title={place.name}
              lines={[place.summary]}
              hint="Tap for photos and details"
              color={color}
            />
          ),
        };
      }),
    [places],
  );

  const place = selected ? places.find((row) => row.id === selected) : undefined;
  const here = place ? (byPlace.get(place.id) ?? []) : [];

  return (
    <div className="-mx-4 h-[62dvh] min-h-[380px] overflow-hidden border-y border-line">
      <MapCanvas
        pins={pins}
        selectedId={selected}
        onSelect={setSelected}
        fitKey={`${mode}:${places.map((row) => row.id).join(',')}`}
        fitPadding={{ top: 70, bottom: 40, left: 40, right: 40 }}
        cooperative
        fallback={fallback}
        ariaLabel="Map of places to discover in Manipur"
        className="h-full rounded-none border-0"
      >
        {place ? (
          <PlaceCard
            key={place.id}
            destination={place}
            eyebrow={place.category.slice(0, 2).map(titleCase).join(' · ')}
            eyebrowColor={PALETTE_COLOR[place.palette]}
            onClose={() => setSelected(undefined)}
            snapshot={snapshot}
            getPreview={getPreview}
            askPlace={askPlace}
            className="absolute bottom-3 left-3 right-3 z-[3] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl"
            actions={
              <>
                <Link
                  href={`/m/place/${place.id}`}
                  className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-2.5 py-1.5 text-[12px] font-medium text-white"
                >
                  Open place
                  <ArrowRight aria-hidden size={13} />
                </Link>
                <Link
                  href={`/m/plan?plan=${encodeURIComponent(`A trip that includes ${place.name}`)}`}
                  className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink-800"
                >
                  <CalendarRange aria-hidden size={13} />
                  Plan a trip
                </Link>
              </>
            }
          >
            <p className="line-clamp-3 text-[12px] leading-snug text-ink-700">{place.summary}</p>
            <p className="text-[11px] text-ink-500">
              {[place.bestSeason ? `Best ${place.bestSeason}` : undefined, `about ${formatDuration(place.typicalVisitMinutes)} for a visit`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {here.length > 0 ? (
              <div className="rounded-lg border border-line bg-surface-2/50 p-2">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  <Sparkles aria-hidden size={12} />
                  Local experiences here
                </p>
                <ul className="space-y-1">
                  {here.slice(0, 3).map((experience) => (
                    <li key={experience.id}>
                      <Link href={experience.href} className="flex items-center justify-between gap-2 py-0.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-medium text-ink-900">{experience.title}</span>
                          <span className="block truncate text-[11px] text-ink-500">
                            {experience.businessName} · {formatRupees(experience.price)} per person
                          </span>
                        </span>
                        <span className="shrink-0 rounded-md bg-ink-900 px-2 py-1 text-[11px] font-medium text-white">
                          {experience.bookable ? 'Book' : 'Enquire'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {here.length > 3 ? (
                  <Link
                    href={`/m/discover?mode=experiences&destination=${place.id}`}
                    className="mt-1 inline-block text-[11px] font-medium text-ink-900 underline"
                  >
                    All {here.length} experiences here
                  </Link>
                ) : null}
              </div>
            ) : null}
          </PlaceCard>
        ) : null}
      </MapCanvas>
    </div>
  );
}
