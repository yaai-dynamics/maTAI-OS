'use client';

import { useState } from 'react';
import { Copy, Crosshair, MapPin, Share2 } from 'lucide-react';

import { distanceKm } from '@/lib/geo';
import { directionsToPlaceHref } from '@/lib/map';
import { FACILITY_KIND_LABEL, type FacilityKind } from '@/lib/types';
import { Badge, Button, cn } from '@/components/ui/primitives';

export interface NearbyFacility {
  id: string;
  kind: FacilityKind;
  name: string;
  districtName: string;
  latitude: number;
  longitude: number;
  note?: string;
}

type State =
  | { step: 'idle' }
  | { step: 'locating' }
  | { step: 'ready'; latitude: number; longitude: number }
  | { step: 'failed'; reason: string };

/**
 * Location is read only when the visitor presses the button, is never sent to
 * the server, and is not recorded: it stays in this component to sort the list
 * below and to fill in a message they can send to someone.
 *
 * Distances are straight-line. On Manipur's hill roads the drive is longer,
 * so the list says so rather than implying a travel time it cannot know.
 */
export function NearbyHelp({ facilities }: { facilities: NearbyFacility[] }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [copied, setCopied] = useState(false);

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ step: 'failed', reason: 'This browser cannot report a location.' });
      return;
    }
    setState({ step: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setState({
          step: 'ready',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) =>
        setState({
          step: 'failed',
          reason:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission was refused. The full list by district is below.'
              : 'Your location could not be read. The full list by district is below.',
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const here = state.step === 'ready' ? { latitude: state.latitude, longitude: state.longitude } : undefined;

  const nearest = here
    ? [...facilities]
        .map((facility) => ({ facility, km: distanceKm(here, facility) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 4)
    : [];

  const coordinates = here ? `${here.latitude.toFixed(5)}, ${here.longitude.toFixed(5)}` : '';
  const message = here
    ? `I need help. My location is ${coordinates} — https://www.google.com/maps/search/?api=1&query=${here.latitude},${here.longitude}`
    : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ text: message });
    } catch {
      // Cancelled, or unsupported: the copy button covers both.
    }
  };

  return (
    <div className="space-y-3">
      {state.step !== 'ready' ? (
        <Button
          type="button"
          onClick={locate}
          variant="secondary"
          disabled={state.step === 'locating'}
          className="w-full sm:w-auto"
        >
          <Crosshair aria-hidden size={16} />
          {state.step === 'locating' ? 'Finding you…' : 'Find what is nearest to me'}
        </Button>
      ) : null}

      {state.step === 'failed' ? (
        <p className="text-[13px] text-ink-600">{state.reason}</p>
      ) : null}

      {here ? (
        <>
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Where you are
            </p>
            <p className="mt-1 font-mono text-[15px] font-medium text-ink-900">{coordinates}</p>
            <p className="mt-1 text-[12px] text-ink-600">
              Read on this device only. It is not sent to mTour Agent and not recorded.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button type="button" onClick={copy} variant="secondary" size="sm">
                <Copy aria-hidden size={14} />
                {copied ? 'Copied' : 'Copy location message'}
              </Button>
              {typeof navigator !== 'undefined' && 'share' in navigator ? (
                <Button type="button" onClick={share} variant="secondary" size="sm">
                  <Share2 aria-hidden size={14} />
                  Share
                </Button>
              ) : null}
            </div>
          </div>

          <ul className="space-y-2">
            {nearest.map(({ facility, km }) => (
              <li
                key={facility.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={facility.kind === 'HOSPITAL' ? 'risk' : 'neutral'}>
                      {FACILITY_KIND_LABEL[facility.kind]}
                    </Badge>
                    <span className="text-[12px] text-ink-500">{facility.districtName}</span>
                  </div>
                  <p className="mt-1 text-[14px] font-medium text-ink-900">{facility.name}</p>
                  {facility.note ? (
                    <p className="mt-0.5 text-[12px] text-ink-600">{facility.note}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn('text-[15px] font-semibold text-ink-900')}>{km.toFixed(0)} km</p>
                  <p className="text-[11px] text-ink-500">straight line</p>
                  <a
                    href={directionsToPlaceHref(`${facility.name}, ${facility.districtName}, Manipur`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline"
                  >
                    <MapPin aria-hidden size={12} />
                    Directions
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ink-500">
            Distances are straight-line from where you are to the district town. Hill roads are longer, and in the
            monsoon they can be closed.
          </p>
        </>
      ) : null}
    </div>
  );
}
