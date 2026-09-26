'use client';

import { useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';

import type { Destination, Experience, TourismBusiness } from '@/lib/types';
import type { PlaceMedia } from '@/lib/ai/web-media';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import type { DiscoverAction, DiscoverChatAnswer, DiscoverFocus } from '@/server/ai/discover';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { DiscoverChat } from '@/components/shared/DiscoverChat';
import { TAB_BAR_CLEARANCE } from '@/components/mobile/metrics';

/**
 * The cross-catalog AI search, on mobile: the same DiscoverChat desktop uses
 * inside DiscoverWorkspace, opened full-screen from a floating trigger on the
 * opposite corner to the Interpreter bubble. Distinct from AskPlacePanel,
 * which answers about one place already on screen — this one finds places
 * across the whole catalogue from a free-text request, same as typing into
 * Discover's search box but conversational, with photos, videos and a guided
 * enquiry.
 */
export function DiscoverChatLauncher({
  destinations,
  experiences,
  businesses = [],
  ask,
  lookUpOnline,
  getPreview,
  askPlace,
  submitEnquiry,
  initialFocus,
}: {
  destinations: Destination[];
  experiences: Experience[];
  businesses?: TourismBusiness[];
  ask: (input: unknown) => Promise<{ ok: boolean; error?: string; answer?: DiscoverChatAnswer }>;
  lookUpOnline: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; media?: PlaceMedia; actions?: DiscoverAction[] }>;
  getPreview: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; data?: DestinationDetailsData }>;
  askPlace: (destinationId: string, question: string) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  submitEnquiry: (input: unknown) => Promise<{ ok: boolean; error?: string }>;
  initialFocus?: DiscoverFocus;
}) {
  const [open, setOpen] = useState(false);
  const destinationById = new Map(destinations.map((d) => [d.id, d]));
  const experienceById = new Map(experiences.map((e) => [e.id, e]));
  const businessById = new Map(businesses.map((b) => [b.id, b]));

  if (!open) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[480px] justify-start px-3"
        style={{ bottom: `calc(${TAB_BAR_CLEARANCE} + 0.5rem)` }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask mTour Agent: find places, food or stays by describing what you want"
          className="glass-bar pointer-events-auto flex h-12 items-center gap-2 rounded-full pl-3 pr-4 text-ink-900 shadow-raised transition-transform active:scale-95"
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-full text-white"
            style={{ background: 'linear-gradient(180deg, #5AD8E6, #18A8C9)' }}
          >
            <MessageCircleQuestion size={18} strokeWidth={2.2} />
          </span>
          <span className="text-[13px] font-semibold">Ask</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-paper p-3">
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
        initialFocus={initialFocus}
      />
    </div>
  );
}
