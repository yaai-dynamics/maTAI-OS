import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/components/ui/primitives';

/**
 * iOS-style solid icon tiles: a white glyph on a vertical gradient in one of
 * the iOS system colours, like Settings and app icons. The one place the
 * monochrome mobile theme uses colour on purpose, so actions and categories
 * are recognisable at a glance.
 *
 * Colours are literal hex, not theme tokens: the monochrome theme maps every
 * token to grey, and these must stay in colour.
 */

export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal' | 'indigo' | 'pink' | 'yellow' | 'graphite';

const GRADIENT: Record<Tone, [string, string]> = {
  blue: ['#4DA3FF', '#0A6CFF'],
  green: ['#4CD964', '#1DB954'],
  orange: ['#FFB340', '#FF8A00'],
  red: ['#FF6B6B', '#FF3B30'],
  purple: ['#C77DFF', '#9B51E0'],
  teal: ['#5AD8E6', '#18A8C9'],
  indigo: ['#7D7AFF', '#5856D6'],
  pink: ['#FF7AA2', '#FF2D55'],
  yellow: ['#FFE066', '#FFC300'],
  graphite: ['#8E8E93', '#5B5B60'],
};

const SIZE = {
  sm: { box: 'h-8 w-8 rounded-[9px]', icon: 16 },
  md: { box: 'h-11 w-11 rounded-[12px]', icon: 21 },
  lg: { box: 'h-14 w-14 rounded-[15px]', icon: 26 },
} as const;

export type TileSize = keyof typeof SIZE;

/** Pixel size of the glyph that fits a tile of this size. */
export const glyphSize = (size: TileSize): number => SIZE[size].icon;

/** The literal colour of a tone, for a glyph drawn without a tile. */
export const toneColor = (tone: Tone): string => GRADIENT[tone][1];

/** The gradient tile itself, around any glyph. */
export function Tile({
  tone,
  size = 'md',
  className,
  children,
}: {
  tone: Tone;
  size?: TileSize;
  className?: string;
  children: ReactNode;
}) {
  const [top, bottom] = GRADIENT[tone];
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center text-white', SIZE[size].box, className)}
      style={{
        background: `linear-gradient(180deg, ${top}, ${bottom})`,
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.35), 0 1px 2px rgb(0 0 0 / 0.12)',
      }}
    >
      {children}
    </span>
  );
}

/** A tile with a Lucide glyph, for actions. */
export function IconTile({
  icon: Icon,
  tone,
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: TileSize;
  className?: string;
}) {
  return (
    <Tile tone={tone} size={size} className={className}>
      <Icon size={SIZE[size].icon} strokeWidth={2.2} />
    </Tile>
  );
}
