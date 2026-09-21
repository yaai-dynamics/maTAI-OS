'use client';

import { useState, useTransition } from 'react';
import { Button, Card, CardBody, ErrorState } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/interactive';

/**
 * Export control for the briefing.
 *
 * Shown to everyone and refused server side where the role does not allow it,
 * so an officer can see the capability exists and ask for it, rather than
 * wondering whether the product has it.
 */
export function BriefingExport({
  exportAction,
}: {
  exportAction: () => Promise<{
    ok: boolean;
    error?: string;
    text?: string;
    notQuotableCount?: number;
  }>;
}) {
  const [text, setText] = useState<string | null>(null);
  const [warning, setWarning] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await exportAction();
              if (!result.ok || !result.text) {
                setText(null);
                setError(result.error ?? 'Could not prepare the export.');
                return;
              }
              setText(result.text);
              setWarning(result.notQuotableCount ?? 0);
            })
          }
          disabled={pending}
        >
          {pending ? 'Preparing…' : 'Prepare export'}
        </Button>
        {text ? <CopyButton value={text} label="Copy briefing" /> : null}
      </div>

      {error ? <ErrorState title="Export refused" description={error} /> : null}

      {text ? (
        <Card>
          <CardBody className="space-y-2 pt-4">
            {warning > 0 ? (
              <p className="rounded-md border border-warn-500/30 bg-warn-100/60 px-3 py-2 text-[12px] text-warn-700">
                {warning} line{warning === 1 ? ' is' : 's are'} marked as not for external quotation.
                Remove or re-source them before any public use.
              </p>
            ) : null}
            <label htmlFor="briefing-text" className="sr-only">
              Briefing text
            </label>
            <textarea
              id="briefing-text"
              readOnly
              value={text}
              rows={20}
              className="w-full rounded-md border border-line-strong bg-surface-2/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-800"
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
