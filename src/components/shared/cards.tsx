import Link from 'next/link';
import { MapPin } from 'lucide-react';

import { formatLongDate, formatRelative } from '@/lib/date';
import { formatDuration } from '@/lib/geo';
import { now } from '@/lib/config';
import {
  DISH_CATEGORY_LABEL,
  EXPERIENCE_CATEGORY_LABEL,
  ISSUE_CATEGORY_LABEL,
  type Campaign,
  type Creator,
  type Destination,
  type Dish,
  type Experience,
  type Feedback,
  type FoodTrail,
  type LandingPage,
} from '@/lib/types';
import { Badge, Card, cn } from '@/components/ui/primitives';
import { ProvenanceBadge, StatusBadge, TrendChip } from '@/components/shared/badges';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { GeneratedArt } from '@/components/shared/GeneratedArt';

/**
 * Cards shared across the three interfaces.
 *
 * A destination looks the same to a tourist, an officer and a creator, which is
 * what makes this one product rather than three (docs/06-design-system.md).
 */

export function DestinationCard({
  destination,
  href,
  onSelect,
  meta,
  matchedInterests,
  reason,
  compact = false,
  experiences,
  moreExperiencesHref,
}: {
  destination: Destination;
  href?: string;
  /** Opens a preview instead of navigating; takes precedence over `href` when both are given. */
  onSelect?: () => void;
  /** Right-aligned figure, such as a demand index. */
  meta?: React.ReactNode;
  matchedInterests?: readonly string[];
  reason?: string;
  compact?: boolean;
  /** Local experiences at this destination, shown as a small grid below the tags. */
  experiences?: { experience: Experience; href?: string }[];
  /** Where "+N more" leads, when there are more experiences than shown. */
  moreExperiencesHref?: string;
}) {
  // The experience grid links to experiences of its own, so it sits outside
  // the destination's link rather than nested inside it: an anchor cannot
  // contain another anchor.
  const linkedContent = (
    <>
      {!compact ? <DestinationVisual destination={destination} height="lg" /> : null}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink-900">{destination.name}</h3>
            <p className="text-[12px] text-ink-500">{destination.district} district</p>
          </div>
          {meta}
        </div>

        <p className="mt-2 line-clamp-2 text-[13px] text-ink-700">{destination.summary}</p>

        {reason ? (
          <p className="mt-2 rounded-md border border-lake-200 bg-lake-50 px-2.5 py-2 text-[12px] text-lake-800">
            {reason}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {destination.category.slice(0, 3).map((category) => (
            <Badge
              key={category}
              tone={matchedInterests?.includes(category) ? 'lake' : 'neutral'}
            >
              {category}
            </Badge>
          ))}
          {destination.ecoSensitivity === 'HIGH' ? (
            <Badge tone="good" title="Ecologically sensitive: visit guidance applies">
              Sensitive site
            </Badge>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <Card
      as="article"
      className={cn('group h-full overflow-hidden', (href || onSelect) && 'transition-shadow hover:shadow-raised')}
    >
      {onSelect ? (
        <button type="button" onClick={onSelect} className="block w-full text-left">
          {linkedContent}
        </button>
      ) : href ? (
        <Link href={href} className="block">
          {linkedContent}
        </Link>
      ) : (
        linkedContent
      )}

      {experiences && experiences.length > 0 ? (
        <div className="border-t border-line p-4 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
            Experiences here
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {experiences.slice(0, 4).map(({ experience, href: experienceHref }) => (
              <ExperienceMiniCard key={experience.id} experience={experience} href={experienceHref} />
            ))}
          </div>
          {experiences.length > 4 && moreExperiencesHref ? (
            <Link
              href={moreExperiencesHref}
              className="mt-1.5 inline-block text-[11px] font-medium text-brand-700 hover:underline"
            >
              +{experiences.length - 4} more here
            </Link>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/** Small, non-card entry for an experience grid nested under a DestinationCard. */
export function ExperienceMiniCard({ experience, href }: { experience: Experience; href?: string }) {
  const inner = (
    <div className="h-full rounded-md border border-line bg-surface-2/60 p-2 transition-colors hover:border-line-strong hover:bg-surface-2">
      <p className="truncate text-[12px] font-medium text-ink-900">{experience.title}</p>
      <p className="mt-0.5 text-[11px] text-ink-500">
        {formatDuration(experience.durationMinutes)} · ₹{experience.price.toLocaleString('en-IN')}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function ExperienceCard({
  experience,
  destinationName,
  businessName,
  action,
  destination,
  destinationHref,
  additionalDestinations,
}: {
  experience: Experience;
  destinationName: string;
  businessName: string;
  action?: React.ReactNode;
  /** Shown as a thumbnail above the title, with its name captioned below it. */
  destination?: Pick<Destination, 'id' | 'name' | 'palette' | 'category'>;
  /** Makes the destination name a link, for the unified Discover screen. */
  destinationHref?: string;
  /** Other places this experience also visits, for a route or circuit that isn't confined to one stop. */
  additionalDestinations?: { destination: Pick<Destination, 'id' | 'name' | 'palette' | 'category'>; href?: string }[];
}) {
  const availability = {
    AVAILABLE: { tone: 'good' as const, label: 'Available' },
    LIMITED: { tone: 'warn' as const, label: 'Limited availability' },
    UNAVAILABLE: { tone: 'neutral' as const, label: 'Not bookable yet' },
  }[experience.availabilityStatus];

  return (
    <Card as="article" className="flex h-full flex-col overflow-hidden">
      {destination ? <DestinationVisual destination={destination} height="sm" /> : null}

      <div className="flex flex-1 flex-col p-4">
        {destination ? (
          <p className="mb-2 flex items-center gap-1 text-[12px] text-ink-500">
            <MapPin aria-hidden size={12} className="shrink-0" />
            {destinationHref ? (
              <Link href={destinationHref} className="min-w-0 truncate font-medium text-ink-700 hover:text-brand-700 hover:underline">
                {destinationName}
              </Link>
            ) : (
              <span className="min-w-0 truncate">{destinationName}</span>
            )}
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink-900">{experience.title}</h3>
            <p className="mt-0.5 truncate text-[12px] text-ink-500">{businessName}</p>
          </div>
          <Badge tone="neutral">{EXPERIENCE_CATEGORY_LABEL[experience.category]}</Badge>
        </div>

        {additionalDestinations && additionalDestinations.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-500">Also visits</span>
            {additionalDestinations.map(({ destination: place, href }) =>
              href ? (
                <Link
                  key={place.id}
                  href={href}
                  className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-700 hover:border-brand-500 hover:text-brand-700"
                >
                  {place.name}
                </Link>
              ) : (
                <span key={place.id} className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-700">
                  {place.name}
                </span>
              ),
            )}
          </div>
        ) : null}

        <p className="mt-2 text-[13px] text-ink-700">{experience.description}</p>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          <div>
            <dt className="text-ink-500">Duration</dt>
            <dd className="num font-medium text-ink-900">{formatDuration(experience.durationMinutes)}</dd>
          </div>
          <div>
            <dt className="text-ink-500">From</dt>
            <dd className="num font-medium text-ink-900">₹{experience.price.toLocaleString('en-IN')}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Effort</dt>
            <dd className="font-medium text-ink-900">{experience.accessibility.toLowerCase()}</dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={availability.tone}>{availability.label}</Badge>
          {experience.verified ? (
            <Badge tone="lake" title="Checked by the platform before listing">
              ✓ Verified provider
            </Badge>
          ) : (
            <Badge tone="warn">Not yet verified</Badge>
          )}
        </div>

        {action ? <div className="mt-auto pt-4">{action}</div> : null}
      </div>
    </Card>
  );
}

export function DishCard({
  dish,
  destinationName,
  destinationHref,
  businessName,
  action,
}: {
  dish: Dish;
  destinationName: string;
  destinationHref?: string;
  /** Set only where a partner actually serves it. */
  businessName?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card as="article" className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink-900">{dish.name}</h3>
          {dish.localName && dish.localName !== dish.name ? (
            <p className="text-[12px] text-ink-500">{dish.localName}</p>
          ) : null}
        </div>
        <Badge tone="neutral">{DISH_CATEGORY_LABEL[dish.category]}</Badge>
      </div>

      <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-500">
        <MapPin aria-hidden size={12} className="shrink-0" />
        {destinationHref ? (
          <Link href={destinationHref} className="min-w-0 truncate font-medium text-ink-700 hover:text-brand-700 hover:underline">
            {destinationName}
          </Link>
        ) : (
          <span className="min-w-0 truncate">{destinationName}</span>
        )}
      </p>

      <p className="mt-2 line-clamp-3 text-[13px] text-ink-700">{dish.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={dish.vegetarian ? 'good' : 'neutral'}>{dish.vegetarian ? 'Vegetarian' : 'Non-vegetarian'}</Badge>
        {dish.spiceLevel ? <Badge tone="warn">{dish.spiceLevel.toLowerCase()} spice</Badge> : null}
        {businessName ? (
          <Badge tone="lake">{businessName}</Badge>
        ) : (
          <Badge tone="neutral">No partner serving it yet</Badge>
        )}
      </div>

      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </Card>
  );
}

export function FoodTrailCard({
  trail,
  destinationName,
  stopCount,
  action,
}: {
  trail: FoodTrail;
  destinationName: string;
  stopCount: number;
  action?: React.ReactNode;
}) {
  return (
    <Card as="article" className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink-900">{trail.name}</h3>
          <p className="mt-0.5 text-[12px] text-ink-500">{destinationName}</p>
        </div>
        <Badge tone="lily">
          {stopCount} stop{stopCount === 1 ? '' : 's'}
        </Badge>
      </div>

      <p className="mt-2 text-[13px] text-ink-700">{trail.description}</p>

      <p className="mt-3 text-[12px] text-ink-500">{trail.durationHint}</p>

      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </Card>
  );
}

export function CampaignCard({
  campaign,
  destinationName,
  applicationCount,
  action,
  href,
  highlight = false,
}: {
  campaign: Campaign;
  destinationName: string;
  applicationCount?: number;
  action?: React.ReactNode;
  href?: string;
  highlight?: boolean;
}) {
  const statusTone = {
    DRAFT: 'neutral' as const,
    OPEN: 'good' as const,
    IN_PROGRESS: 'info' as const,
    COMPLETED: 'brand' as const,
    CLOSED: 'neutral' as const,
  }[campaign.status];

  const daysLeft = Math.ceil(
    (new Date(`${campaign.endDate}T23:59:59Z`).getTime() - now().getTime()) / (24 * 60 * 60 * 1000),
  );

  const inner = (
    <Card
      as="article"
      className={cn('flex h-full flex-col p-4', highlight && 'ring-2 ring-brand-300')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink-900">{campaign.name}</h3>
          <p className="mt-0.5 text-[12px] text-ink-500">{destinationName}</p>
        </div>
        <Badge tone={statusTone}>{campaign.status.replace('_', ' ').toLowerCase()}</Badge>
      </div>

      <p className="mt-2 line-clamp-3 text-[13px] text-ink-700">{campaign.objective}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <div>
          <dt className="text-ink-500">Reward pool</dt>
          <dd className="num font-semibold text-ink-900">
            ₹{campaign.rewardPool.toLocaleString('en-IN')}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Deadline</dt>
          <dd className="font-medium text-ink-900">
            {formatLongDate(campaign.endDate)}
            {campaign.status === 'OPEN' || campaign.status === 'IN_PROGRESS' ? (
              <span className={cn('ml-1', daysLeft <= 3 ? 'text-risk-700' : 'text-ink-500')}>
                ({daysLeft > 0 ? `${daysLeft} days left` : 'closed'})
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Audience</dt>
          <dd className="text-ink-900">{campaign.targetAudience}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Platforms</dt>
          <dd className="text-ink-900">{campaign.platforms.join(', ')}</dd>
        </div>
      </dl>

      <p className="mt-3 rounded-md bg-surface-2 px-2.5 py-2 text-[12px] text-ink-700">
        <span className="font-medium text-ink-900">Required: </span>
        {campaign.contentRequirement}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ProvenanceBadge provenance={campaign.provenance} />
        {applicationCount !== undefined ? (
          <Badge tone="neutral">
            {applicationCount} application{applicationCount === 1 ? '' : 's'}
          </Badge>
        ) : null}
      </div>

      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full rounded-lg">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function CreatorCard({
  creator,
  action,
  meta,
}: {
  creator: Creator;
  action?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <Card as="article" className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink-900">{creator.displayName}</h3>
          <p className="text-[12px] text-ink-500">
            {creator.homeDistrict} · {creator.platforms.join(', ')}
          </p>
        </div>
        {meta}
      </div>

      {creator.bio ? <p className="mt-2 text-[13px] text-ink-700">{creator.bio}</p> : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {creator.categories.slice(0, 4).map((category) => (
          <Badge key={category} tone="neutral">
            {category}
          </Badge>
        ))}
        {creator.verified ? <Badge tone="lake">✓ Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
      </div>

      <p className="mt-2 text-[12px] text-ink-600">{creator.audienceSummary}</p>

      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </Card>
  );
}

export function FeedbackCard({
  feedback,
  destinationName,
  isNew = false,
}: {
  feedback: Feedback;
  destinationName: string;
  isNew?: boolean;
}) {
  const categoryLabel =
    feedback.category in ISSUE_CATEGORY_LABEL
      ? ISSUE_CATEGORY_LABEL[feedback.category as keyof typeof ISSUE_CATEGORY_LABEL]
      : feedback.category.toLowerCase();

  const tone =
    feedback.sentiment === 'POSITIVE' ? 'good' : feedback.sentiment === 'NEGATIVE' ? 'risk' : 'warn';

  return (
    <Card
      as="article"
      className={cn('p-3.5', isNew && 'border-lake-300 bg-lake-50/60 ring-1 ring-lake-200')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[13px] font-semibold text-ink-900" aria-label={`Rated ${feedback.rating} out of 5`}>
          {feedback.rating}/5
        </span>
        <Badge tone={tone}>{categoryLabel}</Badge>
        <span className="text-[12px] text-ink-500">{destinationName}</span>
        {isNew ? <Badge tone="lake">New in this session</Badge> : null}
        <span className="ml-auto text-[11px] text-ink-500">
          {formatRelative(feedback.createdAt, now())}
        </span>
      </div>

      <p className="mt-2 text-[13px] text-ink-800">{feedback.text}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ProvenanceBadge provenance={feedback.provenance} />
        {feedback.anonymized ? (
          <span className="text-[11px] text-ink-500">Anonymised before it reaches this view</span>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Promotional spotlight for a published landing page — a partner's own page,
 * or a campaign/festival page — on the Discover screen and on the
 * partner/admin dashboards that link to it.
 */
export function LandingPagePromoCard({ page, href }: { page: LandingPage; href?: string }) {
  const inner = (
    <Card as="article" className="flex h-full flex-col overflow-hidden">
      <GeneratedArt seed={page.slug} label={page.title} imageUrl={page.heroImageUrl} height="md" overlay />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate text-[15px] font-semibold text-ink-900">{page.title}</h3>
          <Badge tone={page.ownerType === 'CAMPAIGN' ? 'brand' : 'lake'}>
            {page.ownerType === 'CAMPAIGN' ? 'Campaign' : 'Partner page'}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] text-ink-700">{page.tagline}</p>
        <div className="mt-auto pt-3">
          <span className="text-[12px] font-medium text-brand-700">View page →</span>
        </div>
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full rounded-lg">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** Compact destination row used in dense government tables. */
export function DestinationRowMeta({
  demandIndex,
  trendPercent,
  status,
}: {
  demandIndex: number;
  trendPercent: number | null;
  status: Destination['status'];
}) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className="num text-[18px] font-semibold leading-none text-ink-900">{demandIndex}</span>
      <TrendChip percent={trendPercent} label="vs previous window" />
      <StatusBadge status={status} />
    </div>
  );
}
