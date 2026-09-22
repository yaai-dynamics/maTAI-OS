'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/primitives';

/**
 * Goes back to wherever the visitor came from (the destinations list, a
 * trip's stops, a search, another destination's "Also in this district").
 * Falls back to a fixed page when there is no history to go back to, such as
 * a link opened directly in a new tab.
 */
export function BackButton({ fallbackHref, label = 'Back' }: { fallbackHref: string; label?: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft aria-hidden size={16} />
      {label}
    </Button>
  );
}
