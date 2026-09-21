# 06 — Design System

## Design direction

The product should feel:

- modern
- trustworthy
- premium but local
- government credible
- tourism inspiring
- AI-native without looking like a generic chatbot

Use Manipur-inspired visual references subtly, without turning the UI into decorative folklore.

## Information architecture

### Public/tourist
- Home
- Journey
- Destinations
- Experiences
- Live Trip

### Government
- Pulse
- Destinations
- Issues
- Campaigns
- Ask AI

### Creator
- Dashboard
- Campaigns
- Studio
- Submissions
- Analytics

## Role-specific UI

### Tourist
Mobile-first.
Use large visual cards, map previews, short text, strong CTA buttons.

### Government
Desktop-first.
Use dense but structured cards, tables, trend indicators, maps, filters, evidence drawers.

### Creator
Responsive dashboard.
Campaign status and earnings should be easy to scan.

## Core components

- `DestinationCard`
- `DestinationHero`
- `JourneyTimeline`
- `ExperienceCard`
- `AIChatPanel`
- `EvidenceCard`
- `ConfidenceBadge`
- `ProvenanceBadge`
- `KPIStatCard`
- `TrendChip`
- `InsightCard`
- `CampaignCard`
- `CreatorCard`
- `CreatorMatchCard`
- `FeedbackCard`
- `TourismMap`
- `FilterBar`
- `DataSourceDrawer`

## Provenance badges

Use labels such as:

- Official
- Partner reported
- Platform observed
- Demo data
- Estimated
- Forecast

Do not rely on color alone. Include text.

## AI response design

Government answers must visually separate:

**Answer**

**Evidence**

**Recommendation**

**Confidence**

**Sources**

## Government dashboard density

Home screen hierarchy:

1. top navigation
2. six KPI cards
3. map
4. AI insights
5. trends/issues
6. source/provenance visibility

Avoid showing more than 8 major visual modules on the home screen.

## Maps

Use a restrained map style.

Destination status markers:
- healthy
- watch
- attention

Do not imply official capacity limits unless data exists.

## Typography

Use a clean contemporary sans-serif. Prioritize readable numbers and labels.

## Responsive rules

- Tourist: optimize 360–430px width first.
- Government: optimize 1280px+ first but ensure tablet use.
- Creator: optimize 1024px+ and mobile fallback.

## Accessibility

- keyboard focus states
- adequate contrast
- text labels for status
- captions/transcripts for audio/video
- meaningful alt text
- avoid color-only differentiation

## Motion

Use subtle motion for:
- AI loading
- map transitions
- campaign status
- itinerary progression

Avoid excessive animation.
