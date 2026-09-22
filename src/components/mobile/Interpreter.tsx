'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2, Mic, Repeat2, Square, Volume2 } from 'lucide-react';

import {
  FAILURE_MESSAGE,
  LANGUAGE_LABEL,
  LANGUAGE_NAME,
  type InterpreterTurn,
  type PhraseGroup,
  type SpeechLanguage,
  type TurnResponse,
} from '@/lib/types';
import { cn } from '@/components/ui/primitives';

/**
 * Two-way interpreting, as a conversation across the phone.
 *
 * The local half is upside down, so the phone can lie on a table between two
 * people and each reads their own side, as interpreting apps have done since
 * they existed. Each half has one big button: hold, speak, release.
 *
 * What it refuses to do matters as much as what it does. When a model is
 * missing the screen says so; it never shows a guessed translation, because a
 * visitor would repeat it to the person in front of them.
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'recording'; side: Side }
  | { kind: 'working'; side: Side }
  | { kind: 'error'; message: string };

type Side = 'visitor' | 'local';

const LOCAL: SpeechLanguage = 'mni';

/** iOS gives audio/mp4, Android and desktop audio/webm. Both are sent as they are. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

export function Interpreter({ groups }: { groups: PhraseGroup[] }) {
  const [visitorLanguage, setVisitorLanguage] = useState<SpeechLanguage>('en');
  const [turns, setTurns] = useState<InterpreterTurn[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'checking' });
  const [models, setModels] = useState<{ ready: boolean; listens: SpeechLanguage[] } | undefined>();
  const [phrasebook, setPhrasebook] = useState(false);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const chunks = useRef<Blob[]>([]);
  const end = useRef<HTMLDivElement>(null);

  // Wake the models while the visitor is still reading the screen: a cold
  // serverless worker takes longer to start than a person waits.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/interpreter/warm')
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: { ready?: boolean; listens?: SpeechLanguage[] } | undefined) => {
        if (cancelled) return;
        setModels({ ready: Boolean(body?.ready), listens: body?.listens ?? [] });
        setStatus({ kind: 'idle' });
      })
      .catch(() => {
        if (cancelled) return;
        setModels({ ready: false, listens: [] });
        setStatus({ kind: 'idle' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = useCallback(
    async (audio: Blob, side: Side) => {
      const from = side === 'local' ? LOCAL : visitorLanguage;
      const to = side === 'local' ? visitorLanguage : LOCAL;
      setStatus({ kind: 'working', side });

      const body = new FormData();
      body.append('audio', audio, 'turn');
      body.append('from', from);
      body.append('to', to);

      try {
        const response = await fetch('/api/interpreter/turn', { method: 'POST', body });
        const result = (await response.json()) as TurnResponse;
        if (!result.ok) {
          setStatus({ kind: 'error', message: FAILURE_MESSAGE[result.failure] });
          return;
        }
        setTurns((current) => [...current, result.turn]);
        setStatus({ kind: 'idle' });
        if (result.turn.audio) void new Audio(result.turn.audio).play().catch(() => undefined);
        requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
      } catch {
        setStatus({ kind: 'error', message: 'The interpreter could not be reached. Check the connection.' });
      }
    },
    [visitorLanguage],
  );

  const start = async (side: Side) => {
    if (status.kind === 'recording' || status.kind === 'working') return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus({ kind: 'error', message: 'This browser cannot record audio. Try Safari or Chrome.' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunks.current, { type: media.mimeType || 'audio/webm' });
        chunks.current = [];
        if (audio.size > 0) void send(audio, side);
        else setStatus({ kind: 'error', message: FAILURE_MESSAGE.NO_SPEECH });
      };
      media.start();
      recorder.current = media;
      setStatus({ kind: 'recording', side });
    } catch {
      setStatus({
        kind: 'error',
        message: 'The microphone is blocked. Allow microphone access for this site and try again.',
      });
    }
  };

  const stop = () => {
    recorder.current?.stop();
    recorder.current = undefined;
  };

  const recordingSide = status.kind === 'recording' ? status.side : undefined;
  const workingSide = status.kind === 'working' ? status.side : undefined;

  return (
    <div className="flex min-h-[calc(100dvh-1rem)] flex-col">
      {/* The local person's half, turned to face them across the table. */}
      <Half
        side="local"
        rotated
        language={LOCAL}
        turns={turns}
        recording={recordingSide === 'local'}
        working={workingSide === 'local'}
        onDown={() => void start('local')}
        onUp={stop}
      />

      <div className="my-3 space-y-2">
        {models && !models.ready ? (
          <p className="rounded-2xl border border-warn-500/30 bg-warn-100 px-3.5 py-2.5 text-[12px] text-warn-700">
            The Manipuri speech models are not connected to this build yet, so nothing can be interpreted. The
            phrasebook below still works.
          </p>
        ) : null}
        {status.kind === 'error' ? (
          <p role="alert" className="rounded-2xl border border-risk-500/30 bg-risk-100 px-3.5 py-2.5 text-[12px] text-risk-700">
            {status.message}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-surface-2 p-0.5">
            {(['en', 'hi'] as const).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => setVisitorLanguage(language)}
                aria-pressed={visitorLanguage === language}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  visitorLanguage === language ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500',
                )}
              >
                {LANGUAGE_LABEL[language]}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-1 text-[11px] text-ink-500">
            <Repeat2 aria-hidden size={13} />
            {LANGUAGE_NAME[visitorLanguage]} ⇄ {LANGUAGE_NAME[LOCAL]}
          </span>
          <button
            type="button"
            onClick={() => setPhrasebook((open) => !open)}
            aria-expanded={phrasebook}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-800"
          >
            <BookOpen aria-hidden size={14} />
            Phrases
          </button>
        </div>

        {phrasebook ? <Phrasebook groups={groups} visitorLanguage={visitorLanguage} /> : null}
      </div>

      {/* The visitor's half, the right way up. */}
      <Half
        side="visitor"
        language={visitorLanguage}
        turns={turns}
        recording={recordingSide === 'visitor'}
        working={workingSide === 'visitor'}
        onDown={() => void start('visitor')}
        onUp={stop}
      />
      <div ref={end} />

      <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-500">
        Speech is sent to this platform&rsquo;s own models to be interpreted, and is not stored. Machine
        interpretation: check anything that matters.
      </p>
    </div>
  );
}

/** One person's half: what they last heard, and their button. */
function Half({
  side,
  language,
  turns,
  recording,
  working,
  rotated = false,
  onDown,
  onUp,
}: {
  side: Side;
  language: SpeechLanguage;
  turns: InterpreterTurn[];
  recording: boolean;
  working: boolean;
  rotated?: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  // What this person last heard is the other person's turn, interpreted.
  const heardHere = [...turns].reverse().find((turn) => turn.side !== side);
  const saidHere = [...turns].reverse().find((turn) => turn.side === side);

  return (
    <section
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-surface p-5 shadow-card',
        rotated && 'rotate-180',
      )}
      aria-label={side === 'local' ? 'Manipuri speaker' : 'Visitor'}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">{LANGUAGE_LABEL[language]}</p>

      <div className="min-h-[5.5rem] w-full text-center">
        {heardHere ? (
          <>
            <p className="text-[19px] font-semibold leading-snug text-ink-900">{heardHere.said}</p>
            <button
              type="button"
              onClick={() => heardHere.audio && void new Audio(heardHere.audio).play().catch(() => undefined)}
              disabled={!heardHere.audio}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink-700 disabled:opacity-40"
            >
              <Volume2 aria-hidden size={14} />
              {heardHere.audio ? 'Play again' : 'No voice available'}
            </button>
          </>
        ) : (
          <p className="text-[14px] text-ink-500">
            {side === 'local' ? 'Hold the button and speak.' : 'Hold the button and speak. Release when you finish.'}
          </p>
        )}
        {saidHere ? <p className="mt-3 text-[12px] italic text-ink-400">You said: {saidHere.heard}</p> : null}
      </div>

      <button
        type="button"
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
        disabled={working}
        aria-label={recording ? 'Stop and interpret' : `Hold to speak ${LANGUAGE_NAME[language]}`}
        className={cn(
          'grid h-24 w-24 place-items-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-60',
          recording ? 'bg-risk-500 animate-pulse' : 'bg-ink-900',
        )}
      >
        {working ? (
          <Loader2 aria-hidden size={32} className="animate-spin" />
        ) : recording ? (
          <Square aria-hidden size={28} />
        ) : (
          <Mic aria-hidden size={32} />
        )}
      </button>
      <p className="text-[11px] text-ink-400">
        {working ? 'Interpreting…' : recording ? 'Listening… release to interpret' : 'Hold to speak'}
      </p>
    </section>
  );
}

/** Phrases that work with no models and no network. */
function Phrasebook({ groups, visitorLanguage }: { groups: PhraseGroup[]; visitorLanguage: SpeechLanguage }) {
  return (
    <div className="rounded-2xl bg-surface p-3 shadow-card">
      {groups.map((group) => (
        <div key={group.id} className="border-t border-line first:border-t-0">
          <p className="px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">{group.title}</p>
          <ul className="space-y-1.5 pb-2">
            {group.phrases.map((phrase) => (
              <li key={phrase.id} className="rounded-xl bg-surface-2/60 px-3 py-2">
                <p className="text-[13.5px] font-medium text-ink-900">
                  {visitorLanguage === 'hi' ? phrase.hi : phrase.en}
                </p>
                <p className={cn('text-[13px]', phrase.mni ? 'text-ink-700' : 'text-ink-400')}>
                  {phrase.mni ?? 'Manipuri line awaiting a Manipuri speaker'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
