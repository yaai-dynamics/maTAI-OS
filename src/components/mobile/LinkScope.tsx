'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { mobileHref } from '@/lib/mobile/routes';

/**
 * Keeps navigation inside the mobile app.
 *
 * Shared components (maps, place previews, the timeline) link to the desktop
 * /explore pages. This listens in the capture phase, before React's own
 * handlers, and sends those clicks to the /m equivalent instead. The shared
 * components themselves are not changed.
 */
export function LinkScope() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.origin !== window.location.origin) return;

      const target = mobileHref(`${anchor.pathname}${anchor.search}`);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      router.push(target);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);

  return null;
}
