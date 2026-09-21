import type { ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';

/**
 * Native disclosure. Used for method notes, table views of charts and evidence
 * detail, so those remain reachable without JavaScript.
 */
export function Disclosure({
  summary,
  children,
  className,
  defaultOpen = false,
  tone = 'quiet',
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  tone?: 'quiet' | 'bordered';
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        'group',
        tone === 'bordered' && 'rounded-md border border-line bg-surface',
        className,
      )}
    >
      <summary
        className={cn(
          'cursor-pointer list-none select-none text-[12px] font-medium text-ink-600 hover:text-ink-900',
          'flex items-center gap-1.5',
          tone === 'bordered' && 'px-3 py-2',
        )}
      >
        <span
          aria-hidden
          className="inline-block transition-transform duration-150 group-open:rotate-90"
        >
          ›
        </span>
        {summary}
      </summary>
      <div className={cn('pt-2 text-[13px] text-ink-700', tone === 'bordered' && 'px-3 pb-3')}>
        {children}
      </div>
    </details>
  );
}
