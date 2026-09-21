import Link from 'next/link';
import type { Metadata } from 'next';

import { formatLongDate, toIsoDate } from '@/lib/date';
import { now } from '@/lib/config';
import { getAccommodationFor, getBusiness, getDestination } from '@/server/data/repository';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import { ActionForm, Field, TextInput } from '@/components/shared/ActionForm';
import { reportAvailabilityForm } from '@/server/actions/forms';
import { requirePartner } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Report availability' };
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const { businessId } = await requirePartner();
  const business = getBusiness(businessId);

  if (!business) {
    return <EmptyState title="Business not found" description="Register a business first." />;
  }

  const destination = getDestination(business.destinationId);
  const history = getAccommodationFor(business.id);
  const latest = history[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Report availability</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          What you report here goes straight into the capacity figures the Tourism Department uses to
          decide where to send visitors. It is labelled partner reported, and every aggregate built on
          it says that it covers participating partners only.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={business.name}
            subtitle={`${destination?.name}, ${business.district} district`}
            action={<ProvenanceBadge provenance="PARTNER_REPORTED" />}
          />
          <CardBody>
            <ActionForm
              action={reportAvailabilityForm}
              submitLabel="Report it"
              pendingLabel="Recording…"
              size="lg"
              fullWidthSubmit
              hiddenFields={{ businessId: business.id }}
            >
              <Field label="Date" name="date" required hint="Today, or a day you are catching up on.">
                <TextInput
                  id="date"
                  name="date"
                  type="date"
                  required
                  max={toIsoDate(now())}
                  defaultValue={toIsoDate(now())}
                />
              </Field>

              <Field
                label="Total places"
                name="totalCapacity"
                required
                hint="Rooms, beds or seats you offer in total."
              >
                <TextInput
                  id="totalCapacity"
                  name="totalCapacity"
                  type="number"
                  min={0}
                  required
                  defaultValue={latest?.totalCapacity ?? business.reportedCapacity ?? 0}
                />
              </Field>

              <Field label="Places still free" name="availableCapacity" required>
                <TextInput
                  id="availableCapacity"
                  name="availableCapacity"
                  type="number"
                  min={0}
                  required
                  defaultValue={latest?.availableCapacity ?? 0}
                />
              </Field>
            </ActionForm>

            <div className="mt-4 rounded-md border border-line bg-surface-2/50 p-3">
              <p className="text-[12px] font-medium text-ink-800">What this is used for</p>
              <ul className="mt-1.5 space-y-1 text-[12px] text-ink-600">
                <li>· Whether a destination can absorb a promotion campaign.</li>
                <li>· Capacity pressure warnings when interest is rising faster than supply.</li>
                <li>· The spare-capacity answer when an officer asks where to send visitors.</li>
              </ul>
              <p className="mt-2 text-[12px] text-ink-600">
                It is never shown as an individual property to the public, and your contact details
                are not included in any government analytics view.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What you have reported"
            subtitle="One record per day. Correcting a day replaces it rather than adding a second figure."
            eyebrow={`${history.length} reports`}
          />
          <CardBody>
            {history.length === 0 ? (
              <EmptyState
                icon="—"
                title="Nothing reported yet"
                description="Your first report appears here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] uppercase tracking-[0.06em] text-ink-500">
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 text-right font-semibold">Total</th>
                      <th className="px-3 py-2 text-right font-semibold">Free</th>
                      <th className="px-3 py-2 text-right font-semibold">Occupancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 14).map((row) => (
                      <tr key={row.id} className="border-b border-line/70">
                        <td className="px-3 py-2">{formatLongDate(row.date)}</td>
                        <td className="num px-3 py-2 text-right">{row.totalCapacity}</td>
                        <td className="num px-3 py-2 text-right">{row.availableCapacity}</td>
                        <td className="num px-3 py-2 text-right">
                          {Math.round(row.occupancyRate * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Link
              href="/partner"
              className="mt-3 inline-block text-[12px] font-medium text-brand-700 underline"
            >
              Back to the dashboard
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
