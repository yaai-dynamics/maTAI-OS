'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/components/ui/primitives';

/**
 * Goes back in history when there is somewhere to go, otherwise to the fallback.
 *
 * `floating` pins it to the top-left corner as a glass circle, the way iOS
 * keeps a back button over full-bleed photos: it stays put while the page
 * scrolls beneath it, and reads over a photograph or plain white alike.
 */
export function BackLink({
  fallbackHref,
  label = 'Back',
  tone = 'light',
  className,
}: {
  fallbackHref: string;
  label?: string;
  tone?: 'light' | 'floating';
  className?: string;
}) {
  const router = useRouter();
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };

  if (tone === 'floating') {
    // Only the 44px button is fixed, never a full-width layer at the top edge:
    // iOS 26 Safari treats a full-width fixed element at the top as a
    // navigation bar and paints a solid strip behind the status bar, which
    // hides the photo that should run under the Dynamic Island. Without one,
    // Safari keeps the photo there and blurs content under the status bar
    // itself as the page scrolls. Keep it that way on photo pages.
    return (
      <button
        type="button"
        aria-label={label}
        onClick={goBack}
        style={{ left: 'max(0.75rem, calc(50% - 240px + 0.75rem))' }}
        className={cn(
          'glass-bar fixed top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 grid h-11 w-11 place-items-center rounded-full text-ink-900 transition-transform active:scale-90',
          className,
        )}
      >
        <ChevronLeft aria-hidden size={24} strokeWidth={2.4} className="-ml-0.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={goBack}
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-800 transition-colors hover:bg-surface-2 active:scale-95',
        className,
      )}
    >
      <ChevronLeft aria-hidden size={22} />
    </button>
  );
}
