'use client';

import { MessageCircle } from 'lucide-react';
import { cn } from '@/components/ui/primitives';

/**
 * The one consistent way to start a chat with OneStop Manipur's AI guide,
 * wherever it can be started from (Discover, a destination's own page, and
 * anywhere else that adopts it): a floating, unmistakably brand-coloured
 * trigger rather than a text link buried in the page.
 */
export function AskOneStopButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed right-4 z-40 inline-flex items-center gap-2 rounded-full bg-brand-700 px-4 py-3 text-[13px] font-semibold text-white shadow-raised transition-transform hover:scale-[1.03] hover:bg-brand-600',
        'bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6',
        className,
      )}
    >
      <MessageCircle aria-hidden size={18} />
      Ask OneStop
    </button>
  );
}
