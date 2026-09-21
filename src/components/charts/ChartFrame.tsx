import type { ReactNode } from 'react';
import type { Provenance } from '@/lib/provenance';
import { cn } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';

/**
 * Shared chart chrome: title, provenance, method note and a table view.
 *
 * The table view is not optional decoration. It is how the values stay
 * reachable for screen readers, for print, and when colour is unavailable.
 */
export function ChartFrame({
  title,
  subtitle,
  provenance,
  method,
  children,
  table,
  className,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  provenance?: Provenance;
  method?: string;
  children: ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  action?: ReactNode;
}) {
  return (
    <figure className={cn('m-0', className)}>
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[12px] text-ink-600">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
        </div>
      </figcaption>

      {children}

      {(method || table) && (
        <div className="mt-3 space-y-2">
          {method ? <Disclosure summary="How this is calculated">{method}</Disclosure> : null}
          {table ? (
            <Disclosure summary="Show as table">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-600">
                      {table.columns.map((column) => (
                        <th key={column} className="py-1.5 pr-3 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr key={index} className="border-b border-line/60 last:border-0">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={cn('py-1.5 pr-3', cellIndex > 0 && 'text-right')}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Disclosure>
          ) : null}
        </div>
      )}
    </figure>
  );
}
