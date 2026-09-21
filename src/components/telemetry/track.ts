'use client';

/**
 * Browser half of the telemetry intake.
 *
 * Events are queued and sent in small batches to /api/telemetry with
 * navigator.sendBeacon, which the browser delivers even as the tab closes.
 * Each event carries its own id, so a batch that is retried after a flaky
 * connection is still counted once.
 *
 * Nothing here decides whether an event is recorded — the server does, from
 * the visitor's analytics choice. The browser only reports what happened.
 */

export type ClientSignal = {
  type: 'DESTINATION_VIEW' | 'NAVIGATION_START';
  destinationId: string;
  /** Where on the page it happened, for example "directions-link". */
  surface?: string;
};

const ENDPOINT = '/api/telemetry';
const FLUSH_AFTER_MS = 1500;
const MAX_BATCH = 20;

const queue: (ClientSignal & { clientEventId: string; metadata?: { surface: string } })[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

const newEventId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function send(batch: typeof queue): void {
  const body = JSON.stringify({ events: batch });
  // text/plain keeps sendBeacon a "simple" request: no preflight, no cookies lost.
  const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
  if (navigator.sendBeacon?.(ENDPOINT, blob)) return;
  void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, credentials: 'same-origin' }).catch(() => {
    // A dropped signal must never break the page the visitor came for.
  });
}

export function flush(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  while (queue.length > 0) send(queue.splice(0, MAX_BATCH));
}

function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

export function track(signal: ClientSignal): void {
  if (typeof window === 'undefined') return;
  listen();
  const { surface, ...rest } = signal;
  queue.push({ ...rest, clientEventId: newEventId(), ...(surface ? { metadata: { surface } } : {}) });
  if (queue.length >= MAX_BATCH) return flush();
  if (!timer) timer = setTimeout(flush, FLUSH_AFTER_MS);
}
