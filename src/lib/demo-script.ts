/**
 * The 5-minute demo path, from docs/07-demo-script.md.
 *
 * Held in code so the demo bar can walk it in order and so the running order
 * cannot drift from the document.
 */

export interface DemoStep {
  id: string;
  screen: string;
  href: string;
  title: string;
  /** Roughly where this sits in the five minutes. */
  timing: string;
  /** What to do on the screen. */
  action: string;
  /** What to say, condensed from the script. */
  say: string;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 'g1',
    screen: 'G1',
    href: '/gov',
    title: 'Tourism Pulse',
    timing: '0:00',
    action: 'Open on the command centre.',
    say: 'Tourism information is fragmented across tourists, local businesses and the department. This is one intelligence layer connecting all three.',
  },
  {
    id: 'g5-promote',
    screen: 'G5',
    href: '/gov/ask?q=promote',
    title: 'Ask: what should we promote?',
    timing: '0:30',
    action: 'Ask which destination to promote to diversify demand.',
    say: 'The recommendation is not the point. The evidence behind it is: demand, capacity and concentration, each with its source.',
  },
  {
    id: 'g4',
    screen: 'G4',
    href: '/gov/campaigns',
    title: 'Create the campaign',
    timing: '1:10',
    action: 'Open the Discover Ukhrul draft and launch it.',
    say: 'Instead of hunting for influencers, the platform matches creators on category, audience and previous tourism outcomes.',
  },
  {
    id: 'c2',
    screen: 'C2',
    href: '/creator/campaigns',
    title: 'Creator finds the campaign',
    timing: '1:35',
    action: 'Switch to the creator. Open Discover Ukhrul and apply.',
    say: 'Now I am a creator. The campaign tells me the objective, the audience, what content is needed, the deadline and the reward.',
  },
  {
    id: 'c3',
    screen: 'C3',
    href: '/creator/studio',
    title: 'AI Creator Studio',
    timing: '2:10',
    action: 'Generate the content brief.',
    say: 'The brief comes with verified facts from the department knowledge base, so creators move fast without inventing claims.',
  },
  {
    id: 'e1',
    screen: 'E1',
    href: '/explore',
    title: 'Tourist plans a trip',
    timing: '2:35',
    action: 'Enter the three-day request and plan the journey.',
    say: 'That content reaches a traveller, who arrives here.',
  },
  {
    id: 'e2',
    screen: 'E2',
    href: '/explore/journey',
    title: 'The journey',
    timing: '3:05',
    action: 'Show the itinerary and the reason on each stop.',
    say: 'Not a list of attractions. A journey built from stated preferences, with the reason attached to every recommendation.',
  },
  {
    id: 'e3',
    screen: 'E3',
    href: '/explore/destinations/dest-ukhrul',
    title: 'Destination experience',
    timing: '3:30',
    action: 'Open Ukhrul and ask the place a question.',
    say: 'We do not want visitors to arrive and take a photograph. We want them to understand the place.',
  },
  {
    id: 'e4',
    screen: 'E4',
    href: '/explore/destinations/dest-ukhrul/heritage',
    title: 'Living Heritage',
    timing: '3:45',
    action: 'Walk the heritage layers.',
    say: 'Each layer names the verified facts it draws on, so the story is traceable.',
  },
  {
    id: 'e6',
    screen: 'E6',
    href: '/explore/trip',
    title: 'Check in and give feedback',
    timing: '4:00',
    action: 'Check in, then submit the transport feedback.',
    say: 'And now the important part. This interaction is not lost. It becomes a tourism signal.',
  },
  {
    id: 'g3',
    screen: 'G3',
    href: '/gov/issues?destination=dest-ukhrul',
    title: 'The signal arrives',
    timing: '4:20',
    action: 'Show the Ukhrul transport issue with the new report highlighted.',
    say: 'The feedback given thirty seconds ago is now in the department view, counted and categorised.',
  },
  {
    id: 'g5-result',
    screen: 'G5',
    href: '/gov/ask?q=campaign',
    title: 'Ask: did it work?',
    timing: '4:35',
    action: 'Ask whether the Ukhrul campaign improved tourism interest.',
    say: 'The department can evaluate promotion across the whole journey, and the platform says plainly what is observed, reported or estimated.',
  },
  {
    id: 'close',
    screen: 'Close',
    href: '/ecosystem',
    title: 'The ecosystem',
    timing: '4:45',
    action: 'Show the loop.',
    say: 'Explore Manipur. Create for Manipur. Improve Manipur Tourism.',
  },
];

export const findStepIndex = (id: string): number => DEMO_STEPS.findIndex((step) => step.id === id);
