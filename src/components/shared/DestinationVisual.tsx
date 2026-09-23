import { cn } from '@/components/ui/primitives';
import type { Destination } from '@/lib/types';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { creditLine, photoFor } from '@/lib/mobile/photos';

/**
 * Destination artwork, with a real photograph faded in on top when one is
 * curated (see lib/mobile/photos.ts — the name predates the photos being
 * shared with desktop). The generated scene below always renders first and
 * stays as the fallback for destinations without a photo, or if the file
 * fails to load, so nothing here depends on the network being up.
 *
 * Each generated scene is a deterministic layered illustration keyed to the
 * destination's palette, giving every destination a real visual identity
 * even without a photograph.
 */

export type Palette = Destination['palette'];

export const PALETTES: readonly Palette[] = ['lake', 'hill', 'heritage', 'market', 'forest', 'border'];

const SCENES: Record<Palette, { sky: [string, string]; land: string[]; accent: string }> = {
  lake: { sky: ['#f6d9b0', '#9ec4cf'], land: ['#4d8ea0', '#2f6d80', '#1d4e5e'], accent: '#e8b15f' },
  hill: { sky: ['#e7dcf2', '#a9b7d6'], land: ['#7b87ad', '#5b6690', '#3d4670'], accent: '#c77da8' },
  heritage: { sky: ['#f2e2cd', '#c9a98d'], land: ['#8a6a55', '#6b4f40', '#452b63'], accent: '#d8a24a' },
  market: { sky: ['#fae3d2', '#e3b8a6'], land: ['#b5654f', '#8d4a3c', '#5e3029'], accent: '#e0a03c' },
  forest: { sky: ['#dff0d8', '#9fc4a4'], land: ['#5c8a63', '#3f6b4c', '#264a36'], accent: '#c8d96f' },
  border: { sky: ['#e9e4d6', '#bfae93'], land: ['#93826a', '#6e5f4c', '#453c30'], accent: '#c9721c' },
};

/** Tiny deterministic hash, so a destination always renders the same scene. */
function offset(seed: string, range: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % (range * 2)) - range;
}

/**
 * The deterministic layered illustration on its own, keyed by any palette and
 * seed string rather than a destination record — reused by GeneratedArt.tsx
 * as the offline/failure-safe fallback for a landing page hero, so a page
 * that has no destination of its own still gets a designed, on-brand visual.
 */
export function SceneArt({
  palette,
  seed,
  label,
  overlay = false,
  className,
}: {
  palette: Palette;
  seed: string;
  label: string;
  overlay?: boolean;
  className?: string;
}) {
  const scene = SCENES[palette];
  const jitter = offset(seed, 40);
  const jitter2 = offset(`${seed}-b`, 24);
  const gradientId = `sky-${seed}`;

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-surface-3', className)}>
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label={`Illustrative artwork for ${label}. Generated, not a photograph.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={scene.sky[0]} />
            <stop offset="100%" stopColor={scene.sky[1]} />
          </linearGradient>
        </defs>

        <rect width="400" height="200" fill={`url(#${gradientId})`} />
        <circle cx={300 + jitter} cy={48 + jitter2 / 2} r="22" fill={scene.accent} opacity="0.85" />

        {palette === 'lake' ? (
          <>
            <path d={`M0 118 L400 ${112 + jitter2 / 4} L400 200 L0 200 Z`} fill={scene.land[0]} />
            <path d={`M0 140 Q ${120 + jitter} 128 400 146 L400 200 L0 200 Z`} fill={scene.land[1]} />
            {[0, 1, 2, 3, 4].map((index) => (
              <ellipse
                key={index}
                cx={40 + index * 82 + (jitter % 18)}
                cy={158 + (index % 2) * 14}
                rx={26 - index * 2}
                ry={8}
                fill="none"
                stroke={scene.land[2]}
                strokeWidth="3"
                opacity="0.7"
              />
            ))}
          </>
        ) : null}

        {palette === 'hill' ? (
          <>
            <path d={`M0 128 L${90 + jitter} 74 L170 124 L${250 + jitter2} 62 L400 128 L400 200 L0 200 Z`} fill={scene.land[0]} />
            <path d={`M0 152 L${130 + jitter2} 104 L240 150 L${330 + jitter} 112 L400 152 L400 200 L0 200 Z`} fill={scene.land[1]} />
            <path d={`M0 178 L140 154 L280 180 L400 162 L400 200 L0 200 Z`} fill={scene.land[2]} />
            <rect x="0" y="126" width="400" height="7" fill="#ffffff" opacity="0.35" />
          </>
        ) : null}

        {palette === 'heritage' ? (
          <>
            <rect x="0" y="150" width="400" height="50" fill={scene.land[0]} />
            {[0, 1, 2].map((index) => {
              const x = 58 + index * 116 + (jitter % 14);
              return (
                <g key={index}>
                  <rect x={x} y={92 - index * 6} width="46" height="60" fill={scene.land[2]} />
                  <path d={`M${x - 8} ${92 - index * 6} L${x + 23} ${62 - index * 6} L${x + 54} ${92 - index * 6} Z`} fill={scene.land[1]} />
                </g>
              );
            })}
            <rect x="0" y="168" width="400" height="12" fill={scene.land[1]} opacity="0.65" />
          </>
        ) : null}

        {palette === 'market' ? (
          <>
            <rect x="0" y="146" width="400" height="54" fill={scene.land[2]} />
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const x = index * 68 + (jitter % 22);
              return (
                <g key={index}>
                  <path d={`M${x} 146 L${x + 34} 112 L${x + 68} 146 Z`} fill={index % 2 === 0 ? scene.land[0] : scene.accent} />
                  <rect x={x + 14} y="146" width="40" height="30" fill={scene.land[1]} opacity="0.8" />
                </g>
              );
            })}
          </>
        ) : null}

        {palette === 'forest' ? (
          <>
            <rect x="0" y="140" width="400" height="60" fill={scene.land[2]} />
            {[0, 1, 2, 3, 4, 5, 6].map((index) => {
              const x = 26 + index * 56 + (jitter % 16);
              const h = 44 + ((index * 13 + jitter2) % 26);
              return (
                <path
                  key={index}
                  d={`M${x} 148 L${x + 20} ${148 - h} L${x + 40} 148 Z`}
                  fill={index % 2 === 0 ? scene.land[0] : scene.land[1]}
                />
              );
            })}
            <rect x={300 + (jitter % 10)} y="104" width="4" height="44" fill={scene.land[2]} />
            <rect x={292 + (jitter % 10)} y="96" width="20" height="12" fill={scene.accent} />
          </>
        ) : null}

        {palette === 'border' ? (
          <>
            <path d={`M0 132 L${140 + jitter} 92 L260 134 L400 104 L400 200 L0 200 Z`} fill={scene.land[0]} />
            <rect x="0" y="156" width="400" height="44" fill={scene.land[1]} />
            <path d="M0 196 L400 168" stroke={scene.accent} strokeWidth="5" strokeDasharray="22 16" fill="none" />
            <rect x={186 + (jitter % 12)} y="118" width="8" height="42" fill={scene.land[2]} />
            <rect x={160 + (jitter % 12)} y="112" width="60" height="9" fill={scene.land[2]} />
          </>
        ) : null}
      </svg>

      {overlay ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-ink-900/75 via-ink-900/15 to-transparent"
        />
      ) : null}
    </div>
  );
}

export function DestinationVisual({
  destination,
  className,
  height = 'md',
  overlay = false,
  /** Show the photographer's credit over the image. Reserve for a page's single primary photo. */
  showCredit = false,
}: {
  destination: Pick<Destination, 'id' | 'name' | 'palette' | 'category'>;
  className?: string;
  height?: 'sm' | 'md' | 'lg' | 'hero';
  overlay?: boolean;
  showCredit?: boolean;
}) {
  const heights = { sm: 'h-24', md: 'h-40', lg: 'h-56', hero: 'h-64 sm:h-80' }[height];
  const photo = photoFor(destination.id);

  return (
    <PlacePhoto
      src={photo ? (height === 'sm' ? photo.sm : photo.hd) : undefined}
      alt={destination.name}
      overlay={overlay}
      eager={height === 'hero'}
      credit={showCredit && photo ? { label: creditLine(photo.credit), href: photo.credit.source || undefined } : undefined}
      className={cn(heights, className)}
      fallback={<SceneArt palette={destination.palette} seed={destination.id} label={destination.name} overlay={overlay} />}
    />
  );
}

/** Small square used in lists where a full scene would be too heavy. */
export function DestinationSwatch({
  destination,
  className,
}: {
  destination: Pick<Destination, 'id' | 'name' | 'palette' | 'category'>;
  className?: string;
}) {
  return (
    <DestinationVisual
      destination={destination}
      height="sm"
      className={cn('h-14 w-14 shrink-0 rounded-md', className)}
    />
  );
}
