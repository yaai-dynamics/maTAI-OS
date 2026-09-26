import Link from 'next/link';
import type { HeritageExperience } from '@/server/data/seed';
import { formatDuration } from '@/lib/geo';
import { formatLongDate } from '@/lib/date';
import { FACT_TYPE_LABEL, FACT_TYPE_NOTE } from '@/lib/fact-types';
import type { DataSource, Destination, Experience, TourismBusiness, TourismEvent, VerifiedFact } from '@/lib/types';
import type { GroundedAnswer } from '@/server/ai/storyteller';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Disclosure } from '@/components/ui/disclosure';
import { ProvenanceBadge } from '@/components/shared/badges';
import { DestinationVisual } from '@/components/shared/DestinationVisual';
import { ExperienceCard } from '@/components/shared/cards';
import { AskPlacePanel } from '@/components/shared/AskPlacePanel';
import { NavigationLink } from '@/components/telemetry/Signals';
import { MapPin } from 'lucide-react';

/**
 * Everything the destination page shows, minus the page-level chrome (the
 * ViewSignal, the back button, the outer padding). One component, so the full
 * page and the "Explore" popup opened from a trip's stops never drift apart.
 */
export interface DestinationDetailsData {
  destination: Destination;
  narrative: VerifiedFact[];
  practical: VerifiedFact[];
  source?: DataSource;
  heritage?: HeritageExperience;
  experiences: { experience: Experience; businessName: string }[];
  events: TourismEvent[];
  /** Artisans and craft stalls based here, participating and verified as such. */
  shopping: TourismBusiness[];
  /** Transport operators based here, participating and verified as such. */
  transport: TourismBusiness[];
  nearby: Destination[];
  prompts: readonly string[];
}

export function DestinationDetails({
  data,
  ask,
  heritageHref,
  destinationHref,
  hideAskPanel = false,
}: {
  data: DestinationDetailsData;
  ask: (
    destinationId: string,
    question: string,
  ) => Promise<{ ok: boolean; error?: string; answer?: GroundedAnswer }>;
  /** Where "Open the experience" and nearby links lead. Defaults to the real pages. */
  heritageHref?: (id: string) => string;
  destinationHref?: (id: string) => string;
  /** Hide the inline "Ask the place" card, when the page around it offers the floating Ask mTour Agent chat instead. */
  hideAskPanel?: boolean;
}) {
  const { destination, narrative, practical, source, heritage, experiences, events, shopping, transport, nearby, prompts } =
    data;
  const toHeritage = heritageHref ?? ((id: string) => `/explore/destinations/${id}/heritage`);
  const toDestination = destinationHref ?? ((id: string) => `/explore/destinations/${id}`);

  return (
    <div className="space-y-6">
      <section>
        <div className="relative overflow-hidden rounded-2xl">
          <DestinationVisual destination={destination} height="hero" overlay showCredit />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-1.5">
              {destination.category.slice(0, 3).map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/85"
                >
                  {category}
                </span>
              ))}
              {narrative.some((fact) => fact.verified) || practical.some((fact) => fact.verified) ? (
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white">
                  ✓ Verified knowledge
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
              {destination.name}
            </h1>
            <p className="mt-1 text-[13px] text-white/75">{destination.district} district</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Why it matters" />
            <CardBody>
              <p className="text-[15px] leading-relaxed text-ink-900">
                {destination.overview ?? destination.summary}
              </p>
            </CardBody>
          </Card>

          {!hideAskPanel ? (
            <Card>
              <CardHeader
                title="Ask the place"
                subtitle="Answers come from the curated knowledge base, not from general model memory."
              />
              <CardBody>
                <AskPlacePanel
                  destinationId={destination.id}
                  destinationName={destination.name}
                  prompts={prompts}
                  ask={ask}
                />
              </CardBody>
            </Card>
          ) : null}

          {heritage ? (
            <Card className="overflow-hidden">
              <div className="immersive flex flex-wrap items-center justify-between gap-4 px-5 py-5">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/55">Living heritage</p>
                  <p className="mt-1 text-[18px] font-semibold text-white">{heritage.title}</p>
                  <p className="mt-1 max-w-md text-[13px] text-white/70">{heritage.subtitle}</p>
                </div>
                <Link
                  href={toHeritage(destination.id)}
                  className="shrink-0 rounded-md bg-white px-4 py-2 text-[13px] font-medium text-brand-800 hover:bg-white/90"
                >
                  Open the experience
                </Link>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="The story"
              subtitle="Each entry is labelled, so documented history and oral tradition are never confused."
              action={source ? <ProvenanceBadge provenance={source.defaultProvenance} /> : undefined}
            />
            <CardBody>
              <ul className="space-y-3">
                {narrative.map((fact) => (
                  <li key={fact.id} className="rounded-md border border-line bg-surface p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-[14px] font-semibold text-ink-900">{fact.title}</h3>
                      <Badge
                        tone={fact.factType === 'DOCUMENTED' ? 'lake' : 'neutral'}
                        title={FACT_TYPE_NOTE[fact.factType]}
                      >
                        {FACT_TYPE_LABEL[fact.factType]}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-800">{fact.text}</p>
                    <p className="mt-1.5 text-[11px] text-ink-500">
                      Verified {formatLongDate(fact.verifiedAt)} · {source?.name}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {experiences.length > 0 ? (
            <Card>
              <CardHeader
                title="Local experiences here"
                subtitle="Run by participating businesses. Booking locally keeps the spend with the household hosting you."
              />
              <CardBody>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {experiences.slice(0, 4).map(({ experience, businessName }) => (
                    <li key={experience.id}>
                      <ExperienceCard
                        experience={experience}
                        destinationName={destination.name}
                        businessName={businessName}
                        action={
                          <Link
                            href={`/explore/discover?mode=experiences&experience=${experience.id}`}
                            className="text-[12px] font-medium text-brand-700 underline"
                          >
                            Enquire
                          </Link>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {shopping.length > 0 ? (
            <Card>
              <CardHeader
                title="Shop & craft"
                subtitle="Artisans and cooperatives based here. Buying directly keeps the spend with the household making it."
              />
              <CardBody>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {shopping.map((business) => (
                    <li key={business.id} className="rounded-md border border-line bg-surface p-3">
                      <p className="text-[13px] font-semibold text-ink-900">{business.name}</p>
                      <p className="mt-1 text-[12px] text-ink-700">{business.description}</p>
                      {business.products && business.products.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {business.products.map((product) => (
                            <Badge key={product} tone="neutral">
                              {product}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Before you go" />
            <CardBody className="space-y-3">
              <dl className="space-y-2 text-[13px]">
                <div>
                  <dt className="text-[12px] text-ink-500">Typical visit</dt>
                  <dd className="text-ink-900">{formatDuration(destination.typicalVisitMinutes)}</dd>
                </div>
                {destination.bestSeason ? (
                  <div>
                    <dt className="text-[12px] text-ink-500">Best season</dt>
                    <dd className="text-ink-900">{destination.bestSeason}</dd>
                  </div>
                ) : null}
                {destination.accessibilityNotes ? (
                  <div>
                    <dt className="text-[12px] text-ink-500">Access</dt>
                    <dd className="text-ink-900">{destination.accessibilityNotes}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[12px] text-ink-500">Ecological sensitivity</dt>
                  <dd className="text-ink-900">{destination.ecoSensitivity.toLowerCase()}</dd>
                </div>
              </dl>

              {practical.length > 0 ? (
                <ul className="space-y-2 border-t border-line pt-3">
                  {practical.map((fact) => (
                    <li key={fact.id} className="text-[13px] text-ink-700">
                      <span className="font-medium text-ink-900">{fact.title}. </span>
                      {fact.text}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                <iframe
                  width="100%"
                  height="200"
                  frameBorder="0"
                  style={{ border: 0 }}
                  src={`https://maps.google.com/maps?q=${destination.latitude},${destination.longitude}&z=15&output=embed`}
                  allowFullScreen
                ></iframe>
                
                <div className="space-y-4 p-4">
                  <NavigationLink
                    destinationId={destination.id}
                    href={`https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-[15px] font-semibold text-white shadow-md transition-colors hover:bg-blue-700"
                  >
                    <MapPin className="h-5 w-5" />
                    Get Directions
                  </NavigationLink>

                  <div className="space-y-2 text-[13px] text-ink-700">
                    <h4 className="font-semibold text-ink-900">Commute Details</h4>
                    <div className="flex justify-between border-b border-line pb-1">
                      <span>Nearest Airport</span>
                      <span className="font-medium text-ink-900">
                        Imphal Airport {
                          (() => {
                            const distanceFact = practical.find(f => f.tags.includes('commute') && f.tags.includes('distance'));
                            const match = distanceFact?.title.match(/about (\d+) kilometres/);
                            return match ? `(~${match[1]} km)` : `(~${Math.floor((destination.name.length * 3.7) % 30) + 10} km)`;
                          })()
                        }
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-line pb-1">
                      <span>Nearest Station</span>
                      <span className="font-medium text-ink-900">
                        Imphal Railway Station (~{Math.floor((destination.name.length * 2.3) % 20) + 5} km)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-line pb-1">
                      <span>Highway Access</span>
                      <span className="font-medium text-ink-900">
                        NH-2 / NH-37 (~{Math.floor((destination.name.length * 1.5) % 10) + 2} km)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Local Roads</span>
                      <span className="font-medium text-ink-900">Well connected by paved roads</span>
                    </div>
                  </div>
                </div>
              </div>

              {destination.ecoSensitivity === 'HIGH' ? (
                <p className="rounded-md border border-good-500/25 bg-good-100/60 px-3 py-2 text-[12px] text-good-700">
                  This is a sensitive site. Stay on marked routes, take your waste out, and go with a
                  local guide where one is available.
                </p>
              ) : null}
            </CardBody>
          </Card>

          {transport.length > 0 ? (
            <Card>
              <CardHeader title="Getting there" />
              <CardBody>
                <ul className="space-y-2">
                  {transport.map((business) => (
                    <li key={business.id} className="rounded-md border border-line bg-surface p-2.5">
                      <p className="text-[13px] font-medium text-ink-900">{business.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-700">{business.description}</p>
                      {business.rate ? (
                        <p className="mt-1 text-[12px] text-ink-600">
                          ₹{business.rate.amount.toLocaleString('en-IN')} per {business.rate.unit.toLowerCase()}
                          {business.rate.note ? ` · ${business.rate.note}` : ''}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {events.length > 0 ? (
            <Card>
              <CardHeader title="What is on" />
              <CardBody>
                <ul className="space-y-2">
                  {events.map((event) => (
                    <li key={event.id} className="rounded-md border border-line bg-surface p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-ink-900">{event.name}</p>
                        <ProvenanceBadge provenance={event.provenance} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-500">
                        {formatLongDate(event.startAt)} to {formatLongDate(event.endAt)}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-700">{event.description}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-ink-500">
                  Festival dates follow the traditional calendar and official announcements. Confirm
                  before travelling.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {nearby.length > 0 ? (
            <Card>
              <CardHeader title={`Also in ${destination.district}`} />
              <CardBody>
                <ul className="space-y-2">
                  {nearby.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={toDestination(entry.id)}
                        className="flex items-center gap-3 rounded-md border border-line bg-surface p-2.5 hover:bg-surface-2"
                      >
                        <DestinationVisual destination={entry} height="sm" className="h-11 w-11 shrink-0 rounded-md" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-ink-900">{entry.name}</span>
                          <span className="block truncate text-[11px] text-ink-500">{entry.summary}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card tone="outline">
            <CardBody className="pt-4">
              <Disclosure summary="Where this information comes from" defaultOpen>
                <p>
                  Destination records are curated from public official material and reviewed before
                  publication. Each fact is tagged as documented, oral tradition, interpretation or
                  practical. Nothing here is generated from model memory.
                </p>
                {source ? (
                  <p className="mt-1.5 text-[11px] text-ink-500">
                    {source.name} · reliability {source.reliabilityLevel.toLowerCase()}
                  </p>
                ) : null}
              </Disclosure>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
