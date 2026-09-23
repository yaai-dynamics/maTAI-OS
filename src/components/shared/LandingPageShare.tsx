'use client';

import { ShareBar } from '@/components/shared/ShareBar';

/**
 * Binds ShareBar's onShare to the slug, so the server page only needs to pass
 * the server action through once rather than every caller closing over it.
 */
export function LandingPageShare({
  slug,
  url,
  title,
  recordShare,
}: {
  slug: string;
  url: string;
  title: string;
  recordShare: (slug: string) => Promise<{ ok: boolean }>;
}) {
  return <ShareBar url={url} title={title} onShare={() => void recordShare(slug)} />;
}
