import { CONFIDENCE_NOTE, PROVENANCE, type Confidence, type Provenance } from '@/lib/provenance';
import { Badge, cn, type BadgeTone } from '@/components/ui/primitives';

/**
 * Provenance, confidence and trend indicators.
 *
 * Every one of these carries its text label. Nothing here relies on colour
 * alone (docs/06-design-system.md, accessibility).
 */

const PROVENANCE_TONE: Record<Provenance, BadgeTone> = {
  OFFICIAL: 'info',
  PARTNER_REPORTED: 'lake',
  PLATFORM_OBSERVED: 'brand',
  PUBLIC_EXTERNAL: 'neutral',
  DEMO_SYNTHETIC: 'warn',
  ESTIMATED: 'neutral',
  FORECAST: 'lily',
};

/** Small glyph so the categories differ by shape as well as colour and text. */
const PROVENANCE_GLYPH: Record<Provenance, string> = {
  OFFICIAL: '◆',
  PARTNER_REPORTED: '◇',
  PLATFORM_OBSERVED: '●',
  PUBLIC_EXTERNAL: '○',
  DEMO_SYNTHETIC: '▧',
  ESTIMATED: '≈',
  FORECAST: '⤴',
};

export function ProvenanceBadge({
  provenance,
  className,
  showDescription = false,
}: {
  provenance: Provenance;
  className?: string;
  showDescription?: boolean;
}) {
  const descriptor = PROVENANCE[provenance];
  return (
    <Badge tone={PROVENANCE_TONE[provenance]} className={className} title={descriptor.description}>
      <span aria-hidden>{PROVENANCE_GLYPH[provenance]}</span>
      <span>{descriptor.label}</span>
      {showDescription ? (
        <span className="sr-only"> — {descriptor.description}</span>
      ) : null}
    </Badge>
  );
}

export function ProvenanceList({ provenances }: { provenances: readonly Provenance[] }) {
  const unique = [...new Set(provenances)];
  return (
    <div className="flex flex-wrap gap-1.5">
      {unique.map((provenance) => (
        <ProvenanceBadge key={provenance} provenance={provenance} />
      ))}
    </div>
  );
}

const CONFIDENCE_TONE: Record<Confidence, BadgeTone> = {
  HIGH: 'good',
  MEDIUM: 'warn',
  LOW: 'risk',
};

export function ConfidenceBadge({
  confidence,
  reason,
  className,
}: {
  confidence: Confidence;
  reason?: string;
  className?: string;
}) {
  return (
    <Badge
      tone={CONFIDENCE_TONE[confidence]}
      className={className}
      title={reason ?? CONFIDENCE_NOTE[confidence]}
    >
      {confidence === 'HIGH' ? 'High' : confidence === 'MEDIUM' ? 'Medium' : 'Low'} confidence
    </Badge>
  );
}

export function TrendChip({
  percent,
  label,
  invertPolarity = false,
  className,
}: {
  percent: number | null;
  /** What the change is measured against, e.g. "vs previous 30 days". */
  label?: string;
  /** True where a rise is bad, such as complaint counts. */
  invertPolarity?: boolean;
  className?: string;
}) {
  if (percent === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-600',
          className,
        )}
      >
        No baseline
      </span>
    );
  }

  const flat = Math.abs(percent) < 1;
  const rising = percent > 0;
  const good = invertPolarity ? !rising : rising;

  const tone = flat
    ? 'border-line-strong bg-surface-2 text-ink-600'
    : good
      ? 'border-good-500/25 bg-good-100 text-good-700'
      : 'border-risk-500/25 bg-risk-100 text-risk-700';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone,
        className,
      )}
      title={label}
    >
      <span aria-hidden>{flat ? '→' : rising ? '↑' : '↓'}</span>
      <span className="num">
        {rising ? '+' : ''}
        {percent.toFixed(1)}%
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Destination health, as shown on the map and in tables. */
export function StatusBadge({ status }: { status: 'HEALTHY' | 'WATCH' | 'ATTENTION' }) {
  const config = {
    HEALTHY: { tone: 'good' as const, glyph: '●', label: 'Healthy' },
    WATCH: { tone: 'warn' as const, glyph: '◐', label: 'Watch' },
    ATTENTION: { tone: 'risk' as const, glyph: '▲', label: 'Attention' },
  }[status];

  return (
    <Badge tone={config.tone}>
      <span aria-hidden>{config.glyph}</span>
      {config.label}
    </Badge>
  );
}

/** Marks anything produced by the prototype seed rather than by observation. */
export function DemoDataNote({ children }: { children?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] text-ink-600">
      <span aria-hidden className="mt-px text-warn-500">
        ▧
      </span>
      <span>
        {children ??
          'Prototype demo data. These figures describe no real visitor and are not official tourism statistics.'}
      </span>
    </p>
  );
}
