import type { Metadata } from 'next';

import { toIsoDate, addDays } from '@/lib/date';
import { now } from '@/lib/config';
import { EXPERIENCE_CATEGORY_LABEL, type DestinationCategory, type Experience, type ExperienceCategory } from '@/lib/types';
import { currentWindow } from '@/server/analytics/windows';
import { computeDemand } from '@/server/analytics/demand';
import {
  getBusiness,
  getDestination,
  getDestinations,
  getExperiences,
  getPublishedLandingPages,
} from '@/server/data/repository';
import { businessesAcceptingBookings } from '@/server/bookings/ledger';
import { CANCELLATION_POLICY, formatRupees, MAX_PARTY_SIZE, PAYMENT_WINDOW_HOURS } from '@/server/bookings/policy';
import { requestBookingForm, sendEnquiryForm } from '@/server/actions/forms';
import { askPlace, discoverChat, discoverPlaceOnline, getDestinationPreview, mapPlaceSnapshot, sendChatEnquiry } from '@/server/actions/tourist';
import type { DiscoverFocus } from '@/server/ai/discover';
import type { MapPlace } from '@/lib/map';
import { DiscoverMap, type MapExperience } from '@/components/map/DiscoverMap';
import { ViewToggle } from '@/components/map/ViewToggle';
import { TourismMap } from '@/components/shared/TourismMap';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { DestinationCard, ExperienceCard, LandingPagePromoCard } from '@/components/shared/cards';
import { DiscoverWorkspace } from '@/components/shared/DiscoverWorkspace';
import { ActionForm, CheckboxRow, Field, TextArea, TextInput } from '@/components/shared/ActionForm';

export const metadata: Metadata = { title: 'Discover' };
export const dynamic = 'force-dynamic';

const DESTINATION_FILTERS: { value: DestinationCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'nature', label: 'Nature' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'culture', label: 'Culture' },
  { value: 'food', label: 'Food' },
  { value: 'craft', label: 'Craft' },
  { value: 'adventure', label: 'Adventure' },
];

const EXPERIENCE_CATEGORIES: ExperienceCategory[] = [
  'food',
  'handloom',
  'craft',
  'culture',
  'nature',
  'photography',
  'homestay',
];

/**
 * E3/E5 merged: one screen to find a place and the local experiences that go
 * with it, with an AI search that can be scoped to either, or answered as a
 * chat that looks across both at once (docs/09 §26).
 */
export default async function DiscoverPage(props: {
  searchParams: Promise<{
    mode?: string;
    category?: string;
    experience?: string;
    book?: string;
    destination?: string;
    view?: string;
  }>;
}) {
  const { mode: modeParam, category, experience: experienceParam, book: bookParam, destination: destinationParam, view: viewParam } =
    await props.searchParams;
  const mode: 'destinations' | 'experiences' = modeParam === 'experiences' ? 'experiences' : 'destinations';
  const view: 'list' | 'map' = viewParam === 'map' ? 'map' : 'list';
  // Links keep the view, so the map stays the main view once chosen.
  const withView = (href: string) => (view === 'map' ? `${href}${href.includes('?') ? '&' : '?'}view=map` : href);
  const modeHref = mode === 'experiences' ? '/explore/discover?mode=experiences' : '/explore/discover';
  const filterQuery = [
    category ? `category=${encodeURIComponent(category)}` : '',
    mode === 'experiences' && destinationParam ? `destination=${encodeURIComponent(destinationParam)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  const sameFilters = (href: string) => (filterQuery ? `${href}${href.includes('?') ? '&' : '?'}${filterQuery}` : href);

  const allDestinations = getDestinations();
  const allExperiences = getExperiences();
  const experiencesByDestination = new Map<string, Experience[]>();
  for (const experience of allExperiences) {
    const list = experiencesByDestination.get(experience.destinationId) ?? [];
    list.push(experience);
    experiencesByDestination.set(experience.destinationId, list);
  }

  const accepting = await businessesAcceptingBookings();
  const bookable = (experience: Experience) =>
    experience.availabilityStatus !== 'UNAVAILABLE' &&
    accepting.has(experience.businessId) &&
    getBusiness(experience.businessId)?.status === 'PARTICIPATING';

  // What the visitor is already looking at, so opening the chat doesn't ask them to repeat it.
  const spotlightPages = getPublishedLandingPages()
    .sort((a, b) => (a.ownerType === b.ownerType ? 0 : a.ownerType === 'CAMPAIGN' ? -1 : 1))
    .slice(0, 4);

  const selectedExperienceId = experienceParam ?? bookParam;
  const initialFocus: DiscoverFocus | undefined = selectedExperienceId
    ? { experienceId: selectedExperienceId }
    : destinationParam
      ? { destinationId: destinationParam }
      : undefined;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Discover</h1>
          <nav aria-label="Search by" className="flex gap-1.5">
            <ModePill href={withView('/explore/discover')} active={mode === 'destinations'}>
              Destinations
            </ModePill>
            <ModePill href={withView('/explore/discover?mode=experiences')} active={mode === 'experiences'}>
              Experiences
            </ModePill>
          </nav>
          <ViewToggle
            view={view}
            listHref={sameFilters(modeHref)}
            mapHref={sameFilters(`${modeHref}${modeHref.includes('?') ? '&' : '?'}view=map`)}
            className="ml-auto"
          />
        </div>
        <p className={view === 'map' ? 'sr-only' : 'mt-1 max-w-2xl text-[13px] text-ink-600'}>
          Every destination carries curated, verified information, and the local experiences run by
          homestays, guides, cooks and artisans who have joined the platform sit right alongside it.
        </p>
      </div>

      {spotlightPages.length > 0 && view !== 'map' ? (
        <div>
          <h2 className="mb-2 text-[13px] font-semibold text-ink-800">Featured pages</h2>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
            {spotlightPages.map((page) => (
              <li key={page.id} className="w-64 shrink-0 sm:w-auto">
                <LandingPagePromoCard page={page} href={`/p/${page.slug}`} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DiscoverWorkspace
        destinations={allDestinations}
        experiences={allExperiences}
        ask={discoverChat}
        lookUpOnline={discoverPlaceOnline}
        getPreview={getDestinationPreview}
        askPlace={askPlace}
        submitEnquiry={sendChatEnquiry}
        initialFocus={initialFocus}
      >
        {view === 'map' ? (
          <DiscoverMapView mode={mode} category={category} destinationFilter={destinationParam} bookable={bookable} />
        ) : mode === 'destinations' ? (
          <DestinationsBrowse category={category} experiencesByDestination={experiencesByDestination} />
        ) : (
          <ExperiencesBrowse
            category={category}
            destinationFilter={destinationParam}
            experienceParam={experienceParam}
            bookParam={bookParam}
            bookable={bookable}
          />
        )}
      </DiscoverWorkspace>

      <Card tone="outline">
        <CardBody className="pt-4">
          <p className="text-[12px] text-ink-600">
            {mode === 'destinations'
              ? 'The interest index is a relative measure of attention on this platform over the last 30 days. It is not a visitor count, and a low number does not mean a place is not worth going to. Often it means the opposite.'
              : 'Verified means the platform has checked the provider before listing them. Online bookings are paid through Razorpay once the host accepts; card, UPI and bank details go to Razorpay and never to this platform. Hosts not yet taking bookings online reply to enquiries directly.'}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function ModePill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={
        active
          ? 'rounded-full border border-brand-500 bg-brand-50 px-3.5 py-1.5 text-[13px] font-medium text-brand-700'
          : 'rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink-700 hover:bg-surface-2'
      }
    >
      {children}
    </a>
  );
}

function CategoryPills({
  active,
  options,
  baseHref,
}: {
  active: string;
  options: { value: string; label: string }[];
  baseHref: string;
}) {
  const sep = baseHref.includes('?') ? '&' : '?';
  return (
    <nav
      aria-label="Filter by category"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {options.map((option) => (
        <a
          key={option.value}
          href={option.value === 'all' ? baseHref : `${baseHref}${sep}category=${option.value}`}
          className={
            active === option.value
              ? 'shrink-0 rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700'
              : 'shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2'
          }
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}

/** Discover with the map as the main view: the same filters, the same places. */
function DiscoverMapView({
  mode,
  category,
  destinationFilter,
  bookable,
}: {
  mode: 'destinations' | 'experiences';
  category: string | undefined;
  destinationFilter: string | undefined;
  bookable: (experience: Experience) => boolean;
}) {
  const active = category ?? 'all';
  const demand = new Map(computeDemand(currentWindow()).map((row) => [row.destinationId, row]));

  const experiences = getExperiences().filter((experience) =>
    mode === 'destinations'
      ? true
      : (active === 'all' || experience.category === active) &&
        (!destinationFilter || experience.destinationId === destinationFilter),
  );
  const countAt = (id: string) => experiences.filter((experience) => experience.destinationId === id).length;

  const destinations = getDestinations()
    .filter((destination) =>
      mode === 'destinations'
        ? active === 'all' || destination.category.includes(active as never)
        : countAt(destination.id) > 0,
    )
    .sort((a, b) => (demand.get(b.id)?.weightedScore ?? 0) - (demand.get(a.id)?.weightedScore ?? 0));

  const places: MapPlace[] = destinations.map((destination) => ({
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
    .filter((experience) => destinations.some((destination) => destination.id === experience.destinationId))
    .map((experience) => ({
      id: experience.id,
      title: experience.title,
      destinationId: experience.destinationId,
      businessName: getBusiness(experience.businessId)?.name ?? 'Local provider',
      price: experience.price,
      bookable: bookable(experience),
      href: `/explore/discover?mode=experiences&${bookable(experience) ? 'book' : 'experience'}=${experience.id}`,
    }));

  const focusDestination = mode === 'experiences' && destinationFilter ? getDestination(destinationFilter) : undefined;
  const pills =
    mode === 'destinations'
      ? DESTINATION_FILTERS
      : [{ value: 'all', label: 'All' }, ...EXPERIENCE_CATEGORIES.map((value) => ({ value, label: EXPERIENCE_CATEGORY_LABEL[value] }))];

  return (
    <div className="space-y-4">
      <CategoryPills
        active={active}
        options={pills}
        baseHref={mode === 'destinations' ? '/explore/discover?view=map' : '/explore/discover?mode=experiences&view=map'}
      />
      {focusDestination ? (
        <p className="text-[13px] text-ink-700">
          Showing experiences at <span className="font-medium text-ink-900">{focusDestination.name}</span>.{' '}
          <a
            href={`/explore/discover?mode=experiences&view=map${active === 'all' ? '' : `&category=${active}`}`}
            className="font-medium text-brand-700 hover:underline"
          >
            Clear
          </a>
        </p>
      ) : null}
      {places.length === 0 ? (
        <EmptyState title="Nothing matches that filter" description="Try a different interest, or clear the filter." />
      ) : (
        <DiscoverMap
          mode={mode}
          places={places}
          experiences={mapExperiences}
          snapshot={mapPlaceSnapshot}
          getPreview={getDestinationPreview}
          askPlace={askPlace}
          fallback={
            <TourismMap
              points={destinations.map((destination) => ({
                destination,
                demandIndex: demand.get(destination.id)?.demandIndex ?? 20,
                href: `/explore/destinations/${destination.id}`,
              }))}
            />
          }
        />
      )}
    </div>
  );
}

function DestinationsBrowse({
  category,
  experiencesByDestination,
}: {
  category: string | undefined;
  experiencesByDestination: Map<string, Experience[]>;
}) {
  const active = category ?? 'all';
  const demand = new Map(computeDemand(currentWindow()).map((row) => [row.destinationId, row]));

  const destinations = getDestinations()
    .filter((destination) => active === 'all' || destination.category.includes(active as never))
    .sort((a, b) => (demand.get(b.id)?.weightedScore ?? 0) - (demand.get(a.id)?.weightedScore ?? 0));

  return (
    <div className="space-y-4">
      <CategoryPills active={active} options={DESTINATION_FILTERS} baseHref="/explore/discover" />

      {destinations.length === 0 ? (
        <EmptyState title="Nothing matches that filter" description="Try a different interest, or clear the filter." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {destinations.map((destination) => {
            const row = demand.get(destination.id);
            const here = (experiencesByDestination.get(destination.id) ?? []).slice(0, 4);
            return (
              <li key={destination.id}>
                <DestinationCard
                  destination={destination}
                  href={`/explore/destinations/${destination.id}`}
                  meta={
                    row ? (
                      <span className="shrink-0 text-right">
                        <span className="num block text-[15px] font-semibold text-ink-900">{row.demandIndex}</span>
                        <span className="block text-[10px] text-ink-500">interest</span>
                      </span>
                    ) : undefined
                  }
                  experiences={here.map((experience) => ({
                    experience,
                    href: `/explore/discover?mode=experiences&experience=${experience.id}`,
                  }))}
                  moreExperiencesHref={`/explore/discover?mode=experiences&destination=${destination.id}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExperiencesBrowse({
  category,
  destinationFilter,
  experienceParam,
  bookParam,
  bookable,
}: {
  category: string | undefined;
  destinationFilter: string | undefined;
  experienceParam: string | undefined;
  bookParam: string | undefined;
  bookable: (experience: Experience) => boolean;
}) {
  const active = (category ?? 'all') as ExperienceCategory | 'all';
  const focusDestination = destinationFilter ? getDestination(destinationFilter) : undefined;

  const all = getExperiences();
  const filtered = all
    .filter((experience) => active === 'all' || experience.category === active)
    .filter((experience) => !focusDestination || experience.destinationId === focusDestination.id)
    .sort((a, b) => {
      const rank = (value: typeof a) =>
        (value.availabilityStatus === 'AVAILABLE' ? 0 : value.availabilityStatus === 'LIMITED' ? 1 : 2) +
        (value.verified ? 0 : 0.5);
      return rank(a) - rank(b);
    });

  const selected = experienceParam ? all.find((experience) => experience.id === experienceParam) : undefined;
  const booking = bookParam ? all.find((experience) => experience.id === bookParam && bookable(experience)) : undefined;
  const categoryQuery = active === 'all' ? '' : `&category=${active}`;
  const destinationQuery = focusDestination ? `&destination=${focusDestination.id}` : '';

  return (
    <div className="space-y-4">
      <CategoryPills
        active={active}
        options={[{ value: 'all', label: 'All' }, ...EXPERIENCE_CATEGORIES.map((value) => ({ value, label: EXPERIENCE_CATEGORY_LABEL[value] }))]}
        baseHref="/explore/discover?mode=experiences"
      />

      {focusDestination ? (
        <p className="text-[13px] text-ink-700">
          Showing experiences at <span className="font-medium text-ink-900">{focusDestination.name}</span>.{' '}
          <a href={`/explore/discover?mode=experiences${categoryQuery}`} className="font-medium text-brand-700 hover:underline">
            Clear
          </a>
        </p>
      ) : null}

      {booking ? (
        <Card>
          <CardHeader
            title={`Request to book: ${booking.title}`}
            subtitle={`${getBusiness(booking.businessId)?.name} at ${getDestination(booking.destinationId)?.name}. ${formatRupees(booking.price * 100)} per person. Nothing is charged now: once the host accepts, you have up to ${PAYMENT_WINDOW_HOURS} hours to pay.`}
          />
          <CardBody>
            <ActionForm
              action={requestBookingForm}
              submitLabel="Send request"
              pendingLabel="Sending…"
              hiddenFields={{ experienceId: booking.id }}
              footer={<span className="text-[12px] text-ink-500">{CANCELLATION_POLICY}</span>}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How many people" name="partySize" required>
                  <TextInput id="partySize" name="partySize" type="number" min={1} max={MAX_PARTY_SIZE} defaultValue={2} required />
                </Field>
                <Field label="Day" name="date" required>
                  <TextInput
                    id="date"
                    name="date"
                    type="date"
                    required
                    min={toIsoDate(addDays(now(), 1))}
                    defaultValue={toIsoDate(addDays(now(), 7))}
                  />
                </Field>
                <Field label="Your name" name="guestName" required>
                  <TextInput id="guestName" name="guestName" autoComplete="name" maxLength={120} required />
                </Field>
                <Field label="Phone" name="guestPhone" required>
                  <TextInput id="guestPhone" name="guestPhone" type="tel" autoComplete="tel" inputMode="tel" required />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Email (optional)" name="guestEmail">
                    <TextInput id="guestEmail" name="guestEmail" type="email" autoComplete="email" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Anything the host should know" name="note">
                    <TextArea id="note" name="note" maxLength={400} placeholder="Dietary needs, mobility, arrival time." />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <CheckboxRow
                    name="consent"
                    value="on"
                    label="Share my name and phone number with this host, so they can arrange the booking."
                  />
                  <p className="mt-1.5 text-[12px] text-ink-500">
                    Only the host sees them. The Tourism Department sees booking counts, never who booked.
                  </p>
                </div>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      {selected ? (
        <Card>
          <CardHeader
            title={`Enquire: ${selected.title}`}
            subtitle={`${getBusiness(selected.businessId)?.name} at ${getDestination(selected.destinationId)?.name}. The provider replies directly; an enquiry takes no payment.`}
          />
          <CardBody>
            <ActionForm
              action={sendEnquiryForm}
              submitLabel="Send enquiry"
              pendingLabel="Sending…"
              hiddenFields={{ experienceId: selected.id }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How many people" name="partySize" required>
                  <TextInput id="partySize" name="partySize" type="number" min={1} max={20} defaultValue={2} required />
                </Field>
                <Field label="Preferred date" name="preferredDate" required>
                  <TextInput
                    id="preferredDate"
                    name="preferredDate"
                    type="date"
                    required
                    defaultValue={toIsoDate(addDays(now(), 3))}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Anything the host should know" name="note">
                    <TextArea id="note" name="note" maxLength={400} placeholder="Dietary needs, mobility, arrival time." />
                  </Field>
                </div>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title="Nothing listed in that category yet" description="Provider onboarding is ongoing. Try another category." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((experience) => {
            const business = getBusiness(experience.businessId);
            const destination = getDestination(experience.destinationId);
            const additionalDestinations = experience.additionalDestinationIds
              .map((id) => getDestination(id))
              .filter((place): place is NonNullable<typeof place> => Boolean(place))
              .map((place) => ({ destination: place, href: `/explore/destinations/${place.id}` }));
            return (
              <li key={experience.id}>
                <ExperienceCard
                  experience={experience}
                  destinationName={destination?.name ?? experience.destinationId}
                  businessName={business?.name ?? 'Local provider'}
                  destination={destination}
                  destinationHref={destination ? `/explore/destinations/${destination.id}` : undefined}
                  additionalDestinations={additionalDestinations}
                  action={
                    experience.availabilityStatus === 'UNAVAILABLE' ? (
                      <p className="text-[12px] text-ink-500">Not bookable yet. This provider is still being onboarded.</p>
                    ) : bookable(experience) ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/explore/discover?mode=experiences&book=${experience.id}${categoryQuery}${destinationQuery}`}
                          className="inline-block rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
                        >
                          Request to book
                        </a>
                        <a
                          href={`/explore/discover?mode=experiences&experience=${experience.id}${categoryQuery}${destinationQuery}`}
                          className="text-[12px] font-medium text-brand-700 hover:underline"
                        >
                          Ask a question
                        </a>
                      </span>
                    ) : (
                      <a
                        href={`/explore/discover?mode=experiences&experience=${experience.id}${categoryQuery}${destinationQuery}`}
                        className="inline-block rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
                      >
                        Enquire
                      </a>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

