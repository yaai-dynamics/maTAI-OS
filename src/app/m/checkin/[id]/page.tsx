import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ISSUE_CATEGORY_LABEL } from '@/lib/types';
import { getDestination } from '@/server/data/repository';
import { hasCheckedInToday } from '@/server/telemetry/ingest';
import { readVisitor } from '@/server/telemetry/visitor';
import { checkInForm, submitFeedbackForm } from '@/server/actions/forms';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { PlacePhoto } from '@/components/shared/PlacePhoto';
import { ProvenanceBadge } from '@/components/shared/badges';
import { BackLink } from '@/components/mobile/BackLink';
import { EdgeToEdge } from '@/components/mobile/EdgeToEdge';
import { photoFor } from '@/lib/mobile/photos';
import { MobileField, MobileForm, StarRating, mobileInput } from '@/components/mobile/form';
import { Section } from '@/components/mobile/ui';
import { Badge } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const destination = getDestination(id);
  return { title: destination ? `Check in at ${destination.name}` : 'Check in' };
}

const POSITIVE_THEMES = ['EXPERIENCE', 'NATURE', 'HERITAGE', 'CULTURE', 'FOOD', 'HOSPITALITY'] as const;

/**
 * The page a destination QR code points at, opened inside the mobile app: one
 * screen, one decision, no account. Same forms and consent language as the
 * desktop page, kept inside the /m shell so scanning a code on-site does not
 * drop the tourist into a different-looking page.
 */
export default async function MobileCheckInPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const destination = getDestination(id);
  if (!destination) notFound();

  const { sessionId } = await readVisitor();
  const alreadyCheckedIn = sessionId ? hasCheckedInToday(sessionId, id) : false;
  const photo = photoFor(destination.id);

  return (
    <div>
      <section className="relative -mx-4">
        <PlacePhoto
          src={photo?.hd}
          alt={destination.name}
          eager
          overlay
          className="h-56"
          fallback={<DestinationVisual destination={destination} height="lg" overlay className="h-56!" />}
        />
        <EdgeToEdge />
        <BackLink fallbackHref={`/m/place/${destination.id}`} />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/70">You are at</p>
          <h1 className="mt-1 text-[24px] font-bold leading-tight text-white">{destination.name}</h1>
          <p className="text-[12px] text-white/70">{destination.district} district</p>
        </div>
      </section>

      {alreadyCheckedIn ? (
        <div className="mt-4 rounded-2xl border border-good-500/30 bg-good-100/50 p-4">
          <p className="text-[14px] font-medium text-good-700">You are checked in here</p>
          <p className="mt-1 text-[13px] text-ink-700">Your visit is counted. Nothing identifies you.</p>
        </div>
      ) : (
        <Section title="Check in">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-3 text-[13px] text-ink-600">
              A check-in is recorded only if you agree, and carries nothing that identifies you.
            </p>
            <MobileForm
              action={checkInForm}
              submitLabel="Check in here"
              pendingLabel="Checking in…"
              hiddenFields={{ destinationId: destination.id }}
              refreshOnSuccess
            >
              <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-ink-800">
                <input type="checkbox" name="consent" defaultChecked className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand-600)]" />
                <span>
                  Record that someone visited {destination.name} today. Stored against a random session identifier,
                  not against me — no name, no phone number, no location history.
                </span>
              </label>
            </MobileForm>
          </div>
        </Section>
      )}

      <Section title="How was it?">
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <p className="mb-4 text-[12px] text-ink-500">
            Optional, and separate from the check-in. Reaches the department as an issue or a compliment.
          </p>
          <MobileForm
            action={submitFeedbackForm}
            submitLabel="Send feedback"
            pendingLabel="Sending…"
            hiddenFields={{ destinationId: destination.id }}
            refreshOnSuccess
          >
            <StarRating name="rating" />
            <MobileField label="What is this about" htmlFor="category" required>
              <select id="category" name="category" required defaultValue="EXPERIENCE" className={mobileInput}>
                <optgroup label="Something that worked">
                  {POSITIVE_THEMES.map((theme) => (
                    <option key={theme} value={theme}>
                      {theme.charAt(0) + theme.slice(1).toLowerCase()}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Something to fix">
                  {(Object.keys(ISSUE_CATEGORY_LABEL) as (keyof typeof ISSUE_CATEGORY_LABEL)[]).map((category) => (
                    <option key={category} value={category}>
                      {ISSUE_CATEGORY_LABEL[category]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </MobileField>
            <MobileField label="In your words" htmlFor="text" required>
              <textarea id="text" name="text" required maxLength={600} rows={3} className={mobileInput} />
            </MobileField>
          </MobileForm>
        </div>
      </Section>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ProvenanceBadge provenance="PLATFORM_OBSERVED" />
        <Badge tone="neutral">Anonymous</Badge>
      </div>
    </div>
  );
}
