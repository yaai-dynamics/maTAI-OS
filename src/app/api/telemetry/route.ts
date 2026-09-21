import { NextResponse } from 'next/server';

import { countOutcomes, ingestBatch, type IngestEvent } from '@/server/telemetry/ingest';
import { ensureVisitor } from '@/server/telemetry/visitor';

/**
 * Browser telemetry intake.
 *
 * Accepts small batches from src/components/telemetry/track.ts, sent with
 * navigator.sendBeacon. Anything that is not plainly a same-site browser
 * reporting a handful of events is dropped before it touches the store, and
 * counted by reason so the department can see the intake working.
 *
 * Always answers 204 to a well-formed request, whatever was kept: a script
 * probing the endpoint learns nothing about which events counted.
 */

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 25;

/** Crawlers and headless tools, which do not run the tracker but can post to it. */
const AUTOMATED = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|curl|wget|python-requests|httpclient|axios|node-fetch/i;

const noContent = () => new NextResponse(null, { status: 204 });

function sameSite(request: Request): boolean {
  // Browsers send Sec-Fetch-Site on every beacon; older ones send Origin.
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!sameSite(request)) {
    await countOutcomes(['CROSS_SITE']);
    return new NextResponse(null, { status: 403 });
  }
  if (AUTOMATED.test(request.headers.get('user-agent') ?? '')) {
    await countOutcomes(['BOT']);
    return noContent();
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) {
    await countOutcomes(['OVERSIZED']);
    return new NextResponse(null, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    await countOutcomes(['OVERSIZED']);
    return new NextResponse(null, { status: 413 });
  }

  let events: unknown;
  try {
    events = (JSON.parse(raw) as { events?: unknown }).events;
  } catch {
    await countOutcomes(['INVALID']);
    return new NextResponse(null, { status: 400 });
  }
  if (!Array.isArray(events) || events.length === 0) {
    await countOutcomes(['INVALID']);
    return new NextResponse(null, { status: 400 });
  }
  if (events.length > MAX_EVENTS) {
    await countOutcomes(['OVERSIZED']);
    return new NextResponse(null, { status: 413 });
  }

  const visitor = await ensureVisitor();
  const shaped: IngestEvent[] = events.map((event) => {
    const row = (event ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' && value.length <= 80 ? value : undefined);
    const metadata = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
    return {
      type: (text(row.type) ?? '') as IngestEvent['type'],
      ...(text(row.destinationId) ? { destinationId: text(row.destinationId)! } : {}),
      ...(text(row.clientEventId) ? { clientEventId: text(row.clientEventId)! } : {}),
      ...(text(metadata.surface) ? { metadata: { surface: text(metadata.surface)! } } : {}),
    };
  });

  await ingestBatch(visitor, shaped);
  return noContent();
}
