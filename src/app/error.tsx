'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Root error boundary.
 *
 * A live demo must never show a stack trace on a projector, and it must always
 * offer a way back into the flow.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error in the Manipur Tourism prototype:', error);
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-risk-700">
        Something went wrong
      </p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink-900">
        That screen could not be rendered
      </h1>
      <p className="mt-2 text-[14px] text-ink-600">
        The prototype runs on an in-memory dataset. Resetting the demo returns everything to a known
        state.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-ink-400">reference {error.digest}</p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-line-strong bg-surface px-4 py-2 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
        >
          Back to the start
        </Link>
      </div>
    </main>
  );
}
