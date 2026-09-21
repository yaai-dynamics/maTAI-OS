/**
 * Runs once when the Next.js server starts.
 *
 * The tourism working set is loaded into memory here rather than on first
 * request, so no page pays the load cost and every read below the repository
 * stays synchronous. See src/server/data/load.ts for why the whole set is
 * held rather than queried per request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { initState } = await import('@/server/data/store');

  try {
    await initState();
    console.log('[data] tourism working set loaded from MySQL');
  } catch (error) {
    // Failing loudly is the point: a silent fallback to seed data would mean
    // the dashboards keep working while showing figures that are not in the
    // database, which is exactly the kind of quiet mismatch this product
    // exists to prevent.
    console.error('[data] failed to load from MySQL — is the server running and seeded?');
    throw error;
  }
}
