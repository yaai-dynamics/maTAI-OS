'use client';

import { createContext, useMemo, useState } from 'react';
import type { Destination, Experience, TourismBusiness } from '@/lib/types';
import type { PlaceMedia } from '@/lib/ai/web-media';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import type { DiscoverAction, DiscoverChatAnswer, DiscoverFocus } from '@/server/ai/discover';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { cn } from '@/components/ui/primitives';
import { DiscoverChat } from '@/components/shared/DiscoverChat';
import { AskOneStopButton } from '@/components/shared/AskOneStopButton';

/** What the chat tells a map beside it: whether it is open, and the places it just named. */
export const DiscoverChatContext = createContext<{ chatOpen: boolean; named: { ids: string[]; key: number } }>({
  chatOpen: false,
  named: { ids: [], key: 0 },
});

/**
 * Wraps the Discover screen's deterministic browse grid or map (`children`)
 * with the chat: a trigger that opens a panel taking the left third of the
 * screen on a desktop-sized viewport, alongside the content rather than over
 * it, and a full-screen panel on a phone, where a third of the width would be
 * unusable (CLAUDE.md section 10: tourist UI is mobile-first).
 */
export function DiscoverWorkspace({
  destinations,
  experiences,
  businesses = [],
  ask,
  lookUpOnline,
  getPreview,
  askPlace,
  submitEnquiry,
  initialFocus,
  children,
}: {
  destinations: Destination[];
  experiences: Experience[];
  /** Stays the chat can answer about and start an enquiry to, when it is opened focused on one. */
  businesses?: TourismBusiness[];
  ask: (input: unknown) => Promise<{ ok: boolean; error?: string; answer?: DiscoverChatAnswer }>;
  lookUpOnline: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; media?: PlaceMedia; actions?: DiscoverAction[] }>;
  getPreview: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; data?: DestinationDetailsData }>;
  askPlace: (destinationId: string, question: string) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  /** The chat's guided enquiry: a name, a phone number and a message, collected as plain replies. */
  submitEnquiry: (input: unknown) => Promise<{ ok: boolean; error?: string }>;
  /** The destination, experience or stay the surrounding page is already about, so the chat opens already knowing it. */
  initialFocus?: DiscoverFocus;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [named, setNamed] = useState<{ ids: string[]; key: number }>({ ids: [], key: 0 });
  const destinationById = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  const experienceById = useMemo(() => new Map(experiences.map((e) => [e.id, e])), [experiences]);
  const businessById = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses]);
  const context = useMemo(() => ({ chatOpen: open, named }), [open, named]);

  return (
    <DiscoverChatContext.Provider value={context}>
      <div className={cn(open && 'lg:flex lg:items-start lg:gap-5')}>
        {!open ? (
          <div className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 z-40 flex flex-col items-end gap-3">
            <AskOneStopButton onClick={() => setOpen(true)} />
          </div>
        ) : null}

        {open ? (
          <div className="fixed inset-0 z-40 bg-paper p-3 lg:static lg:z-auto lg:w-1/3 lg:shrink-0 lg:bg-transparent lg:p-0">
            <div className="lg:sticky lg:top-4">
              <DiscoverChat
                ask={ask}
                lookUpOnline={lookUpOnline}
                getPreview={getPreview}
                askPlace={askPlace}
                submitEnquiry={submitEnquiry}
                destinationById={destinationById}
                experienceById={experienceById}
                businessById={businessById}
                onClose={() => setOpen(false)}
                onPlaces={(ids) => setNamed((previous) => ({ ids, key: previous.key + 1 }))}
                initialFocus={initialFocus}
              />
            </div>
          </div>
        ) : null}

        <div className={cn('min-w-0', open ? 'hidden lg:block lg:flex-1' : 'w-full')}>{children}</div>
      </div>
    </DiscoverChatContext.Provider>
  );
}
