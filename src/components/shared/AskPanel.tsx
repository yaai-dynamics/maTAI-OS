'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { GovernmentAnswer } from '@/lib/types';
import { Button, Card, CardBody, cn, ErrorState, Skeleton } from '@/components/ui/primitives';
import { AnswerCard } from '@/components/shared/AnswerCard';

/**
 * Ask the Decision Room.
 *
 * A question box, not a chat window. Every answer comes back as the full
 * contract from docs/05-ai-spec.md, so the officer sees evidence and confidence
 * rather than a conversational reply.
 */
export function AskPanel({
  ask,
  suggestions,
  initialQuestion,
  autoRun = false,
}: {
  ask: (question: string) => Promise<{ ok: boolean; error?: string; answer?: GovernmentAnswer }>;
  suggestions: readonly string[];
  initialQuestion?: string;
  /** Runs the initial question immediately, used by the demo deep links. */
  autoRun?: boolean;
}) {
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [answers, setAnswers] = useState<GovernmentAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasAutoRun = useRef(false);

  const run = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await ask(trimmed);
      if (!result.ok || !result.answer) {
        setError(result.error ?? 'Could not answer that question.');
        return;
      }
      setAnswers((previous) => [result.answer!, ...previous]);
    });
  };

  useEffect(() => {
    if (autoRun && initialQuestion && !hasAutoRun.current) {
      hasAutoRun.current = true;
      run(initialQuestion);
    }
    // Deliberately runs once, on the question the deep link arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, initialQuestion]);

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="pt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(question);
            }}
            className="space-y-3"
          >
            <label htmlFor="ask-question" className="block text-[12px] font-medium text-ink-700">
              Ask a question about tourism in Manipur
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="ask-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Which destination should we promote to diversify demand?"
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
              />
              <Button type="submit" disabled={pending} className="shrink-0">
                {pending ? 'Working…' : 'Ask'}
              </Button>
            </div>
          </form>

          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Suggested questions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuestion(suggestion);
                    run(suggestion);
                  }}
                  disabled={pending}
                  className={cn(
                    'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-left text-[12px] text-ink-700',
                    'hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50',
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {error ? <ErrorState title="That question could not be answered" description={error} /> : null}

      {pending ? (
        <Card>
          <CardBody className="space-y-3 pt-4">
            <div className="flex items-center gap-2 text-[13px] text-ink-600">
              <span className="inline-flex gap-1" aria-hidden>
                <span
                  className="h-1.5 w-1.5 rounded-full bg-brand-500"
                  style={{ animation: 'pulse-dot 1.1s ease-in-out infinite' }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-brand-500"
                  style={{ animation: 'pulse-dot 1.1s ease-in-out .18s infinite' }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-brand-500"
                  style={{ animation: 'pulse-dot 1.1s ease-in-out .36s infinite' }}
                />
              </span>
              Classifying the question, running the authorised tools and assembling evidence…
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          </CardBody>
        </Card>
      ) : null}

      {answers.length === 0 && !pending && !error ? (
        <Card>
          <CardBody className="pt-4">
            <p className="text-[13px] text-ink-600">
              Answers appear here with their evidence, confidence, caveats and the audit trail of
              which tools produced each figure.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {answers.map((answer, index) => (
        <div key={`${answer.generatedAt}-${index}`} className={index === 0 ? 'rise' : undefined}>
          <AnswerCard answer={answer} />
        </div>
      ))}
    </div>
  );
}
