'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/components/ui/primitives';

/** Goes back in history when there is somewhere to go, otherwise to the fallback. */
export function BackLink({
  fallbackHref,
  label = 'Back',
  tone = 'light',
  className,
}: {
  fallbackHref: string;
  label?: string;
  tone?: 'light' | 'glass';
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors active:scale-95',
        tone === 'glass'
          ? 'bg-black/35 text-white backdrop-blur hover:bg-black/50'
          : 'text-ink-800 hover:bg-surface-2',
        className,
      )}
    >
      <ChevronLeft aria-hidden size={22} />
    </button>
  );
}
