'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import { Modal } from '@/components/ui/interactive';
import { Button } from '@/components/ui/primitives';
import { DestinationDetails, type DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { ViewSignal } from '@/components/telemetry/Signals';

/**
 * The "Explore" button on a trip's stops: the full destination page, in a big
 * popup, so a stop can be looked into without leaving the trip. The page
 * itself (/explore/destinations/[id]) stays the way to open the same content
 * from the destinations list, and is what "Explore the full page" leads to.
 */
export function DestinationPreviewLink({
  destination,
  ask,
  className,
  children,
}: {
  destination: DestinationDetailsData;
  ask: (
    destinationId: string,
    question: string,
  ) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className={className}>
        {children}
      </Button>
      {open ? <DestinationPreviewModal destination={destination} ask={ask} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DestinationPreviewModal({
  destination,
  ask,
  onClose,
}: {
  destination: DestinationDetailsData;
  ask: (
    destinationId: string,
    question: string,
  ) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={destination.destination.name}
      subtitle={`${destination.destination.district} district`}
      size="full"
    >
      <ViewSignal destinationId={destination.destination.id} surface="destination-popup" />
      <DestinationDetails data={destination} ask={ask} />
      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <Link
          href={`/explore/destinations/${destination.destination.id}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline"
        >
          Explore the full page
          <ArrowUpRight aria-hidden size={14} />
        </Link>
      </div>
    </Modal>
  );
}
