import Link from 'next/link';
import type { Metadata } from 'next';

import { BUSINESS_TYPE_LABEL, businessTypeSchema } from '@/lib/types';
import { getBusinesses, getDestinations } from '@/server/data/repository';
import { isSessionRecord } from '@/server/data/store';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import {
  ActionForm,
  Field,
  Select,
  TextArea,
  TextInput,
} from '@/components/shared/ActionForm';
import { onboardBusinessForm } from '@/server/actions/forms';

export const metadata: Metadata = { title: 'Register your business' };
export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  const destinations = getDestinations();
  const pending = getBusinesses().filter((business) => business.status === 'PENDING_VERIFICATION');
  const invited = getBusinesses().filter((business) => business.status === 'INVITED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
          Register your business
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Homestays, guides, tour operators, restaurants, artisans and transport providers. Joining
          puts you in front of travellers who have already chosen the destination, and puts your
          capacity into the decisions the Tourism Department makes about where to send them.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Your details"
            subtitle="Short on purpose. A pilot would add documents and a site visit."
          />
          <CardBody>
            <ActionForm
              action={onboardBusinessForm}
              submitLabel="Register"
              pendingLabel="Registering…"
              size="lg"
              fullWidthSubmit
            >
              <Field label="Business name" name="name" required>
                <TextInput
                  id="name"
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Shirui Ridge Homestay"
                />
              </Field>

              <Field label="What you do" name="businessType" required>
                <Select id="businessType" name="businessType" required defaultValue="HOMESTAY">
                  {businessTypeSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {BUSINESS_TYPE_LABEL[option]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Where you operate" name="destinationId" required>
                <Select id="destinationId" name="destinationId" required defaultValue="dest-ukhrul">
                  {destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.name} — {destination.district}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Places you can host"
                name="reportedCapacity"
                hint="Rooms, beds or seats. You can change this whenever you report availability."
              >
                <TextInput id="reportedCapacity" name="reportedCapacity" type="number" min={0} />
              </Field>

              <Field label="In a sentence" name="description">
                <TextArea
                  id="description"
                  name="description"
                  maxLength={400}
                  placeholder="Family run homestay on the ridge road, four rooms, meals included."
                />
              </Field>

              <Field
                label="Contact visibility"
                name="contactVisibility"
                required
                hint="On enquiry is the default. Your details are never shown in a government analytics view."
              >
                <Select
                  id="contactVisibility"
                  name="contactVisibility"
                  required
                  defaultValue="ON_ENQUIRY"
                >
                  <option value="ON_ENQUIRY">Share only when someone enquires</option>
                  <option value="PUBLIC">Show publicly on my listing</option>
                  <option value="PRIVATE">Keep private, platform contacts me</option>
                </Select>
              </Field>
              <fieldset className="space-y-3 rounded-md border border-line p-3">
                <legend className="px-1 text-[12px] font-semibold text-ink-800">Your account</legend>
                <p className="text-[12px] text-ink-600">
                  You will be signed in as soon as you register. The email is used to sign in and is
                  never shown in a government analytics view.
                </p>
                <Field label="Your name" name="contactName" required hint="The person responsible for this listing.">
                  <TextInput id="contactName" name="contactName" autoComplete="name" required minLength={2} />
                </Field>
                <Field label="Email" name="email" required>
                  <TextInput id="email" name="email" type="email" autoComplete="email" required />
                </Field>
                <Field label="Password" name="password" required hint="At least 10 characters. A short phrase is easier to remember than symbols.">
                  <TextInput
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                  />
                </Field>
              </fieldset>
            </ActionForm>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="What happens next" />
            <CardBody>
              <ol className="space-y-3">
                {[
                  {
                    title: 'You register',
                    body: 'Your business is recorded as pending verification and marked unverified.',
                  },
                  {
                    title: 'The department verifies you',
                    body: 'Until then, nothing you report counts as participating capacity. An unverified self-report is not evidence, and the capacity figures say so.',
                  },
                  {
                    title: 'You report availability',
                    body: 'Daily, in about ten seconds. It feeds the capacity view the department uses when deciding where to promote.',
                  },
                  {
                    title: 'Travellers find you',
                    body: 'Your listing appears to people already planning a trip to your destination, and creators are pointed at you when they build a campaign brief.',
                  },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-700"
                    >
                      {index + 1}
                    </span>
                    <span>
                      <span className="block text-[13px] font-medium text-ink-900">{step.title}</span>
                      <span className="block text-[12px] text-ink-600">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Awaiting verification"
              subtitle="The Tourism Department decides these, not the platform."
              eyebrow={`${pending.length} pending, ${invited.length} invited`}
            />
            <CardBody>
              {pending.length === 0 && invited.length === 0 ? (
                <p className="text-[13px] text-ink-600">Nothing is waiting.</p>
              ) : (
                <ul className="space-y-2">
                  {[...pending, ...invited].map((business) => (
                    <li
                      key={business.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line bg-surface p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink-900">
                          {business.name}
                          {isSessionRecord(business.id) ? (
                            <span className="ml-1.5 text-[10px] font-normal text-lake-700">
                              new in this session
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {BUSINESS_TYPE_LABEL[business.businessType]} · {business.district}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge tone="warn">{business.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                        <ProvenanceBadge provenance={business.provenance} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/gov/partners"
                className="mt-3 inline-block text-[12px] font-medium text-brand-700 underline"
              >
                See the department verification queue
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
