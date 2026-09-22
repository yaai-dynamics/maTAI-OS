'use client';

import { ExternalLink, Navigation, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { PlaceSnapshot } from '@/lib/ai/web-media';
import { directionsHref } from '@/lib/map';
import type { Destination } from '@/lib/types';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { DestinationPreviewModal } from '@/components/shared/DestinationPreview';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { cn } from '@/components/ui/primitives';

export type SnapshotFn = (destinationId: unknown) => Promise<{ ok: boolean; snapshot?: PlaceSnapshot }>;
export type PreviewFn = (destinationId: unknown) => Promise<{ ok: boolean; error?: string; data?: DestinationDetailsData }>;
export type AskPlaceFn = (destinationId: string, question: string) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;

/** Photographs already fetched, for as long as the page is open. */
const snapshots = new Map<string, PlaceSnapshot>();

function usePlaceSnapshot(destinationId: string, load: SnapshotFn): PlaceSnapshot | undefined {
  const [fetched, setFetched] = useState<{ id: string; snapshot: PlaceSnapshot } | undefined>();
  useEffect(() => {
    if (snapshots.has(destinationId)) return;
    let cancelled = false;
    void load(destinationId)
      .catch(() => ({ ok: false }) as Awaited<ReturnType<SnapshotFn>>)
      .then((result) => {
        const snapshot = result.snapshot ?? {};
        snapshots.set(destinationId, snapshot);
        if (!cancelled) setFetched({ id: destinationId, snapshot });
      });
    return () => {
      cancelled = true;
    };
  }, [destinationId, load]);
  return snapshots.get(destinationId) ?? (fetched?.id === destinationId ? fetched.snapshot : undefined);
}

/**
 * The card for the pin that was chosen: a photograph from Wikimedia Commons
 * (credited, and marked as coming from the web), the platform's own verified
 * summary, and the ways onward: the full "Explore" popup, directions, and
 * whatever the screen offers next (book, plan).
 */
export function PlaceCard({
  destination,
  eyebrow,
  eyebrowColor,
  children,
  actions,
  onClose,
  snapshot: loadSnapshot,
  getPreview,
  askPlace,
  className,
}: {
  destination: Pick<Destination, 'id' | 'name' | 'district' | 'palette' | 'category' | 'latitude' | 'longitude'>;
  eyebrow?: string;
  eyebrowColor?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  snapshot: SnapshotFn;
  getPreview: PreviewFn;
  askPlace: AskPlaceFn;
  className?: string;
}) {
  const snapshot = usePlaceSnapshot(destination.id, loadSnapshot);
  const [preview, setPreview] = useState<{ status: 'closed' | 'loading' | 'error' } | { status: 'open'; data: DestinationDetailsData }>({
    status: 'closed',
  });
  const [broken, setBroken] = useState<string | undefined>();
  const image = snapshot?.image && broken !== snapshot.image.src ? snapshot.image : undefined;

  const explore = () => {
    setPreview({ status: 'loading' });
    void getPreview(destination.id).then((result) =>
      setPreview(result.ok && result.data ? { status: 'open', data: result.data } : { status: 'error' }),
    );
  };

  return (
    <div className={cn('rise overflow-hidden rounded-xl border border-line bg-surface shadow-[0_14px_40px_rgba(20,22,31,0.25)]', className)}>
      <div className="relative h-36">
        {image ? (
          // Remote photographs are shown as they are: next/image is kept to local assets (next.config.ts).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt={image.alt}
            className="h-full w-full object-cover"
            onError={() => setBroken(image.src)}
          />
        ) : (
          <DestinationVisual destination={destination} className={cn('h-full', !snapshot && 'animate-pulse')} />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/10 to-transparent" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900/55 text-white hover:bg-ink-900/75"
        >
          <X aria-hidden size={15} />
        </button>
        <div className="absolute inset-x-3 bottom-2.5">
          {eyebrow ? (
            <p className="mb-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white" style={{ background: eyebrowColor ?? 'var(--color-brand-700)' }}>
              {eyebrow}
            </p>
          ) : null}
          <p className="text-[17px] font-semibold leading-tight text-white">{destination.name}</p>
          <p className="text-[11px] text-white/80">{destination.district} district</p>
        </div>
        {image ? (
          <a
            href={image.href}
            target="_blank"
            rel="noreferrer"
            className="absolute right-2 bottom-2 rounded bg-ink-900/55 px-1.5 py-0.5 text-[10px] text-white/90 hover:bg-ink-900/75"
          >
            Photo: Wikimedia Commons ↗
          </a>
        ) : null}
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        {children}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={explore}
            disabled={preview.status === 'loading'}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {preview.status === 'loading' ? 'Opening…' : 'Explore'}
          </button>
          <a
            href={directionsHref(destination.latitude, destination.longitude)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink-800 hover:bg-surface-2"
          >
            <Navigation aria-hidden size={13} />
            Directions
          </a>
          {actions}
        </div>
        {preview.status === 'error' ? <p className="text-[12px] text-risk-700">Could not open this place. Try again.</p> : null}
        {snapshot?.wiki ? (
          <a
            href={snapshot.wiki.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-800 hover:underline"
          >
            More on Wikipedia (public, not verified by OneStop Manipur)
            <ExternalLink aria-hidden size={11} />
          </a>
        ) : null}
      </div>

      {preview.status === 'open' ? (
        <DestinationPreviewModal destination={preview.data} ask={askPlace} onClose={() => setPreview({ status: 'closed' })} />
      ) : null}
    </div>
  );
}
