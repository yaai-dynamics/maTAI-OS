import { LayoutList, Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/components/ui/primitives';

/** Switches a screen between its list and the map as the main view. */
export function ViewToggle({
  view,
  listHref,
  mapHref,
  listLabel = 'List',
  className,
}: {
  view: 'list' | 'map';
  listHref: string;
  mapHref: string;
  listLabel?: string;
  className?: string;
}) {
  const item = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium transition-colors',
      active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-surface-2',
    );
  return (
    <nav aria-label="View" className={cn('inline-flex overflow-hidden rounded-full border border-line-strong bg-surface', className)}>
      <Link href={listHref} scroll={false} aria-current={view === 'list' ? 'page' : undefined} className={item(view === 'list')}>
        <LayoutList aria-hidden size={14} />
        {listLabel}
      </Link>
      <Link href={mapHref} scroll={false} aria-current={view === 'map' ? 'page' : undefined} className={item(view === 'map')}>
        <MapIcon aria-hidden size={14} />
        Map
      </Link>
    </nav>
  );
}
