import { generateHeroImage } from '@/lib/ai/image-provider';
import { narrate } from '@/lib/ai/provider';
import { PROMPTS } from '@/lib/ai/prompts';
import { formatPeriod } from '@/lib/date';
import { BUSINESS_TYPE_LABEL, EVENT_CATEGORY_LABEL } from '@/lib/types';
import type { LandingPageSection } from '@/lib/types';
import {
  getBusiness,
  getCampaign,
  getDestination,
  getEvent,
  getFactsFor,
} from '@/server/data/repository';

/**
 * Deterministic content assembly for a landing page, in the shape
 * src/server/ai/creator-studio.ts already established: every fact comes from
 * application code and real data, and narrate() is asked only to write the
 * one "about" paragraph, with everything else passed as evidence it must stay
 * inside. The hero image is a separate, best-effort call — see
 * src/lib/ai/image-provider.ts for why it can never block the page.
 */

export interface LandingPageDraft {
  title: string;
  tagline: string;
  sections: LandingPageSection[];
  hashtags: string[];
  heroImageUrl?: string;
  bookingUrl?: string;
  generatedBy: string;
}

const HASHTAG_BASE = ['ExploreManipur', 'ManipurTourism'];

const toHashtag = (value: string): string =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join('');

const hashtagsFor = (extra: string[]): string[] =>
  [...HASHTAG_BASE, ...extra.map(toHashtag)]
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 8)
    .map((tag) => `#${tag}`);

export async function generateBusinessLandingContent(businessId: string): Promise<LandingPageDraft | undefined> {
  const business = getBusiness(businessId);
  if (!business) return undefined;
  const destination = getDestination(business.destinationId);
  const typeLabel = BUSINESS_TYPE_LABEL[business.businessType];

  const tagline = destination
    ? `${typeLabel} in ${destination.name}, ${business.district}.`
    : `${typeLabel} in ${business.district}.`;

  const deterministicAbout =
    business.description ??
    (destination
      ? `${business.name} is a ${typeLabel.toLowerCase()} at ${destination.name}, ${business.district}. ${destination.summary}`
      : `${business.name} is a ${typeLabel.toLowerCase()} in ${business.district}, Manipur.`);

  const highlightLines = [
    business.description ?? `A ${typeLabel.toLowerCase()} in ${business.district}`,
    business.verified ? 'Verified partner on OneStop Manipur' : undefined,
    destination ? `Close to ${destination.name}` : undefined,
    ...(destination?.category.slice(0, 2).map((category) => `Good for ${category} travel`) ?? []),
  ].filter((line): line is string => Boolean(line));

  const practicalLines = [
    business.rate
      ? `₹${business.rate.amount.toLocaleString('en-IN')} per ${business.rate.covers.toLowerCase()} per ${business.rate.unit.toLowerCase()}${business.rate.note ? `, ${business.rate.note}` : ''}`
      : undefined,
    `${business.district} district, Manipur`,
    'Enquire on OneStop Manipur to check availability',
  ].filter((line): line is string => Boolean(line));

  const narration = await narrate({
    promptId: PROMPTS.landingPageCopy.id,
    system: PROMPTS.landingPageCopy.system,
    deterministicText: deterministicAbout,
    evidence: {
      business: { name: business.name, type: typeLabel, district: business.district, verified: business.verified },
      destination: destination ? { name: destination.name, summary: destination.summary } : undefined,
    },
    task: 'Write the about paragraph for this partner\'s landing page.',
    maxTokens: 260,
  });

  const heroImage = await generateHeroImage({
    prompt: `A warm, editorial travel photograph of ${business.name}, a ${typeLabel.toLowerCase()} at ${destination?.name ?? business.district} in Manipur, India. Natural light, no text, no logos, no people's faces in close-up.`,
  });

  return {
    title: business.name,
    tagline,
    sections: [
      { key: 'about', heading: 'About', body: narration.text },
      { key: 'highlights', heading: 'What guests can expect', body: highlightLines.join('\n') },
      { key: 'practical', heading: 'Good to know', body: practicalLines.join('\n') },
    ],
    hashtags: hashtagsFor([typeLabel, business.district, ...(destination?.category.slice(0, 2) ?? [])]),
    ...(heroImage.dataUrl ? { heroImageUrl: heroImage.dataUrl } : {}),
    generatedBy: narration.fallback ? `${narration.provider} (fallback)` : narration.provider,
  };
}

export interface CampaignLandingInput {
  /** Links this page to a creator campaign, when one applies. */
  campaignId?: string;
  /** Links this page to a festival or event, when one applies. */
  eventId?: string;
  /** Used when neither id resolves to a title of its own. */
  titleOverride?: string;
}

export async function generateCampaignLandingContent(
  input: CampaignLandingInput,
): Promise<LandingPageDraft | undefined> {
  const campaign = input.campaignId ? getCampaign(input.campaignId) : undefined;
  const event = input.eventId ? getEvent(input.eventId) : undefined;
  if (!campaign && !event && !input.titleOverride) return undefined;

  const destinationId = event?.destinationId ?? campaign?.destinationId;
  const destination = destinationId ? getDestination(destinationId) : undefined;
  const facts = destination ? getFactsFor(destination.id).slice(0, 2) : [];

  const title = event?.name ?? campaign?.name ?? input.titleOverride ?? 'Manipur tourism campaign';

  const admissionLabel = {
    FREE: 'Free admission',
    REGISTRATION: 'Registration required',
    TICKETED: event?.ticketPrice ? `₹${event.ticketPrice.toLocaleString('en-IN')} per person` : 'Ticketed',
  } as const;

  const tagline = event
    ? `${EVENT_CATEGORY_LABEL[event.category]} · ${formatPeriod(event.startAt, event.endAt)}${destination ? ` · ${destination.name}` : ''}`
    : campaign
      ? `${campaign.objective.split('.')[0]}.`
      : `A Manipur Tourism campaign.`;

  const deterministicAbout = event
    ? `${event.description}${event.datesProvisional ? ' Dates are provisional and announced by the department each year.' : ''}`
    : campaign
      ? `${campaign.objective} ${destination ? `Centred on ${destination.name}, ${destination.district}.` : ''}`
      : `${title}, a Manipur Tourism campaign.`;

  const highlightLines = event
    ? [
        `${EVENT_CATEGORY_LABEL[event.category]} at ${event.venue ?? destination?.name ?? 'venues across Manipur'}`,
        event.organiser ? `Organised by ${event.organiser}` : undefined,
        admissionLabel[event.admission],
        ...facts.slice(0, 1).map((fact) => fact.title),
      ].filter((line): line is string => Boolean(line))
    : campaign
      ? [
          `Themes: ${campaign.themes.join(', ') || 'general tourism promotion'}`,
          `Audience: ${campaign.targetAudience}`,
          ...facts.slice(0, 1).map((fact) => fact.title),
        ]
      : [];

  const practicalLines = event
    ? [
        `${formatPeriod(event.startAt, event.endAt)}${event.datesProvisional ? ' (dates provisional)' : ''}`,
        event.venue ?? (destination ? `${destination.name}, ${destination.district}` : undefined),
        admissionLabel[event.admission],
        event.organiser,
      ].filter((line): line is string => Boolean(line))
    : campaign
      ? [
          `${campaign.startDate} to ${campaign.endDate}`,
          destination ? `${destination.name}, ${destination.district}` : undefined,
          campaign.createdBy,
        ].filter((line): line is string => Boolean(line))
      : [];

  const narration = await narrate({
    promptId: PROMPTS.landingPageCopy.id,
    system: PROMPTS.landingPageCopy.system,
    deterministicText: deterministicAbout,
    evidence: {
      event: event
        ? { name: event.name, category: event.category, venue: event.venue, description: event.description }
        : undefined,
      campaign: campaign ? { name: campaign.name, objective: campaign.objective } : undefined,
      destination: destination ? { name: destination.name, summary: destination.summary } : undefined,
    },
    task: 'Write the about paragraph for this campaign landing page.',
    maxTokens: 260,
  });

  const heroImage = await generateHeroImage({
    prompt: `A vivid, editorial photograph capturing the spirit of ${title}${destination ? ` at ${destination.name}, Manipur, India` : ', Manipur, India'}. Festive but tasteful, natural light, no text, no logos.`,
  });

  return {
    title,
    tagline,
    sections: [
      { key: 'about', heading: 'About', body: narration.text },
      { key: 'highlights', heading: "What's on", body: highlightLines.join('\n') },
      { key: 'practical', heading: 'Good to know', body: practicalLines.join('\n') },
    ],
    hashtags: hashtagsFor([
      event ? EVENT_CATEGORY_LABEL[event.category] : undefined,
      ...(campaign?.themes ?? []),
      destination?.name,
    ].filter((value): value is string => Boolean(value))),
    ...(heroImage.dataUrl ? { heroImageUrl: heroImage.dataUrl } : {}),
    generatedBy: narration.fallback ? `${narration.provider} (fallback)` : narration.provider,
  };
}
