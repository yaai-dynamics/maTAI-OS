import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getDestination } from '@/server/data/repository';
import { buildDestinationPreview } from '@/server/data/destination-preview';
import { DestinationDetails } from '@/components/shared/DestinationDetails';
import { BackButton } from '@/components/shared/BackButton';
import { ViewSignal } from '@/components/telemetry/Signals';
import { askPlace } from '@/server/actions/tourist';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const destination = getDestination(id);
  return { title: destination?.name ?? 'Destination' };
}

export default async function DestinationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const destination = getDestination(id);
  if (!destination) notFound();

  return (
    <div className="space-y-4">
      {/* Opening the page is itself a tourism signal, recorded anonymously. */}
      <ViewSignal destinationId={id} />

      <BackButton fallbackHref="/explore/discover" />

      <DestinationDetails data={buildDestinationPreview(destination)} ask={askPlace} />
    </div>
  );
}
