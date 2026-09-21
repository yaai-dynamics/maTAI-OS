'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { track, type ClientSignal } from '@/components/telemetry/track';

/**
 * Reports a destination view once per mount. Opening a destination page is
 * itself the interaction the government views aggregate; the server decides
 * whether it is recorded, and a reload inside half an hour is not a new view.
 */
export function ViewSignal({ destinationId }: { destinationId: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track({ type: 'DESTINATION_VIEW', destinationId, surface: 'destination-page' });
  }, [destinationId]);
  return null;
}

/** An outbound link that reports a navigation start when followed. */
export function NavigationLink({
  destinationId,
  href,
  className,
  children,
  signal = 'directions-link',
}: {
  destinationId: string;
  href: string;
  className?: string;
  children: ReactNode;
  signal?: string;
}) {
  const reported: Pick<ClientSignal, 'type'> = { type: 'NAVIGATION_START' };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track({ ...reported, destinationId, surface: signal })}
    >
      {children}
    </a>
  );
}
