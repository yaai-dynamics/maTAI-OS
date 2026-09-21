import Link from 'next/link';
import type { Metadata } from 'next';

import { getCreators, getDistricts } from '@/server/data/repository';
import { isSessionRecord } from '@/server/data/store';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import {
  ActionForm,
  CheckboxRow,
  Field,
  Select,
  TextArea,
  TextInput,
} from '@/components/shared/ActionForm';
import { onboardCreatorForm } from '@/server/actions/forms';

export const metadata: Metadata = { title: 'Join as a creator' };
export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'nature',
  'culture',
  'heritage',
  'history',
  'food',
  'craft',
  'adventure',
  'eco-tourism',
  'photography',
  'wildlife',
  'travel',
] as const;

const LANGUAGES = ['English', 'Hindi', 'Meitei', 'Tangkhul', 'Rongmei', 'Mizo'] as const;

export default function CreatorOnboardingPage() {
  const districts = getDistricts();
  const pending = getCreators().filter((creator) => creator.status === 'PENDING_VERIFICATION');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Join as a creator</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Tourism Department campaigns are matched to creators on what they cover, who they reach and
          what their past content actually produced. Joining puts you in that pool.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Your profile"
            subtitle="This is what the matching runs against, so it is worth being accurate rather than broad."
          />
          <CardBody>
            <ActionForm
              action={onboardCreatorForm}
              submitLabel="Register"
              pendingLabel="Registering…"
              size="lg"
              fullWidthSubmit
            >
              <Field label="Name you publish under" name="displayName" required>
                <TextInput
                  id="displayName"
                  name="displayName"
                  required
                  maxLength={120}
                  placeholder="NorthEast Frames"
                />
              </Field>

              <Field label="Home district" name="homeDistrict" required>
                <Select id="homeDistrict" name="homeDistrict" required defaultValue="Ukhrul">
                  {districts.map((district) => (
                    <option key={district.id} value={district.name}>
                      {district.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="What you cover"
                name="categories"
                required
                hint="Matched against campaign themes. Pick what you actually make, not everything."
              >
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((category) => (
                    <CheckboxRow key={category} name="categories" value={category} label={category} />
                  ))}
                </div>
              </Field>

              <Field label="Languages you publish in" name="languages" required>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.map((language) => (
                    <CheckboxRow
                      key={language}
                      name="languages"
                      value={language}
                      label={language}
                      defaultChecked={language === 'English'}
                    />
                  ))}
                </div>
              </Field>

              <Field label="Platforms" name="platforms" required>
                <div className="flex flex-wrap gap-1.5">
                  <CheckboxRow name="platforms" value="Instagram" label="Instagram" defaultChecked />
                  <CheckboxRow name="platforms" value="YouTube" label="YouTube" />
                  <CheckboxRow name="platforms" value="Facebook" label="Facebook" />
                  <CheckboxRow name="platforms" value="X" label="X" />
                </div>
              </Field>

              <Field label="Who you reach" name="audienceSummary" required>
                <TextInput
                  id="audienceSummary"
                  name="audienceSummary"
                  required
                  maxLength={200}
                  placeholder="Northeast travel and outdoor audience"
                />
              </Field>

              <Field label="Audience age band" name="audienceAgeBand" hint="For example 18-35.">
                <TextInput id="audienceAgeBand" name="audienceAgeBand" defaultValue="18-35" />
              </Field>

              <Field label="In a sentence" name="bio">
                <TextArea
                  id="bio"
                  name="bio"
                  maxLength={400}
                  placeholder="Outdoor and trekking content from the eastern hills, filmed close to home."
                />
              </Field>
              <fieldset className="space-y-3 rounded-md border border-line p-3">
                <legend className="px-1 text-[12px] font-semibold text-ink-800">Your account</legend>
                <p className="text-[12px] text-ink-600">
                  You will be signed in as soon as you register. The email is used to sign in and is
                  never shown in a government analytics view.
                </p>
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
            <CardHeader title="How this works" />
            <CardBody>
              <ol className="space-y-3">
                {[
                  {
                    title: 'You register',
                    body: 'Your profile is recorded as awaiting verification. Until the department verifies you, you are not shortlisted for campaigns, because a shortlist is a departmental endorsement.',
                  },
                  {
                    title: 'You start at zero',
                    body: 'Reputation on this platform is earned from delivered campaigns, not declared. A new creator has no score, and that is the honest starting point.',
                  },
                  {
                    title: 'You apply and deliver',
                    body: 'Every campaign states its objective, audience, content requirement, deadline and reward up front. Briefs come with verified facts so you are not inventing claims.',
                  },
                  {
                    title: 'You are paid on outcomes',
                    body: 'The reward split follows itinerary additions and check-ins attributed to the campaign, not follower counts.',
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
              subtitle="Decided by the Tourism Department, not by the platform."
              eyebrow={`${pending.length} waiting`}
            />
            <CardBody>
              {pending.length === 0 ? (
                <p className="text-[13px] text-ink-600">Nothing is waiting.</p>
              ) : (
                <ul className="space-y-2">
                  {pending.map((creator) => (
                    <li
                      key={creator.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line bg-surface p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink-900">
                          {creator.displayName}
                          {isSessionRecord(creator.id) ? (
                            <span className="ml-1.5 text-[10px] font-normal text-lake-700">
                              new in this session
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {creator.homeDistrict} · {creator.categories.slice(0, 3).join(', ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge tone="warn">awaiting verification</Badge>
                        <ProvenanceBadge provenance={creator.provenance} />
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
