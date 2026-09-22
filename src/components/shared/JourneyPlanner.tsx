'use client';

import {
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  Globe,
  IndianRupee,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { formatShortDate } from '@/lib/date';
import { formatRupees } from '@/lib/money';
import type { OnlineSearchStatus } from '@/lib/types';
import type { OnlineSearchResult, PlanOptionView, PlanResult } from '@/server/actions/tourist';
import { Button, ButtonLink, cn } from '@/components/ui/primitives';
import { CompareButton } from '@/components/shared/CompareOptions';

/**
 * E1: the planner, as a conversation.
 *
 * The free text is the primary input. Dates, travellers and a budget are
 * optional and sit on the composer; the rest are refinements. Extraction and
 * planning happen server side and are deterministic, so the same request
 * always produces the same options.
 *
 * Each reply offers two or three options. The visitor opens any of them and
 * chooses one, which becomes a kept journey. After planning, a web search
 * looks for stays, guides and transport that are not partners.
 *
 * The thread is kept for the tab (sessionStorage), so opening a plan and
 * coming back does not lose it; the plans themselves are stored server side.
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

const BUDGET_STYLES = [
  { value: 'BUDGET', label: 'Simple' },
  { value: 'MODERATE', label: 'Comfortable' },
  { value: 'PREMIUM', label: 'Premium' },
] as const;

const ACCESS = [
  { value: 'NONE', label: 'No constraints' },
  { value: 'FAMILY_WITH_CHILDREN', label: 'With children' },
  { value: 'SENIOR_FRIENDLY', label: 'With seniors' },
  { value: 'LOW_MOBILITY', label: 'Step-free only' },
] as const;

const BUDGET_PRESETS = [10_000, 25_000, 50_000, 100_000];

const SUGGESTIONS = [
  'I have 3 days, love nature, culture and local food, and prefer less crowded places.',
  'Two days of history and heritage around Imphal, travelling with my parents.',
  'Four days, photography first, and I want to be on the water at sunrise.',
  'A long weekend of craft and markets for two, budget ₹20,000.',
];

/* ------------------------------- The thread -------------------------------- */

interface Exchange {
  request: string;
  groupId: string;
  options: PlanOptionView[];
  introduction?: string;
  planFor?: string;
  travellers: number;
  budgetAmount?: number;
  online?: { status: OnlineSearchStatus | 'SEARCHING'; found: number; error?: string };
}

const CHAT_KEY = 'matai-planner-chat-v2';
const CHAT_EVENT = 'matai-planner-chat';
const MAX_EXCHANGES = 8;
const NO_EXCHANGES: Exchange[] = [];

// useSyncExternalStore needs the same object back while nothing has changed,
// so the parsed thread is cached against the raw string it came from.
let cached: { raw: string | null; value: Exchange[] } = { raw: null, value: NO_EXCHANGES };

function readThread(): Exchange[] {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(CHAT_KEY);
  } catch {
    // Storage blocked: the thread lives in memory for this page view.
    return cached.value;
  }
  if (raw === cached.raw) return cached.value;
  let value: Exchange[] = NO_EXCHANGES;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) value = parsed.filter((entry) => Array.isArray(entry?.options)) as Exchange[];
  } catch {
    /* an unreadable thread starts again */
  }
  cached = { raw, value };
  return value;
}

function writeThread(value: Exchange[]) {
  const kept = value.slice(-MAX_EXCHANGES);
  try {
    window.sessionStorage.setItem(CHAT_KEY, JSON.stringify(kept));
  } catch {
    cached = { raw: cached.raw, value: kept };
  }
  window.dispatchEvent(new Event(CHAT_EVENT));
}

const updateExchange = (groupId: string, change: (exchange: Exchange) => Exchange) =>
  writeThread(readThread().map((exchange) => (exchange.groupId === groupId ? change(exchange) : exchange)));

function subscribe(onChange: () => void) {
  window.addEventListener(CHAT_EVENT, onChange);
  return () => window.removeEventListener(CHAT_EVENT, onChange);
}

/* -------------------------------- Component -------------------------------- */

type Panel = 'dates' | 'travellers' | 'budget' | 'refine' | null;

const shortDate = (date: string) => formatShortDate(`${date}T00:00:00Z`);

export function JourneyPlanner({
  plan,
  choose,
  findOnline,
  journeys,
  today,
}: {
  plan: (input: unknown) => Promise<PlanResult>;
  choose: (tripId: string) => Promise<{ ok: boolean; error?: string }>;
  findOnline: (groupId: string) => Promise<OnlineSearchResult>;
  /** The visitor's stored plans and journeys, to tell which options are still open. */
  journeys: { id: string; status: string }[];
  /** Today in Manipur, by the server's clock, so no one plans for yesterday. */
  today: string;
}) {
  const router = useRouter();
  const thread = useSyncExternalStore(subscribe, readThread, () => NO_EXCHANGES);
  const stored = new Map(journeys.map((journey) => [journey.id, journey.status]));

  const [request, setRequest] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [startDate, setStartDate] = useState('');
  const [arriveTime, setArriveTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [travellers, setTravellers] = useState<number | undefined>(undefined);
  const [budgetText, setBudgetText] = useState('');
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [interests, setInterests] = useState<string[]>([]);
  const [crowd, setCrowd] = useState<string | undefined>(undefined);
  const [budgetStyle, setBudgetStyle] = useState<string | undefined>(undefined);
  const [accessibility, setAccessibility] = useState<string>('NONE');
  const [asking, setAsking] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ request: string; error: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  const budgetAmount = Number(budgetText.replace(/[^\d]/g, '')) || undefined;
  const datesSet = Boolean(startDate && endDate);
  const refinements =
    (!datesSet && duration ? 1 : 0) +
    interests.length +
    (crowd ? 1 : 0) +
    (budgetStyle ? 1 : 0) +
    (accessibility !== 'NONE' ? 1 : 0);

  const toScroll = useCallback(() => {
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, []);

  const toggle = (value: string) =>
    setInterests((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );

  // Not a transition: React holds back everything in a transition until all of
  // it settles, so a slow search would keep the new options off screen.
  const searchOnline = async (groupId: string) => {
    updateExchange(groupId, (exchange) => ({ ...exchange, online: { status: 'SEARCHING', found: 0 } }));
    const result = await findOnline(groupId).catch(
      (): OnlineSearchResult => ({ ok: false, status: 'FAILED', found: 0 }),
    );
    updateExchange(groupId, (exchange) => ({
      ...exchange,
      online: { status: result.status, found: result.found, ...(result.error ? { error: result.error } : {}) },
    }));
    router.refresh();
  };

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (asking) return;
    if (trimmed.length < 3) {
      setHint('Tell us a little about the trip you want, in a sentence or two.');
      return;
    }
    if ((startDate && !endDate) || (!startDate && endDate)) {
      setHint('Give both the day you arrive and the day you leave, or neither.');
      setPanel('dates');
      return;
    }
    setHint(null);
    setFailed(null);
    setAsking(trimmed);
    setRequest('');
    setPanel(null);
    toScroll();

    startTransition(async () => {
      const result = await plan({
        request: trimmed,
        ...(datesSet
          ? {
              window: {
                startDate,
                endDate,
                ...(arriveTime ? { arriveTime } : {}),
                ...(departTime ? { departTime } : {}),
              },
            }
          : duration
            ? { durationDays: duration }
            : {}),
        ...(travellers ? { travellers } : {}),
        ...(budgetAmount ? { budgetAmount } : {}),
        ...(interests.length > 0 ? { interests } : {}),
        ...(crowd ? { crowdPreference: crowd } : {}),
        ...(budgetStyle ? { budget: budgetStyle } : {}),
        ...(accessibility !== 'NONE' ? { accessibility } : {}),
      });
      setAsking(null);

      if (!result.ok || !result.groupId || !result.options) {
        setFailed({ request: trimmed, error: result.error ?? 'Could not plan that trip.' });
        setRequest(trimmed);
        toScroll();
        return;
      }
      const groupId = result.groupId;
      writeThread([
        ...readThread(),
        {
          request: trimmed,
          groupId,
          options: result.options,
          travellers: result.profile?.travellers ?? 1,
          ...(result.profile?.budgetAmount ? { budgetAmount: result.profile.budgetAmount } : {}),
          ...(result.introduction ? { introduction: result.introduction } : {}),
          ...(result.planFor ? { planFor: result.planFor } : {}),
          ...(result.searchOnline ? {} : { online: { status: 'OFF', found: 0 } }),
        },
      ]);
      router.refresh();
      toScroll();
      // After this transition ends, so the options show before the search returns.
      if (result.searchOnline) setTimeout(() => void searchOnline(groupId), 0);
    });
  };

  const empty = thread.length === 0 && !asking && !failed;
  const pill = (key: Exclude<Panel, null>, icon: React.ReactNode, label: string, set: boolean) => (
    <button
      type="button"
      onClick={() => setPanel(panel === key ? null : key)}
      aria-expanded={panel === key}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
        panel === key
          ? 'border-white bg-white text-brand-800'
          : set
            ? 'border-lake-300/60 bg-lake-500/25 text-white'
            : 'border-white/20 bg-white/5 text-white/80 hover:bg-white/15',
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <section
      aria-labelledby="planner-heading"
      className="immersive -mx-4 -mt-5 flex flex-col px-4 py-6 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:px-6 xl:min-h-[calc(100dvh-6rem)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/55">Plan a trip</p>
          <h1
            id="planner-heading"
            className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-white sm:text-[28px]"
          >
            Where would you like Manipur to take you?
          </h1>
        </div>
        {thread.length > 0 ? (
          <button
            type="button"
            onClick={() => writeThread([])}
            className="shrink-0 rounded-md px-2 py-1 text-[12px] text-white/60 hover:bg-white/10 hover:text-white"
          >
            New chat
          </button>
        ) : null}
      </div>

      <div className="mt-5 flex-1 space-y-4" aria-live="polite">
        <Assistant>
          Tell me what you enjoy and how you like to travel. Add your dates, who is coming and a budget
          if you know them. I will plan two or three options, with stays, transport, guides and local
          experiences, and you choose the one to keep.
        </Assistant>

        {thread.map((exchange, index) => (
          <Fragment key={exchange.groupId}>
            <Visitor>{exchange.request}</Visitor>
            <Assistant>
              <Reply
                exchange={exchange}
                stored={index === thread.length - 1 ? withLatest(stored, exchange) : stored}
                choose={choose}
                onSearch={() => void searchOnline(exchange.groupId)}
              />
            </Assistant>
          </Fragment>
        ))}

        {asking ? (
          <>
            <Visitor>{asking}</Visitor>
            <Assistant>
              <Typing>Planning your options…</Typing>
            </Assistant>
          </>
        ) : null}

        {failed ? (
          <>
            <Visitor>{failed.request}</Visitor>
            <Assistant>
              <span role="alert">{failed.error}</span>
            </Assistant>
          </>
        ) : null}
        <div ref={end} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(request);
        }}
        className="mt-6 space-y-3"
      >
        {empty ? (
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
        ) : null}

        {/* Trip details sit before the send button: they only count if set before planning. */}
        <div className="flex flex-wrap gap-2">
          {pill(
            'dates',
            <CalendarDays aria-hidden size={14} />,
            datesSet
              ? `${shortDate(startDate)}${arriveTime ? ` ${arriveTime}` : ''} → ${shortDate(endDate)}${departTime ? ` ${departTime}` : ''}`
              : 'Dates',
            datesSet,
          )}
          {pill(
            'travellers',
            <Users aria-hidden size={14} />,
            travellers ? `${travellers} ${travellers === 1 ? 'traveller' : 'travellers'}` : 'Travellers',
            Boolean(travellers),
          )}
          {pill(
            'budget',
            <IndianRupee aria-hidden size={14} />,
            budgetAmount ? formatRupees(budgetAmount) : 'Budget',
            Boolean(budgetAmount),
          )}
          {pill(
            'refine',
            <SlidersHorizontal aria-hidden size={14} />,
            refinements > 0 ? `Refine · ${refinements}` : 'Refine',
            refinements > 0,
          )}
        </div>

        {panel ? (
          <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-white/85">
            {panel === 'dates' ? (
              <div className="space-y-3">
                <p className="text-[12px] text-white/65">
                  Optional. With dates, the plan fits your arrival and departure, and it becomes your
                  current trip while you are travelling.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateTimeField
                    label="Arrive"
                    date={startDate}
                    time={arriveTime}
                    min={today}
                    onDate={(value) => {
                      setStartDate(value);
                      if (endDate && value > endDate) setEndDate(value);
                    }}
                    onTime={setArriveTime}
                  />
                  <DateTimeField
                    label="Leave"
                    date={endDate}
                    time={departTime}
                    min={startDate || today}
                    onDate={setEndDate}
                    onTime={setDepartTime}
                  />
                </div>
                {startDate || endDate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setArriveTime('');
                      setDepartTime('');
                    }}
                    className="inline-flex items-center gap-1 text-[12px] text-white/60 hover:text-white"
                  >
                    <X aria-hidden size={13} /> Clear dates
                  </button>
                ) : null}
              </div>
            ) : null}

            {panel === 'travellers' ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-white/65">How many are travelling?</span>
                <div className="flex items-center gap-1">
                  <Stepper label="One fewer" onClick={() => setTravellers(Math.max(1, (travellers ?? 1) - 1))}>
                    −
                  </Stepper>
                  <span className="num w-8 text-center text-[15px] font-semibold text-white">{travellers ?? 1}</span>
                  <Stepper label="One more" onClick={() => setTravellers(Math.min(20, (travellers ?? 1) + 1))}>
                    +
                  </Stepper>
                </div>
                <span className="text-[11px] text-white/50">Two to a room, four to a car.</span>
              </div>
            ) : null}

            {panel === 'budget' ? (
              <div className="space-y-2">
                <label className="block text-[12px] text-white/65" htmlFor="trip-budget">
                  The whole trip, for everyone travelling
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-md border border-white/25 bg-white/10 px-2">
                    <span className="text-white/60">₹</span>
                    <input
                      id="trip-budget"
                      inputMode="numeric"
                      value={budgetText}
                      onChange={(event) => setBudgetText(event.target.value.replace(/[^\d,]/g, '').slice(0, 10))}
                      placeholder="25,000"
                      className="w-28 bg-transparent px-1.5 py-1.5 text-[14px] text-white placeholder:text-white/40 focus:outline-none"
                    />
                  </div>
                  {BUDGET_PRESETS.map((value) => (
                    <ChipDark key={value} selected={budgetAmount === value} onClick={() => setBudgetText(String(value))}>
                      {formatRupees(value)}
                    </ChipDark>
                  ))}
                  {budgetText ? (
                    <button type="button" onClick={() => setBudgetText('')} className="text-[12px] text-white/60 hover:text-white">
                      Clear
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-white/50">
                  Plans are costed from partner rates. Meals, entry fees and getting to Imphal are not included.
                </p>
              </div>
            ) : null}

            {panel === 'refine' ? (
              <div className="space-y-3">
                {datesSet ? null : (
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
                )}
                <Group label="Interests">
                  {INTERESTS.map((value) => (
                    <ChipDark key={value} selected={interests.includes(value)} onClick={() => toggle(value)}>
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
                <Group label="Stays">
                  {BUDGET_STYLES.map((option) => (
                    <ChipDark
                      key={option.value}
                      selected={budgetStyle === option.value}
                      onClick={() => setBudgetStyle(budgetStyle === option.value ? undefined : option.value)}
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
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-white/25 bg-white/10 focus-within:border-white/55">
          <label htmlFor="trip-request" className="sr-only">
            Describe the trip you want
          </label>
          <textarea
            id="trip-request"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit(request);
              }
            }}
            rows={2}
            placeholder="I have 3 days, love nature, culture and local food, and prefer less crowded places."
            className="block w-full resize-none bg-transparent px-4 pt-3 text-[15px] text-white placeholder:text-white/45 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
            <span className="hidden text-[11px] text-white/45 sm:inline">
              Enter to plan · Shift + Enter for a new line
            </span>
            <Button type="submit" variant="inverse" size="sm" disabled={asking !== null} className="ml-auto rounded-lg">
              {asking ? 'Planning…' : 'Plan my trip'}
              <ArrowUp aria-hidden size={16} />
            </Button>
          </div>
        </div>
        {hint ? (
          <p role="alert" className="text-[12px] text-warn-100">
            {hint}
          </p>
        ) : null}
      </form>
    </section>
  );
}

/**
 * The list of stored plans can lag a reply by a moment after planning. Until
 * it shows any option of the newest reply, those options count as open: only a
 * newer request (or a choice among them) can have removed them.
 */
function withLatest(stored: Map<string, string>, exchange: Exchange): Map<string, string> {
  if (exchange.options.some((option) => stored.has(option.tripId))) return stored;
  return new Map([...stored, ...exchange.options.map((option) => [option.tripId, 'DRAFT'] as const)]);
}

/* ------------------------------- Messages --------------------------------- */

function Assistant({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--color-lake-500),var(--color-lake-800))] text-[11px] font-bold text-white"
      >
        AI
      </span>
      <div className="min-w-0 max-w-[94%] flex-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.07] px-4 py-3 text-[14px] leading-relaxed text-white/85">
        <span className="sr-only">maTAI: </span>
        {children}
      </div>
    </div>
  );
}

function Visitor({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white/90 px-4 py-2.5 text-[14px] leading-relaxed text-ink-900">
        <span className="sr-only">You: </span>
        {children}
      </p>
    </div>
  );
}

function Typing({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-white/75">
      <span aria-hidden className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70 [animation-delay:300ms]" />
      </span>
      {children}
    </span>
  );
}

function Reply({
  exchange,
  stored,
  choose,
  onSearch,
}: {
  exchange: Exchange;
  stored: Map<string, string>;
  choose: (tripId: string) => Promise<{ ok: boolean; error?: string }>;
  onSearch: () => void;
}) {
  const chosen = exchange.options.find((option) => {
    const status = stored.get(option.tripId);
    return status !== undefined && status !== 'DRAFT';
  });
  const open = exchange.options.some((option) => stored.get(option.tripId) === 'DRAFT');

  return (
    <div className="space-y-3">
      {exchange.introduction ? <p className="text-[13px] text-white/80">{exchange.introduction}</p> : null}

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Context>
          <CalendarDays aria-hidden size={12} />
          {exchange.planFor ?? 'No dates yet'}
        </Context>
        <Context>
          <Users aria-hidden size={12} />
          {exchange.travellers} {exchange.travellers === 1 ? 'traveller' : 'travellers'}
        </Context>
        <Context>
          <IndianRupee aria-hidden size={12} />
          {exchange.budgetAmount ? `Budget ${formatRupees(exchange.budgetAmount)}` : 'No budget given'}
        </Context>
      </div>

      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] text-white/65">
          {chosen
            ? 'You chose one of these. It is now in your trips.'
            : open
              ? `${exchange.options.length === 1 ? 'One plan fits' : `${exchange.options.length} options`}. Open any of them, then choose the one to keep.`
              : 'These options were replaced by a newer plan, or deleted.'}
        </p>
        <CompareButton options={exchange.options} tone="dark" />
      </div>

      <ul className="space-y-2.5">
        {exchange.options.map((option) => (
          <li key={option.tripId}>
            <OptionCard option={option} status={stored.get(option.tripId)} chosen={chosen?.tripId === option.tripId} choose={choose} />
          </li>
        ))}
      </ul>

      {chosen || open ? <OnlineLine online={exchange.online} onSearch={onSearch} /> : null}
    </div>
  );
}

function Context({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/75">
      {children}
    </span>
  );
}

function OptionCard({
  option,
  status,
  chosen,
  choose,
}: {
  option: PlanOptionView;
  status: string | undefined;
  chosen: boolean;
  choose: (tripId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const stops = option.stopNames.length;
  const gone = status === undefined;

  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 transition-colors',
        chosen ? 'border-lake-300/70 bg-lake-500/15' : 'border-white/12 bg-white/[0.04]',
        gone && 'opacity-55',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-lake-100">
          {option.label}
        </span>
        {chosen ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-lake-100">
            <Check aria-hidden size={13} /> Chosen
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{option.theme}</p>
      <p className="mt-0.5 text-[12px] text-white/60">{option.summary}</p>

      <p className="mt-2 text-[12px] text-white/75">{option.stopNames.join(' → ')}</p>
      <p className="mt-1 text-[12px] text-white/60">
        {option.days} {option.days === 1 ? 'day' : 'days'} · {stops} {stops === 1 ? 'place' : 'places'}
        {option.experiences > 0 ? ` · ${option.experiences} local ${option.experiences === 1 ? 'experience' : 'experiences'}` : ''}
        {option.nights > 0
          ? ` · ${option.partnerNights} of ${option.nights} ${option.nights === 1 ? 'night' : 'nights'} with partner stays`
          : ''}
        {option.guides > 0 ? ` · ${option.guides} ${option.guides === 1 ? 'day' : 'days'} guided` : ''}
      </p>

      <p className="mt-2 text-[13px] text-white">
        <span className="font-semibold">{formatRupees(option.cost)}</span>
        <span className="text-white/60"> estimated</span>
        {option.fitsBudget === undefined ? null : option.fitsBudget ? (
          <span className="ml-2 rounded-full bg-good-500/30 px-2 py-0.5 text-[11px] text-good-100">within budget</span>
        ) : (
          <span className="ml-2 rounded-full bg-warn-500/30 px-2 py-0.5 text-[11px] text-warn-100">over budget</span>
        )}
      </p>

      {gone ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ButtonLink href={`/explore/journey/${option.tripId}`} variant="inverse" size="sm" className="rounded-lg">
            {chosen ? 'Open trip' : 'View details'}
            <ArrowRight aria-hidden size={15} />
          </ButtonLink>
          {status === 'DRAFT' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await choose(option.tripId);
                  setError(result.ok ? null : (result.error ?? 'Could not choose this plan.'));
                  router.refresh();
                })
              }
              className="rounded-lg border border-white/30 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {pending ? 'Choosing…' : 'Choose this plan'}
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-warn-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OnlineLine({ online, onSearch }: { online: Exchange['online']; onSearch: () => void }) {
  const status = online?.status;
  const retry = (
    <button type="button" onClick={onSearch} className="ml-1 underline decoration-white/40 hover:text-white">
      Try again
    </button>
  );
  return (
    <p className="flex items-start gap-1.5 border-t border-white/10 pt-2.5 text-[12px] text-white/65">
      <Globe aria-hidden size={14} className="mt-0.5 shrink-0" />
      <span>
        {status === undefined || status === 'NOT_RUN' ? (
          <>
            Places that are not maTAI partners have not been looked for yet.
            <button type="button" onClick={onSearch} className="ml-1 underline decoration-white/40 hover:text-white">
              Search online
            </button>
          </>
        ) : status === 'SEARCHING' ? (
          <Typing>Searching online for stays, guides and transport that are not partners…</Typing>
        ) : status === 'FOUND' ? (
          `Found ${online!.found} ${online!.found === 1 ? 'place' : 'places'} online that ${online!.found === 1 ? 'is' : 'are'} not a partner. Each plan's details list them, with their sources.`
        ) : status === 'NONE_FOUND' ? (
          'Searched online: nothing beyond the partners turned up for these places.'
        ) : status === 'OFF' ? (
          'Online search is off, so these plans use registered partners only.'
        ) : status === 'LIMITED' ? (
          (online?.error ?? 'Online search is paused for a while.')
        ) : (
          <>
            The online search did not finish.
            {retry}
          </>
        )}
      </span>
    </p>
  );
}

/* --------------------------------- Inputs --------------------------------- */

function DateTimeField({
  label,
  date,
  time,
  min,
  onDate,
  onTime,
}: {
  label: string;
  date: string;
  time: string;
  min: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">{label}</legend>
      <div className="flex gap-2">
        <input
          type="date"
          aria-label={`${label} date`}
          value={date}
          min={min}
          onChange={(event) => onDate(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-[13px] text-white [color-scheme:dark] focus:outline-none focus:border-white/55"
        />
        <input
          type="time"
          aria-label={`${label} time, optional`}
          value={time}
          onChange={(event) => onTime(event.target.value)}
          className="w-[6.5rem] rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-[13px] text-white [color-scheme:dark] focus:outline-none focus:border-white/55"
        />
      </div>
      <p className="text-[11px] text-white/45">Time is optional, in Manipur time.</p>
    </fieldset>
  );
}

function Stepper({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-white/25 text-[16px] text-white hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">{label}</p>
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
