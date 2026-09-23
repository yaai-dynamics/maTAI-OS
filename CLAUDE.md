# OneStop Manipur — Claude Code Instructions

## 1. Mission

Build a hackathon-ready, production-minded MVP called **OneStop Manipur** (Manipur Tourism Intelligence Platform).

The platform connects three primary roles through one shared tourism intelligence/data layer:

1. **Explore Manipur** — tourist experience
2. **Decision Room** — Tourism Department command center
3. **Create for Manipur** — creator/influencer campaign hub

The core product promise is:

> Government can manage and promote tourism, creators can create and earn, and tourists can discover and experience Manipur through one shared tourism intelligence layer.

The project is being developed for the **Re-Imagining Manipur — Hackathon 2026** tourism challenge. The MVP must prioritize a reliable 5-minute live demo over feature breadth.

## 2. Source of truth

Read these files before making substantial product decisions:

- `docs/01-product-vision.md`
- `docs/02-mvp-spec.md`
- `docs/03-user-flows.md`
- `docs/04-data-model.md`
- `docs/05-ai-spec.md`
- `docs/06-design-system.md`
- `docs/07-demo-script.md`
- `docs/08-roadmap.md`

When the chat history conflicts with these files, these files are the current source of truth unless the user explicitly changes a requirement.

## 3. Product principles

- Build one integrated product, not three disconnected apps.
- Tourist, government and creator experiences must share entities and data.
- AI must be grounded in structured/demo data and verified knowledge; do not invent tourism metrics.
- Clearly distinguish official data, partner-reported data, platform-observed signals, synthetic demo data, estimates and forecasts.
- The hackathon demo must work offline or with predictable local/mock services whenever possible.
- Prefer a polished narrow workflow over broad unfinished features.
- Avoid over-engineering. Implement the simplest architecture that supports the defined MVP and a credible post-hackathon path.
- Use realistic Manipur content and names; do not fabricate historical facts as official truth.
- All prototype numbers must be labelled as demo/prototype data where they are not from live/official sources.
- Design for privacy: use aggregated/anonymized tourism signals in government views.

## 4. MVP interfaces

### Explore Manipur
Primary screens:
- E1 Home / AI Planner
- E2 AI Journey
- E3 Destination Experience
- E4 AR / Living Heritage
- E5 Local Experiences
- E6 Live Trip + Feedback

### Decision Room
Primary screens:
- G1 Tourism Pulse
- G2 Destination Intelligence
- G3 Issues & Sentiment
- G4 Campaign & Creator Command
- G5 Ask the Decision Room

### Create for Manipur
Primary screens:
- C1 Creator Dashboard
- C2 Campaign Discovery
- C3 AI Creator Studio
- C4 Campaign Submission
- C5 Analytics & Earnings

## 5. Hackathon demo priorities

The live 5-minute demo flow is:

G1 → G5 → G4 → C2 → C3 → E1 → E2 → E3 → E4 → E6 → G3 → G5 → final ecosystem screen

The detailed wording is in `docs/07-demo-script.md`.

## 6. Tech stack guidance

Use the repository's existing stack if one already exists. If starting from an empty repository, default to:

- Next.js (App Router) + TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma or Drizzle ORM
- Zod for validation
- A server-side API/tool layer for analytics and AI calls
- pgvector only if/when semantic retrieval is needed
- Claude or OpenAI API via a server-side provider abstraction
- Leaflet/MapLibre or another practical map library for prototype mapping

Do not hard-code vendor-specific AI calls throughout the UI. Create a small `ai`/provider abstraction.

## 7. AI implementation rules

- Use deterministic application functions for calculations, filtering, comparisons and aggregations.
- Use the LLM for natural-language understanding, tool selection, explanation, synthesis, recommendations and content drafting.
- Never let the LLM invent KPI values.
- Every government insight should support:
  - answer
  - evidence
  - recommendation when appropriate
  - confidence
  - source/provenance labels
- For simulation/demo scenarios, use explicit simulation functions with controlled inputs.
- Treat historical/official data and synthetic/demo data differently in storage and UI.
- Keep prompts versioned in code or a prompts directory.

## 8. Data provenance labels

Supported labels:
- OFFICIAL
- PARTNER_REPORTED
- PLATFORM_OBSERVED
- PUBLIC_EXTERNAL
- DEMO_SYNTHETIC
- ESTIMATED
- FORECAST

Government UI should expose the provenance of important numbers.

## 9. Security and privacy

- Never expose secrets to the browser.
- Keep API keys server-side.
- Avoid storing unnecessary personal data.
- Use anonymous/session identifiers for prototype tourist signals.
- Government analytics should use aggregation by default.
- Add a consent flag for location/check-in based signals.
- Do not claim official government integration unless an actual integration exists.

## 10. UX rules

- Tourist UI: mobile-first, visual, conversational, minimal friction.
- Government UI: desktop-first, information-dense but readable, evidence-first.
- Creator UI: desktop/mobile responsive, campaign/task oriented.
- Use consistent destination cards and campaign cards across roles.
- Always show loading, empty, error and demo-data states.
- Avoid dark patterns.
- Prefer meaningful animations only where they support the demo.

## 11. What is explicitly out of MVP scope

Do not build unless explicitly requested:
- full OTA/payment platform
- real hotel/channel-manager integrations
- live Instagram/YouTube campaign API integrations
- enterprise government SSO
- full AR SDK deployment for every destination
- complete GIS platform
- live statewide visitor counting
- production-grade creator payout processing
- social network/chat system
- large-scale recommendation ML training

## 12. Delivery discipline

When implementing:
1. Inspect the repository before changing architecture.
2. Build shared types/data access first.
3. Implement the demo path end-to-end before secondary screens.
4. Use seed data from `/data`.
5. Keep demo data visibly marked in development mode.
6. Add basic tests for core analytics and AI tool functions.
7. Run lint/typecheck/tests/build before declaring an implementation complete.
8. Update relevant docs when a deliberate product decision changes.

## 13. Definition of done for the hackathon

The prototype is successful when a reviewer can:

- understand the three-role ecosystem in under 60 seconds;
- ask a government question and receive an evidence-backed answer;
- create a campaign and match creators;
- open a creator campaign and generate a content brief;
- switch to a tourist and generate a personalized Manipur journey;
- view a destination story and one AR/living-heritage experience;
- submit tourist feedback;
- see the resulting signal in the government experience;
- ask whether the campaign worked;
- understand what data is observed vs synthetic/estimated.
