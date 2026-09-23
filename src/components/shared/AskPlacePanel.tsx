'use client';

import { useState, useTransition } from 'react';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import { FACT_TYPE_LABEL, FACT_TYPE_NOTE } from '@/lib/fact-types';
import { Badge, Button, Card, CardBody, ErrorState, Skeleton, cn } from '@/components/ui/primitives';
import { Mic, Volume2, VolumeX } from 'lucide-react';

/**
 * Ask the Place.
 *
 * Answers come from the curated knowledge base only. When the question is not
 * covered, the panel says so and shows what is covered instead, rather than
 * letting a model fill the gap.
 */
export function AskPlacePanel({
  destinationId,
  destinationName,
  prompts,
  ask,
  tone = 'light',
}: {
  destinationId: string;
  destinationName: string;
  prompts: readonly string[];
  ask: (
    destinationId: string,
    question: string,
  ) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  tone?: 'light' | 'dark';
}) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<GroundedAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingId, setIsPlayingId] = useState<string | null>(null);

  const dark = tone === 'dark';

  const startRecording = () => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support Speech Recognition.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = (e: any) => {
      console.error('Speech recognition error', e.error);
      setIsRecording(false);
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuestion(transcript);
      run(transcript);
    };
    recognition.start();
  };

  const speakAnswer = (text: string, id: string) => {
    if (isPlayingId === id) {
      window.speechSynthesis.cancel();
      setIsPlayingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsPlayingId(null);
    utterance.onerror = () => setIsPlayingId(null);
    setIsPlayingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const run = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await ask(destinationId, trimmed);
      if (!result.ok || !result.answer) {
        setError(result.error ?? 'Could not answer that.');
        return;
      }
      setAnswers((previous) => [result.answer!, ...previous]);
      setQuestion('');
    });
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor={`ask-${destinationId}`} className="sr-only">
          Ask about {destinationName}
        </label>
        <div className="relative w-full">
          <input
            id={`ask-${destinationId}`}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={`Ask about ${destinationName}`}
            className={cn(
              'w-full rounded-md border px-3 py-2.5 pr-10 text-[14px]',
              dark
                ? 'border-white/25 bg-white/10 text-white placeholder:text-white/50 focus:border-white/50'
                : 'border-line-strong bg-surface text-ink-900 placeholder:text-ink-400 focus:border-brand-500',
            )}
          />
          <button
            type="button"
            onClick={startRecording}
            disabled={pending || isRecording}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors",
              isRecording ? "text-red-500 animate-pulse bg-red-100" : (dark ? "text-white/70 hover:bg-white/10" : "text-ink-500 hover:bg-surface-2")
            )}
            title="Ask with voice"
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>
        <Button
          type="submit"
          disabled={pending}
          className={cn('shrink-0', dark && 'bg-white text-brand-800 hover:bg-white/90')}
        >
          {pending ? 'Asking…' : 'Ask'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => run(prompt)}
            disabled={pending}
            className={cn(
              'rounded-full border px-3 py-1.5 text-left text-[12px] disabled:opacity-50',
              dark
                ? 'border-white/20 bg-white/5 text-white/80 hover:bg-white/15'
                : 'border-line-strong bg-surface text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            {prompt}
          </button>
        ))}
      </div>

      {error ? <ErrorState title="Could not answer that" description={error} /> : null}

      {pending ? (
        <Card>
          <CardBody className="space-y-2 pt-4">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/5" />
          </CardBody>
        </Card>
      ) : null}

      {answers.map((answer, index) => (
        <Card key={`${answer.generatedAt}-${index}`} className={index === 0 ? 'rise' : undefined}>
          <CardBody className="space-y-3 pt-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] font-medium text-ink-500">{answer.question}</p>
              <button
                onClick={() => speakAnswer(answer.answer, answer.generatedAt)}
                className={cn(
                  "shrink-0 rounded-full p-1.5 transition-colors",
                  isPlayingId === answer.generatedAt 
                    ? "bg-brand-100 text-brand-700" 
                    : "text-ink-400 hover:bg-surface-2 hover:text-ink-700"
                )}
                title="Read aloud"
              >
                {isPlayingId === answer.generatedAt ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[14px] leading-relaxed text-ink-900">{answer.answer}</p>

            {answer.facts.length > 0 ? (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  {answer.unanswered ? 'What the knowledge base does cover' : 'Based on'}
                </p>
                <ul className="space-y-1.5">
                  {answer.facts.map((fact) => (
                    <li key={fact.id} className="flex flex-wrap items-start gap-2">
                      <Badge
                        tone={fact.factType === 'DOCUMENTED' ? 'lake' : 'neutral'}
                        title={FACT_TYPE_NOTE[fact.factType]}
                      >
                        {FACT_TYPE_LABEL[fact.factType]}
                      </Badge>
                      <span className="min-w-0 flex-1 text-[12px] text-ink-700">{fact.title}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-ink-500">Source: {answer.sourceName}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
