'use client';

import { CalendarRange, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatDuration } from '@/lib/geo';
import { PALETTE_COLOR, planHref, type MapPlace } from '@/lib/map';
import { cn } from '@/components/ui/primitives';
import { DestinationSwatch } from '@/components/shared/DestinationVisual';
import { DiscoverChatContext } from '@/components/shared/DiscoverWorkspace';
import { MapCanvas, type CanvasPin, type MapCanvasHandle } from '@/components/map/MapCanvas';
import { PinTooltip, PlacePin } from '@/components/map/pins';
import { PlaceCard, type AskPlaceFn, type PreviewFn, type SnapshotFn } from '@/components/map/PlaceCard';

/** An experience as the map lists it. */
export interface MapExperience {
  id: string;
  title: string;
  destinationId: string;
  businessName: string;
  price: number;
  durationMinutes?: number;
  /** Where "Request to book" or "Enquire" leads. */
  href: string;
  bookable: boolean;
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');

/**
 * Discover with the map as the main view. The list beside it holds the same
 * places in text, and the chat, when open, moves the map to the places it
 * names.
 */
export function DiscoverMap({
  mode,
  places,
  experiences,
  snapshot,
  getPreview,
  askPlace,
  fallback,
}: {
  mode: 'destinations' | 'experiences';
  places: MapPlace[];
  experiences: MapExperience[];
  snapshot: SnapshotFn;
  getPreview: PreviewFn;
  askPlace: AskPlaceFn;
  fallback: ReactNode;
}) {
  const canvas = useRef<MapCanvasHandle>(null);
  const { chatOpen, named } = useContext(DiscoverChatContext);
  const [selected, setSelected] = useState<string | undefined>();
  const [seenKey, setSeenKey] = useState(named.key);
  const [clearedKey, setClearedKey] = useState(0);

  const byPlace = useMemo(() => {
    const map = new Map<string, MapExperience[]>();
    for (const experience of experiences) map.set(experience.destinationId, [...(map.get(experience.destinationId) ?? []), experience]);
    return map;
  }, [experiences]);

  // The chat named places: one is opened, several are shown together, and
  // the rest are dimmed until "show all".
  const namedHere = useMemo(
    () => named.ids.filter((id) => places.some((place) => place.id === id)),
    [named.ids, places],
  );
  const highlighted = useMemo(
    () => new Set(named.key > 0 && named.key !== clearedKey ? namedHere : []),
    [named.key, clearedKey, namedHere],
  );
  if (named.key !== seenKey) {
    setSeenKey(named.key);
    if (namedHere.length === 1) setSelected(namedHere[0]);
    else if (namedHere.length > 1) setSelected(undefined);
  }
  useEffect(() => {
    if (named.key > 0 && namedHere.length > 1) canvas.current?.fit(namedHere);
    // Only when the chat names places again, not when the list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [named.key]);

  const pins: CanvasPin[] = useMemo(
    () =>
      places.map((place) => {
        const color = PALETTE_COLOR[place.palette];
        return {
          id: place.id,
          latitude: place.latitude,
          longitude: place.longitude,
          label: `${place.name}, ${place.district}`,
          dimmed: highlighted.size > 0 && !highlighted.has(place.id),
          render: ({ selected: isSelected, hovered }) => (
            <PlacePin
              palette={place.palette}
              color={color}
              name={place.name}
              selected={isSelected}
              hovered={hovered}
              count={place.experienceCount || undefined}
              highlighted={highlighted.has(place.id)}
            />
          ),
          tooltip: (
            <PinTooltip
              eyebrow={place.category.slice(0, 3).map(titleCase).join(' · ')}
              title={place.name}
              lines={[
                place.summary,
                [
                  place.experienceCount ? `${place.experienceCount} local ${place.experienceCount === 1 ? 'experience' : 'experiences'}` : undefined,
                  place.bestSeason ? `best ${place.bestSeason}` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined,
              ]}
              hint="Click for photos, details and booking"
              color={color}
            />
          ),
        };
      }),
    [places, highlighted],
  );

  const place = selected ? places.find((row) => row.id === selected) : undefined;
  const here = place ? (byPlace.get(place.id) ?? []) : [];

  const card = place ? (
    <PlaceCard
      key={place.id}
      destination={place}
      eyebrow={place.category.slice(0, 2).map(titleCase).join(' · ')}
      eyebrowColor={PALETTE_COLOR[place.palette]}
      onClose={() => setSelected(undefined)}
      snapshot={snapshot}
      getPreview={getPreview}
      askPlace={askPlace}
      className="absolute bottom-3 left-3 right-3 z-[3] max-h-[calc(100%-4.5rem)] overflow-y-auto sm:right-auto sm:w-[340px]"
      actions={
        <Link
          href={planHref(place.name)}
          className="inline-flex items-center gap-1 rounded-md border border-lake-600 bg-lake-50 px-2.5 py-1.5 text-[12px] font-medium text-lake-800 hover:bg-lake-100"
        >
          <CalendarRange aria-hidden size={13} />
          Plan a trip here
        </Link>
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
              <li key={experience.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-ink-900">{experience.title}</span>
                  <span className="block truncate text-[11px] text-ink-500">
                    {experience.businessName} · ₹{experience.price.toLocaleString('en-IN')} per person
                  </span>
                </span>
                <a
                  href={experience.href}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium',
                    experience.bookable ? 'bg-brand-700 text-white hover:bg-brand-600' : 'border border-line-strong text-ink-800 hover:bg-surface',
                  )}
                >
                  {experience.bookable ? 'Book' : 'Enquire'}
                </a>
              </li>
            ))}
          </ul>
          {here.length > 3 ? (
            <a href={`/explore/discover?mode=experiences&destination=${place.id}`} className="mt-1 inline-block text-[11px] font-medium text-brand-700 hover:underline">
              All {here.length} experiences here
            </a>
          ) : null}
        </div>
      ) : null}
    </PlaceCard>
  ) : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface lg:h-[calc(100vh-17rem)] lg:min-h-[520px] lg:flex-row">
      <div className="h-[64vh] min-h-[400px] lg:order-2 lg:h-auto lg:flex-1">
        <MapCanvas
          ref={canvas}
          pins={pins}
          selectedId={selected}
          onSelect={setSelected}
          fitKey={`${mode}:${places.map((row) => row.id).join(',')}`}
          fitPadding={{ top: 80, bottom: 50, left: 50, right: 50 }}
          fallback={fallback}
          ariaLabel="Map of places to discover in Manipur"
          className="h-full rounded-none border-0"
          toolbar={
            highlighted.size > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setClearedKey(named.key);
                  canvas.current?.fit();
                }}
                className="rounded-lg border border-brand-500 bg-brand-50 px-2.5 py-1.5 text-[12px] font-medium text-brand-700 shadow-sm"
              >
                Showing {highlighted.size} from the chat · show all
              </button>
            ) : null
          }
        >
          {card}
        </MapCanvas>
      </div>

      <aside
        className={cn(
          'border-t border-line lg:order-1 lg:w-[320px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-t-0',
          chatOpen && 'lg:hidden',
        )}
      >
        <p className="sticky top-0 z-[1] border-b border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink-900">
          {mode === 'experiences'
            ? `${experiences.length} ${experiences.length === 1 ? 'experience' : 'experiences'} at ${places.length} ${places.length === 1 ? 'place' : 'places'}`
            : `${places.length} ${places.length === 1 ? 'place' : 'places'}`}
        </p>
        <ul className="divide-y divide-line">
          {places.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelected(row.id)}
                aria-pressed={selected === row.id}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                  selected === row.id ? 'bg-brand-50' : 'hover:bg-surface-2',
                )}
              >
                <DestinationSwatch destination={row} className="h-12 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink-900">{row.name}</span>
                    {row.demandIndex !== undefined && mode === 'destinations' ? (
                      <span className="num shrink-0 text-[11px] text-ink-500">{row.demandIndex} interest</span>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-ink-500">
                    {row.district}
                    {row.experienceCount ? ` · ${row.experienceCount} ${row.experienceCount === 1 ? 'experience' : 'experiences'}` : ''}
                  </span>
                  {mode === 'experiences' ? (
                    <span className="mt-1 block space-y-0.5">
                      {(byPlace.get(row.id) ?? []).slice(0, 3).map((experience) => (
                        <span key={experience.id} className="block truncate text-[12px] text-ink-700">
                          · {experience.title}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-600">{row.summary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
