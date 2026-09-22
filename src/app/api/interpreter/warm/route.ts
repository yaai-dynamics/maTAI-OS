import { NextResponse } from 'next/server';

import { interpreterProvider } from '@/server/interpreter/provider';

/**
 * Wakes the speech models, and tells the interface whether they are there at
 * all. Called when the interpreter screen opens, so a serverless worker is
 * starting while the visitor is still choosing a language.
 *
 * Answers immediately with what the interface needs; the warming itself
 * continues in the background and its result is not awaited.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  const provider = await interpreterProvider();
  if (provider.ready) void provider.warm(AbortSignal.timeout(50_000)).catch(() => undefined);

  return NextResponse.json({
    ready: provider.ready,
    provider: provider.name,
    /** Languages the models can listen to. The browser covers the rest where it can. */
    listens: provider.languages,
  });
}
