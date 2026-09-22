import {
  Bank,
  BowlFood,
  Camera,
  FlowerLotus,
  HouseLine,
  MaskHappy,
  Mountains,
  Needle,
  PawPrint,
  PersonSimpleHike,
  Scroll,
  Sparkle,
  Storefront,
  Tree,
  Yarn,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';

import { Tile, glyphSize, toneColor, type TileSize, type Tone } from '@/components/mobile/IconTile';

/**
 * Solid icons for destination and experience categories: Phosphor's fill
 * weight, which reads like SF Symbols, in the iOS system colours. The ssr
 * entry renders in server components as well as client ones.
 */

const CATEGORY: Record<string, { icon: Icon; tone: Tone }> = {
  all: { icon: Sparkle, tone: 'indigo' },
  nature: { icon: Tree, tone: 'green' },
  'eco-tourism': { icon: Tree, tone: 'green' },
  heritage: { icon: Bank, tone: 'orange' },
  culture: { icon: MaskHappy, tone: 'purple' },
  history: { icon: Scroll, tone: 'yellow' },
  food: { icon: BowlFood, tone: 'red' },
  craft: { icon: Needle, tone: 'blue' },
  handloom: { icon: Yarn, tone: 'pink' },
  adventure: { icon: PersonSimpleHike, tone: 'teal' },
  wildlife: { icon: PawPrint, tone: 'green' },
  photography: { icon: Camera, tone: 'graphite' },
  homestay: { icon: HouseLine, tone: 'orange' },
  market: { icon: Storefront, tone: 'pink' },
  spiritual: { icon: FlowerLotus, tone: 'purple' },
  border: { icon: Mountains, tone: 'teal' },
};

const FALLBACK = { icon: Sparkle, tone: 'graphite' as Tone };

/** A category's solid glyph in its colour, without a tile (for pills). */
export function CategoryGlyph({ category, size = 16 }: { category: string; size?: number }) {
  const { icon: Glyph, tone } = CATEGORY[category] ?? FALLBACK;
  return <Glyph aria-hidden weight="fill" size={size} color={toneColor(tone)} className="shrink-0" />;
}

/** A category's solid glyph, white on its colour tile (for grids). */
export function CategoryTile({ category, size = 'lg' }: { category: string; size?: TileSize }) {
  const { icon: Glyph, tone } = CATEGORY[category] ?? FALLBACK;
  return (
    <Tile tone={tone} size={size}>
      <Glyph weight="fill" size={glyphSize(size)} />
    </Tile>
  );
}
