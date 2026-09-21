import { narrate } from '@/lib/ai/provider';
import { PROMPTS } from '@/lib/ai/prompts';
import { formatLongDate } from '@/lib/date';
import type { Campaign, Creator, VerifiedFact } from '@/lib/types';
import {
  getCampaign,
  getCreator,
  getDestination,
  getExperiencesFor,
  getFactsFor,
  getKnowledgeDocuments,
} from '@/server/data/repository';

/**
 * AI Creator Studio (C3).
 *
 * The brief is assembled from the campaign record plus the verified knowledge
 * for its destination, so a creator cannot be handed a claim the Tourism
 * Department has not verified. Responsible visit guidance is attached
 * automatically for sensitive destinations rather than left to the creator.
 */

export interface ContentBrief {
  campaign: Campaign;
  creator?: Creator;
  destinationName: string;
  concept: string;
  angle: string;
  hooks: string[];
  storyStructure: { beat: string; direction: string; seconds: number }[];
  verifiedFacts: VerifiedFact[];
  caption: string;
  callToAction: string;
  hashtags: string[];
  responsibleGuidance: string[];
  doNotClaim: string[];
  disclosure: string;
  localBusinessesToFeature: { name: string; why: string }[];
  generatedBy: string;
  generatedAt: string;
}

const HASHTAG_BASE = ['ExploreManipur', 'ManipurTourism', 'NortheastIndia'];

const toHashtag = (value: string): string =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join('');

export async function generateContentBrief(
  campaignId: string,
  creatorId?: string,
): Promise<ContentBrief | undefined> {
  const campaign = getCampaign(campaignId);
  if (!campaign) return undefined;

  const destination = getDestination(campaign.destinationId);
  if (!destination) return undefined;

  const creator = creatorId ? getCreator(creatorId) : undefined;
  const facts = getFactsFor(destination.id);

  // Practical facts make weak content but strong captions, so they are kept
  // separate from the narrative facts.
  const narrativeFacts = facts.filter((fact) => fact.factType !== 'PRACTICAL').slice(0, 4);
  const practicalFacts = facts.filter((fact) => fact.factType === 'PRACTICAL');

  const sharedThemes = creator
    ? creator.categories.filter((category) =>
        [...campaign.themes, ...destination.category].some(
          (theme) => theme.toLowerCase() === category.toLowerCase(),
        ),
      )
    : campaign.themes;

  const lead = narrativeFacts[0];
  const second = narrativeFacts[1];

  const angle = creator
    ? `Your ${sharedThemes.slice(0, 2).join(' and ') || 'travel'} audience, pointed at what makes ${destination.name} specific rather than scenic.`
    : `What makes ${destination.name} specific rather than scenic.`;

  const concept = [
    `${campaign.name} asks for ${campaign.contentRequirement.toLowerCase()}.`,
    lead
      ? `Build it on one idea: ${lead.title.toLowerCase()}.`
      : `Build it on what the destination is for, not on drone shots.`,
    `Open on the thing a visitor would walk past, explain why it matters, and close on how to visit it properly.`,
  ].join(' ');

  const hooks = [
    lead ? `"${lead.title}" — say it in the first three seconds, then show it.` : `Open on ${destination.name} at the hour nobody films it.`,
    second ? `"Most people photograph this. Almost nobody knows ${second.title.toLowerCase()}."` : `"${destination.name} is not what the photographs suggest."`,
    `"${campaign.targetAudience.split(' ').slice(0, 4).join(' ')} — this one is for you." Then earn it in the next five seconds.`,
  ];

  const totalSeconds = /90/.test(campaign.contentRequirement) ? 90 : 60;
  const storyStructure = [
    {
      beat: 'Hook',
      direction: lead
        ? `Lead with ${lead.title.toLowerCase()}. No preamble, no logo card.`
        : 'Open on the strongest single frame you have, with a claim over it.',
      seconds: Math.round(totalSeconds * 0.08),
    },
    {
      beat: 'Place',
      direction: `Establish ${destination.name} in ${destination.district}. One wide, one detail, one person.`,
      seconds: Math.round(totalSeconds * 0.17),
    },
    {
      beat: 'The idea',
      direction: lead ? lead.text.slice(0, 160) : destination.summary,
      seconds: Math.round(totalSeconds * 0.3),
    },
    {
      beat: 'The people',
      direction: 'Put a host, guide or maker on camera saying one true sentence about their own work.',
      seconds: Math.round(totalSeconds * 0.25),
    },
    {
      beat: 'How to go',
      direction: practicalFacts[0]
        ? practicalFacts[0].text.slice(0, 160)
        : 'Give the practical detail a viewer needs to actually make the trip.',
      seconds: Math.round(totalSeconds * 0.2),
    },
  ];

  const experiences = getExperiencesFor(destination.id)
    .filter((experience) => experience.verified && experience.availabilityStatus !== 'UNAVAILABLE')
    .slice(0, 3);

  const responsibleGuidance: string[] = [];
  if (destination.ecoSensitivity === 'HIGH') {
    const guidanceDoc = getKnowledgeDocuments().find((document) =>
      document.destinationIds.includes(destination.id) && document.tags.includes('sustainability'),
    );
    responsibleGuidance.push(
      'This destination is flagged as ecologically sensitive. Put the responsible visit guidance in the video itself, not only in the caption.',
    );
    if (guidanceDoc) responsibleGuidance.push(guidanceDoc.text.slice(0, 220));
  }
  const communityDoc = getKnowledgeDocuments().find(
    (document) => document.destinationIds.includes(destination.id) && document.tags.includes('community'),
  );
  if (communityDoc) {
    responsibleGuidance.push(
      'Name the hosting arrangement. Village visits here are arranged through a local host, and saying so sets the right expectation.',
    );
  }
  if (destination.accessibilityNotes) {
    responsibleGuidance.push(`Access note worth including: ${destination.accessibilityNotes}`);
  }

  const doNotClaim = [
    'Do not quote visitor numbers. No official arrivals figure is connected to this platform.',
    'Do not present oral tradition as documented history. The facts below are labelled.',
    'Do not promise availability or prices you have not confirmed with the provider.',
  ];

  const hashtags = [
    ...HASHTAG_BASE,
    toHashtag(destination.name),
    toHashtag(destination.district),
    ...campaign.themes.map(toHashtag),
  ]
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 8)
    .map((tag) => `#${tag}`);

  const caption = [
    lead ? `${lead.title}.` : `${destination.name}, ${destination.district}.`,
    destination.summary,
    practicalFacts[0] ? practicalFacts[0].text.split('.')[0] + '.' : '',
    `Plan it on Explore Manipur.`,
  ]
    .filter(Boolean)
    .join(' ');

  const callToAction = `Send this to whoever you would take. Full route and local experiences on Explore Manipur.`;

  const disclosure = `Paid partnership with Manipur Tourism — ${campaign.name}. Required on every post before review.`;

  const deterministicConcept = concept;
  const narration = await narrate({
    promptId: PROMPTS.creatorStudio.id,
    system: PROMPTS.creatorStudio.system,
    deterministicText: deterministicConcept,
    evidence: {
      campaign: {
        name: campaign.name,
        objective: campaign.objective,
        audience: campaign.targetAudience,
        requirement: campaign.contentRequirement,
        deadline: formatLongDate(campaign.endDate),
      },
      destination: { name: destination.name, district: destination.district, summary: destination.summary },
      facts: narrativeFacts.map((fact) => ({ title: fact.title, text: fact.text, factType: fact.factType })),
      responsibleGuidance,
    },
    task: 'Write the campaign concept paragraph for the creator, in two or three sentences.',
    maxTokens: 300,
  });

  return {
    campaign,
    creator,
    destinationName: destination.name,
    concept: narration.text,
    angle,
    hooks,
    storyStructure,
    verifiedFacts: narrativeFacts,
    caption,
    callToAction,
    hashtags,
    responsibleGuidance,
    doNotClaim,
    disclosure,
    localBusinessesToFeature: experiences.map((experience) => ({
      name: experience.title,
      why: `Verified local provider, ${experience.durationMinutes} minutes, from ₹${experience.price}. Featuring it sends viewers to someone who can actually host them.`,
    })),
    generatedBy: narration.fallback ? `${narration.provider} (fallback)` : narration.provider,
    generatedAt: new Date().toISOString(),
  };
}
