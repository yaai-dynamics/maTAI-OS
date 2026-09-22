'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';
import { DemoToggle } from './DemoToggle';
import { InterfaceNav, SectionList, TouristTabBar, type NavItem, type TabItem } from './RoleNav';

export type Portal = {
  href: string;
  title: string;
  subtitle?: ReactNode;
  letter: string;
  accent: string;
};

/**
 * The frame every interface shares: a full-width top bar (brand, interfaces,
 * account, demo icon) and, from the lg breakpoint, the interface's sections in
 * a sidebar at the left edge. Below lg the sidebar becomes a drawer behind the
 * menu button, and the tourist interface keeps its bottom tab bar.
 */
export function ShellFrame({
  demo,
  portal,
  sections,
  tabs,
  actions,
  sidebarFooter,
  children,
}: {
  demo: boolean;
  portal?: Portal;
  sections?: NavItem[];
  tabs?: TabItem[];
  actions?: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const sidebar = portal && sections && sections.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className={cn('min-h-dvh bg-paper', tabs && 'pb-16 lg:pb-0')}>
      <header className="sticky top-0 z-40 h-12 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex h-full items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            className="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-ink-700 hover:bg-surface-2 lg:hidden"
          >
            <Menu aria-hidden size={20} />
          </button>

          <Link href="/" className="flex items-center gap-2.5" aria-label="OneStop Manipur home">
            <Wordmark />
            {portal ? (
              <span className="text-[12px] font-medium text-ink-600 lg:hidden">{portal.title}</span>
            ) : null}
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <InterfaceNav />
            {actions}
            {demo ? <DemoToggle /> : null}
          </div>
        </div>
      </header>

      <div className="flex">
        {sidebar ? (
          <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
            <SidebarBody portal={portal} sections={sections} footer={sidebarFooter} />
          </aside>
        ) : null}

        <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1680px]">{children}</div>
        </main>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeMenu}
            className="absolute inset-0 bg-ink-900/40"
          />
          <div
            id="app-menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
              <Wordmark />
              <button
                type="button"
                onClick={closeMenu}
                autoFocus
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-600 hover:bg-surface-2"
              >
                <X aria-hidden size={18} />
              </button>
            </div>
            <SidebarBody
              portal={portal}
              sections={sections}
              footer={sidebarFooter}
              onNavigate={closeMenu}
            />
          </div>
        </div>
      ) : null}

      {tabs ? <TouristTabBar items={tabs} /> : null}
    </div>
  );
}

/**
 * The product name as the logo. Loktak teal, so it never reads as the purple
 * of a selected item, with the AI of Ma-T-AI picked out.
 */
function Wordmark() {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 items-center rounded-lg bg-[linear-gradient(135deg,var(--color-lake-500),var(--color-lake-800))] px-2.5 text-[17px] font-bold leading-none tracking-tight text-white shadow-sm"
    >
      One<span className="text-warn-100">Stop</span>
    </span>
  );
}

function SidebarBody({
  portal,
  sections,
  footer,
  onNavigate,
}: {
  portal?: Portal;
  sections?: NavItem[];
  footer?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {portal ? (
          <Link
            href={portal.href}
            onClick={onNavigate}
            className="flex items-center gap-2.5 px-4 pb-3 pt-4"
          >
            <span
              aria-hidden
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold text-white',
                portal.accent,
              )}
            >
              {portal.letter}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[14px] font-semibold text-ink-900">{portal.title}</span>
              {portal.subtitle ? (
                <span className="block truncate text-[11px] text-ink-500">{portal.subtitle}</span>
              ) : null}
            </span>
          </Link>
        ) : null}

        {portal && sections && sections.length > 0 ? (
          <div className="px-2 pb-3">
            <SectionList items={sections} label={`${portal.title} sections`} onNavigate={onNavigate} />
          </div>
        ) : null}
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-line px-4 py-3 text-[12px] text-ink-500">{footer}</div>
      ) : null}
    </>
  );
}
