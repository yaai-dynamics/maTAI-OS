'use client';

import { ArrowRight, ArrowUp, ExternalLink, Globe, MessageSquareText, Play, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import type { Destination, Experience, TourismBusiness } from '@/lib/types';
import type { PlaceMedia, WebVideo } from '@/lib/ai/web-media';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import type { DiscoverAction, DiscoverChatAnswer, DiscoverFocus } from '@/server/ai/discover';
import type { DestinationDetailsData } from '@/components/shared/DestinationDetails';
import { Button, ErrorState, Skeleton, cn } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/interactive';
import { DestinationCard, ExperienceMiniCard } from '@/components/shared/cards';
import { DestinationPreviewModal } from '@/components/shared/DestinationPreview';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { ProvenanceBadge } from '@/components/shared/badges';

/**
 * Discover, as a conversation: the only way to search Discover.
 *
 * A place is shown once, when it first comes up; after that the chat answers
 * about it rather than repeating its cards. Each reply ends with next steps
 * that move from finding a place towards doing something about it, and a step
 * already taken in this conversation is not offered again.
 *
 * "Photos and videos" looks the place up on the web (Wikipedia, YouTube,
 * grounded search) and says so: it is labelled as public external content,
 * not OneStop Manipur's verified records.
 */

type OnlineState =
  | { status: 'SEARCHING' }
  | { status: 'DONE'; media: PlaceMedia; actions: DiscoverAction[] }
  | { status: 'FAILED'; error: string };

interface Turn {
  id: string;
  question: string;
  answer: DiscoverChatAnswer;
  online?: OnlineState;
}

const CHAT_KEY = 'matai-discover-chat-v3';
const CHAT_EVENT = 'matai-discover-chat-v3';
const MAX_TURNS = 10;
const MAX_STEPS = 5;
const NO_TURNS: Turn[] = [];

let cached: { raw: string | null; value: Turn[] } = { raw: null, value: NO_TURNS };

function readThread(): Turn[] {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(CHAT_KEY);
  } catch {
    return cached.value;
  }
  if (raw === cached.raw) return cached.value;
  let value: Turn[] = NO_TURNS;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) value = parsed.filter((entry) => entry?.answer?.actions) as Turn[];
  } catch {
    /* an unreadable thread starts again */
  }
  cached = { raw, value };
  return value;
}

function writeThread(value: Turn[]) {
  const kept = value.slice(-MAX_TURNS);
  try {
    window.sessionStorage.setItem(CHAT_KEY, JSON.stringify(kept));
  } catch {
    cached = { raw: cached.raw, value: kept };
  }
  window.dispatchEvent(new Event(CHAT_EVENT));
}

const updateTurn = (id: string, change: (turn: Turn) => Turn) =>
  writeThread(readThread().map((turn) => (turn.id === id ? change(turn) : turn)));

function subscribe(onChange: () => void) {
  window.addEventListener(CHAT_EVENT, onChange);
  return () => window.removeEventListener(CHAT_EVENT, onChange);
}

const SUGGESTIONS = [
  'Quiet nature spots for a weekend',
  'Craft and weaving experiences near Imphal',
  'Heritage sites good for half a day',
  'Food experiences run by local homestays',
];

/** What to suggest asking first, when the chat opens already knowing a place, experience or stay. */
function contextSuggestions(destination?: Destination, experience?: Experience, business?: TourismBusiness): string[] {
  if (experience) {
    return [
      `Tell me about ${experience.title}`,
      'Is this bookable right now?',
      'What else is there to do nearby?',
    ];
  }
  if (business) {
    return [`What's the rate at ${business.name}?`, 'How do I contact them?', 'What else is nearby?'];
  }
  if (destination) {
    return [
      `What can I do at ${destination.name}?`,
      `When should I go to ${destination.name}?`,
      `Plan a trip with ${destination.name}`,
    ];
  }
  return SUGGESTIONS;
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** A step is "taken" once its question was asked or its web lookup ran for that place, anywhere in the chat. */
function untaken(actions: DiscoverAction[], thread: Turn[]): DiscoverAction[] {
  const asked = new Set(thread.map((turn) => normalize(turn.question)));
  const looked = new Set(
    thread.filter((turn) => turn.online || turn.answer.lookUpOnline).map((turn) => turn.answer.lookUpOnline?.destinationId ?? turn.answer.focus?.destinationId),
  );
  const open = actions
    .filter((action) => !(action.kind === 'ask' && asked.has(normalize(action.value))))
    .filter((action) => !(action.kind === 'online' && looked.has(action.destinationId)));
  // Booking, planning and enquiring are never the ones trimmed: they are where the ladder leads.
  const commit = open.filter((action) => action.kind === 'link' || action.kind === 'enquire').slice(0, 2);
  const explore = open.filter((action) => action.kind !== 'link' && action.kind !== 'enquire').slice(0, MAX_STEPS - commit.length);
  return [...explore, ...commit];
}

/** Every place an answer names: its places, its focus, and where its experiences are. */
function placesOf(answer: DiscoverChatAnswer, experienceById: Map<string, Experience>): string[] {
  const ids = [
    ...answer.destinationIds,
    ...(answer.focus?.destinationId ? [answer.focus.destinationId] : []),
    ...answer.experienceIds.map((id) => experienceById.get(id)?.destinationId).filter((id): id is string => Boolean(id)),
  ];
  return [...new Set(ids)];
}

type PreviewState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'open'; data: DestinationDetailsData }
  | { status: 'error'; error: string };

interface EnquiryMessage {
  from: 'assistant' | 'visitor';
  text: string;
}

/**
 * The chat's own guided enquiry: name, then phone, then a message, each typed
 * as a plain reply rather than filled into a form. `recipient` is who it
 * reaches; the main input is captured by this flow until it finishes.
 */
interface EnquiryFlowState {
  recipient: { label: string; experienceId?: string; businessId?: string };
  step: 'name' | 'phone' | 'message' | 'sending' | 'done' | 'error';
  visitorName?: string;
  visitorPhone?: string;
  messages: EnquiryMessage[];
}

export function DiscoverChat({
  ask,
  lookUpOnline,
  getPreview,
  askPlace,
  submitEnquiry,
  destinationById,
  experienceById,
  businessById = new Map(),
  onClose,
  onPlaces,
  initialFocus,
}: {
  ask: (input: unknown) => Promise<{ ok: boolean; error?: string; answer?: DiscoverChatAnswer }>;
  lookUpOnline: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; media?: PlaceMedia; actions?: DiscoverAction[] }>;
  getPreview: (destinationId: unknown) => Promise<{ ok: boolean; error?: string; data?: DestinationDetailsData }>;
  askPlace: (destinationId: string, question: string) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  /** The chat's guided enquiry: a name, a phone number and a message, collected as plain replies. */
  submitEnquiry: (input: unknown) => Promise<{ ok: boolean; error?: string }>;
  destinationById: Map<string, Destination>;
  experienceById: Map<string, Experience>;
  businessById?: Map<string, TourismBusiness>;
  onClose?: () => void;
  /** The places an answer is about, for a map beside the chat to show. */
  onPlaces?: (destinationIds: string[]) => void;
  /** Seeds the first message's context: the destination, experience or stay the visitor was already on, if any. */
  initialFocus?: DiscoverFocus;
}) {
  const thread = useSyncExternalStore(subscribe, readThread, () => NO_TURNS);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: 'closed' });
  const [enquiry, setEnquiry] = useState<EnquiryFlowState | null>(null);
  const [, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const focusedDestination = initialFocus?.destinationId ? destinationById.get(initialFocus.destinationId) : undefined;
  const focusedExperience = initialFocus?.experienceId ? experienceById.get(initialFocus.experienceId) : undefined;
  const focusedBusiness = initialFocus?.businessId ? businessById.get(initialFocus.businessId) : undefined;

  const toScroll = useCallback(() => {
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, []);

  const openPreview = (destinationId: string) => {
    setPreview({ status: 'loading' });
    void getPreview(destinationId).then((result) => {
      setPreview(
        result.ok && result.data
          ? { status: 'open', data: result.data }
          : { status: 'error', error: result.error ?? 'Could not open this place.' },
      );
    });
  };

  const runOnline = (turnId: string, destinationId: string) => {
    updateTurn(turnId, (turn) => ({ ...turn, online: { status: 'SEARCHING' } }));
    toScroll();
    void lookUpOnline(destinationId)
      .catch(() => ({ ok: false, error: 'The web lookup did not finish.' }) as Awaited<ReturnType<typeof lookUpOnline>>)
      .then((result) => {
        updateTurn(turnId, (turn) => ({
          ...turn,
          online:
            result.ok && result.media
              ? { status: 'DONE', media: result.media, actions: result.actions ?? [] }
              : { status: 'FAILED', error: result.error ?? 'The web lookup did not finish.' },
        }));
        toScroll();
      });
  };

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (asking || trimmed.length < 1) return;
    if (enquiry && enquiry.step !== 'sending' && enquiry.step !== 'done' && enquiry.step !== 'error') {
      advanceEnquiry(trimmed);
      return;
    }
    setError(null);
    setAsking(trimmed);
    setQuestion('');
    toScroll();

    const focus = readThread().at(-1)?.answer.focus ?? initialFocus;
    startTransition(async () => {
      const result = await ask({ message: trimmed, ...(focus ? { focus } : {}) });
      setAsking(null);
      if (!result.ok || !result.answer) {
        setError(result.error ?? 'Could not answer that.');
        toScroll();
        return;
      }
      const turn: Turn = { id: `${Date.now()}`, question: trimmed, answer: result.answer };
      writeThread([...readThread(), turn]);
      onPlaces?.(placesOf(result.answer, experienceById));
      toScroll();
      // Outside the transition, so the reply shows before the web answers.
      const target = result.answer.lookUpOnline?.destinationId;
      if (target) setTimeout(() => runOnline(turn.id, target), 0);
    });
  };

  const startEnquiry = (action: DiscoverAction) => {
    setEnquiry({
      recipient: { label: action.value, experienceId: action.experienceId, businessId: action.businessId },
      step: 'name',
      messages: [{ from: 'assistant', text: `Happy to pass this to ${action.value}. What name should they have for you?` }],
    });
    setQuestion('');
    toScroll();
  };

  const runEnquirySubmit = (state: EnquiryFlowState, message: string) => {
    void submitEnquiry({
      ...state.recipient,
      contactName: state.visitorName,
      contactPhone: state.visitorPhone,
      message,
    }).then((result) => {
      setEnquiry((current) => {
        if (!current || current.step !== 'sending') return current;
        return {
          ...current,
          step: result.ok ? 'done' : 'error',
          messages: [
            ...current.messages,
            {
              from: 'assistant',
              text: result.ok
                ? `Sent to ${current.recipient.label}. They'll get in touch with you directly.`
                : (result.error ?? 'Could not send that. Try again from the "Send an enquiry" button.'),
            },
          ],
        };
      });
      toScroll();
    });
  };

  const advanceEnquiry = (value: string) => {
    setQuestion('');
    setEnquiry((current) => {
      if (!current) return current;
      const messages: EnquiryMessage[] = [...current.messages, { from: 'visitor', text: value }];
      if (current.step === 'name') {
        return {
          ...current,
          step: 'phone',
          visitorName: value,
          messages: [...messages, { from: 'assistant', text: 'And a phone number they can reach you on?' }],
        };
      }
      if (current.step === 'phone') {
        return {
          ...current,
          step: 'message',
          visitorPhone: value,
          messages: [...messages, { from: 'assistant', text: 'What would you like to ask or tell them?' }],
        };
      }
      // 'message'
      const next: EnquiryFlowState = {
        ...current,
        step: 'sending',
        messages: [...messages, { from: 'assistant', text: 'Sending…' }],
      };
      runEnquirySubmit(next, value);
      return next;
    });
    toScroll();
  };

  return (
    <section
      aria-label="Discover chat"
      className="flex h-full flex-col rounded-xl border border-line bg-surface lg:h-auto lg:max-h-[calc(100vh-2rem)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-[13px] font-semibold text-ink-900">Your Manipur guide</p>
        <div className="flex items-center gap-1">
          {thread.length > 0 ? (
            <button
              type="button"
              onClick={() => writeThread([])}
              className="rounded-md px-2 py-1 text-[12px] text-ink-500 hover:bg-surface-2 hover:text-ink-900"
            >
              New chat
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              className="rounded-md p-1 text-ink-500 hover:bg-surface-2 hover:text-ink-900"
            >
              <X aria-hidden size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {thread.length === 0 && !asking ? (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-600">
              {focusedExperience
                ? `Ask me anything about "${focusedExperience.title}" — when to go, what else is nearby, or how to book it.`
                : focusedBusiness
                  ? `Ask me anything about ${focusedBusiness.name} — its rate, its rooms, or send an enquiry to the host.`
                  : focusedDestination
                    ? `Ask me anything about ${focusedDestination.name} — what to do there, when to go, or how to book a local experience.`
                    : 'Tell me what you like and I will find the places and local hosts for it, show you photos and videos, and help you book or plan the trip. Follow-ups like "when should I go?" know which place you mean.'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(focusedDestination || focusedExperience || focusedBusiness
                ? contextSuggestions(focusedDestination, focusedExperience, focusedBusiness)
                : SUGGESTIONS
              ).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-left text-[12px] text-ink-700 hover:bg-surface-2"
                >
                  {suggestion}
                </button>
              ))}
              {focusedExperience || focusedBusiness ? (
                <button
                  type="button"
                  onClick={() =>
                    startEnquiry(
                      focusedExperience
                        ? { label: 'Send an enquiry', kind: 'enquire', value: focusedExperience.title, experienceId: focusedExperience.id }
                        : { label: 'Send an enquiry', kind: 'enquire', value: focusedBusiness!.name, businessId: focusedBusiness!.id },
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600"
                >
                  <MessageSquareText aria-hidden size={12} />
                  Send an enquiry
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {thread.map((turn) => (
          <div key={turn.id} className="space-y-2">
            <Visitor>{turn.question}</Visitor>
            <Assistant>
              <Reply
                turn={turn}
                steps={untaken(turn.answer.actions, thread)}
                onlineSteps={turn.online?.status === 'DONE' ? untaken(turn.online.actions, thread) : []}
                destinationById={destinationById}
                experienceById={experienceById}
                onAsk={submit}
                onOnline={(destinationId) => runOnline(turn.id, destinationId)}
                onOpenPlace={openPreview}
                onEnquire={startEnquiry}
              />
            </Assistant>
          </div>
        ))}

        {asking ? (
          <div className="space-y-2">
            <Visitor>{asking}</Visitor>
            <Assistant>
              <Typing>Looking…</Typing>
            </Assistant>
          </div>
        ) : null}

        {enquiry ? (
          <div className="space-y-2">
            {enquiry.messages.map((message, index) =>
              message.from === 'visitor' ? (
                <Visitor key={index}>{message.text}</Visitor>
              ) : (
                <Assistant key={index}>{message.text}</Assistant>
              ),
            )}
            {enquiry.step === 'done' || enquiry.step === 'error' ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setEnquiry(null)}
                  className="text-[12px] font-medium text-ink-500 hover:text-ink-900 hover:underline"
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-[12px] text-risk-700">
            {error}
          </p>
        ) : null}
        <div ref={end} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(question);
        }}
        className="shrink-0 border-t border-line p-3"
      >
        {enquiry && (enquiry.step === 'name' || enquiry.step === 'phone' || enquiry.step === 'message') ? (
          <button
            type="button"
            onClick={() => setEnquiry(null)}
            className="mb-2 text-[11px] font-medium text-ink-500 hover:text-ink-900 hover:underline"
          >
            Cancel the enquiry
          </button>
        ) : null}
        <div className="flex items-center gap-2">
          <label htmlFor="discover-chat-input" className="sr-only">
            {enquiry?.step === 'name'
              ? 'Your name'
              : enquiry?.step === 'phone'
                ? 'Your phone number'
                : enquiry?.step === 'message'
                  ? 'Your message'
                  : 'Ask about a destination or experience'}
          </label>
          <input
            id="discover-chat-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={
              enquiry?.step === 'name'
                ? 'Your name…'
                : enquiry?.step === 'phone'
                  ? 'Your phone number…'
                  : enquiry?.step === 'message'
                    ? 'What would you like to say…'
                    : 'Ask about a place or a local experience…'
            }
            disabled={enquiry?.step === 'sending'}
            className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none disabled:opacity-60"
          />
          <Button type="submit" size="sm" disabled={asking !== null || enquiry?.step === 'sending' || enquiry?.step === 'done'}>
            {asking ? 'Asking…' : 'Ask'}
            <ArrowUp aria-hidden size={15} />
          </Button>
        </div>
      </form>

      {preview.status === 'loading' ? (
        <Modal open onClose={() => setPreview({ status: 'closed' })} title="Loading…" size="full">
          <div className="space-y-3 py-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </Modal>
      ) : null}
      {preview.status === 'error' ? (
        <Modal open onClose={() => setPreview({ status: 'closed' })} title="Could not open this place">
          <ErrorState title="Something went wrong" description={preview.error} />
        </Modal>
      ) : null}
      {preview.status === 'open' ? (
        <DestinationPreviewModal destination={preview.data} ask={askPlace} onClose={() => setPreview({ status: 'closed' })} />
      ) : null}
    </section>
  );
}

function Assistant({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--color-lake-500),var(--color-lake-800))] text-[11px] font-bold text-white"
      >
        AI
      </span>
      <div className="min-w-0 max-w-full flex-1 rounded-2xl rounded-tl-sm border border-line bg-surface-2/60 px-3.5 py-3 text-[14px] leading-relaxed text-ink-900">
        {children}
      </div>
    </div>
  );
}

function Visitor({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-700 px-3.5 py-2 text-[14px] leading-relaxed text-white">
        {children}
      </p>
    </div>
  );
}

function Typing({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-600">
      <span aria-hidden className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400 [animation-delay:300ms]" />
      </span>
      {children}
    </span>
  );
}

function Steps({
  actions,
  onAsk,
  onOnline,
  onEnquire,
}: {
  actions: DiscoverAction[];
  onAsk: (text: string) => void;
  onOnline: (destinationId: string) => void;
  onEnquire: (action: DiscoverAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="border-t border-line pt-2.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">Next</p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => {
          // Links, and starting an enquiry, are the actions that commit to something, so they stand out.
          if (action.kind === 'link') {
            return (
              <Link
                key={action.label}
                href={action.value}
                className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600"
              >
                {action.label}
                <ArrowRight aria-hidden size={12} />
              </Link>
            );
          }
          if (action.kind === 'enquire') {
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => onEnquire(action)}
                className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600"
              >
                <MessageSquareText aria-hidden size={12} />
                {action.label}
              </button>
            );
          }
          return (
            <button
              key={action.label}
              type="button"
              onClick={() => (action.kind === 'online' && action.destinationId ? onOnline(action.destinationId) : onAsk(action.value))}
              className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:bg-surface-2"
            >
              {action.kind === 'online' ? <Globe aria-hidden size={12} /> : null}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Reply({
  turn,
  steps,
  onlineSteps,
  destinationById,
  experienceById,
  onAsk,
  onOnline,
  onOpenPlace,
  onEnquire,
}: {
  turn: Turn;
  steps: DiscoverAction[];
  onlineSteps: DiscoverAction[];
  destinationById: Map<string, Destination>;
  experienceById: Map<string, Experience>;
  onAsk: (text: string) => void;
  onOnline: (destinationId: string) => void;
  onOpenPlace: (destinationId: string) => void;
  onEnquire: (action: DiscoverAction) => void;
}) {
  const { answer, online } = turn;
  const destinations = answer.destinationIds.map((id) => destinationById.get(id)).filter((d): d is Destination => Boolean(d));
  const experiences = answer.experienceIds.map((id) => experienceById.get(id)).filter((e): e is Experience => Boolean(e));
  const hero = answer.hero ? destinationById.get(answer.hero) : undefined;

  return (
    <div className="space-y-3">
      {hero ? (
        <button
          type="button"
          onClick={() => onOpenPlace(hero.id)}
          className="group relative block w-full overflow-hidden rounded-lg text-left"
        >
          <DestinationVisual destination={hero} height="lg" overlay />
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
            <span className="text-[14px] font-semibold text-white">{hero.name}</span>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-brand-800 group-hover:bg-white">
              Open details
            </span>
          </span>
        </button>
      ) : null}

      <p>{answer.text}</p>

      {destinations.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">Places</p>
          <div className="grid grid-cols-1 gap-2">
            {destinations.map((destination) => (
              <DestinationCard
                key={destination.id}
                destination={destination}
                onSelect={() => onOpenPlace(destination.id)}
                reason={answer.reasons[destination.id]}
                compact
              />
            ))}
          </div>
        </div>
      ) : null}

      {experiences.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
            Local experiences
          </p>
          <div className={cn('grid gap-2', experiences.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {experiences.map((experience) => (
              <ExperienceMiniCard
                key={experience.id}
                experience={experience}
                href={`/explore/discover?mode=experiences&experience=${experience.id}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {online ? (
        <OnlineView online={online} />
      ) : (
        <Steps actions={steps} onAsk={onAsk} onOnline={onOnline} onEnquire={onEnquire} />
      )}
      {online?.status === 'DONE' ? (
        <Steps actions={onlineSteps} onAsk={onAsk} onOnline={onOnline} onEnquire={onEnquire} />
      ) : null}
      {online?.status === 'FAILED' ? <Steps actions={steps} onAsk={onAsk} onOnline={onOnline} onEnquire={onEnquire} /> : null}
    </div>
  );
}

function OnlineView({ online }: { online: OnlineState }) {
  if (online.status === 'SEARCHING') {
    return (
      <div className="space-y-2 border-t border-line pt-2.5">
        <Typing>Looking on Wikipedia, YouTube and the web…</Typing>
        <div className="grid grid-cols-3 gap-1.5">
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
        </div>
      </div>
    );
  }
  if (online.status === 'FAILED') {
    return <p className="border-t border-line pt-2.5 text-[12px] text-risk-700">{online.error}</p>;
  }

  const { media } = online;
  const empty = !media.wiki && media.images.length === 0 && media.videos.length === 0 && media.facts.length === 0;

  return (
    <div className="space-y-3 border-t border-line pt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <ProvenanceBadge provenance="PUBLIC_EXTERNAL" />
        <span className="text-[11px] text-ink-500">From the web, not verified by mTour Agent</span>
      </div>

      {empty ? <p className="text-[13px] text-ink-600">Nothing about {media.name} turned up on the web just now.</p> : null}

      {media.images.length > 0 ? (
        <div>
          <div className="grid grid-cols-3 gap-1.5">
            {media.images.map((image) => (
              <a
                key={image.src}
                href={image.href}
                target="_blank"
                rel="noreferrer"
                title={`${image.alt} — credit and licence on Wikimedia`}
                className="block overflow-hidden rounded-md bg-surface-3"
              >
                {/* Remote photographs are shown as they are: next/image is kept to local assets (next.config.ts). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt={image.alt} loading="lazy" className="aspect-square w-full object-cover transition-transform hover:scale-105" />
              </a>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-500">Photos: Wikimedia Commons. Tap one for its author and licence.</p>
        </div>
      ) : null}

      {media.videos.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">Videos</p>
          {media.videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : null}

      {media.wiki ? (
        <div className="rounded-md border border-line bg-surface p-2.5">
          <p className="line-clamp-5 text-[13px] text-ink-800">{media.wiki.extract}</p>
          <a
            href={media.wiki.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline"
          >
            Read more on Wikipedia
            <ExternalLink aria-hidden size={11} />
          </a>
        </div>
      ) : null}

      {media.facts.length > 0 ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">Good to know</p>
          <ul className="space-y-1.5">
            {media.facts.map((fact) => (
              <li key={fact.text} className="text-[13px] text-ink-800">
                {fact.text}{' '}
                {fact.sources.map((source) => (
                  <a
                    key={source.uri}
                    href={source.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 inline-flex items-center gap-0.5 rounded bg-surface-3 px-1 text-[10px] text-ink-600 hover:text-brand-700"
                  >
                    {source.title}
                    <ExternalLink aria-hidden size={9} />
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {media.searchNote ? <p className="text-[11px] text-ink-500">{media.searchNote}</p> : null}
    </div>
  );
}

/** A thumbnail until pressed, so nothing loads from YouTube until the visitor asks for it. */
function VideoCard({ video }: { video: WebVideo }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <div className="overflow-hidden rounded-md bg-ink-900">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="flex w-full items-center gap-2.5 rounded-md border border-line bg-surface p-1.5 text-left hover:bg-surface-2"
    >
      <span className="relative block w-28 shrink-0 overflow-hidden rounded">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-ink-900/25">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-risk-700">
            <Play aria-hidden size={14} fill="currentColor" />
          </span>
        </span>
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 block text-[12px] font-medium text-ink-900">{video.title}</span>
        <span className="block truncate text-[11px] text-ink-500">{video.author} · YouTube</span>
      </span>
    </button>
  );
}
