import Link from 'next/link';
import { cn } from '@/components/ui/primitives';

/**
 * The closed loop, as a diagram.
 *
 * Built in HTML rather than a fixed SVG so it stays readable at 400px, where a
 * circular graphic would shrink its labels to nothing. The loop is the product
 * argument: promotion, discovery, experience and feedback are one cycle, and
 * the data layer under them is what makes it one.
 */

export interface LoopStage {
  id: string;
  role: 'Government' | 'Creator' | 'Tourist' | 'Platform';
  title: string;
  body: string;
  href?: string;
  screen?: string;
}

export const LOOP_STAGES: LoopStage[] = [
  {
    id: 'identify',
    role: 'Government',
    title: 'Identify the opportunity',
    body: 'Ask which destination to promote. The answer arrives with demand, capacity and concentration evidence attached.',
    href: '/gov/ask?q=promote',
    screen: 'G5',
  },
  {
    id: 'campaign',
    role: 'Government',
    title: 'Launch a campaign',
    body: 'Creators are matched on category, audience, language, geography and past tourism outcomes, with every component shown.',
    href: '/gov/campaigns',
    screen: 'G4',
  },
  {
    id: 'accept',
    role: 'Creator',
    title: 'A creator takes it on',
    body: 'The objective, audience, content requirement, deadline and reward are stated up front, not negotiated in a direct message.',
    href: '/creator/campaigns',
    screen: 'C2',
  },
  {
    id: 'brief',
    role: 'Creator',
    title: 'The brief is grounded',
    body: 'Verified facts, labelled as documented or tradition, plus responsible visit guidance the creator must include.',
    href: '/creator/studio',
    screen: 'C3',
  },
  {
    id: 'discover',
    role: 'Tourist',
    title: 'A traveller plans a trip',
    body: 'Free text becomes a structured trip profile, and a journey is built around it with a reason on every stop.',
    href: '/explore',
    screen: 'E1 / E2',
  },
  {
    id: 'experience',
    role: 'Tourist',
    title: 'And understands the place',
    body: 'Destination stories and living heritage layers, answered from the curated knowledge base rather than model memory.',
    href: '/explore/destinations/dest-ukhrul',
    screen: 'E3 / E4',
  },
  {
    id: 'signal',
    role: 'Tourist',
    title: 'The visit becomes a signal',
    body: 'A consented check-in and a short piece of feedback, anonymised at the point of capture.',
    href: '/explore/trip',
    screen: 'E6',
  },
  {
    id: 'measure',
    role: 'Government',
    title: 'The department sees it',
    body: 'The same feedback appears as a counted, categorised issue, and the campaign funnel updates. Then the cycle starts again.',
    href: '/gov/issues',
    screen: 'G3 / G5',
  },
];

const ROLE_STYLE = {
  Government: 'border-brand-200 bg-brand-50 text-brand-700',
  Creator: 'border-lily-200 bg-lily-100 text-lily-600',
  Tourist: 'border-lake-200 bg-lake-50 text-lake-700',
  Platform: 'border-line-strong bg-surface-2 text-ink-700',
} as const;

export function EcosystemLoop({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      <ol className={cn('grid gap-3', compact ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-4')}>
        {LOOP_STAGES.map((stage, index) => {
          const card = (
            <div
              className={cn(
                'relative h-full rounded-lg border border-line bg-surface p-4 transition-shadow',
                stage.href && 'hover:shadow-raised',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    ROLE_STYLE[stage.role],
                  )}
                >
                  {stage.role}
                </span>
                <span className="num text-[11px] text-ink-400">
                  {stage.screen ?? String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <p className="mt-2 text-[14px] font-semibold text-ink-900">{stage.title}</p>
              <p className="mt-1 text-[12px] leading-snug text-ink-600">{stage.body}</p>

              {index < LOOP_STAGES.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-ink-300 xl:block"
                >
                  →
                </span>
              ) : null}
            </div>
          );

          return (
            <li key={stage.id} className="relative">
              {stage.href ? (
                <Link href={stage.href} className="block h-full rounded-lg">
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3.5 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
          One shared tourism intelligence layer
        </p>
        <p className="mx-auto mt-1 max-w-3xl text-[13px] text-ink-700">
          Destinations, verified knowledge, businesses, experiences, creators, campaigns, anonymous
          interactions and feedback. Every stage above reads and writes the same records, which is why
          a tourist action reaches a government screen without anyone exporting a spreadsheet.
        </p>
        <p className="mt-1.5 text-[12px] text-ink-600">
          And every number it produces says whether it is official, partner reported, platform
          observed, estimated, forecast or prototype demo data.
        </p>
      </div>
    </div>
  );
}
