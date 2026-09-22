import type { Metadata, Viewport } from 'next';

import './mobile.css';

import { readVisitor } from '@/server/telemetry/visitor';
import { AnalyticsNotice } from '@/components/telemetry/AnalyticsNotice';
import { LinkScope } from '@/components/mobile/LinkScope';
import { TabBar } from '@/components/mobile/TabBar';

export const metadata: Metadata = {
  title: { default: 'Explore Manipur', template: '%s — maTAI' },
  robots: { index: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

/**
 * The mobile tourist app. Separate from the responsive desktop pages under
 * /explore: its own shell and screens, the same server actions and data.
 * The Android build (capacitor.config.ts) opens here.
 */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const visitor = await readVisitor();
  const ask = visitor.choice === 'unset' && !visitor.gpc;

  return (
    <div className="m-mono mx-auto min-h-dvh max-w-[480px] bg-paper">
      <LinkScope />
      <main id="main" className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
        {ask ? (
          <div className="mt-6">
            <AnalyticsNotice />
          </div>
        ) : null}
      </main>
      <TabBar />
    </div>
  );
}
