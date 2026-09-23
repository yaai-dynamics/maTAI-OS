'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowUp, Check, ChevronRight, Globe, SlidersHorizontal, Sparkles, X, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

import { formatRupees } from '@/lib/money';
import type { OnlineSearchResult, PlanOptionView, PlanResult } from '@/server/actions/tourist';
import { cn } from '@/components/ui/primitives';
import { TAB_BAR_CLEARANCE } from '@/components/mobile/metrics';

/**
 * E1 on a phone: a chat thread with the composer pinned above the tab bar.
 * Planning is the same server action as the desktop planner; only the
 * presentation differs. The thread is kept for the tab in sessionStorage.
 */

interface Exchange {
  request: string;
  groupId: string;
  introduction?: string;
  planFor?: string;
  options: PlanOptionView[];
  online?: { status: string; found: number };
}

const STORE_KEY = 'matai-m-planner-v1';
const MAX_EXCHANGES = 6;

const SUGGESTIONS = [
  'I have 3 days, love nature, culture and local food, and prefer less crowded places.',
  'Two days of history and heritage around Imphal, travelling with my parents.',
  'Four days, photography first, and I want to be on the water at sunrise.',
];

const DAYS = [2, 3, 4, 5];
const INTERESTS = ['nature', 'culture', 'heritage', 'food', 'craft', 'history', 'adventure', 'photography'];
const CROWD = [
  { value: 'QUIET', label: 'Less crowded' },
  { value: 'BALANCED', label: 'A mix' },
  { value: 'POPULAR', label: 'Highlights' },
] as const;

function load(): Exchange[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as Exchange[]).filter((entry) => Array.isArray(entry?.options)) : [];
  } catch {
    return [];
  }
}

function save(thread: Exchange[]) {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(thread.slice(-MAX_EXCHANGES)));
  } catch {
    /* storage blocked: the thread lives for this page view */
  }
}

export function MobilePlanner({
  initialRequest,
  plan,
  choose,
  findOnline,
}: {
  initialRequest?: string;
  plan: (input: unknown) => Promise<PlanResult>;
  choose: (tripId: unknown) => Promise<{ ok: boolean; error?: string }>;
  findOnline: (groupId: unknown) => Promise<OnlineSearchResult>;
}) {
  const router = useRouter();
  const [thread, setThread] = useState<Exchange[]>([]);
  const [request, setRequest] = useState(initialRequest ?? '');
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [days, setDays] = useState<number | null>(null);
  const [travellers, setTravellers] = useState(1);
  const [interests, setInterests] = useState<string[]>([]);
  const [crowd, setCrowd] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  const [isPlayingId, setIsPlayingId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setRequest(prev => (prev ? prev + ' ' : '') + transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const speakAnswer = (text: string, id: string) => {
    if (isPlayingId === id) {
      window.speechSynthesis.cancel();
      setIsPlayingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (/[\u0900-\u097F]/.test(text)) {
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'en-IN';
    }
    
    utterance.onend = () => setIsPlayingId(null);
    utterance.onerror = () => setIsPlayingId(null);
    setIsPlayingId(id);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    // Read after mount: sessionStorage does not exist during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThread(load());
  }, []);

  const update = (next: (current: Exchange[]) => Exchange[]) =>
    setThread((current) => {
      const value = next(current);
      save(value);
      return value;
    });

  const scrollDown = () =>
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));

  const refinements = (days ? 1 : 0) + (travellers > 1 ? 1 : 0) + interests.length + (crowd ? 1 : 0);

  const searchOnline = async (groupId: string) => {
    update((current) =>
      current.map((entry) => (entry.groupId === groupId ? { ...entry, online: { status: 'SEARCHING', found: 0 } } : entry)),
    );
    const result = await findOnline(groupId).catch(
      (): OnlineSearchResult => ({ ok: false, status: 'FAILED', found: 0 }),
    );
    update((current) =>
      current.map((entry) =>
        entry.groupId === groupId ? { ...entry, online: { status: result.status, found: result.found } } : entry,
      ),
    );
  };

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (asking) return;
    if (trimmed.length < 3) {
      setError('Tell us a little about the trip you want, in a sentence or two.');
      return;
    }
    setError(null);
    setAsking(trimmed);
    setRequest('');
    setSheet(false);
    scrollDown();

    startTransition(async () => {
      const result = await plan({
        request: trimmed,
        ...(days ? { durationDays: days } : {}),
        ...(travellers > 1 ? { travellers } : {}),
        ...(interests.length > 0 ? { interests } : {}),
        ...(crowd ? { crowdPreference: crowd } : {}),
      }).catch((): PlanResult => ({ ok: false, error: 'The planner could not be reached. Try again.' }));
      setAsking(null);

      if (!result.ok || !result.groupId || !result.options) {
        setError(result.error ?? 'Could not plan that trip.');
        setRequest(trimmed);
        scrollDown();
        return;
      }
      const groupId = result.groupId;
      update((current) => [
        ...current,
        {
          request: trimmed,
          groupId,
          options: result.options!,
          ...(result.introduction ? { introduction: result.introduction } : {}),
          ...(result.planFor ? { planFor: result.planFor } : {}),
          ...(result.searchOnline ? {} : { online: { status: 'OFF', found: 0 } }),
        },
      ]);
      router.refresh();
      scrollDown();
      if (result.searchOnline) setTimeout(() => void searchOnline(groupId), 0);
    });
  };

  const pick = (tripId: string) => {
    setChoosing(tripId);
    startTransition(async () => {
      const result = await choose(tripId);
      setChoosing(null);
      if (!result.ok) {
        setError(result.error ?? 'Could not keep that plan.');
        return;
      }
      router.push(`/m/journey/${tripId}`);
    });
  };

  const empty = thread.length === 0 && !asking;

  return (
    <div>
      {empty ? (
        <div className="pt-2">
          <div className="immersive rounded-3xl p-5">
            <Sparkles aria-hidden size={22} className="text-lake-200" />
            <p className="mt-2 text-[20px] font-semibold leading-snug text-white">
              Tell me about the trip you want.
            </p>
            <p className="mt-1.5 text-[13px] text-white/70">
              How long, what you enjoy, who is coming. I will build two or three options from verified places and
              partners.
            </p>
          </div>
          <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-500">Try one</p>
          <ul className="space-y-2">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="w-full rounded-2xl border border-line-strong bg-surface p-3.5 text-left text-[14px] text-ink-800 active:bg-surface-2"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="space-y-5 pt-1">
          {thread.map((exchange) => (
            <li key={exchange.groupId} className="space-y-3">
              <UserBubble text={exchange.request} />
              <div className="space-y-3">
                {exchange.introduction ? (
                  <div className="group relative rounded-2xl rounded-tl-md bg-surface p-3.5 pr-10 text-[14px] leading-relaxed text-ink-800 shadow-card">
                    {exchange.introduction}
                    <button
                      onClick={() => speakAnswer(exchange.introduction!, exchange.groupId)}
                      className={cn(
                        "absolute right-2 top-2 rounded-full p-1.5 transition-colors",
                        isPlayingId === exchange.groupId 
                          ? "bg-brand-50 text-brand-700" 
                          : "text-ink-400 hover:bg-surface-2 hover:text-ink-600"
                      )}
                      title="Read aloud"
                    >
                      {isPlayingId === exchange.groupId ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  </div>
                ) : null}
                {exchange.planFor ? <p className="text-[12px] text-ink-500">For {exchange.planFor}</p> : null}
                {exchange.options.map((option) => (
                  <OptionCard
                    key={option.tripId}
                    option={option}
                    choosing={choosing === option.tripId}
                    onChoose={() => pick(option.tripId)}
                  />
                ))}
                <OnlineLine online={exchange.online} />
              </div>
            </li>
          ))}
          {asking ? (
            <li className="space-y-3">
              <UserBubble text={asking} />
              <div className="rise flex items-center gap-2 rounded-2xl rounded-tl-md bg-surface p-3.5 text-[14px] text-ink-600 shadow-card">
                <span className="flex gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
                Planning your options…
              </div>
            </li>
          ) : null}
        </ol>
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-risk-500/30 bg-risk-100 px-3.5 py-2.5 text-[13px] text-risk-700">
          {error}
        </p>
      ) : null}

      <div ref={end} className="h-36" />

      {/* Composer, pinned above the tab bar */}
      <div className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-3" style={{ bottom: TAB_BAR_CLEARANCE }}>
        {sheet ? (
          <RefineSheet
            days={days}
            setDays={setDays}
            travellers={travellers}
            setTravellers={setTravellers}
            interests={interests}
            toggleInterest={(value) =>
              setInterests((current) =>
                current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
              )
            }
            crowd={crowd}
            setCrowd={setCrowd}
            onClose={() => setSheet(false)}
          />
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(request);
          }}
          className="glass-bar flex items-end gap-2 rounded-[1.75rem] p-1.5"
        >
          <button
            type="button"
            onClick={() => setSheet((open) => !open)}
            aria-expanded={sheet}
            aria-label="Trip details"
            className={cn(
              'relative grid h-10 w-10 shrink-0 place-items-center rounded-full',
              sheet ? 'bg-brand-50 text-brand-700' : 'text-ink-600',
            )}
          >
            <SlidersHorizontal aria-hidden size={19} />
            {refinements > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-lake-600 px-1 text-[10px] font-bold text-white">
                {refinements}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={isListening ? stopRecording : startRecording}
            aria-label="Voice input"
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors',
              isListening ? 'bg-red-50 text-red-600' : 'text-ink-600 hover:bg-surface-2',
            )}
          >
            {isListening ? <MicOff aria-hidden size={19} /> : <Mic aria-hidden size={19} />}
          </button>
          <label htmlFor="m-plan-request" className="sr-only">
            Describe your trip
          </label>
          <textarea
            id="m-plan-request"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(request);
              }
            }}
            rows={1}
            maxLength={600}
            placeholder={thread.length > 0 ? 'Ask for another trip…' : 'Describe your trip…'}
            className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] text-ink-900 outline-none placeholder:text-ink-400 [field-sizing:content]"
          />
          <button
            type="submit"
            disabled={Boolean(asking) || request.trim().length < 3}
            aria-label="Plan"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-700 text-white transition-opacity disabled:opacity-35"
          >
            <ArrowUp aria-hidden size={19} />
          </button>
        </form>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-brand-700 px-3.5 py-2.5 text-[14px] text-white">{text}</p>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500"
      style={{ animationDelay: delay }}
    />
  );
}

function OptionCard({
  option,
  choosing,
  onChoose,
}: {
  option: PlanOptionView;
  choosing: boolean;
  onChoose: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl bg-surface shadow-card">
      <Link href={`/m/journey/${option.tripId}`} className="block p-4 active:bg-surface-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-lake-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-lake-700">
            {option.label}
          </span>
          <span className="text-[12px] text-ink-500">
            {option.days} {option.days === 1 ? 'day' : 'days'} · {option.stopNames.length} places
          </span>
        </div>
        <p className="mt-2 text-[16px] font-semibold leading-snug text-ink-900">{option.theme}</p>
        <p className="mt-1 text-[13px] leading-snug text-ink-600">{option.summary}</p>
        <p className="mt-2 line-clamp-2 text-[12px] text-ink-500">{option.stopNames.join(' → ')}</p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[13px]">
            <span className="num font-semibold text-ink-900">{formatRupees(option.cost)}</span>
            <span className="text-ink-500"> estimated</span>
            {option.fitsBudget === undefined ? null : option.fitsBudget ? (
              <span className="ml-1.5 font-medium text-good-700">within budget</span>
            ) : (
              <span className="ml-1.5 font-medium text-warn-700">over budget</span>
            )}
          </p>
          <ChevronRight aria-hidden size={18} className="text-ink-400" />
        </div>
      </Link>
      <div className="grid grid-cols-2 border-t border-line">
        <Link
          href={`/m/journey/${option.tripId}`}
          className="py-3 text-center text-[14px] font-semibold text-ink-700 active:bg-surface-2"
        >
          Details
        </Link>
        <button
          type="button"
          onClick={onChoose}
          disabled={choosing}
          className="flex items-center justify-center gap-1.5 border-l border-line py-3 text-[14px] font-semibold text-brand-700 active:bg-brand-50 disabled:opacity-60"
        >
          <Check aria-hidden size={16} />
          {choosing ? 'Keeping…' : 'Keep this'}
        </button>
      </div>
    </article>
  );
}

function OnlineLine({ online }: { online: Exchange['online'] }) {
  if (!online || online.status === 'OFF' || online.status === 'NOT_RUN') return null;
  const text =
    online.status === 'SEARCHING'
      ? 'Searching online for stays and guides that are not partners…'
      : online.status === 'FOUND'
        ? `Found ${online.found} more places online. They are listed in each option.`
        : online.status === 'NONE_FOUND'
          ? 'Nothing more found online.'
          : 'The online search was not available.';
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-ink-500">
      <Globe aria-hidden size={13} className={online.status === 'SEARCHING' ? 'animate-pulse' : undefined} />
      {text}
    </p>
  );
}

function RefineSheet({
  days,
  setDays,
  travellers,
  setTravellers,
  interests,
  toggleInterest,
  crowd,
  setCrowd,
  onClose,
}: {
  days: number | null;
  setDays: (value: number | null) => void;
  travellers: number;
  setTravellers: (value: number) => void;
  interests: string[];
  toggleInterest: (value: string) => void;
  crowd: string | null;
  setCrowd: (value: string | null) => void;
  onClose: () => void;
}) {
  const chip = (selected: boolean) =>
    cn(
      'rounded-full px-3 py-1.5 text-[13px] font-medium',
      selected ? 'bg-ink-900 text-white' : 'border border-line-strong bg-surface text-ink-700',
    );
  return (
    <div className="rise mb-2 max-h-[55dvh] overflow-y-auto rounded-3xl border border-line-strong bg-surface p-4 shadow-overlay">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink-900">Trip details</p>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-500">
          <X aria-hidden size={18} />
        </button>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-500">All optional. Anything you write takes priority.</p>

      <p className="mb-1.5 mt-4 text-[12px] font-semibold text-ink-700">How many days</p>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((value) => (
          <button key={value} type="button" onClick={() => setDays(days === value ? null : value)} className={chip(days === value)}>
            {value} days
          </button>
        ))}
      </div>

      <p className="mb-1.5 mt-4 text-[12px] font-semibold text-ink-700">Travellers</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTravellers(Math.max(1, travellers - 1))}
          aria-label="Fewer travellers"
          className="grid h-9 w-9 place-items-center rounded-full border border-line-strong text-[18px] text-ink-700"
        >
          −
        </button>
        <span className="num w-6 text-center text-[16px] font-semibold text-ink-900">{travellers}</span>
        <button
          type="button"
          onClick={() => setTravellers(Math.min(20, travellers + 1))}
          aria-label="More travellers"
          className="grid h-9 w-9 place-items-center rounded-full border border-line-strong text-[18px] text-ink-700"
        >
          +
        </button>
      </div>

      <p className="mb-1.5 mt-4 text-[12px] font-semibold text-ink-700">Interests</p>
      <div className="flex flex-wrap gap-1.5">
        {INTERESTS.map((value) => (
          <button key={value} type="button" onClick={() => toggleInterest(value)} className={chip(interests.includes(value))}>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>

      <p className="mb-1.5 mt-4 text-[12px] font-semibold text-ink-700">Crowds</p>
      <div className="flex flex-wrap gap-1.5">
        {CROWD.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setCrowd(crowd === option.value ? null : option.value)}
            className={chip(crowd === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
