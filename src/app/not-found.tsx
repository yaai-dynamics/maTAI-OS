import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-500">Not found</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink-900">
        That page is not part of the platform
      </h1>
      <p className="mt-2 text-[14px] text-ink-600">
        The link may be out of date, or the destination, campaign or creator it referred to may not
        exist in this prototype dataset.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/"
          className="rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
        >
          Start again
        </Link>
        <Link
          href="/explore/destinations"
          className="rounded-md border border-line-strong bg-surface px-4 py-2 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
        >
          Browse destinations
        </Link>
      </div>
    </main>
  );
}
