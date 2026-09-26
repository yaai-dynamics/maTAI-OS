import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BASE_URL } from '@/lib/config';
import { Badge, Card, CardBody } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/shared/badges';
import { GeneratedArt } from '@/components/shared/GeneratedArt';
import { LandingPageShare } from '@/components/shared/LandingPageShare';
import {
  getBusiness,
  getCampaign,
  getDestination,
  getEvent,
  getLandingPageBySlug,
} from '@/server/data/repository';
import { recordLandingPageShare, recordLandingPageView } from '@/server/actions/landing-pages';
import { MediaGalleryLightbox } from '@/components/shared/MediaGalleryLightbox';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const page = getLandingPageBySlug(slug);
  if (!page || page.status !== 'PUBLISHED') return { title: 'Page not found' };
  return { title: page.title, description: page.tagline };
}

/**
 * A published landing page: a partner's own microsite, or a campaign/festival
 * page the department published. Public, unauthenticated, and left out of
 * src/proxy.ts on purpose.
 */
export default async function LandingPagePublic(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const page = getLandingPageBySlug(slug);
  if (!page || page.status !== 'PUBLISHED') notFound();

  await recordLandingPageView(slug);

  const business = page.businessId ? getBusiness(page.businessId) : undefined;
  const event = page.eventId ? getEvent(page.eventId) : undefined;
  const campaign = page.campaignId ? getCampaign(page.campaignId) : undefined;
  const destinationId = business?.destinationId ?? event?.destinationId ?? campaign?.destinationId;
  const destination = destinationId ? getDestination(destinationId) : undefined;

  const bookingUrl =
    page.bookingUrl ?? (destination ? `/explore/destinations/${destination.id}` : '/explore/discover');
  const bookingIsExternal = /^https?:\/\//.test(bookingUrl);
  const pageUrl = `${BASE_URL}/p/${page.slug}`;

  return (
    <div className="mx-auto max-w-3xl">
      <GeneratedArt
        seed={page.slug}
        label={page.title}
        imageUrl={page.heroImageUrl}
        palette={destination?.palette}
        height="hero"
        overlay
        className="rounded-b-lg"
      />

      <div className="px-4 py-6 sm:px-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={page.ownerType === 'CAMPAIGN' ? 'brand' : 'lake'}>
            {page.ownerType === 'CAMPAIGN' ? 'Campaign' : 'Partner page'}
          </Badge>
          <ProvenanceBadge provenance={page.provenance} />
        </div>

        <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-ink-900">{page.title}</h1>
        <p className="mt-1 text-[15px] text-ink-700">{page.tagline}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={bookingUrl}
            target={bookingIsExternal ? '_blank' : undefined}
            rel={bookingIsExternal ? 'noopener noreferrer' : undefined}
            className="inline-block rounded-md bg-brand-700 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600"
          >
            {page.ownerType === 'BUSINESS' ? 'Enquire / book' : 'Plan your visit'}
          </a>
          <LandingPageShare slug={page.slug} url={pageUrl} title={page.title} recordShare={recordLandingPageShare} />
        </div>

        <div className="mt-6 space-y-5">
          {page.sections
            .filter((section) => section.body.trim().length > 0)
            .map((section) => {
              const items = section.body.split('\n').filter(Boolean);
              const isList = section.key !== 'about';
              return (
                <Card key={section.key}>
                  <CardBody className="pt-4">
                    <h2 className="text-[15px] font-semibold text-ink-900">{section.heading}</h2>
                    {isList ? (
                      <ul className="mt-2 space-y-1.5">
                        {items.map((line, index) => (
                          <li key={index} className="flex gap-2 text-[13px] text-ink-700">
                            <span aria-hidden className="text-brand-600">
                              ·
                            </span>
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[14px] leading-relaxed text-ink-700">{section.body}</p>
                    )}
                  </CardBody>
                </Card>
              );
            })}
        </div>
        
        <MediaGalleryLightbox media={page.galleryMedia} />

        {page.hashtags.length > 0 ? (
          <p className="mt-5 text-[12px] text-ink-500">{page.hashtags.join(' ')}</p>
        ) : null}

        <p className="mt-6 text-[11px] text-ink-400">
          Generated with AI assistance ({page.generatedBy}) from verified platform data. Built on mTour Agent
          Manipur.
        </p>
      </div>
    </div>
  );
}
