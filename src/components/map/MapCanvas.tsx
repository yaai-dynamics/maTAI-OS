'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import { Layers, Mountain, Satellite } from 'lucide-react';
import type { FlyToOptions, Map as MapLibreMap, Marker, Popup, StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/components/ui/primitives';

/**
 * A real, tiled map of Manipur (docs/09 §27).
 *
 * Pins are React content rendered into MapLibre markers through portals, so
 * they are ordinary buttons that can be tabbed to and read by a screen reader.
 * Every map screen also lists the same places in text beside the map: the
 * map is a way in, never the only one.
 *
 * Tiles come from public services (OpenFreeMap, Esri, AWS terrain). When they
 * cannot be reached, or WebGL is missing, the caller's `fallback` is shown,
 * the schematic offline map, so the demo still works with no network
 * (CLAUDE.md section 3).
 */

export interface CanvasPin {
  id: string;
  latitude: number;
  longitude: number;
  /** Accessible name of the pin's button. */
  label: string;
  render: (state: { selected: boolean; hovered: boolean }) => ReactNode;
  /** Shown on hover and keyboard focus. */
  tooltip: ReactNode;
  dimmed?: boolean;
}

export interface CanvasLine {
  id: string;
  coordinates: [number, number][];
  color: string;
  dashed?: boolean;
  dimmed?: boolean;
}

export type Basemap = 'streets' | 'satellite';

export interface MapCanvasHandle {
  flyTo: (id: string, options?: Partial<FlyToOptions>) => void;
  fit: (ids?: string[]) => void;
  /** Turns the 3D hills on or off, as the button does. */
  setThreeD: (on: boolean) => void;
}

const STREETS = 'https://tiles.openfreemap.org/styles/liberty';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    places: {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 18,
    },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    { id: 'places', type: 'raster', source: 'places' },
  ],
};
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const DEM_ATTRIBUTION = 'Terrain: Mapzen, AWS Open Data';

const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

const MANIPUR_CENTER: [number, number] = [93.9, 24.75];
/** Keeps the map around Manipur; the planner never goes further. */
const MAX_BOUNDS: [[number, number], [number, number]] = [[91.6, 22.8], [96.2, 26.8]];
const LOAD_TIMEOUT_MS = 12_000;
/** Pins closer than this on screen are fanned out so each can be seen and pressed. */
const CROWD_PX = 40;

const ROUTES = 'matai-routes';

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function routeData(lines: CanvasLine[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines.map((line) => ({
      type: 'Feature',
      properties: { id: line.id, color: line.color, dashed: Boolean(line.dashed), dimmed: Boolean(line.dimmed) },
      geometry: { type: 'LineString', coordinates: line.coordinates },
    })),
  };
}

export function MapCanvas({
  pins,
  lines = [],
  selectedId,
  onSelect,
  onHover,
  fitIds,
  fitKey,
  fitPadding,
  cooperative = false,
  selectCamera,
  fallback,
  toolbar,
  children,
  className,
  ariaLabel,
  ref,
}: {
  pins: CanvasPin[];
  lines?: CanvasLine[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onHover?: (id: string | undefined) => void;
  /** Which pins the view fits to; all of them when not given. */
  fitIds?: string[];
  /** Changing this refits the view (a new filter, a new day). */
  fitKey?: string;
  /** Room kept clear of the fitted pins, for cards drawn over the map. */
  fitPadding?: { top: number; bottom: number; left: number; right: number };
  /** On a scrolling page: two fingers or Ctrl + scroll to move the map. */
  cooperative?: boolean;
  /** How the camera moves to a newly chosen pin. */
  selectCamera?: Partial<FlyToOptions>;
  fallback: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
  className?: string;
  ariaLabel: string;
  ref?: Ref<MapCanvasHandle>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const tooltip = useRef<Popup | null>(null);
  const [tooltipNode] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')));
  const [elements, setElements] = useState<Map<string, HTMLDivElement>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [basemap, setBasemap] = useState<Basemap>('streets');
  const [terrain, setTerrain] = useState(false);
  const [hovered, setHovered] = useState<string | undefined>();

  const pinsRef = useRef(pins);
  const linesRef = useRef(lines);
  const terrainRef = useRef(terrain);
  const fitRef = useRef({ fitIds, fitPadding });
  useEffect(() => {
    pinsRef.current = pins;
    linesRef.current = lines;
    terrainRef.current = terrain;
    fitRef.current = { fitIds, fitPadding };
  });

  /* ------------------------------ camera helpers ----------------------------- */

  const fit = useCallback((ids?: string[]) => {
    const map = mapRef.current;
    if (!map) return;
    const wanted = ids ?? fitRef.current.fitIds;
    const points = pinsRef.current.filter((pin) => !wanted || wanted.includes(pin.id));
    if (points.length === 0) return;
    const padding = fitRef.current.fitPadding ?? { top: 70, bottom: 50, left: 50, right: 50 };
    if (points.length === 1) {
      map.flyTo({ center: [points[0]!.longitude, points[0]!.latitude], zoom: 11.5, duration: 900 });
      return;
    }
    const lons = points.map((pin) => pin.longitude);
    const lats = points.map((pin) => pin.latitude);
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding, maxZoom: 12, duration: 900 },
    );
  }, []);

  const flyTo = useCallback((id: string, options: Partial<FlyToOptions> = {}) => {
    const map = mapRef.current;
    const pin = pinsRef.current.find((row) => row.id === id);
    if (!map || !pin) return;
    map.flyTo({
      center: [pin.longitude, pin.latitude],
      zoom: Math.max(map.getZoom(), 10.5),
      duration: 1100,
      essential: true,
      ...options,
    });
  }, []);

  const setThreeD = useCallback((next: boolean) => {
    const map = mapRef.current;
    if (!map || terrainRef.current === next) return;
    setTerrain(next);
    terrainRef.current = next;
    map.setTerrain(next ? { source: 'matai-dem', exaggeration: 1.6 } : null);
    map.easeTo({ pitch: next ? 58 : 0, bearing: next ? -18 : 0, duration: 1200 });
  }, []);

  useImperativeHandle(ref, () => ({ flyTo, fit, setThreeD }), [flyTo, fit, setThreeD]);

  /* ------------------------------ style overlays ----------------------------- */

  // Everything the map adds to a basemap. Run again after a basemap switch,
  // since a new style starts from nothing.
  const applyOverlays = useCallback((map: MapLibreMap) => {
    if (!map.getSource('matai-dem')) {
      map.addSource('matai-dem', { type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: DEM_ATTRIBUTION });
    }
    if (!map.getSource('matai-shade')) {
      map.addSource('matai-shade', { type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
    }
    // Hill shading under the labels: Manipur is a valley ringed by hills, and
    // the relief is what makes the map read as the place.
    const firstSymbol = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
    if (!map.getLayer('matai-hillshade')) {
      map.addLayer(
        {
          id: 'matai-hillshade',
          type: 'hillshade',
          source: 'matai-shade',
          paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#3d4670', 'hillshade-highlight-color': '#fff8ec' },
        },
        firstSymbol,
      );
    }
    if (!map.getSource(ROUTES)) {
      map.addSource(ROUTES, { type: 'geojson', data: routeData(linesRef.current) });
      const opacity = ['case', ['get', 'dimmed'], 0.22, 0.95] as unknown as number;
      map.addLayer({
        id: `${ROUTES}-casing`,
        type: 'line',
        source: ROUTES,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': ['case', ['get', 'dimmed'], 0.15, 0.85] },
      });
      map.addLayer({
        id: `${ROUTES}-road`,
        type: 'line',
        source: ROUTES,
        filter: ['!', ['get', 'dashed']],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 4.5, 'line-opacity': opacity },
      });
      map.addLayer({
        id: `${ROUTES}-straight`,
        type: 'line',
        source: ROUTES,
        filter: ['get', 'dashed'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-dasharray': [1.6, 1.4], 'line-opacity': opacity },
      });
    }
    map.setTerrain(terrainRef.current ? { source: 'matai-dem', exaggeration: 1.6 } : null);
    map.setSky({
      'sky-color': '#9cc3e8',
      'horizon-color': '#f4ead9',
      'fog-color': '#f4ead9',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.4,
    });
  }, []);

  /* ------------------------------- set the map up ---------------------------- */

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    if (!hasWebGl()) {
      void Promise.resolve().then(() => setStatus('failed'));
      return;
    }
    let cancelled = false;
    let loaded = false;
    const timer = setTimeout(() => {
      if (loaded || cancelled) return;
      console.warn('[map] falling back to the offline outline: the map did not load in time');
      setStatus('failed');
    }, LOAD_TIMEOUT_MS);
    const observer = new ResizeObserver(() => mapRef.current?.resize());

    void import('maplibre-gl')
      .then(({ Map, NavigationControl, ScaleControl, FullscreenControl, AttributionControl, Popup, setWorkerUrl }) => {
        if (cancelled) return;
        // The bundler does not ship MapLibre's worker file; it is served from
        // public/maplibre (scripts/copy-maplibre-worker.mjs).
        setWorkerUrl(WORKER_URL);
        const map = new Map({
          container: node,
          style: STREETS,
          center: MANIPUR_CENTER,
          zoom: 7.6,
          minZoom: 6.5,
          maxZoom: 17,
          maxBounds: MAX_BOUNDS,
          maxPitch: 72,
          attributionControl: false,
          cooperativeGestures: cooperative,
        });
        mapRef.current = map;
        map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
        map.addControl(new FullscreenControl(), 'top-right');
        map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
        map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
        tooltip.current = new Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'matai-tooltip',
          offset: 22,
          maxWidth: '300px',
        });
        if (tooltipNode) tooltip.current.setDOMContent(tooltipNode);

        map.on('style.load', () => applyOverlays(map));
        // Ready once the style is in: waiting for 'load' means waiting for
        // every first tile, which on a slow connection can take a long time.
        map.once('style.load', () => {
          loaded = true;
          clearTimeout(timer);
          if (cancelled) return;
          setStatus('ready');
          fit();
        });
        map.on('error', (event) => {
          // A missing tile is normal at the edges; a style that never loads is not.
          if (!loaded && !map.isStyleLoaded() && /style|fetch|network/i.test(String(event.error?.message))) {
            console.warn('[map] falling back to the offline outline:', event.error?.message);
            setStatus('failed');
          }
        });
        observer.observe(node);
      })
      .catch((error: unknown) => {
        console.warn('[map] falling back to the offline outline:', error);
        if (!cancelled) setStatus('failed');
      });

    const placed = markers.current;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
      placed.forEach((marker) => marker.remove());
      placed.clear();
      tooltip.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is built once; later changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------- markers -------------------------------- */

  // Spreads pins that sit on top of each other (Imphal's sights are a few
  // hundred metres apart) into a small ring, recomputed as the view changes.
  const declutter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    container.current?.toggleAttribute('data-zoomed', map.getZoom() >= 10);
    const placed = pinsRef.current
      .map((pin) => ({ pin, point: map.project([pin.longitude, pin.latitude]) }))
      .filter((row) => markers.current.has(row.pin.id));
    const groups: (typeof placed)[] = [];
    for (const row of placed) {
      const group = groups.find(
        (members) => Math.hypot(members[0]!.point.x - row.point.x, members[0]!.point.y - row.point.y) < CROWD_PX,
      );
      if (group) group.push(row);
      else groups.push([row]);
    }
    for (const group of groups) {
      const radius = group.length > 1 ? 16 + group.length * 3 : 0;
      group.forEach((row, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / group.length;
        markers.current.get(row.pin.id)?.setOffset(
          radius ? [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)] : [0, 0],
        );
      });
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(declutter);
    };
    map.on('move', onMove);
    return () => {
      cancelAnimationFrame(frame);
      map.off('move', onMove);
    };
  }, [status, declutter]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    let cancelled = false;
    void import('maplibre-gl').then(({ Marker }) => {
      if (cancelled) return;
      const wanted = new Set(pins.map((pin) => pin.id));
      let changed = false;
      for (const [id, marker] of markers.current) {
        if (!wanted.has(id)) {
          marker.remove();
          markers.current.delete(id);
          changed = true;
        }
      }
      for (const pin of pins) {
        const existing = markers.current.get(pin.id);
        if (existing) {
          existing.setLngLat([pin.longitude, pin.latitude]);
          continue;
        }
        const element = document.createElement('div');
        element.className = 'matai-pin';
        markers.current.set(pin.id, new Marker({ element, anchor: 'center' }).setLngLat([pin.longitude, pin.latitude]).addTo(map));
        changed = true;
      }
      if (changed) {
        setElements(new Map([...markers.current].map(([id, marker]) => [id, marker.getElement() as HTMLDivElement])));
      }
      declutter();
    });
    return () => {
      cancelled = true;
    };
  }, [pins, status, declutter]);

  // Selected and hovered pins sit above the rest.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker.getElement().style.zIndex = id === selectedId ? '3' : id === hovered ? '2' : '1';
    }
  }, [elements, selectedId, hovered]);

  /* ---------------------------------- tooltip -------------------------------- */

  useEffect(() => {
    const map = mapRef.current;
    const popup = tooltip.current;
    if (!map || !popup) return;
    const pin = hovered ? pins.find((row) => row.id === hovered) : undefined;
    const marker = hovered ? markers.current.get(hovered) : undefined;
    if (!pin || !marker) {
      popup.remove();
      return;
    }
    const offset = marker.getOffset();
    popup
      .setOffset([offset.x, offset.y - 20])
      .setLngLat([pin.longitude, pin.latitude])
      .addTo(map);
  }, [hovered, pins]);

  const hover = useCallback(
    (id: string | undefined) => {
      setHovered(id);
      onHover?.(id);
    },
    [onHover],
  );

  /* ---------------------------------- routes --------------------------------- */

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const source = map.getSource(ROUTES) as { setData?: (data: GeoJSON.FeatureCollection) => void } | undefined;
    source?.setData?.(routeData(lines));
  }, [lines, status]);

  /* ------------------------------ fit and select ----------------------------- */

  useEffect(() => {
    if (status === 'ready' && fitKey !== undefined) fit();
  }, [fitKey, status, fit]);

  const cameraRef = useRef(selectCamera);
  useEffect(() => {
    cameraRef.current = selectCamera;
  });
  useEffect(() => {
    if (status === 'ready' && selectedId) flyTo(selectedId, cameraRef.current);
  }, [selectedId, status, flyTo]);

  /* ------------------------------ basemap, 3D -------------------------------- */

  const switchBasemap = (next: Basemap) => {
    const map = mapRef.current;
    if (!map || next === basemap) return;
    setBasemap(next);
    map.setStyle(next === 'streets' ? STREETS : SATELLITE);
  };

  const toggleTerrain = () => setThreeD(!terrain);

  if (status === 'failed') {
    return (
      <div className={cn('relative overflow-auto rounded-xl border border-line bg-surface p-3', className)}>
        <p className="mb-2 text-[12px] text-ink-500">
          The live map could not load (no connection to the map service), so this is the offline outline.
        </p>
        {fallback}
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-line bg-[#e8e4dc]', className)}>
      {/* Inline, because MapLibre's own stylesheet sets `position: relative` on this element. */}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} role="region" aria-label={ariaLabel} />

      {status === 'loading' ? (
        <div className="shimmer absolute inset-0 flex items-center justify-center">
          <p className="rounded-full bg-surface/90 px-3 py-1 text-[12px] text-ink-600 shadow-sm">Loading the map…</p>
        </div>
      ) : null}

      {status === 'ready' ? (
        <div className="absolute left-3 top-3 z-[2] flex flex-wrap items-center gap-1.5">
          <div className="flex overflow-hidden rounded-lg border border-line bg-surface/95 shadow-sm backdrop-blur" role="group" aria-label="Map style">
            <StyleButton active={basemap === 'streets'} onClick={() => switchBasemap('streets')} icon={<Layers aria-hidden size={14} />}>
              Map
            </StyleButton>
            <StyleButton active={basemap === 'satellite'} onClick={() => switchBasemap('satellite')} icon={<Satellite aria-hidden size={14} />}>
              Satellite
            </StyleButton>
          </div>
          <button
            type="button"
            onClick={toggleTerrain}
            aria-pressed={terrain}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium shadow-sm backdrop-blur',
              terrain ? 'border-brand-500 bg-brand-700 text-white' : 'border-line bg-surface/95 text-ink-800 hover:bg-surface',
            )}
          >
            <Mountain aria-hidden size={14} />
            3D hills
          </button>
          {toolbar}
        </div>
      ) : null}

      {children}

      {[...elements].map(([id, element]) => {
        const pin = pins.find((row) => row.id === id);
        if (!pin) return null;
        return createPortal(
          <button
            type="button"
            aria-label={pin.label}
            aria-pressed={pin.id === selectedId}
            onClick={() => onSelect?.(pin.id)}
            onMouseEnter={() => hover(pin.id)}
            onMouseLeave={() => hover(undefined)}
            onFocus={() => hover(pin.id)}
            onBlur={() => hover(undefined)}
            className={cn('matai-pin-button', pin.dimmed && 'opacity-40')}
          >
            {pin.render({ selected: pin.id === selectedId, hovered: pin.id === hovered })}
          </button>,
          element,
          id,
        );
      })}

      {tooltipNode && hovered
        ? createPortal(pins.find((pin) => pin.id === hovered)?.tooltip ?? null, tooltipNode)
        : null}
    </div>
  );
}

function StyleButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium',
        active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-surface-2',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
