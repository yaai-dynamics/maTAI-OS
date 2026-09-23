'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Languages } from 'lucide-react';

import { TAB_BAR_CLEARANCE } from '@/components/mobile/metrics';

/**
 * The interpreter, one tap away from anywhere in the app: a floating bubble
 * above the tab bar, the way a chat or assistant button sits on iOS.
 *
 * Hidden on the interpreter screen itself, and kept narrow so it never covers
 * a page's own action bar; both sit above the tab bar's footprint.
 */
export function TalkBubble() {
  const pathname = usePathname();
  if (pathname.startsWith('/m/talk')) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[480px] justify-end px-3"
      style={{ bottom: `calc(${TAB_BAR_CLEARANCE} + 0.5rem)` }}
    >
      <Link
        href="/m/talk"
        aria-label="Interpreter: speak with a local in Manipuri"
        className="glass-bar pointer-events-auto flex h-12 items-center gap-2 rounded-full pl-3 pr-4 text-ink-900 shadow-raised transition-transform active:scale-95"
      >
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-full text-white"
          style={{ background: 'linear-gradient(180deg, #7D7AFF, #5856D6)' }}
        >
          <Languages size={18} strokeWidth={2.2} />
        </span>
        <span className="text-[13px] font-semibold">Talk</span>
      </Link>
    </div>
  );
}
