import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock, IndianRupee, MapPin, Sparkles, Star, Tent, TreePine, Users, Zap } from 'lucide-react';
import type { Campaign, Experience, Destination } from '@/lib/types';

/* ------------------------------------------------------------------
   Photo helper — destination id is "dest-{slug}", photos live in
   /public/photos/dest-{slug}-sm.jpg
   ------------------------------------------------------------------ */
const PHOTO_SLUGS = new Set([
  'dest-kangla','dest-ima-keithel','dest-loktak','dest-keibul',
  'dest-moirang','dest-ukhrul','dest-shirui','dest-bishnupur-temple',
  'dest-andro','dest-dzukou','dest-imphal-war-cemetery',
  'dest-khongjom','dest-moreh','dest-tamenglong',
]);

function destPhoto(id: string): string | null {
  if (!PHOTO_SLUGS.has(id)) return null;
  return `/photos/${id}-sm.jpg`;
}

/* ── Campaign status pill ─────────────────────────────────────── */
const STATUS: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  IN_PROGRESS: { label: 'Live now',     bg: 'bg-good-100',    text: 'text-good-700',  dot: 'bg-good-500'  },
  OPEN:        { label: 'Open',         bg: 'bg-lake-50',     text: 'text-lake-700',  dot: 'bg-lake-500'  },
  DRAFT:       { label: 'Coming soon',  bg: 'bg-info-100',    text: 'text-info-700',  dot: 'bg-info-500'  },
  COMPLETED:   { label: 'Completed',    bg: 'bg-surface-2',   text: 'text-ink-500',   dot: 'bg-ink-400'   },
};

/* ── Experience category icon ─────────────────────────────────── */
function catIcon(category: string): React.ReactNode {
  const map: Record<string, React.ReactNode> = {
    nature:    <TreePine  size={14} aria-hidden />,
    craft:     <Sparkles  size={14} aria-hidden />,
    homestay:  <Tent      size={14} aria-hidden />,
    culture:   <Star      size={14} aria-hidden />,
    adventure: <Zap       size={14} aria-hidden />,
    food:      <Sparkles  size={14} aria-hidden />,
  };
  return map[category] ?? <Sparkles size={14} aria-hidden />;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function formatRupees(n: number) {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `₹${n}`;
}

/* ── Section heading ──────────────────────────────────────────── */

/* ── Campaign card ────────────────────────────────────────────── */
function CampaignCard({ campaign, destinationName }: { campaign: Campaign; destinationName: string }) {
  const s = STATUS[campaign.status] ?? STATUS.COMPLETED!;
  const photo = destPhoto(campaign.destinationId);
  return (
    <Link href="/creator/campaigns"
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]">
      <div className="relative h-32 overflow-hidden bg-surface-2">
        {photo
          ? <Image src={photo} alt={destinationName} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="280px" />
          : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,var(--color-brand-100),var(--color-lake-100))' }} />
        }
        <div className="absolute left-2.5 top-2.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="text-[13px] font-semibold leading-snug text-ink-900 group-hover:text-brand-700 transition-colors line-clamp-2">{campaign.name}</p>
        <p className="text-[11px] text-ink-500 line-clamp-2 flex-1">{campaign.objective}</p>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <span className="flex items-center gap-1 text-[11px] text-ink-500"><MapPin size={11} aria-hidden />{destinationName}</span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-brand-700"><IndianRupee size={11} aria-hidden />{formatRupees(campaign.rewardPool)} pool</span>
        </div>
        {campaign.themes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {campaign.themes.slice(0, 3).map(t => (
              <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">{t}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ── Destination card ─────────────────────────────────────────── */
function DestinationCard({ destination }: { destination: Destination }) {
  const photo = destPhoto(destination.id);
  const planQuery = encodeURIComponent(`I want to visit ${destination.name} in Manipur`);
  return (
    <div className="group relative flex w-52 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]">
      <div className="relative h-36 overflow-hidden bg-surface-2">
        {photo
          ? <Image src={photo} alt={destination.name} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="208px" />
          : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,var(--color-lake-100),var(--color-brand-100))' }} />
        }
        <div className="absolute right-2.5 top-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
            destination.status === 'HEALTHY' ? 'bg-good-100/90 text-good-700'
            : destination.status === 'WATCH' ? 'bg-warn-100/90 text-warn-700'
            : 'bg-surface-2/90 text-ink-500'}`}>
            {destination.status === 'HEALTHY' ? '✓' : destination.status === 'WATCH' ? '!' : '—'}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="text-[13px] font-semibold text-ink-900 leading-snug">{destination.name}</p>
          <p className="flex items-center gap-1 mt-0.5 text-[11px] text-ink-500"><MapPin size={10} aria-hidden />{destination.district}</p>
        </div>
        <p className="text-[11px] text-ink-600 line-clamp-2 flex-1">{destination.summary}</p>
        <div className="flex flex-wrap gap-1">
          {destination.category.slice(0, 2).map(c => (
            <span key={c} className="rounded-full bg-lake-50 px-2 py-0.5 text-[10px] font-medium text-lake-700">{c}</span>
          ))}
        </div>
        <Link href={`/explore?plan=${planQuery}`} className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-600">
          Plan a trip<ArrowRight size={12} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/* ── Experience card ──────────────────────────────────────────── */
function ExperienceCard({ experience, destinationName }: { experience: Experience; destinationName: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lake-50 text-lake-700">{catIcon(experience.category)}</span>
        <span className="rounded-full bg-lake-50 px-2 py-0.5 text-[10px] font-medium text-lake-700">{experience.category}</span>
        {experience.availabilityStatus === 'LIMITED' && (
          <span className="rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-medium text-warn-700">Limited spots</span>
        )}
      </div>
      <div className="flex-1">
        <p className="text-[14px] font-semibold leading-snug text-ink-900">{experience.title}</p>
        <p className="mt-1 text-[12px] text-ink-600 line-clamp-2">{experience.description}</p>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-ink-500"><MapPin size={11} aria-hidden />{destinationName}</p>
      <div className="flex items-center justify-between border-t border-line pt-2.5">
        <span className="flex items-center gap-1 text-[12px] text-ink-500"><Clock size={12} aria-hidden />{formatDuration(experience.durationMinutes)}</span>
        <span className="text-[14px] font-semibold text-ink-900">
          {formatRupees(experience.price)}<span className="ml-1 text-[11px] font-normal text-ink-500">/ person</span>
        </span>
      </div>
    </div>
  );
}

/* ── Stay card ────────────────────────────────────────────────── */
function StayCard({ experience, destinationName }: { experience: Experience; destinationName: string }) {
  const photo = destPhoto(experience.destinationId);
  return (
    <div className="group relative flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]">
      <div className="relative h-40 overflow-hidden bg-surface-2">
        {photo
          ? <Image src={photo} alt={destinationName} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="256px" />
          : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,var(--color-brand-100),var(--color-lake-100))' }} />
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <p className="absolute bottom-2.5 left-3 text-[13px] font-semibold text-white">{destinationName}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="text-[13px] font-semibold leading-snug text-ink-900 line-clamp-2">{experience.title}</p>
        <p className="text-[11px] text-ink-600 line-clamp-2 flex-1">{experience.description}</p>
        <div className="flex items-center justify-between border-t border-line pt-2.5">
          <span className="flex items-center gap-1 text-[11px] text-ink-500">
            <Users size={11} aria-hidden />{experience.accessibility === 'EASY' ? 'All abilities' : 'Moderate access'}
          </span>
          <span className="text-[13px] font-semibold text-ink-900">
            {formatRupees(experience.price)}<span className="ml-1 text-[10px] font-normal text-ink-500">/ night</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Main export
   ================================================================ */
export function TripPlannerDiscovery({
  activeCampaigns,
  destinations,
  featuredExperiences,
  stays,
  destinationMap,
}: {
  activeCampaigns: Campaign[];
  destinations: Destination[];
  featuredExperiences: Experience[];
  stays: Experience[];
  destinationMap: Map<string, string>;
}) {
  return (
    <div className="mt-10 space-y-10">

      {/* Active Campaigns */}
      {activeCampaigns.length > 0 && (
        <section aria-labelledby="disc-campaigns">
          <SectionHeading id="disc-campaigns" title="Active Campaigns" subtitle="Official tourism campaigns you can follow or contribute to" href="/creator/campaigns" linkLabel="View all" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeCampaigns.map(c => (
              <CampaignCard key={c.id} campaign={c} destinationName={destinationMap.get(c.destinationId) ?? c.destinationId} />
            ))}
          </div>
        </section>
      )}

      {/* Explore Locations */}
      {destinations.length > 0 && (
        <section aria-labelledby="disc-locations">
          <SectionHeading id="disc-locations" title="Explore Locations" subtitle="Manipur's signature destinations — from historic Imphal to the eastern hills" href="/explore/discover" linkLabel="See all" />
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-3.5 overflow-x-auto pb-3 xl:flex-wrap xl:overflow-visible">
              {destinations.map(d => <DestinationCard key={d.id} destination={d} />)}
            </div>
          </div>
        </section>
      )}

      {/* Featured Experiences */}
      {featuredExperiences.length > 0 && (
        <section aria-labelledby="disc-experiences">
          <SectionHeading id="disc-experiences" title="Featured Experiences" subtitle="Curated local experiences with verified operators" href="/explore/experiences" linkLabel="Browse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredExperiences.map(e => (
              <ExperienceCard key={e.id} experience={e} destinationName={destinationMap.get(e.destinationId) ?? e.destinationId} />
            ))}
          </div>
        </section>
      )}

      {/* Places to Stay */}
      {stays.length > 0 && (
        <section aria-labelledby="disc-stays">
          <SectionHeading id="disc-stays" title="Places to Stay" subtitle="Verified homestays and partner accommodations across Manipur" href="/explore/stays" linkLabel="Browse stays" />
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-3.5 overflow-x-auto pb-3">
              {stays.map(e => (
                <StayCard key={e.id} experience={e} destinationName={destinationMap.get(e.destinationId) ?? e.destinationId} />
              ))}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}

/* SectionHeading with id prop for aria */
function SectionHeading({ title, subtitle, href, linkLabel, id }: {
  title: string; subtitle?: string; href?: string; linkLabel?: string; id?: string;
}) {
  return (
    <>
      <h2 id={id} className="sr-only">{title}</h2>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p aria-hidden className="text-[18px] font-semibold tracking-tight text-ink-900">{title}</p>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
        </div>
        {href && linkLabel && (
          <Link href={href} className="shrink-0 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:text-brand-600">
            {linkLabel}<ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
    </>
  );
}
