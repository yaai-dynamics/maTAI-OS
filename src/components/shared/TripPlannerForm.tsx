'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PlanResult } from '@/server/actions/tourist';
import { Button, Chip, ErrorState, cn } from '@/components/ui/primitives';

/**
 * E1 planner entry.
 *
 * The free text is the primary input; the chips are additive refinements, not a
 * form the traveller has to fill in. Extraction happens server side and is
 * deterministic, so the same sentence always produces the same trip profile.
 */

const DURATIONS = [2, 3, 4, 5];

const INTERESTS = [
  'nature',
  'culture',
  'heritage',
  'food',
  'craft',
  'history',
  'wildlife',
  'adventure',
  'photography',
] as const;

const CROWD = [
  { value: 'QUIET', label: 'Less crowded' },
  { value: 'BALANCED', label: 'A mix' },
  { value: 'POPULAR', label: 'The highlights' },
] as const;

const BUDGETS = [
  { value: 'BUDGET', label: 'Budget' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'PREMIUM', label: 'Premium' },
] as const;

const ACCESS = [
  { value: 'NONE', label: 'No constraints' },
  { value: 'FAMILY_WITH_CHILDREN', label: 'With children' },
  { value: 'SENIOR_FRIENDLY', label: 'With seniors' },
  { value: 'LOW_MOBILITY', label: 'Step-free only' },
] as const;

const SUGGESTIONS = [
  'I have 3 days, love nature, culture and local food, and prefer less crowded places.',
  'Two days of history and heritage around Imphal, travelling with my parents.',
  'Four days, photography first, and I want to be on the water at sunrise.',
  'A long weekend of craft and markets, on a budget.',
];

export function TripPlannerForm({ plan }: { plan: (input: unknown) => Promise<PlanResult> }) {
  const router = useRouter();
  const [request, setRequest] = useState('');
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [interests, setInterests] = useState<string[]>([]);
  const [crowd, setCrowd] = useState<string | undefined>(undefined);
  const [budget, setBudget] = useState<string | undefined>(undefined);
  const [accessibility, setAccessibility] = useState<string>('NONE');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refinements =
    (duration ? 1 : 0) +
    interests.length +
    (crowd ? 1 : 0) +
    (budget ? 1 : 0) +
    (accessibility !== 'NONE' ? 1 : 0);

  const toggle = (value: string) =>
    setInterests((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setError('Tell us a little about the trip you want, in a sentence or two.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await plan({
        request: trimmed,
        ...(duration ? { durationDays: duration } : {}),
        ...(interests.length > 0 ? { interests } : {}),
        ...(crowd ? { crowdPreference: crowd } : {}),
        ...(budget ? { budget } : {}),
        ...(accessibility !== 'NONE' ? { accessibility } : {}),
      });

      if (!result.ok) {
        setError(result.error ?? 'Could not plan that trip.');
        return;
      }
      router.push('/explore/journey');
    });
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(request);
        }}
        className="space-y-3"
      >
        <label htmlFor="trip-request" className="sr-only">
          Describe the trip you want
        </label>
        <textarea
          id="trip-request"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          rows={3}
          placeholder="I have 3 days, love nature, culture and local food, and prefer less crowded places."
          className="w-full resize-none rounded-lg border border-white/25 bg-white/10 px-4 py-3 text-[15px] text-white placeholder:text-white/50 focus:border-white/50"
        />

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setRequest(suggestion)}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/15"
            >
              {suggestion.length > 48 ? `${suggestion.slice(0, 46)}…` : suggestion}
            </button>
          ))}
        </div>

        {/* Refinements sit before the button: they only count if set before planning. */}
        <details className="group rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white/85">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium [&::-webkit-details-marker]:hidden">
            <span>
              Refine it <span className="font-normal text-white/60">(optional)</span>
              {refinements > 0 ? (
                <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-white">
                  {refinements} set
                </span>
              ) : null}
            </span>
            <span aria-hidden className="text-white/60 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="mt-3 space-y-3 pb-1">
            <Group label="How many days">
              {DURATIONS.map((value) => (
                <ChipDark
                  key={value}
                  selected={duration === value}
                  onClick={() => setDuration(duration === value ? undefined : value)}
                >
                  {value} days
                </ChipDark>
              ))}
            </Group>

            <Group label="Interests">
              {INTERESTS.map((value) => (
                <ChipDark
                  key={value}
                  selected={interests.includes(value)}
                  onClick={() => toggle(value)}
                >
                  {value}
                </ChipDark>
              ))}
            </Group>

            <Group label="Crowds">
              {CROWD.map((option) => (
                <ChipDark
                  key={option.value}
                  selected={crowd === option.value}
                  onClick={() => setCrowd(crowd === option.value ? undefined : option.value)}
                >
                  {option.label}
                </ChipDark>
              ))}
            </Group>

            <Group label="Budget">
              {BUDGETS.map((option) => (
                <ChipDark
                  key={option.value}
                  selected={budget === option.value}
                  onClick={() => setBudget(budget === option.value ? undefined : option.value)}
                >
                  {option.label}
                </ChipDark>
              ))}
            </Group>

            <Group label="Accessibility">
              {ACCESS.map((option) => (
                <ChipDark
                  key={option.value}
                  selected={accessibility === option.value}
                  onClick={() => setAccessibility(option.value)}
                >
                  {option.label}
                </ChipDark>
              ))}
            </Group>
          </div>
        </details>

        <Button type="submit" size="lg" variant="inverse" disabled={pending} className="w-full">
          {pending ? 'Building your journey…' : 'Plan my journey'}
        </Button>
      </form>

      {error ? <ErrorState title="Could not plan that trip" description={error} /> : null}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ChipDark({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
        selected
          ? 'border-white bg-white text-brand-800'
          : 'border-white/25 bg-white/5 text-white/85 hover:bg-white/15',
      )}
    >
      {children}
    </button>
  );
}

/** Light-surface variant, used on screens that are not the immersive hero. */
export function InterestChips({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {INTERESTS.map((interest) => (
        <Chip
          key={interest}
          selected={values.includes(interest)}
          onClick={() =>
            onChange(
              values.includes(interest)
                ? values.filter((value) => value !== interest)
                : [...values, interest],
            )
          }
        >
          {interest}
        </Chip>
      ))}
    </div>
  );
}
