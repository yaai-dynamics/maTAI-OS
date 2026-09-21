import Link from 'next/link';
import type { Metadata } from 'next';

import { BUSINESS_TYPE_LABEL } from '@/lib/types';
import { formatLongDate, formatRelative } from '@/lib/date';
import { now } from '@/lib/config';
import { currentWindow } from '@/server/analytics/windows';
import { computeDemand } from '@/server/analytics/demand';
import { computeDestinationSentiment } from '@/server/analytics/sentiment';
import {
  getAccommodationFor,
  getBusiness,
  getDestination,
  getEnquiriesForBusiness,
  getExperiences,
} from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, EmptyState, Meter } from '@/components/ui/primitives';
import { ProvenanceBadge, TrendChip } from '@/components/shared/badges';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { LineChart } from '@/components/charts/LineChart';
import { requirePartner } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Partner dashboard' };
export const dynamic = 'force-dynamic';

export default async function PartnerDashboardPage() {
  // The business is the one bound to the signed-in account. The prototype let a
  // ?business= parameter override it, which let anyone read any partner's
  // enquiries by editing the URL.
  const { businessId } = await requirePartner();
  const business = getBusiness(businessId);

  if (!business) {
    return (
      <EmptyState
        title="Business not found"
        description="Register your business to start reporting availability and receiving enquiries."
        action={
          <Link
            href="/partner/onboarding"
            className="rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
          >
            Register a business
          </Link>
        }
      />
    );
  }

  const destination = getDestination(business.destinationId);
  const snapshots = getAccommodationFor(business.id);
  const latest = snapshots[0];
  const enquiries = getEnquiriesForBusiness(business.id);
  const openEnquiries = enquiries.filter((entry) => entry.status === 'SUBMITTED');
  const listings = getExperiences().filter((entry) => entry.businessId === business.id);

  const window = currentWindow();
  const demand = computeDemand(window).find((row) => row.destinationId === business.destinationId);
  const sentiment = computeDestinationSentiment(window).find(
    (row) => row.destinationId === business.destinationId,
  );

  const occupancySeries = [...snapshots]
    .reverse()
    .map((row) => ({ label: row.date, value: Math.round(row.occupancyRate * 100) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">{business.name}</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            {BUSINESS_TYPE_LABEL[business.businessType]} at {destination?.name} ·{' '}
            {business.district} district
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              business.status === 'PARTICIPATING'
                ? 'good'
                : business.status === 'PENDING_VERIFICATION'
                  ? 'warn'
                  : 'neutral'
            }
          >
            {business.status.replace(/_/g, ' ').toLowerCase()}
          </Badge>
          {business.verified ? (
            <Badge tone="lake">✓ Verified</Badge>
          ) : (
            <Badge tone="warn">Not yet verified</Badge>
          )}
        </div>
      </div>

      {!business.verified ? (
        <Card className="border-warn-500/30 bg-warn-100/50">
          <CardBody className="pt-4">
            <p className="text-[13px] font-medium text-warn-700">
              Awaiting verification by the Tourism Department
            </p>
            <p className="mt-1 text-[13px] text-ink-700">
              You can report availability now, but it is not counted as participating capacity until
              you are verified. An unverified self-report is not evidence, and the department&rsquo;s
              capacity figures say so explicitly.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] text-ink-600">Open enquiries</p>
            <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
          </div>
          <p className="mt-1.5 text-[28px] font-semibold leading-none text-ink-900">
            {openEnquiries.length}
          </p>
          <p className="mt-1 text-[12px] text-ink-500">{enquiries.length} in total</p>
          {openEnquiries.length > 0 ? (
            <Link
              href="/partner/enquiries"
              className="mt-2 inline-block text-[12px] font-medium text-brand-700 underline"
            >
              Respond
            </Link>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] text-ink-600">Places free today</p>
            <ProvenanceBadge provenance="PARTNER_REPORTED" />
          </div>
          {latest ? (
            <>
              <p className="mt-1.5 text-[28px] font-semibold leading-none text-ink-900">
                {latest.availableCapacity}
                <span className="text-[15px] font-normal text-ink-500">/{latest.totalCapacity}</span>
              </p>
              <p className="mt-1 text-[12px] text-ink-500">
                reported {formatRelative(latest.date, now())}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-[15px] font-semibold text-ink-500">Not reported</p>
              <p className="mt-1 text-[12px] text-ink-600">
                Nothing is assumed on your behalf. Report it and it counts.
              </p>
            </>
          )}
          <Link
            href="/partner/availability"
            className="mt-2 inline-block text-[12px] font-medium text-brand-700 underline"
          >
            Report availability
          </Link>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] text-ink-600">Interest at {destination?.name}</p>
            <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
          </div>
          <p className="mt-1.5 text-[28px] font-semibold leading-none text-ink-900">
            {demand?.demandIndex ?? 0}
          </p>
          <div className="mt-1.5">
            <TrendChip percent={demand?.trendPercent ?? null} label="vs previous 30 days" />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-500">
            Demand index of 100, relative to the busiest destination. Not a visitor count.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] text-ink-600">Visitor satisfaction here</p>
            <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
          </div>
          <p className="mt-1.5 text-[28px] font-semibold leading-none text-ink-900">
            {sentiment?.averageRating?.toFixed(2) ?? '—'}
          </p>
          <p className="mt-1 text-[12px] text-ink-500">
            {sentiment?.responses ?? 0} responses in 30 days
          </p>
          {sentiment?.topIssue ? (
            <p className="mt-1.5 text-[11px] leading-snug text-warn-700">
              Most reported: {sentiment.topIssue.label}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Your reported occupancy"
            subtitle="What you have told the platform, day by day. Nothing is inferred."
            action={<ProvenanceBadge provenance="PARTNER_REPORTED" />}
          />
          <CardBody>
            {occupancySeries.length < 2 ? (
              <EmptyState
                icon="—"
                title="Not enough reports yet"
                description="Report availability for a few days and the trend appears here."
              />
            ) : (
              <ChartFrame
                title="Occupancy rate"
                subtitle="Percentage of your reported places taken"
                provenance="PARTNER_REPORTED"
                method="Occupancy is one minus available places divided by total places, from what you reported on each date."
                table={{
                  columns: ['Date', 'Occupancy'],
                  rows: occupancySeries.slice(-10).map((row) => [row.label, `${row.value}%`]),
                }}
              >
                <LineChart points={occupancySeries} unit="percent occupied" />
              </ChartFrame>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Your listings" eyebrow={`${listings.length} on the platform`} />
            <CardBody>
              {listings.length === 0 ? (
                <EmptyState
                  icon="—"
                  title="No listings yet"
                  description="Listings are added by the platform team during onboarding in this prototype."
                />
              ) : (
                <ul className="space-y-2">
                  {listings.map((listing) => (
                    <li key={listing.id} className="rounded-md border border-line bg-surface p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-ink-900">{listing.title}</p>
                        <Badge
                          tone={
                            listing.availabilityStatus === 'AVAILABLE'
                              ? 'good'
                              : listing.availabilityStatus === 'LIMITED'
                                ? 'warn'
                                : 'neutral'
                          }
                        >
                          {listing.availabilityStatus.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="num mt-1 text-[12px] text-ink-600">
                        ₹{listing.price.toLocaleString('en-IN')} · {listing.durationMinutes} minutes
                      </p>
                      <Link
                        href={`/explore/experiences?experience=${listing.id}`}
                        className="mt-1.5 inline-block text-[12px] font-medium text-brand-700 underline"
                      >
                        See how travellers see it
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {latest && latest.totalCapacity > 0 ? (
            <Card>
              <CardHeader title="Today at a glance" />
              <CardBody>
                <Meter
                  value={latest.occupancyRate}
                  label="Occupancy"
                  valueLabel={`${Math.round(latest.occupancyRate * 100)}%`}
                  tone={latest.occupancyRate > 0.85 ? 'warn' : 'brand'}
                />
                <p className="mt-2 text-[12px] text-ink-600">
                  Reported for {formatLongDate(latest.date)}.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

    </div>
  );
}
