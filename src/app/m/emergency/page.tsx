import type { Metadata } from 'next';
import { Phone } from 'lucide-react';

import {
  EMERGENCY_SERVICE_LABEL,
  FACILITY_KIND_LABEL,
  type EmergencyContact,
  type SafetyFacility,
} from '@/lib/types';
import { directionsToPlaceHref } from '@/lib/map';
import { getDistricts, getEmergencyContacts, getSafetyFacilities } from '@/server/data/repository';
import { NearbyHelp, type NearbyFacility } from '@/components/shared/NearbyHelp';
import { Badge } from '@/components/ui/primitives';
import { MobileHeader, Section } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Emergency help' };
export const dynamic = 'force-dynamic';

/**
 * Same content and consent as the desktop Emergency page, reshaped for one
 * hand on a phone: the free numbers first as large tap targets, everything
 * else as scrollable panels. Nothing here is counted (see the desktop page's
 * own note) — a visit to this screen is not tourism intelligence.
 */
export default function MobileEmergencyPage() {
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
    <div>
      <MobileHeader
        title="Emergency help"
        subtitle="Free numbers, from any handset. If unsure who you need, call 112."
        backHref="/m"
      />

      <div className="grid grid-cols-2 gap-3">
        {primary.map((contact) => (
          <CallCard key={contact.id} contact={contact} emphasis={contact.number === '112'} />
        ))}
      </div>

      <Section title="Other lines">
        <div className="space-y-2.5 rounded-2xl bg-surface p-4 shadow-card">
          {others.map((contact) => (
            <div key={contact.id} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <a href={`tel:${contact.number}`} className="text-[15px] font-semibold text-ink-900">
                  {contact.number}
                </a>
                <Badge tone="neutral">{EMERGENCY_SERVICE_LABEL[contact.service]}</Badge>
              </div>
              <p className="text-[13px] text-ink-700">{contact.name}</p>
              <p className="mt-0.5 text-[12px] text-ink-600">{contact.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Nearest to you">
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <NearbyHelp facilities={nearby} />
        </div>
      </Section>

      <Section title="By district">
        <div className="space-y-4 rounded-2xl bg-surface p-4 shadow-card">
          {byDistrict.map((group) => (
            <div key={group.name}>
              <h3 className="text-[13px] font-semibold text-ink-900">{group.name}</h3>
              <ul className="mt-1.5 space-y-2">
                {group.list.map((facility) => (
                  <FacilityRow key={facility.id} facility={facility} districtName={group.name} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <p className="mt-6 text-[12px] text-ink-500">
        Facilities are real public institutions, held only to district level, so &ldquo;Directions&rdquo; searches
        for the building by name. No individual facility telephone number is listed — 112 reaches all of them.
      </p>
    </div>
  );
}

function CallCard({ contact, emphasis }: { contact: EmergencyContact; emphasis?: boolean }) {
  return (
    <a
      href={`tel:${contact.number}`}
      className={
        emphasis
          ? 'flex flex-col justify-between rounded-2xl bg-risk-500 p-4 text-white shadow-card active:scale-[0.98]'
          : 'flex flex-col justify-between rounded-2xl border border-line-strong bg-surface p-4 shadow-card active:scale-[0.98]'
      }
    >
      <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]">
        <Phone aria-hidden size={12} />
        {EMERGENCY_SERVICE_LABEL[contact.service]}
      </span>
      <span className={emphasis ? 'num mt-2 text-[30px] font-bold leading-none' : 'num mt-2 text-[30px] font-bold leading-none text-ink-900'}>
        {contact.number}
      </span>
      <span className={emphasis ? 'mt-1.5 text-[12px] text-white/85' : 'mt-1.5 text-[12px] text-ink-600'}>
        {contact.name}
      </span>
    </a>
  );
}

function FacilityRow({ facility, districtName }: { facility: SafetyFacility; districtName: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
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
        className="shrink-0 text-[12px] font-medium text-brand-700"
      >
        Directions ↗
      </a>
    </li>
  );
}
