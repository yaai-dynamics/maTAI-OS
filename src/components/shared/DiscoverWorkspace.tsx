'use client';

import { MessageCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Destination, Experience } from '@/lib/types';
import type { PlaceMedia } from '@/lib/ai/web-media';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import type { DiscoverAction, DiscoverChatAnswer } from '@/server/ai/discover';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { cn } from '@/components/ui/primitives';
import { DiscoverChat } from '@/components/shared/DiscoverChat';

/**
 * Wraps the Discover screen's deterministic browse grid (`children`) with the
 * chat: a trigger that opens a panel taking the left third of the screen on
 * a desktop-sized viewport, alongside the grid rather than over it, and a
 * full-screen panel on a phone, where a third of the width would be
 * unusable (CLAUDE.md section 10: tourist UI is mobile-first).
 */
export function DiscoverWorkspace({
  destinations,
  experiences,
  ask,
  lookUpOnline,
  getPreview,
  askPlace,
  children,
}: {
  destinations: Destination[];
  experiences: Experience[];
  ask: (input: unknown) => Promise<{ ok: boolean; error?: string; answer?: DiscoverChatAnswer }>;
  lookUpOnline: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; media?: PlaceMedia; actions?: DiscoverAction[] }>;
  getPreview: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; data?: DestinationDetailsData }>;
  askPlace: (destinationId: string, question: string) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const destinationById = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  const experienceById = useMemo(() => new Map(experiences.map((e) => [e.id, e])), [experiences]);

  return (
    <div className={cn(open && 'lg:flex lg:items-start lg:gap-5')}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border border-brand-500 bg-brand-50 px-3.5 py-2 text-[13px] font-medium text-brand-700 hover:bg-brand-100"
        >
          <MessageCircle aria-hidden size={16} />
          Chat with AI to find a place or an experience
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40 bg-paper p-3 lg:static lg:z-auto lg:w-1/3 lg:shrink-0 lg:bg-transparent lg:p-0">
          <div className="lg:sticky lg:top-4">
            <DiscoverChat
              ask={ask}
              lookUpOnline={lookUpOnline}
              getPreview={getPreview}
              askPlace={askPlace}
              destinationById={destinationById}
              experienceById={experienceById}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className={cn('min-w-0', open ? 'hidden lg:block lg:flex-1' : 'w-full')}>{children}</div>
    </div>
  );
}
