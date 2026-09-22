'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/components/ui/primitives';

const CREDIT =
  'absolute right-2 top-[calc(env(safe-area-inset-top)+0.75rem)] max-w-[60%] truncate rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur';

/**
 * A destination's real photograph, faded in over its generated artwork. The
 * artwork stays underneath as the placeholder, and is what shows when the
 * destination has no photograph or the file fails to load. Used on both the
 * mobile app and the desktop site.
 */
export function PlacePhoto({
  src,
  alt,
  fallback,
  overlay = false,
  credit,
  eager = false,
  className,
}: {
  /** From photoFor(); undefined keeps the artwork. */
  src?: string;
  alt: string;
  fallback: ReactNode;
  /** A dark gradient at the foot, for text laid over the image. */
  overlay?: boolean;
  /** Author and licence, linked to the file page, shown over the photo. */
  credit?: { label: string; href?: string };
  /** Load immediately (a hero) rather than when scrolled near. */
  eager?: boolean;
  className?: string;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');

  useEffect(() => {
    // The image may have settled before hydration, when its events were missed.
    const element = image.current;
    if (!element?.complete) return;
    setState(element.naturalWidth > 0 ? 'loaded' : 'failed');
  }, []);

  const showing = Boolean(src) && state !== 'failed';

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {fallback}
      {showing ? (
        // eslint-disable-next-line @next/next/no-img-element -- static files in public/, already sized
        <img
          ref={image}
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            state === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
      {overlay && showing && state === 'loaded' ? (
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/10" />
      ) : null}
      {credit && showing && state === 'loaded' ? (
        credit.href ? (
          <a href={credit.href} target="_blank" rel="noopener noreferrer" className={CREDIT}>
            {credit.label}
          </a>
        ) : (
          <span className={CREDIT}>{credit.label}</span>
        )
      ) : null}
    </div>
  );
}
