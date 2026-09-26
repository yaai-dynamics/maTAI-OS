import Link from 'next/link';
import type { Metadata } from 'next';
import { BedDouble, MapPin, ShieldCheck } from 'lucide-react';

import { BUSINESS_TYPE_LABEL, type TourismBusiness } from '@/lib/types';
import { getDestination, getStays } from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { Badge } from '@/components/ui/primitives';
import { MobileEmpty, MobileHeader, PillBar } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Stays' };
export const dynamic = 'force-dynamic';

/**
 * PS5, reshaped for the phone: the same partner records as desktop's
 * /explore/stays, filtered by kind and district, one column of cards.
 */
export default async function MobileStaysPage(props: {
  searchParams: Promise<{ district?: string; type?: string }>;
}) {
  const { district, type } = await props.searchParams;
  const bookable = await businessesAcceptingBookings();

  const all = getStays()
    .filter((stay) => stay.status === 'PARTICIPATING')
    .map((stay) => ({ stay, destination: getDestination(stay.destinationId) }));

  const districts = [...new Set(all.map((row) => row.stay.district))].sort();
  const activeDistrict = district && districts.includes(district) ? district : 'all';
  const activeType = type === 'HOMESTAY' || type === 'HOTEL' ? type : 'all';

  const shown = all.filter(
    (row) =>
      (activeDistrict === 'all' || row.stay.district === activeDistrict) &&
      (activeType === 'all' || row.stay.businessType === activeType),
  );

  const href = (next: { district?: string; type?: string }) => {
    const params = new URLSearchParams();
    const d = next.district ?? activeDistrict;
    const t = next.type ?? activeType;
    if (d !== 'all') params.set('district', d);
    if (t !== 'all') params.set('type', t);
    const query = params.toString();
    return query ? `/m/stays?${query}` : '/m/stays';
  };

  return (
    <div>
      <MobileHeader title="Stays" subtitle="Verified homestays and hotels — book directly with the host." backHref="/m" />

      <div className="space-y-2.5">
        <PillBar
          label="Kind"
          active={activeType}
          options={[
            { value: 'all', label: 'All', href: href({ type: 'all' }) },
            { value: 'HOMESTAY', label: 'Homestays', href: href({ type: 'HOMESTAY' }) },
            { value: 'HOTEL', label: 'Hotels', href: href({ type: 'HOTEL' }) },
          ]}
        />
        <PillBar
          label="District"
          active={activeDistrict}
          options={[
            { value: 'all', label: 'Everywhere', href: href({ district: 'all' }) },
            ...districts.map((value) => ({ value, label: value, href: href({ district: value }) })),
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <div className="mt-4">
          <MobileEmpty
            icon={BedDouble}
            tone="blue"
            title="No stays match those filters"
            description="Try another district, or look at both homestays and hotels."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map(({ stay, destination }) => (
            <li key={stay.id}>
              <StayRow stay={stay} destinationName={destination?.name} online={bookable.has(stay.id)} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[12px] text-ink-500">
        Rates are what each host reported, per room per night, confirmed when the host accepts. Prototype partner
        data.
      </p>
    </div>
  );
}

function StayRow({
  stay,
  destinationName,
  online,
}: {
  stay: TourismBusiness;
  destinationName?: string;
  online: boolean;
}) {
  return (
    <Link href={`/m/stays/${stay.id}`} className="block rounded-2xl bg-surface p-4 shadow-card active:scale-[0.99]">
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
      <p className="mt-2 text-[15px] font-semibold text-ink-900">{stay.name}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-600">
        <MapPin aria-hidden size={12} />
        {destinationName ?? stay.district}, {stay.district}
      </p>
      {stay.description ? <p className="mt-2 line-clamp-2 text-[13px] text-ink-700">{stay.description}</p> : null}
      <div className="mt-3 flex items-end justify-between border-t border-line pt-2.5">
        <span className="text-[13px] text-ink-600">
          {stay.rate ? (
            <>
              <span className="num text-[16px] font-semibold text-ink-900">
                ₹{stay.rate.amount.toLocaleString('en-IN')}
              </span>{' '}
              / night
            </>
          ) : (
            'Rate on enquiry'
          )}
        </span>
        <span className="text-[12px] font-medium text-brand-700">{online ? 'Book →' : 'View →'}</span>
      </div>
    </Link>
  );
}
