import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ISSUE_CATEGORY_LABEL } from '@/lib/types';
import { getDestination } from '@/server/data/repository';
import { hasCheckedInToday } from '@/server/telemetry/ingest';
import { readVisitor } from '@/server/telemetry/visitor';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { ActionForm, Field, Select, TextArea } from '@/components/shared/ActionForm';
import { checkInForm, submitFeedbackForm } from '@/server/actions/forms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const destination = getDestination(id);
  return { title: destination ? `Check in at ${destination.name}` : 'Check in' };
}

const POSITIVE_THEMES = ['EXPERIENCE', 'NATURE', 'HERITAGE', 'CULTURE', 'FOOD', 'HOSPITALITY'] as const;

/**
 * The page a destination QR code points at — roadmap Phase 1.
 *
 * Designed for someone standing at a site entrance on a phone: one screen, one
 * decision, no account. The consent language is on the screen rather than
 * behind a link, because a check-in that was not understood is not consent.
 */
export default async function CheckInPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const destination = getDestination(id);
  if (!destination) notFound();

  // This visitor, today. It used to ask whether anyone had checked in during
  // this server process, so the second tourist at a site was told they
  // already had.
  const { sessionId } = await readVisitor();
  const alreadyCheckedIn = sessionId ? hasCheckedInToday(sessionId, id) : false;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Card className="overflow-hidden">
        <div className="relative">
          <DestinationVisual destination={destination} height="lg" overlay />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">You are at</p>
            <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-white">
              {destination.name}
            </h1>
            <p className="text-[12px] text-white/70">{destination.district} district</p>
          </div>
        </div>
      </Card>

      {alreadyCheckedIn ? (
        <Card className="border-good-500/30 bg-good-100/50">
          <CardBody className="pt-4">
            <p className="text-[14px] font-medium text-good-700">You are checked in here</p>
            <p className="mt-1 text-[13px] text-ink-700">
              Your visit is counted. Nothing identifies you.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Check in"
            subtitle="A check-in is recorded only if you agree, and carries nothing that identifies you."
          />
          <CardBody>
            <ActionForm
              action={checkInForm}
              submitLabel="Check in here"
              pendingLabel="Checking in…"
              size="lg"
              fullWidthSubmit
              hiddenFields={{ destinationId: destination.id }}
            >
              <label className="flex items-start gap-2.5 rounded-md border border-line bg-surface-2/50 p-3.5 text-[13px] text-ink-800">
                <input
                  type="checkbox"
                  name="consent"
                  defaultChecked
                  className="mt-0.5 h-4 w-4 accent-[var(--color-brand-600)]"
                />
                <span>
                  Record that someone visited {destination.name} today. It is stored against a random
                  session identifier, not against me. No name, no phone number, no location history.
                  The Tourism Department only ever sees it as part of a total.
                </span>
              </label>
            </ActionForm>

            <Disclosure summary="Why this is worth doing" className="mt-3">
              <p>
                Visitor counts at most destinations are estimates. A check-in is one of the few
                signals that is actually observed rather than modelled, which is what lets the
                department tell a genuinely busy site from a well known one, and put money where
                visitors actually are.
              </p>
              <p className="mt-1.5">
                Declining changes nothing about your visit, and there is no second prompt.
              </p>
            </Disclosure>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="How was it?"
          subtitle="Optional, and separate from the check-in. This is what reaches the department as an issue or a compliment."
        />
        <CardBody>
          <ActionForm
            action={submitFeedbackForm}
            submitLabel="Send feedback"
            pendingLabel="Sending…"
            fullWidthSubmit
            hiddenFields={{ destinationId: destination.id }}
          >
            <fieldset>
              <legend className="mb-1.5 text-[12px] font-medium text-ink-700">Rating</legend>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label
                    key={value}
                    htmlFor={`qr-rating-${value}`}
                    className="flex-1 cursor-pointer rounded-md border border-line-strong bg-surface py-2.5 text-center text-[15px] font-semibold text-ink-700 hover:bg-surface-2 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                  >
                    <input
                      id={`qr-rating-${value}`}
                      type="radio"
                      name="rating"
                      value={value}
                      required
                      defaultChecked={value === 4}
                      className="sr-only"
                    />
                    {value}
                    <span className="sr-only"> out of 5</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="What is this about" name="category" required>
              <Select id="category" name="category" required defaultValue="EXPERIENCE">
                <optgroup label="Something that worked">
                  {POSITIVE_THEMES.map((theme) => (
                    <option key={theme} value={theme}>
                      {theme.charAt(0) + theme.slice(1).toLowerCase()}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Something to fix">
                  {(Object.keys(ISSUE_CATEGORY_LABEL) as (keyof typeof ISSUE_CATEGORY_LABEL)[]).map(
                    (category) => (
                      <option key={category} value={category}>
                        {ISSUE_CATEGORY_LABEL[category]}
                      </option>
                    ),
                  )}
                </optgroup>
              </Select>
            </Field>

            <Field label="In your words" name="text" required>
              <TextArea id="text" name="text" required maxLength={600} rows={3} />
            </Field>
          </ActionForm>
        </CardBody>
      </Card>

      <Card tone="outline">
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex items-center gap-2">
            <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
            <Badge tone="neutral">Anonymous</Badge>
          </div>
          <Link
            href={`/explore/destinations/${destination.id}`}
            className="text-[13px] font-medium text-brand-700 underline"
          >
            About {destination.name}
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
