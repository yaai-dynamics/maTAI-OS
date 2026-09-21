'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';

/* ---------------------------------- Tabs ---------------------------------- */

export interface TabItem {
  id: string;
  label: string;
  badge?: string;
  content: ReactNode;
}

export function Tabs({ items, className }: { items: TabItem[]; className?: string }) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  const baseId = useId();
  const current = items.find((item) => item.id === active) ?? items[0];

  return (
    <div className={className}>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line" aria-label="Sections">
        {items.map((item) => {
          const selected = item.id === current?.id;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              onClick={() => setActive(item.id)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                selected
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-600 hover:text-ink-900',
              )}
            >
              {item.label}
              {item.badge ? (
                <span className="num ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-600">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {current ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${current.id}`}
          aria-labelledby={`${baseId}-tab-${current.id}`}
          className="pt-4"
        >
          {current.content}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- Drawer --------------------------------- */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/35"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Detail panel'}
        tabIndex={-1}
        className={cn(
          'relative flex h-full w-full flex-col bg-paper shadow-overlay',
          width === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-ink-600">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-surface-2 hover:text-ink-900"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Copy button ------------------------------- */

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:bg-surface-2"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
