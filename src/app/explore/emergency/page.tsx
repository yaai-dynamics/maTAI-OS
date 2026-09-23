import type { Metadata } from 'next';
import { Phone, ShieldAlert } from 'lucide-react';

import {
  EMERGENCY_SERVICE_LABEL,
  FACILITY_KIND_LABEL,
  type EmergencyContact,
  type SafetyFacility,
} from '@/lib/types';
import { directionsToPlaceHref } from '@/lib/map';
import { getDistricts, getEmergencyContacts, getSafetyFacilities } from '@/server/data/repository';
import { NearbyHelp, type NearbyFacility } from '@/components/shared/NearbyHelp';
import { Badge, Card, CardBody, CardHeader, cn } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Emergency help',
  description: 'Emergency numbers for Manipur, and the nearest hospital, police control room and tourist office.',
};

/**
 * Emergency numbers and the nearest help.
 *
 * Everything needed in an emergency is server-rendered plain HTML and `tel:`
 * links, so the page works with JavaScript off and from the browser cache with
 * no network. Locating the visitor is the only scripted part, and it is an
 * addition to a list that is already complete.
 *
 * Nothing on this page is counted. A visit here is not tourism intelligence,
 * and the department has no reason to know who opened it.
 */
export default function EmergencyPage() {
  const contacts = getEmergencyContacts();
  const facilities = getSafetyFacilities();
  const districtName = new Map(getDistricts().map((district) => [district.id, district.name]));

  const primary = contacts.filter((contact) => contact.primary);
  const others = contacts.filter((contact) => !contact.primary);

  const nearby: NearbyFacility[] = facilities.map((facility) => ({
    id: facility.id,
    kind: facility.kind,
    name: facility.name,
    districtName: districtName.get(facility.districtId) ?? 'Manipur',
    latitude: facility.latitude,
    longitude: facility.longitude,
    note: facility.note,
  }));

  const byDistrict = [...districtName.entries()]
    .map(([id, name]) => ({ name, list: facilities.filter((facility) => facility.districtId === id) }))
    .filter((group) => group.list.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight text-ink-900">
          <ShieldAlert aria-hidden size={22} className="text-risk-700" />
          Emergency help
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          These numbers are free, work from any Indian handset — including one with no balance — and reach a real
          control room. If you are not sure who you need, call 112.
        </p>
      </div>

      <section aria-label="Emergency numbers" className="grid gap-3 sm:grid-cols-3">
        {primary.map((contact) => (
          <CallCard key={contact.id} contact={contact} emphasis={contact.number === '112'} />
        ))}
      </section>

      <Card>
        <CardHeader
          title="Other lines"
          subtitle="Each is answered nationally, in English and Hindi at minimum."
        />
        <CardBody className="space-y-2.5">
          {others.map((contact) => (
            <div
              key={contact.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2.5 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <a
                  href={`tel:${contact.number}`}
                  className="text-[14px] font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                >
                  {contact.number}
                </a>
                <span className="ml-2 text-[13px] text-ink-700">{contact.name}</span>
                <p className="mt-0.5 max-w-prose text-[12px] text-ink-600">{contact.description}</p>
              </div>
              <Badge tone="neutral">{EMERGENCY_SERVICE_LABEL[contact.service]}</Badge>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Nearest hospital, police and tourist office"
          subtitle="Sorted by how far each is from you, once you allow this page to read your location."
        />
        <CardBody>
          <NearbyHelp facilities={nearby} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="By district"
          subtitle="The full list, so it is here whether or not location works."
        />
        <CardBody className="space-y-4">
          {byDistrict.map((group) => (
            <div key={group.name}>
              <h3 className="text-[13px] font-semibold text-ink-900">{group.name}</h3>
              <ul className="mt-1.5 space-y-1.5">
                {group.list.map((facility) => (
                  <FacilityRow key={facility.id} facility={facility} districtName={group.name} />
                ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-500">
        Numbers are India&rsquo;s published national emergency short codes. Facilities are real public institutions;
        this platform holds their position only to district level, so &ldquo;Directions&rdquo; searches for the building by
        name rather than sending you to a point on a map. No individual facility telephone number is listed, because
        none could be verified — 112 reaches all of them.
      </p>
    </div>
  );
}

function CallCard({ contact, emphasis }: { contact: EmergencyContact; emphasis?: boolean }) {
  return (
    <a
      href={`tel:${contact.number}`}
      className={cn(
        'flex flex-col justify-between rounded-lg border p-4 transition-colors',
        emphasis
          ? 'border-transparent bg-risk-500 text-white hover:bg-risk-700'
          : 'border-line-strong bg-surface hover:bg-surface-2',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
        <Phone aria-hidden size={13} />
        {EMERGENCY_SERVICE_LABEL[contact.service]}
      </span>
      <span className={cn('mt-2 text-[32px] font-bold leading-none tracking-tight', !emphasis && 'text-ink-900')}>
        {contact.number}
      </span>
      <span className={cn('mt-1.5 text-[12px]', emphasis ? 'text-white/85' : 'text-ink-600')}>
        {contact.name}
      </span>
    </a>
  );
}

function FacilityRow({ facility, districtName }: { facility: SafetyFacility; districtName: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="min-w-0 text-[13px] text-ink-800">
        <Badge tone={facility.kind === 'HOSPITAL' ? 'risk' : 'neutral'} className="mr-1.5">
          {FACILITY_KIND_LABEL[facility.kind]}
        </Badge>
        {facility.name}
      </span>
      <a
        href={directionsToPlaceHref(`${facility.name}, ${districtName}, Manipur`)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[12px] font-medium text-brand-700 hover:underline"
      >
        Directions ↗
      </a>
    </li>
  );
}
