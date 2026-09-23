import type { Metadata } from 'next';

import { formatLongDate, formatRelative } from '@/lib/date';
import { now } from '@/lib/config';
import type { Enquiry } from '@/lib/types';
import { getBusiness, getEnquiriesForBusiness, getExperience } from '@/server/data/repository';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import { ActionForm } from '@/components/shared/ActionForm';
import { respondToEnquiryForm } from '@/server/actions/forms';
import { requirePartner } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Enquiries' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  SUBMITTED: 'warn',
  ACKNOWLEDGED: 'info',
  CONFIRMED: 'good',
  DECLINED: 'neutral',
} as const;

export default async function EnquiriesPage() {
  const { businessId } = await requirePartner();
  const business = getBusiness(businessId);

  if (!business) {
    return <EmptyState title="Business not found" description="Register a business first." />;
  }

  const enquiries = getEnquiriesForBusiness(business.id);
  const open = enquiries.filter((entry) => entry.status === 'SUBMITTED');
  const handled = enquiries.filter((entry) => entry.status !== 'SUBMITTED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Enquiries</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Travellers who chose {business.name} after reading about the destination. The platform takes
          no payment and no commission; you confirm with them directly.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Waiting for you"
          subtitle="An enquiry left unanswered is a visitor who goes somewhere else."
          eyebrow={`${open.length} open`}
        />
        <CardBody>
          {open.length === 0 ? (
            <EmptyState
              icon="✓"
              title="Nothing waiting"
              description="New enquiries appear here as travellers send them."
            />
          ) : (
            <ul className="space-y-3">
              {open.map((enquiry) => (
                <li key={enquiry.id}>
                  <EnquiryRow enquiry={enquiry} actionable />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Handled" eyebrow={`${handled.length}`} />
        <CardBody>
          {handled.length === 0 ? (
            <EmptyState icon="—" title="Nothing handled yet" />
          ) : (
            <ul className="space-y-2.5">
              {handled.slice(0, 12).map((enquiry) => (
                <li key={enquiry.id}>
                  <EnquiryRow enquiry={enquiry} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className="text-[12px] text-ink-600">
            An enquiry sent through the form carries a party size and a preferred date, and nothing to
            reach the traveller by. One sent through the chat agent instead carries a name and a phone
            number, given with their explicit consent so you can call them back directly.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function EnquiryRow({ enquiry, actionable = false }: { enquiry: Enquiry; actionable?: boolean }) {
  const experience = enquiry.experienceId ? getExperience(enquiry.experienceId) : undefined;
  const details = [
    enquiry.partySize ? `party of ${enquiry.partySize}` : '',
    enquiry.preferredDate ? `preferred ${formatLongDate(enquiry.preferredDate)}` : '',
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-900">
            {experience?.title ?? (enquiry.experienceId ? enquiry.experienceId : 'A stay, direct')}
          </p>
          <p className="text-[11px] text-ink-500">
            {[formatRelative(enquiry.createdAt, now()), ...details].join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={STATUS_TONE[enquiry.status]}>{enquiry.status.toLowerCase()}</Badge>
          <ProvenanceBadge provenance={enquiry.provenance} />
        </div>
      </div>

      {enquiry.contactName || enquiry.contactPhone ? (
        <p className="mt-2 text-[12px] text-ink-700">
          <span className="font-medium text-ink-900">{enquiry.contactName ?? 'No name given'}</span>
          {enquiry.contactPhone ? ` · ${enquiry.contactPhone}` : ''}
          <span className="ml-1.5 text-[11px] text-ink-500">shared with their consent, from the chat</span>
        </p>
      ) : null}

      {enquiry.message ?? enquiry.note ? (
        <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-[12px] text-ink-700">
          {enquiry.message ?? enquiry.note}
        </p>
      ) : null}

      {actionable ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <ActionForm
            action={respondToEnquiryForm}
            submitLabel="Confirm"
            pendingLabel="Confirming…"
            size="sm"
            className="space-y-2"
            hiddenFields={{ enquiryId: enquiry.id, status: 'CONFIRMED' }}
          />
          <ActionForm
            action={respondToEnquiryForm}
            submitLabel="Acknowledge"
            pendingLabel="Saving…"
            variant="secondary"
            size="sm"
            className="space-y-2"
            hiddenFields={{ enquiryId: enquiry.id, status: 'ACKNOWLEDGED' }}
          />
          <ActionForm
            action={respondToEnquiryForm}
            submitLabel="Decline"
            pendingLabel="Saving…"
            variant="ghost"
            size="sm"
            className="space-y-2"
            hiddenFields={{ enquiryId: enquiry.id, status: 'DECLINED' }}
          />
        </div>
      ) : null}
    </div>
  );
}
