'use client';

import { useEffect } from 'react';

/**
 * Lets a photo page run under the Dynamic Island from the moment it opens.
 *
 * iOS 26 Safari colours the status-bar strip from whatever sits at the top
 * of the page, and re-checks only when the page scrolls. After a client-side
 * navigation from a page whose top was white (a list page), it keeps
 * that white strip over the photo until the first scroll. A one-pixel scroll
 * and back, at the top of the page only, makes it look again. Invisible
 * elsewhere: other browsers simply scroll a pixel and return.
 */
export function EdgeToEdge() {
  useEffect(() => {
    if (window.scrollY !== 0) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      window.scrollTo(0, 1);
      second = requestAnimationFrame(() => {
        if (window.scrollY <= 1) window.scrollTo(0, 0);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  return null;
}
