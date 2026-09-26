import type { Metadata, Viewport } from 'next';

import './mobile.css';

import { readVisitor } from '@/server/telemetry/visitor';
import { AnalyticsNotice } from '@/components/telemetry/AnalyticsNotice';
import { LinkScope } from '@/components/mobile/LinkScope';
import { TabBar } from '@/components/mobile/TabBar';
import { TalkBubble } from '@/components/mobile/TalkBubble';

export const metadata: Metadata = {
  title: { default: 'Explore Manipur', template: '%s — mTour Agent' },
  robots: { index: false },
};

// No themeColor: Safari paints the status-bar strip with it, which put a
// solid band above full-bleed photos. Without it, Safari takes the colour
// from the page itself.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
      <main id="main" className="px-4 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+6rem)]">
        {children}
        {ask ? (
          <div className="mt-6">
            <AnalyticsNotice />
          </div>
        ) : null}
      </main>
      <TalkBubble />
      <TabBar />
    </div>
  );
}
