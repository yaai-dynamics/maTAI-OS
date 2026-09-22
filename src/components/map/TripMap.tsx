'use client';

import { Maximize2, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatDuration } from '@/lib/geo';
import { dayColor, dayWaypoints, type MapStop, type RouteShape, type TripMapData } from '@/lib/map';
import { cn } from '@/components/ui/primitives';
import { MapCanvas, type CanvasLine, type CanvasPin, type MapCanvasHandle } from '@/components/map/MapCanvas';
import { BasePin, NightPin, PinTooltip, StopPin } from '@/components/map/pins';
import { PlaceCard, type AskPlaceFn, type PreviewFn, type SnapshotFn } from '@/components/map/PlaceCard';

type RoutesFn = (tripId: unknown) => Promise<{ ok: boolean; routes?: RouteShape[] }>;

const PLAY_STEP_MS = 4200;

/**
 * A trip on the map: numbered stops in each day's colour, the day's road
 * route, where each night is spent, and a "play" that flies through the
 * stops in order. `variant="card"` sits beside the timeline; `"full"` is the
 * map as the main view, with the day-by-day list beside it.
 */
export function TripMap({
  data,
  routes: loadRoutes,
  snapshot,
  getPreview,
  askPlace,
  variant,
  initialDay,
  fullHref,
  fallback,
}: {
  data: TripMapData;
  routes: RoutesFn;
  snapshot: SnapshotFn;
  getPreview: PreviewFn;
  askPlace: AskPlaceFn;
  variant: 'card' | 'full';
  initialDay?: number;
  /** Where "Open the map view" leads, from the card. */
  fullHref?: string;
  fallback: ReactNode;
}) {
  const canvas = useRef<MapCanvasHandle>(null);
  const [day, setDay] = useState<number | 'all'>(initialDay ?? 'all');
  const [selected, setSelected] = useState<string | undefined>();
  const [roads, setRoads] = useState<RouteShape[] | undefined>();
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);

  // Straight lines at once, roads when the router has answered.
  useEffect(() => {
    let cancelled = false;
    void loadRoutes(data.tripId)
      .catch(() => ({ ok: false }) as Awaited<ReturnType<RoutesFn>>)
      .then((result) => {
        if (!cancelled && result.ok && result.routes) setRoads(result.routes);
      });
    return () => {
      cancelled = true;
    };
  }, [data.tripId, loadRoutes]);

  const shapes: RouteShape[] = useMemo(
    () =>
      roads ??
      dayWaypoints(data).map(({ day: d, points }) => ({
        day: d,
        source: 'straight' as const,
        coordinates: points.map((point) => [point.longitude, point.latitude] as [number, number]),
      })),
    [roads, data],
  );

  const inDay = (stop: MapStop) => day === 'all' || stop.day === day;
  const visibleStops = data.stops.filter(inDay);
  const stopById = new Map(data.stops.map((stop) => [`stop-${stop.itemId}`, stop]));

  const pins: CanvasPin[] = useMemo(() => {
    const list: CanvasPin[] = [
      {
        id: 'base',
        latitude: data.base.latitude,
        longitude: data.base.longitude,
        label: 'Imphal, where the trip starts and ends',
        render: () => <BasePin />,
        tooltip: <PinTooltip eyebrow="Start and finish" title="Imphal" lines={['The trip starts here and ends back here.']} color="#14161f" />,
      },
    ];
    for (const night of data.nights) {
      // A night at a stop's own place, or back in Imphal, would sit on that
      // pin; the list and the timeline say where it is.
      const atBase = night.latitude === data.base.latitude && night.longitude === data.base.longitude;
      if (atBase || data.stops.some((stop) => stop.destinationId === night.destinationId)) continue;
      list.push({
        id: `night-${night.night}`,
        latitude: night.latitude,
        longitude: night.longitude,
        label: `Night ${night.night} near ${night.placeName}`,
        dimmed: day !== 'all' && night.night !== day,
        render: () => <NightPin partner={Boolean(night.partnerName)} />,
        tooltip: (
          <PinTooltip
            eyebrow={`Night ${night.night}`}
            title={night.partnerName ?? `Near ${night.placeName}`}
            lines={[night.partnerName ? `maTAI partner stay, ${night.placeName}` : 'No partner stay here yet']}
            color="#0e6e62"
          />
        ),
      });
    }
    for (const stop of data.stops) {
      const color = dayColor(stop.day);
      list.push({
        id: `stop-${stop.itemId}`,
        latitude: stop.latitude,
        longitude: stop.longitude,
        label: `Stop ${stop.number}, day ${stop.day}: ${stop.title}`,
        dimmed: day !== 'all' && stop.day !== day,
        render: ({ selected: isSelected, hovered }) => (
          <StopPin number={stop.number} color={color} selected={isSelected} hovered={hovered} experience={stop.kind === 'EXPERIENCE'} />
        ),
        tooltip: (
          <PinTooltip
            eyebrow={`Stop ${stop.number} · Day ${stop.day} · ${stop.startTime}`}
            title={stop.title}
            lines={[
              stop.kind === 'EXPERIENCE' ? `Local experience at ${stop.placeName}` : `${stop.district} district · about ${formatDuration(stop.durationMinutes)}`,
              stop.rationale,
            ]}
            hint="Click for photos and details"
            color={color}
          />
        ),
      });
    }
    return list;
  }, [data, day]);

  const lines: CanvasLine[] = useMemo(
    () =>
      shapes.map((shape) => ({
        id: `day-${shape.day}`,
        coordinates: shape.coordinates,
        color: dayColor(shape.day),
        dashed: shape.source === 'straight',
        dimmed: day !== 'all' && shape.day !== day,
      })),
    [shapes, day],
  );

  const fitIds = useMemo(
    () => ['base', ...visibleStops.map((stop) => `stop-${stop.itemId}`)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, data],
  );

  /* ---------------------------------- play ----------------------------------- */

  // While playing, the chosen stop is the one the play has reached.
  const playList = visibleStops;
  const playingStop = playing ? playList[step] : undefined;
  const shown = playingStop ? `stop-${playingStop.itemId}` : selected;
  const shownStop = shown ? stopById.get(shown) : undefined;
  const playCount = playList.length;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (step + 1 < playCount) {
        setStep(step + 1);
        return;
      }
      setPlaying(false);
      setSelected(undefined);
      canvas.current?.fit();
    }, PLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, step, playCount]);

  const togglePlay = () => {
    if (playing) {
      setSelected(shown);
      setPlaying(false);
      return;
    }
    canvas.current?.setThreeD(true);
    setStep(0);
    setPlaying(true);
  };

  const camera = playing
    ? { zoom: 13, pitch: 62, bearing: -30 + ((step * 53) % 90), duration: 3200, curve: 1.6 }
    : { zoom: 11.5, duration: 1100 };

  const choose = (id: string) => {
    if (!id.startsWith('stop-')) return;
    setPlaying(false);
    setSelected(id);
  };

  /* --------------------------------- pieces ---------------------------------- */

  const dayChips = (
    <div className="flex overflow-hidden rounded-lg border border-line bg-surface/95 shadow-sm backdrop-blur" role="group" aria-label="Show day">
      <DayChip active={day === 'all'} onClick={() => setDay('all')}>
        All days
      </DayChip>
      {Array.from({ length: data.days }, (_, index) => index + 1).map((d) => (
        <DayChip key={d} active={day === d} onClick={() => setDay(d)} color={dayColor(d)}>
          Day {d}
        </DayChip>
      ))}
    </div>
  );

  const toolbar = (
    <>
      <button
        type="button"
        onClick={togglePlay}
        disabled={playList.length === 0}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold shadow-sm',
          playing ? 'border-risk-500 bg-risk-100 text-risk-700' : 'border-lake-600 bg-lake-600 text-white hover:bg-lake-700',
        )}
      >
        {playing ? <Pause aria-hidden size={14} /> : <Play aria-hidden size={14} />}
        {playing ? 'Stop' : 'Play the route'}
      </button>
      {variant === 'card' ? dayChips : null}
    </>
  );

  const card = shownStop ? (
    <PlaceCard
      key={shownStop.itemId}
      destination={{
        id: shownStop.destinationId,
        name: shownStop.placeName,
        district: shownStop.district,
        palette: shownStop.palette,
        category: shownStop.category,
        latitude: shownStop.latitude,
        longitude: shownStop.longitude,
      }}
      eyebrow={`Stop ${shownStop.number} · Day ${shownStop.day}`}
      eyebrowColor={dayColor(shownStop.day)}
      onClose={() => {
        setPlaying(false);
        setSelected(undefined);
      }}
      snapshot={snapshot}
      getPreview={getPreview}
      askPlace={askPlace}
      className="absolute bottom-3 left-3 right-3 z-[3] sm:right-auto sm:w-[330px]"
    >
      {shownStop.kind === 'EXPERIENCE' ? (
        <p className="text-[13px] font-semibold text-ink-900">{shownStop.title}</p>
      ) : null}
      <p className="num text-[12px] text-ink-600">
        {shownStop.startTime} · about {formatDuration(shownStop.durationMinutes)}
      </p>
      <p className="line-clamp-3 text-[12px] leading-snug text-ink-700">{shownStop.rationale}</p>
    </PlaceCard>
  ) : null;

  const map = (
    <MapCanvas
      ref={canvas}
      pins={pins}
      lines={lines}
      selectedId={shown}
      onSelect={choose}
      fitIds={fitIds}
      fitKey={String(day)}
      fitPadding={variant === 'full' ? { top: 90, bottom: 60, left: 60, right: 60 } : { top: 80, bottom: 40, left: 40, right: 50 }}
      cooperative={variant === 'card'}
      selectCamera={camera}
      toolbar={toolbar}
      fallback={fallback}
      ariaLabel="Map of the trip's stops and routes"
      className={variant === 'full' ? 'h-full rounded-none border-0' : 'h-[440px]'}
    >
      {card}
    </MapCanvas>
  );

  if (variant === 'card') {
    return (
      <div className="space-y-2">
        {map}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RouteNote roads={roads} />
          {fullHref ? (
            <Link href={fullHref} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline">
              <Maximize2 aria-hidden size={13} />
              Open the map view
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface lg:h-[calc(100vh-10rem)] lg:min-h-[560px] lg:flex-row">
      <div className="h-[62vh] min-h-[380px] lg:order-2 lg:h-auto lg:flex-1">{map}</div>
      <aside className="border-t border-line lg:order-1 lg:w-[330px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
        <div className="sticky top-0 z-[1] space-y-2 border-b border-line bg-surface px-4 py-3">
          <p className="text-[13px] font-semibold text-ink-900">
            {data.stops.length} stops over {data.days} {data.days === 1 ? 'day' : 'days'}
          </p>
          <div className="flex flex-wrap gap-1">
            <RailChip active={day === 'all'} onClick={() => setDay('all')}>
              All
            </RailChip>
            {Array.from({ length: data.days }, (_, index) => index + 1).map((d) => (
              <RailChip key={d} active={day === d} onClick={() => setDay(d)} color={dayColor(d)}>
                Day {d}
              </RailChip>
            ))}
          </div>
        </div>
        <ol className="space-y-4 px-4 py-3">
          {Array.from({ length: data.days }, (_, index) => index + 1)
            .filter((d) => day === 'all' || d === day)
            .map((d) => {
              const stops = data.stops.filter((stop) => stop.day === d);
              const road = roads?.find((shape) => shape.day === d);
              const night = data.nights.find((row) => row.night === d);
              return (
                <li key={d}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: dayColor(d) }} />
                      Day {d}
                    </p>
                    {road?.source === 'road' && road.distanceKm ? (
                      <span className="num text-[11px] text-ink-500">
                        {road.distanceKm} km · {formatDuration(road.durationMinutes ?? 0)} driving
                      </span>
                    ) : null}
                  </div>
                  {stops.length === 0 ? <p className="text-[12px] text-ink-500">No stops this day.</p> : null}
                  <ol className="space-y-1">
                    {stops.map((stop) => {
                      const id = `stop-${stop.itemId}`;
                      return (
                        <li key={stop.itemId}>
                          <button
                            type="button"
                            onClick={() => choose(id)}
                            aria-pressed={shown === id}
                            className={cn(
                              'flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                              shown === id ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-surface-2',
                            )}
                          >
                            <span
                              className={cn(
                                'num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[11px] font-bold text-white',
                                stop.kind === 'EXPERIENCE' ? 'rounded-md' : 'rounded-full',
                              )}
                              style={{ background: dayColor(stop.day) }}
                            >
                              {stop.number}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-ink-900">{stop.title}</span>
                              <span className="num block text-[11px] text-ink-500">
                                {stop.startTime} · {formatDuration(stop.durationMinutes)}
                                {stop.kind === 'EXPERIENCE' ? ` · at ${stop.placeName}` : ` · ${stop.district}`}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  {night && d < data.days ? (
                    <p className="mt-1 pl-2 text-[11px] text-ink-500">
                      ☾ Night {d}: {night.partnerName ? `${night.partnerName}, ${night.placeName}` : `near ${night.placeName}`}
                    </p>
                  ) : null}
                </li>
              );
            })}
        </ol>
        <div className="border-t border-line px-4 py-3">
          <RouteNote roads={roads} />
        </div>
      </aside>
    </div>
  );
}

function RouteNote({ roads }: { roads: RouteShape[] | undefined }) {
  const straight = roads?.some((shape) => shape.source === 'straight');
  return (
    <p className="text-[11px] text-ink-500">
      {!roads
        ? 'Finding the roads… lines are straight until then.'
        : straight
          ? 'Routes follow the roads (OpenStreetMap routing); a dashed line is a straight line where no road route was found.'
          : 'Routes follow the roads (OpenStreetMap routing).'}{' '}
      Times in the plan are its own estimates.
    </p>
  );
}

function DayChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('inline-flex items-center gap-1 px-2 py-1.5 text-[12px] font-medium', active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-surface-2')}
    >
      {color ? <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  );
}

function RailChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium',
        active ? 'border-ink-900 bg-ink-900 text-white' : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-2',
      )}
    >
      {color ? <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  );
}
