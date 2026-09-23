import Link from 'next/link';
import type { Metadata } from 'next';
import { BedDouble, MapPin, ShieldCheck } from 'lucide-react';

import { BUSINESS_TYPE_LABEL, type TourismBusiness } from '@/lib/types';
import { getDestination, getDestinations, getExperiences, getStays } from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { askPlace, discoverChat, discoverPlaceOnline, getDestinationPreview, sendChatEnquiry } from '@/server/actions/tourist';
import { DiscoverWorkspace } from '@/components/shared/DiscoverWorkspace';
import { Badge, Card, CardBody, EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Stays',
  description: 'Verified homestays and small hotels across Manipur, bookable directly with the host.',
};
export const dynamic = 'force-dynamic';

/**
 * PS5: the places to sleep, listed from the same partner records the planner
 * and the department already use. A booking goes to the host, not to an
 * intermediary, and the rate shown is the one the host reported.
 */
export default async function StaysPage(props: { searchParams: Promise<{ district?: string; type?: string }> }) {
  const { district, type } = await props.searchParams;
  const bookable = await businessesAcceptingBookings();

  const all = getStays()
    .filter((stay) => stay.status === 'PARTICIPATING')
    .map((stay) => ({ stay, destination: getDestination(stay.destinationId) }));

  const districts = [...new Set(all.map((row) => row.stay.district))].sort();
  const activeDistrict = district && districts.includes(district) ? district : undefined;
  const activeType = type === 'HOMESTAY' || type === 'HOTEL' ? type : undefined;

  const shown = all.filter(
    (row) =>
      (!activeDistrict || row.stay.district === activeDistrict) &&
      (!activeType || row.stay.businessType === activeType),
  );

  const href = (next: { district?: string; type?: string }) => {
    const params = new URLSearchParams();
    const d = next.district ?? activeDistrict;
    const t = next.type ?? activeType;
    if (d && d !== 'all') params.set('district', d);
    if (t && t !== 'all') params.set('type', t);
    const query = params.toString();
    return query ? `/explore/stays?${query}` : '/explore/stays';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Stays</h1>
        <p className="mt-1 max-w-prose text-[13px] text-ink-600">
          Homestays and small hotels that have joined the platform. You book with the host directly: they accept
          first, and nothing is charged until they do.
        </p>
      </div>

      <DiscoverWorkspace
        destinations={getDestinations()}
        experiences={getExperiences()}
        businesses={getStays()}
        ask={discoverChat}
        lookUpOnline={discoverPlaceOnline}
        getPreview={getDestinationPreview}
        askPlace={askPlace}
        submitEnquiry={sendChatEnquiry}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <nav aria-label="Kind" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[12px] font-medium text-ink-500">Kind</span>
              <Chip href={href({ type: 'all' })} active={!activeType}>
                All
              </Chip>
              <Chip href={href({ type: 'HOMESTAY' })} active={activeType === 'HOMESTAY'}>
                Homestays
              </Chip>
              <Chip href={href({ type: 'HOTEL' })} active={activeType === 'HOTEL'}>
                Hotels
              </Chip>
            </nav>
            <nav aria-label="District" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[12px] font-medium text-ink-500">District</span>
              <Chip href={href({ district: 'all' })} active={!activeDistrict}>
                Everywhere
              </Chip>
              {districts.map((value) => (
                <Chip key={value} href={href({ district: value })} active={activeDistrict === value}>
                  {value}
                </Chip>
              ))}
            </nav>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              title="No stays match those filters"
              description="Try another district, or look at both homestays and hotels."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map(({ stay, destination }) => (
                <li key={stay.id}>
                  <StayCard
                    stay={stay}
                    destinationName={destination?.name}
                    online={bookable.has(stay.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          <p className="text-[12px] text-ink-500">
            Rates are what each host reported to the platform, per room per night, and are confirmed when the host
            accepts. Prototype partner data.
          </p>
        </div>
      </DiscoverWorkspace>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700'
          : 'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2'
      }
    >
      {children}
    </Link>
  );
}

function StayCard({
  stay,
  destinationName,
  online,
}: {
  stay: TourismBusiness;
  destinationName?: string;
  online: boolean;
}) {
  return (
    <Card as="article" className="flex h-full flex-col transition-colors hover:bg-surface-2">
      <CardBody className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="lake">
            <BedDouble aria-hidden size={11} />
            {BUSINESS_TYPE_LABEL[stay.businessType]}
          </Badge>
          {stay.verified ? (
            <Badge tone="good">
              <ShieldCheck aria-hidden size={11} />
              Verified
            </Badge>
          ) : null}
          {!online ? <Badge tone="neutral">Enquiry only</Badge> : null}
        </div>

        <h2 className="mt-2 text-[15px] font-semibold text-ink-900">
          <Link href={`/explore/stays/${stay.id}`} className="hover:text-brand-700 hover:underline">
            {stay.name}
          </Link>
        </h2>

        <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-600">
          <MapPin aria-hidden size={12} />
          {destinationName ?? stay.district}, {stay.district}
        </p>

        {stay.description ? (
          <p className="mt-2 line-clamp-3 text-[13px] text-ink-700">{stay.description}</p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <span className="text-[13px] text-ink-600">
            {stay.rate ? (
              <>
                <span className="text-[16px] font-semibold text-ink-900">
                  ₹{stay.rate.amount.toLocaleString('en-IN')}
                </span>{' '}
                per room, per night
              </>
            ) : (
              'Rate on enquiry'
            )}
          </span>
          <Link
            href={`/explore/stays/${stay.id}`}
            className="shrink-0 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-800 hover:bg-surface-2"
          >
            {online ? 'Book' : 'View'}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
