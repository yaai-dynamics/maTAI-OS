import Link from 'next/link';
import type { Metadata } from 'next';
import { List, Map as MapIcon, Search, X } from 'lucide-react';

import { EXPERIENCE_CATEGORY_LABEL, type Experience, type ExperienceCategory } from '@/lib/types';
import type { MapPlace } from '@/lib/map';
import { currentWindow } from '@/server/analytics/windows';
import { computeDemand } from '@/server/analytics/demand';
import { getBusiness, getDestination, getDestinations, getExperiences } from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { askPlace, getDestinationPreview, mapPlaceSnapshot } from '@/server/actions/tourist';
import { DiscoverMap, type MapExperience } from '@/components/map/DiscoverMap';
import { TourismMap } from '@/components/shared/TourismMap';
import { ExperienceRow, MobileEmpty, MobileHeader, PillBar, PlaceRow, Segmented } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Discover' };
export const dynamic = 'force-dynamic';

const PLACE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'nature', label: 'Nature' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'culture', label: 'Culture' },
  { value: 'food', label: 'Food' },
  { value: 'craft', label: 'Craft' },
  { value: 'adventure', label: 'Adventure' },
];

const EXPERIENCE_CATEGORIES: ExperienceCategory[] = ['food', 'handloom', 'craft', 'culture', 'nature', 'photography', 'homestay'];

const norm = (value: string) => value.toLowerCase().normalize('NFKD');

/** E3/E5 on mobile: search and browse places and local experiences. */
export default async function MobileDiscoverPage(props: {
  searchParams: Promise<{ mode?: string; category?: string; destination?: string; view?: string; q?: string }>;
}) {
  const params = await props.searchParams;
  const mode: 'places' | 'experiences' = params.mode === 'experiences' ? 'experiences' : 'places';
  const view: 'list' | 'map' = params.view === 'map' ? 'map' : 'list';
  const category = params.category ?? 'all';
  const query = (params.q ?? '').trim().slice(0, 80);
  const focus = mode === 'experiences' && params.destination ? getDestination(params.destination) : undefined;

  const href = (change: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      mode: mode === 'experiences' ? 'experiences' : undefined,
      category: category === 'all' ? undefined : category,
      destination: focus?.id,
      view: view === 'map' ? 'map' : undefined,
      q: query || undefined,
      ...change,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const text = next.toString();
    return text ? `/m/discover?${text}` : '/m/discover';
  };

  const demand = new Map(computeDemand(currentWindow()).map((row) => [row.destinationId, row]));
  const accepting = await businessesAcceptingBookings();
  const bookable = (experience: Experience) =>
    experience.availabilityStatus !== 'UNAVAILABLE' &&
    accepting.has(experience.businessId) &&
    getBusiness(experience.businessId)?.status === 'PARTICIPATING';

  const q = norm(query);
  const places = getDestinations()
    .filter((destination) => category === 'all' || destination.category.includes(category as never))
    .filter(
      (destination) =>
        !q ||
        [destination.name, destination.district, destination.summary, ...destination.category].some((field) =>
          norm(field).includes(q),
        ),
    )
    .sort((a, b) => (demand.get(b.id)?.weightedScore ?? 0) - (demand.get(a.id)?.weightedScore ?? 0));

  const experiences = getExperiences()
    .filter((experience) => category === 'all' || experience.category === category)
    .filter((experience) => !focus || experience.destinationId === focus.id)
    .filter((experience) => {
      if (!q) return true;
      const business = getBusiness(experience.businessId)?.name ?? '';
      const destination = getDestination(experience.destinationId)?.name ?? '';
      return [experience.title, experience.description, business, destination].some((field) => norm(field).includes(q));
    })
    .sort((a, b) => {
      const rank = (value: Experience) =>
        (value.availabilityStatus === 'AVAILABLE' ? 0 : value.availabilityStatus === 'LIMITED' ? 1 : 2) +
        (value.verified ? 0 : 0.5);
      return rank(a) - rank(b);
    });

  const pills =
    mode === 'places'
      ? PLACE_FILTERS
      : [{ value: 'all', label: 'All' }, ...EXPERIENCE_CATEGORIES.map((value) => ({ value, label: EXPERIENCE_CATEGORY_LABEL[value] }))];

  return (
    <div>
      <MobileHeader
        title="Discover"
        subtitle="Verified places and local hosts"
        action={
          <Link
            href={href({ view: view === 'map' ? undefined : 'map' })}
            replace
            aria-label={view === 'map' ? 'Show list' : 'Show map'}
            className="grid h-10 w-10 place-items-center rounded-full bg-surface text-ink-700 shadow-card"
          >
            {view === 'map' ? <List aria-hidden size={19} /> : <MapIcon aria-hidden size={19} />}
          </Link>
        }
      />

      <form action="/m/discover" role="search" className="relative">
        {mode === 'experiences' ? <input type="hidden" name="mode" value="experiences" /> : null}
        {view === 'map' ? <input type="hidden" name="view" value="map" /> : null}
        <Search aria-hidden size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <label htmlFor="m-discover-q" className="sr-only">
          Search
        </label>
        <input
          id="m-discover-q"
          name="q"
          type="search"
          defaultValue={query}
          enterKeyHint="search"
          placeholder={mode === 'places' ? 'Search places, districts…' : 'Search experiences, hosts…'}
          className="h-12 w-full rounded-2xl border border-line-strong bg-surface pl-11 pr-4 text-[15px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-400"
        />
      </form>

      <div className="mt-3">
        <Segmented
          label="Search by"
          active={mode}
          options={[
            { value: 'places', label: 'Places', href: view === 'map' ? '/m/discover?view=map' : '/m/discover' },
            {
              value: 'experiences',
              label: 'Experiences',
              href: view === 'map' ? '/m/discover?mode=experiences&view=map' : '/m/discover?mode=experiences',
            },
          ]}
        />
      </div>

      <div className="mt-3">
        <PillBar
          label="Filter by category"
          active={category}
          options={pills.map((pill) => ({ ...pill, href: href({ category: pill.value === 'all' ? undefined : pill.value }) }))}
        />
      </div>

      {query || focus ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {query ? (
            <Link href={href({ q: undefined })} replace className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-[12px] font-medium text-brand-700">
              “{query}”
              <X aria-hidden size={13} />
            </Link>
          ) : null}
          {focus ? (
            <Link href={href({ destination: undefined })} replace className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-[12px] font-medium text-brand-700">
              At {focus.name}
              <X aria-hidden size={13} />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        {view === 'map' ? (
          <MapView mode={mode} places={places} experiences={experiences} bookable={bookable} demand={demand} />
        ) : mode === 'places' ? (
          places.length === 0 ? (
            <MobileEmpty icon={<Search aria-hidden size={24} />} title="No places match" description="Try another word or clear the filter." />
          ) : (
            <ul className="space-y-2.5">
              {places.map((destination) => {
                const row = demand.get(destination.id);
                return (
                  <li key={destination.id}>
                    <PlaceRow
                      destination={destination}
                      href={`/m/place/${destination.id}`}
                      meta={
                        row ? (
                          <span className="block text-right">
                            <span className="num block text-[15px] font-semibold text-ink-900">{row.demandIndex}</span>
                            <span className="block text-[10px] text-ink-500">interest</span>
                          </span>
                        ) : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )
        ) : experiences.length === 0 ? (
          <MobileEmpty icon={<Search aria-hidden size={24} />} title="Nothing listed here yet" description="Provider onboarding is ongoing. Try another category." />
        ) : (
          <ul className="space-y-2.5">
            {experiences.map((experience) => (
              <li key={experience.id}>
                <ExperienceRow
                  experience={experience}
                  businessName={getBusiness(experience.businessId)?.name ?? 'Local host'}
                  destinationName={getDestination(experience.destinationId)?.name ?? ''}
                  href={`/m/experience/${experience.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-ink-500">
        {mode === 'places'
          ? 'The interest index is relative attention on this platform over 30 days. It is not a visitor count; a low number often means a quieter place.'
          : 'Verified means the platform checked the provider before listing them. Online payment happens only after the host accepts.'}
      </p>
    </div>
  );
}

function MapView({
  mode,
  places,
  experiences,
  bookable,
  demand,
}: {
  mode: 'places' | 'experiences';
  places: ReturnType<typeof getDestinations>;
  experiences: Experience[];
  bookable: (experience: Experience) => boolean;
  demand: Map<string, { demandIndex: number }>;
}) {
  const countAt = (id: string) => experiences.filter((experience) => experience.destinationId === id).length;
  const shown = mode === 'places' ? places : getDestinations().filter((destination) => countAt(destination.id) > 0);

  if (shown.length === 0) {
    return <MobileEmpty icon={<MapIcon aria-hidden size={24} />} title="Nothing to show on the map" description="Clear the search or filter." />;
  }

  const mapPlaces: MapPlace[] = shown.map((destination) => ({
    id: destination.id,
    name: destination.name,
    district: destination.district,
    latitude: destination.latitude,
    longitude: destination.longitude,
    palette: destination.palette,
    category: destination.category,
    summary: destination.summary,
    ...(destination.bestSeason ? { bestSeason: destination.bestSeason } : {}),
    typicalVisitMinutes: destination.typicalVisitMinutes,
    experienceCount: countAt(destination.id),
    ...(demand.get(destination.id) ? { demandIndex: demand.get(destination.id)!.demandIndex } : {}),
  }));

  const mapExperiences: MapExperience[] = experiences
    .filter((experience) => shown.some((destination) => destination.id === experience.destinationId))
    .map((experience) => ({
      id: experience.id,
      title: experience.title,
      destinationId: experience.destinationId,
      businessName: getBusiness(experience.businessId)?.name ?? 'Local provider',
      price: experience.price,
      bookable: bookable(experience),
      href: `/m/experience/${experience.id}`,
    }));

  return (
    <div className="-mx-4">
      <DiscoverMap
        mode={mode === 'places' ? 'destinations' : 'experiences'}
        places={mapPlaces}
        experiences={mapExperiences}
        snapshot={mapPlaceSnapshot}
        getPreview={getDestinationPreview}
        askPlace={askPlace}
        fallback={
          <TourismMap
            points={shown.map((destination) => ({
              destination,
              demandIndex: demand.get(destination.id)?.demandIndex ?? 20,
              href: `/m/place/${destination.id}`,
            }))}
          />
        }
      />
    </div>
  );
}
