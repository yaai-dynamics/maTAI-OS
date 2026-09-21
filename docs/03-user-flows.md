# 03 — User Flows

## A. Tourist flow

```text
Home
  ↓
Enter natural-language trip request
  ↓
AI extracts preferences
  ↓
AI Journey
  ↓
Select destination
  ↓
Destination Experience
  ↓
Living Heritage / AR
  ↓
Local Experience
  ↓
Live Trip
  ↓
Check-in / interaction
  ↓
Feedback
  ↓
Tourism signal stored
```

### Core demo persona

**Name:** Ananya

**Trip:** 3 days

**Interests:** nature + culture + local food

**Preference:** avoid crowded places

### Tourist success condition

The user gets a coherent, explainable itinerary in under 30 seconds and can understand why each recommendation was made.

---

## B. Government flow

```text
Tourism Pulse
  ↓
Ask the Decision Room
  ↓
Question: which destination should we promote?
  ↓
Tool: compare destinations
  ↓
Evidence
  ↓
Recommendation
  ↓
Create campaign
  ↓
AI creator matching
  ↓
Campaign monitoring
  ↓
Issues/sentiment
  ↓
Ask AI: did campaign work?
```

### Core demo persona

**Name:** Tourism Officer

**Goal:** diversify tourism demand and promote a less concentrated destination.

### Government success condition

The officer can move from a question to a defensible recommendation with evidence and a next action.

---

## C. Creator flow

```text
Creator Dashboard
  ↓
Campaign Discovery
  ↓
Open campaign
  ↓
Apply
  ↓
AI Creator Studio
  ↓
Generate brief/content concept
  ↓
Submit content
  ↓
Campaign analytics
  ↓
Earn reward
```

### Core demo persona

**Name:** Priya

**Niche:** nature + travel

**Audience:** Northeast + urban India

### Creator success condition

The creator understands why the campaign is relevant, gets a high-quality brief, and can see how performance connects to reward.

---

## D. End-to-end ecosystem flow

```text
Government identifies opportunity
        ↓
Government creates campaign
        ↓
AI recommends creators
        ↓
Creator accepts
        ↓
AI creates campaign brief
        ↓
Creator publishes content
        ↓
Tourist discovers destination
        ↓
Tourist plans trip
        ↓
Tourist experiences destination
        ↓
Tourist checks in / gives feedback
        ↓
Platform aggregates signals
        ↓
Government sees campaign impact
        ↓
Government decides next action
```

## E. Data provenance flow

Every signal should carry provenance.

```text
Official source        → OFFICIAL
Business integration   → PARTNER_REPORTED
Platform interaction   → PLATFORM_OBSERVED
Public web/API         → PUBLIC_EXTERNAL
Prototype seed         → DEMO_SYNTHETIC
Model output           → ESTIMATED / FORECAST
```

Never silently mix these categories.
