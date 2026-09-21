'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A small number persisted in localStorage.
 *
 * Written with useSyncExternalStore rather than an effect that calls setState:
 * localStorage is an external system, so subscribing to it is the correct
 * pattern and avoids both cascading renders and a hydration mismatch.
 */
const EVENT = 'manipur-persistent-step';

function read(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    // Private windows and blocked site data both land here. The caller still works.
    return fallback;
  }
}

export function usePersistentStep(
  key: string,
  fallback = 0,
): [number, (value: number) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(EVENT, onChange);
    };
  }, []);

  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );

  const setValue = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        /* ignore: the control still works for this page view */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, setValue];
}
