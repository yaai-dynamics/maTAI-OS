import { cn } from '@/components/ui/primitives';
import { PALETTES, SceneArt, type Palette } from '@/components/shared/DestinationVisual';
import { PlacePhoto } from '@/components/shared/PlacePhoto';

/**
 * A landing page's hero artwork: an AI-generated image when one exists,
 * fading in over a deterministic scene that renders first and stays as the
 * fallback — the same discipline DestinationVisual applies to curated
 * photographs, extended to a page that has no destination record of its own
 * (a business or a festival page). Nothing here depends on the network,
 * or on a live AI provider, being up.
 */

/** A stable palette for anything that isn't a destination, from a seed string. */
export function paletteFor(seed: string): Palette {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length]!;
}

export function GeneratedArt({
  seed,
  label,
  imageUrl,
  palette,
  height = 'md',
  overlay = false,
  className,
}: {
  /** Anything stable per page, such as its slug. Chooses the fallback scene and its jitter. */
  seed: string;
  label: string;
  /** Data URL or remote URL of an AI-generated image, when generation succeeded. */
  imageUrl?: string;
  /** Defaults to one derived from `seed`, so callers only pass this to match a destination's own palette. */
  palette?: Palette;
  height?: 'sm' | 'md' | 'lg' | 'hero';
  overlay?: boolean;
  className?: string;
}) {
  const heights = { sm: 'h-24', md: 'h-40', lg: 'h-56', hero: 'h-64 sm:h-80' }[height];

  return (
    <PlacePhoto
      src={imageUrl}
      alt={label}
      overlay={overlay}
      eager={height === 'hero'}
      className={cn(heights, className)}
      fallback={
        <SceneArt palette={palette ?? paletteFor(seed)} seed={seed} label={label} overlay={overlay} />
      }
    />
  );
}
