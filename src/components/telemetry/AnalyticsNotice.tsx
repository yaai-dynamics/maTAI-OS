import Link from 'next/link';

import { chooseAnalyticsForm } from '@/server/actions/forms';
import { ActionForm } from '@/components/shared/ActionForm';

/**
 * The one-time analytics notice.
 *
 * Plain about what is counted and who sees it, with a real choice: "Don't
 * record" is as easy as "OK", and either answer is final until changed on the
 * privacy page. Declining never disables a feature.
 */
export function AnalyticsNotice() {
  return (
    <section
      aria-label="Visit counting"
      className="mb-5 rounded-lg border border-line-strong bg-surface p-4 shadow-card"
    >
      <p className="text-[13px] text-ink-800">
        The Tourism Department counts which places people look at and plan, to spread visitors and fix problems
        where they occur. Counting is anonymous: no name, no account, no location unless you check in.{' '}
        <Link href="/explore/privacy" className="font-medium text-brand-700 hover:underline">
          What is counted
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <ActionForm
          action={chooseAnalyticsForm}
          submitLabel="OK, count my visits"
          pendingLabel="Saving…"
          size="sm"
          className="space-y-2"
          hiddenFields={{ choice: 'yes' }}
        />
        <ActionForm
          action={chooseAnalyticsForm}
          submitLabel="Don't record my visits"
          pendingLabel="Saving…"
          variant="secondary"
          size="sm"
          className="space-y-2"
          hiddenFields={{ choice: 'no' }}
        />
      </div>
    </section>
  );
}
