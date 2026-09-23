import { BadgeCheck, BedDouble, Car, ExternalLink, Globe, UserRound } from 'lucide-react';

import { formatRupees } from '@/lib/money';
import { BUSINESS_TYPE_LABEL, type OnlinePlace, type Trip } from '@/lib/types';
import { costTrip } from '@/server/ai/trip-logistics';
import { getBusiness, getDestination } from '@/server/data/repository';
import { ProvenanceBadge } from '@/components/shared/badges';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';

/**
 * What a plan includes beyond its places, with where each part comes from.
 *
 * A OneStop partner is a verified business registered on the platform; its
 * price is its own rate. A place found online is not a partner, is not
 * priced, and carries the search results it was found in.
 */

export function PartnerTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-lake-200 bg-lake-50 px-2 py-0.5 text-[11px] font-medium text-lake-700">
      <BadgeCheck aria-hidden size={12} />
      OneStop partner
    </span>
  );
}

export function OnlineTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-info-500/25 bg-info-100 px-2 py-0.5 text-[11px] font-medium text-info-700">
      <Globe aria-hidden size={12} />
      Not a partner · found online
    </span>
  );
}

const placeName = (id: string) => getDestination(id)?.name ?? id;

function OnlineList({ places }: { places: OnlinePlace[] }) {
  if (places.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2 border-l-2 border-info-100 pl-3">
      {places.map((place) => (
        <li key={`${place.destinationId}-${place.kind}-${place.name}`} className="text-[12px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-ink-900">{place.name}</span>
            <OnlineTag />
          </div>
          {place.note ? <p className="mt-0.5 text-ink-600">{place.note}</p> : null}
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-ink-500">
            {place.sources.map((source) => (
              <a
                key={source.uri}
                href={source.uri}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-info-700 hover:underline"
              >
                {source.title}
                <ExternalLink aria-hidden size={11} />
              </a>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Where each night is spent, how the visitor gets around, and who guides them. */
export function TripIncludes({ trip, searchAction }: { trip: Trip; searchAction?: React.ReactNode }) {
  const logistics = trip.logistics;
  if (!logistics) return null;
  const online = logistics.online.places;
  // One business can turn up near several stops; it is listed once.
  const onlineFor = (kind: OnlinePlace['kind'], destinationId?: string) =>
    online.filter(
      (place, index) =>
        place.kind === kind &&
        (destinationId === undefined || place.destinationId === destinationId) &&
        online.findIndex((other) => other.kind === kind && other.name.toLowerCase() === place.name.toLowerCase()) === index,
    );
  const transport = logistics.transport;
  const transportPartner = transport?.businessId ? getBusiness(transport.businessId) : undefined;
  const onlineGuides = onlineFor('GUIDE');
  const distinctOnline = new Set(online.map((place) => `${place.kind}:${place.name.toLowerCase()}`)).size;

  return (
    <Card>
      <CardHeader
        title="What this plan includes"
        subtitle="Partners are verified businesses on OneStop Manipur. Places found online are not partners, and have no price here."
      />
      <CardBody className="space-y-5">
        {/* Stays */}
        <section aria-labelledby={`stays-${trip.id}`} className="space-y-3">
          <h3 id={`stays-${trip.id}`} className="text-[13px] font-semibold text-ink-900">
            Where you stay
          </h3>
          {logistics.stays.length === 0 ? (
            <p className="text-[12px] text-ink-500">A day trip: no nights to arrange.</p>
          ) : (
            logistics.stays.map((stay) => {
              const partner = stay.businessId ? getBusiness(stay.businessId) : undefined;
              const firstNightHere = logistics.stays.find((row) => row.destinationId === stay.destinationId)?.night === stay.night;
              return (
                <Row key={stay.night} icon={<BedDouble size={16} />}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                    Night {stay.night} · {placeName(stay.destinationId)}
                  </p>
                  {partner ? (
                    <>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-medium text-ink-900">{partner.name}</span>
                        <PartnerTag />
                      </div>
                      <p className="text-[12px] text-ink-600">
                        {BUSINESS_TYPE_LABEL[partner.businessType]}
                        {partner.rate?.note ? ` · ${partner.rate.note}` : ''} ·{' '}
                        {stay.rate !== undefined ? `${formatRupees(stay.rate)} a room` : 'rate on enquiry'} ×{' '}
                        {stay.rooms} {stay.rooms === 1 ? 'room' : 'rooms'}
                        {stay.travelMinutes > 0 ? ` · about ${stay.travelMinutes} min from where the day ends` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-[13px] text-ink-700">
                      No OneStop partner stay near {placeName(stay.destinationId)} yet.
                    </p>
                  )}
                  {firstNightHere ? <OnlineList places={onlineFor('STAY', stay.destinationId)} /> : null}
                </Row>
              );
            })
          )}
        </section>

        {/* Transport */}
        <section aria-labelledby={`transport-${trip.id}`} className="space-y-3 border-t border-line pt-4">
          <h3 id={`transport-${trip.id}`} className="text-[13px] font-semibold text-ink-900">
            Getting around
          </h3>
          <Row icon={<Car size={16} />}>
            {transportPartner && transport ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-ink-900">{transportPartner.name}</span>
                  <PartnerTag />
                </div>
                <p className="text-[12px] text-ink-600">
                  {transportPartner.rate?.note ?? 'Car with driver'} · {formatRupees(transport.rate ?? 0)} a day ×{' '}
                  {transport.days} {transport.days === 1 ? 'day' : 'days'}
                  {transport.vehicles > 1 ? ` × ${transport.vehicles} cars` : ''}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-ink-700">No OneStop partner with vehicles yet: hire locally.</p>
            )}
            <OnlineList places={onlineFor('TRANSPORT')} />
          </Row>
          <p className="text-[11px] text-ink-500">
            Drive times are estimates from straight-line distance with a hill-adjusted road factor, not routed times.
          </p>
        </section>

        {/* Guides */}
        <section aria-labelledby={`guides-${trip.id}`} className="space-y-3 border-t border-line pt-4">
          <h3 id={`guides-${trip.id}`} className="text-[13px] font-semibold text-ink-900">
            Guides
          </h3>
          {logistics.guides.length === 0 ? (
            <p className="text-[12px] text-ink-500">No stop on this plan has a partner guide nearby.</p>
          ) : (
            logistics.guides.map((guide) => {
              const partner = getBusiness(guide.businessId);
              return (
                <Row key={guide.day} icon={<UserRound size={16} />}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                    Day {guide.day} · {placeName(guide.destinationId)}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-ink-900">{partner?.name ?? 'Partner guide'}</span>
                    <PartnerTag />
                  </div>
                  <p className="text-[12px] text-ink-600">
                    {partner?.rate?.note ?? 'For the group'} ·{' '}
                    {guide.rate !== undefined ? formatRupees(guide.rate) : 'rate on enquiry'}
                  </p>
                </Row>
              );
            })
          )}
          {onlineGuides.length > 0 ? (
            <Row icon={<Globe size={16} />}>
              <p className="text-[12px] text-ink-600">Guides found online</p>
              <OnlineList places={onlineGuides} />
            </Row>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[12px] text-ink-600">
          <Globe aria-hidden size={14} className="text-ink-400" />
          <span>
            {logistics.online.status === 'FOUND'
              ? `${distinctOnline} ${distinctOnline === 1 ? 'place' : 'places'} found online, listed with their sources.`
              : logistics.online.status === 'NONE_FOUND'
                ? 'Searched online: nothing beyond the partners turned up.'
                : logistics.online.status === 'OFF'
                  ? 'Online search is off: this plan uses registered partners only.'
                  : logistics.online.status === 'FAILED'
                    ? 'The online search did not finish.'
                    : logistics.online.status === 'LIMITED'
                      ? 'Online search is paused for a while.'
                      : 'Places that are not partners have not been looked for yet.'}
          </span>
          {logistics.online.status !== 'OFF' ? searchAction : null}
        </div>
      </CardBody>
    </Card>
  );
}

/** The estimate, line by line, against the visitor's budget. */
export function TripCostCard({ trip }: { trip: Trip }) {
  const cost = costTrip(trip);
  const partners = [
    ...(trip.logistics?.stays.map((stay) => stay.businessId) ?? []),
    trip.logistics?.transport?.businessId,
    ...(trip.logistics?.guides.map((guide) => guide.businessId) ?? []),
  ]
    .filter((id): id is string => Boolean(id))
    .map((id) => getBusiness(id));
  const demo = partners.some((partner) => partner?.provenance === 'DEMO_SYNTHETIC');
  const travellers = trip.preferences.travellers;

  return (
    <Card>
      <CardHeader
        title="Cost estimate"
        subtitle={`For ${travellers} ${travellers === 1 ? 'traveller' : 'travellers'}, from partner rates and listed experience prices.`}
      />
      <CardBody className="space-y-3">
        {cost.lines.length === 0 ? (
          <p className="text-[13px] text-ink-600">Nothing on this plan has a partner price yet.</p>
        ) : (
          <dl className="space-y-2 text-[13px]">
            {cost.lines.map((line) => (
              <div key={line.key} className="flex items-start justify-between gap-3">
                <dt>
                  <span className="text-ink-900">{line.label}</span>
                  <span className="block text-[11px] text-ink-500">{line.detail}</span>
                </dt>
                <dd className="num text-ink-900">{formatRupees(line.amount)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
              <dt className="font-semibold text-ink-900">Estimated total</dt>
              <dd className="num text-[16px] font-semibold text-ink-900">{formatRupees(cost.total)}</dd>
            </div>
            {travellers > 1 ? (
              <div className="flex justify-between gap-3 text-[12px] text-ink-500">
                <dt>Per person</dt>
                <dd className="num">{formatRupees(cost.perPerson)}</dd>
              </div>
            ) : null}
          </dl>
        )}

        {cost.budget ? (
          <p
            className={
              cost.budget.fits
                ? 'rounded-md border border-good-500/25 bg-good-100 px-3 py-2 text-[13px] text-good-700'
                : 'rounded-md border border-warn-500/25 bg-warn-100 px-3 py-2 text-[13px] text-warn-700'
            }
          >
            {cost.budget.fits
              ? `Within your ${formatRupees(cost.budget.amount)} budget, with about ${formatRupees(cost.budget.difference)} to spare for what is not included.`
              : `About ${formatRupees(-cost.budget.difference)} over your ${formatRupees(cost.budget.amount)} budget.`}
          </p>
        ) : (
          <p className="text-[12px] text-ink-500">No budget given. Add one when you plan to see how a plan fits it.</p>
        )}

        <p className="text-[12px] text-ink-500">Not included: {cost.excludes.join(', ')}.</p>
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge provenance="ESTIMATED" />
          {demo ? <ProvenanceBadge provenance="DEMO_SYNTHETIC" /> : null}
          <span className="text-[11px] text-ink-500">A planning estimate, not a quote. Confirm prices with each partner.</span>
        </div>
      </CardBody>
    </Card>
  );
}
