import type { Metadata } from 'next';

import { getDestination } from '@/server/data/repository';
import { requireGovernment } from '@/server/auth/session';
import { bookingSummaryByDestination } from '@/server/bookings/ledger';
import { formatRupees } from '@/server/bookings/policy';
import { gatewayStatus } from '@/server/payments/gateway';
import { ProvenanceBadge } from '@/components/shared/badges';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

/**
 * Bookings as the department sees them: counts and money per destination.
 *
 * The ledger holds travellers' names and phone numbers for their hosts. None
 * of it reaches this page — bookingSummaryByDestination returns aggregates
 * only (CLAUDE.md section 9: aggregation by default in government views).
 */
export default async function GovBookingsPage() {
  await requireGovernment();
  const rows = await bookingSummaryByDestination();
  const payments = gatewayStatus();

  const totals = rows.reduce(
    (sum, row) => ({
      requests: sum.requests + row.requests,
      paid: sum.paid + row.paid,
      cancelled: sum.cancelled + row.cancelled,
      net: sum.net + row.capturedPaise - row.refundedPaise,
    }),
    { requests: 0, paid: 0, cancelled: 0, net: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Bookings</h1>
          <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
          {payments.configured && payments.gateway.testMode ? (
            <Badge tone="warn" title="Razorpay test mode: no real money moved.">
              Test payments
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          Requests travellers made to hosts on the platform, and how many became paid bookings. Counted from the
          booking ledger, so every figure here is a real transaction on this platform — not an estimate of tourism
          across the state.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          ['Requests', String(totals.requests)],
          ['Paid bookings', String(totals.paid)],
          ['Cancelled after paying', String(totals.cancelled)],
          ['Paid, after refunds', formatRupees(totals.net)],
        ].map(([term, value]) => (
          <div key={term} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <dt className="text-[12px] text-ink-600">{term}</dt>
            <dd className="num mt-1 text-[20px] font-semibold text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader
          title="By destination"
          subtitle="Paid counts every booking that was ever paid for, including ones later cancelled."
        />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState
              title="No bookings yet"
              description="Requests appear here as travellers book hosts who take bookings online."
            />
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="border-b border-line text-[12px] text-ink-600">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Destination</th>
                    <th scope="col" className="num py-2 pr-3 text-right font-medium">Requests</th>
                    <th scope="col" className="num py-2 pr-3 text-right font-medium">Paid</th>
                    <th scope="col" className="num py-2 pr-3 text-right font-medium">Completed</th>
                    <th scope="col" className="num py-2 pr-3 text-right font-medium">Cancelled</th>
                    <th scope="col" className="num py-2 pr-3 text-right font-medium">Closed unpaid</th>
                    <th scope="col" className="num py-2 text-right font-medium">Paid, after refunds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.destinationId}>
                      <th scope="row" className="py-2 pr-3 font-medium text-ink-900">
                        {getDestination(row.destinationId)?.name ?? row.destinationId}
                      </th>
                      <td className="num py-2 pr-3 text-right">{row.requests}</td>
                      <td className="num py-2 pr-3 text-right">{row.paid}</td>
                      <td className="num py-2 pr-3 text-right">{row.completed}</td>
                      <td className="num py-2 pr-3 text-right">{row.cancelled}</td>
                      <td className="num py-2 pr-3 text-right">{row.expiredOrDeclined}</td>
                      <td className="num py-2 text-right">{formatRupees(row.capturedPaise - row.refundedPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card tone="outline">
        <CardBody className="pt-4 text-[12px] text-ink-600">
          Coverage is limited to hosts who take bookings on the platform, so a destination with no bookings here may
          still be busy. Who booked is never shown to the department: travellers&rsquo; contact details go only to their
          host.
        </CardBody>
      </Card>
    </div>
  );
}
