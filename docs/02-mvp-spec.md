# 02 — MVP Specification

## MVP boundary

The MVP is a polished hackathon prototype, not a production tourism marketplace. The primary objective is to make one end-to-end campaign journey work reliably.

## Interface map

### Explore Manipur — 6 screens
- E1 Home / AI Planner
- E2 AI Journey
- E3 Destination Experience
- E4 AR / Living Heritage
- E5 Local Experiences
- E6 Live Trip + Feedback

### Decision Room — 5 screens
- G1 Tourism Pulse
- G2 Destination Intelligence
- G3 Issues & Sentiment
- G4 Campaign & Creator Command
- G5 Ask the Decision Room

### Create for Manipur — 5 screens
- C1 Creator Dashboard
- C2 Campaign Discovery
- C3 AI Creator Studio
- C4 Campaign Submission
- C5 Analytics & Earnings

---

# Explore Manipur

## E1 — Home / AI Planner

### Goal
Provide an immediate natural-language entry point.

### Required components
- hero/background image or lightweight visual treatment
- free-text trip request input
- optional chips for duration, interest, budget
- Plan My Journey CTA
- suggested prompts
- small trending-destinations strip

### Example input
> I have 3 days, love nature, culture and local food, and prefer less crowded places.

### Output
A trip profile object:
- duration
- budget
- interests
- crowd preference
- accessibility needs if provided
- inferred travel style

## E2 — AI Journey

### Goal
Show a personalized, explainable itinerary.

### Required
- 3-day itinerary for demo
- route order
- estimated time at destination
- travel-time indication
- explanation for each recommendation
- alternative option
- save itinerary

### Example explanation
> Recommended because you selected nature + culture and prefer less crowded experiences.

## E3 — Destination Experience

### Goal
Turn a location into a content-rich experience.

### Required
- hero image
- destination metadata
- why it matters
- short history/culture/eco content
- nearby experiences
- Ask AI CTA
- AR/Living Heritage CTA
- verified knowledge/source badge

## E4 — AR / Living Heritage

### Goal
Provide the visual wow moment.

### MVP implementation
A polished AR-style experience is sufficient for the hackathon. It can use:
- camera/image target;
- fixed visual overlays;
- timeline/cards;
- audio narration;
- historical reconstruction/mock overlay.

Do not block the demo on production-grade spatial AR.

### Required
- one selected destination
- one visual overlay
- one story
- one “ask about this” interaction
- source/verified label

## E5 — Local Experiences

### Goal
Connect tourists to local economic participation.

### Required
- experience cards
- category filter
- host/provider
- price
- duration
- verification badge
- enquiry/book CTA (mock)

Categories:
- food
- handloom/craft
- culture
- nature
- photography
- homestay

## E6 — Live Trip + Feedback

### Goal
Collect a tourism signal from the tourist journey.

### Required
- today/upcoming itinerary
- destination status
- one adaptive-trip recommendation
- feedback form
- rating
- short text feedback
- optional destination check-in

---

# Decision Room

## G1 — Tourism Pulse

### Goal
Single-screen summary for senior officers.

### Required KPI cards
1. Platform-observed tourism activity
2. 7/30-day trend
3. Destination demand index
4. Tourist satisfaction
5. Tourism concentration index
6. Open issues

### Required sections
- Manipur map
- AI insights
- notable alerts
- provenance indicators

### Important
Metrics must identify whether they are official, observed, partner-reported, synthetic, estimated or forecast.

## G2 — Destination Intelligence

### Goal
Compare and drill into destinations.

### Required
- destination table/map
- interest
- trend
- capacity signal
- sentiment
- recommended action
- destination detail drawer/page

## G3 — Issues & Sentiment

### Goal
Identify operational problems from tourist feedback.

### Required
- category chart
- trend
- district/destination filtering
- AI issue summary
- anonymized supporting feedback
- recommendation

## G4 — Campaign & Creator Command

### Goal
Let the department launch and measure creator campaigns.

### Required
- create campaign form
- campaign objective
- destination
- audience
- platforms
- reward pool
- deadline
- AI creator matching
- creator shortlist

## G5 — Ask the Decision Room

### Goal
Natural-language decision support.

### Required suggested queries
- Which destinations are growing fastest?
- What should we promote next month?
- Why did destination demand change?
- What are tourists complaining about?
- Which destinations have spare capacity?
- Which creators are best for this campaign?
- Did the last campaign work?
- What happens if we promote this destination to an additional 5,000 visitors?

### Answer structure
- direct answer
- evidence
- recommendation
- confidence
- source/provenance
- chart/table when useful

---

# Create for Manipur

## C1 — Creator Dashboard

### Required
- creator identity
- creator score (demo)
- campaign count
- reach/verified interactions (demo)
- earnings (demo)
- recommended campaigns

## C2 — Campaign Discovery

### Required
- campaign cards
- objective
- target audience
- reward
- deadline
- content requirement
- approved information
- Apply CTA

## C3 — AI Creator Studio

### Required
- generate campaign concept
- generate hook
- story structure
- verified facts
- caption idea
- CTA
- hashtag suggestions

## C4 — Campaign Submission

### Required
- upload or mock content URL
- caption
- disclosure
- submit for review
- status

## C5 — Analytics & Earnings

### Required
- views/reach (demo if needed)
- tourism page visits
- itinerary additions
- verified check-ins
- bookings (demo if needed)
- campaign reward
- performance summary

---

# Cross-cutting MVP components

## Shared destination knowledge
Each destination has:
- id
- name
- district
- coordinates
- category
- short description
- verified facts
- heritage/culture tags
- eco/sensitivity flag
- estimated/declared capacity signal if available

## Shared campaign
Each campaign has:
- objective
- destination(s)
- audience
- platforms
- budget/reward
- start/end date
- required content
- verified knowledge pack
- status

## Shared tourism signals
Supported event types:
- SEARCH
- ITINERARY_ADD
- DESTINATION_VIEW
- NAVIGATION_START
- QR_CHECKIN
- BOOKING
- REVIEW
- FEEDBACK

## Demo mode
The application should include a development/demo mode that:
- seeds deterministic data;
- labels synthetic metrics;
- resets to a known state;
- provides stable AI responses for critical demo questions when desired;
- avoids dependence on live external APIs.
