# 05 — AI Specification

## AI role

AI is the reasoning and interaction layer over structured tourism data, verified knowledge and deterministic analytics.

It is not the system of record.

## AI capabilities

### 1. Tourist planner
Inputs:
- duration
- budget
- interests
- crowd preference
- accessibility needs
- starting point

Outputs:
- trip profile
- itinerary
- recommendation rationale
- alternatives

### 2. Destination storyteller
Answers questions about a destination using the verified tourism knowledge base.

Rules:
- retrieve grounded facts first;
- identify uncertainty;
- distinguish verified history from folklore/oral tradition where relevant;
- do not invent claims.

### 3. Government analyst
Uses tools rather than free-form arithmetic.

Tools:
- `getDestinationMetrics`
- `compareDestinations`
- `getSentimentSummary`
- `getAccommodationCapacity`
- `getCampaignMetrics`
- `recommendCampaignTargets`
- `simulateCampaign`
- `searchOfficialDocuments`

### 4. Creator assistant
Uses campaign metadata + verified knowledge to generate:
- content angles
- hooks
- story structures
- captions
- CTAs
- platform variants

### 5. Campaign matching
Rank creators based on deterministic/profile signals first, then use AI to explain the match.

Example factors:
- category match
- language match
- target audience match
- past tourism performance
- geography
- campaign format fit

Do not make opaque decisions solely from an LLM.

---

# Decision Room answer contract

Every answer should follow approximately:

```json
{
  "answer": "...",
  "evidence": [
    {
      "label": "...",
      "value": "...",
      "source": "...",
      "provenance": "PLATFORM_OBSERVED"
    }
  ],
  "recommendation": "...",
  "confidence": "HIGH|MEDIUM|LOW",
  "caveats": ["..."],
  "nextActions": ["..."]
}
```

If the question does not support a recommendation, omit it.

## Confidence guidance

### HIGH
- strong official/verified data
- consistent sources
- sufficient sample size

### MEDIUM
- multiple partner/platform signals
- reasonable sample but incomplete coverage

### LOW
- sparse data
- mostly inferred or synthetic information

Never use confidence to make a weak claim appear stronger.

---

# Government question routing

### Question: “Which destinations are growing fastest?”

Use:
1. `getDestinationMetrics`
2. calculate growth rate deterministically
3. rank destinations
4. ask LLM to explain

### Question: “Why did destination demand change?”

Use:
1. trend metrics
2. event calendar
3. sentiment changes
4. accommodation/capacity
5. campaign metrics
6. public/external signals if available

Then classify causal statements carefully:
- “associated with”
- “likely contributed”
- “insufficient evidence to determine cause”

### Question: “What should we promote?”

Use:
1. destination demand
2. capacity
3. crowd/concentration
4. sentiment
5. campaign priorities
6. sustainability indicators

Return ranked recommendations with evidence.

### Question: “Did the campaign work?”

Use campaign funnel:
- views
- tourism page visits
- itinerary additions
- check-ins
- bookings if available
- sentiment

Do not call this causal attribution unless a proper comparison/experiment exists.

### Question: “What if we add 5,000 visitors?”

Call `simulateCampaign` with controlled assumptions.
Return:
- estimated visitor load
- accommodation pressure
- transport pressure
- indicative local-business demand
- uncertainty range
- mitigation options

Clearly label results as simulation/forecast.

---

# Retrieval architecture

Use hybrid retrieval where useful:

```text
User question
  ↓
Intent classification
  ↓
Tool/data query + document retrieval
  ↓
Deterministic analytics
  ↓
Evidence package
  ↓
LLM synthesis
  ↓
Structured response
```

## Knowledge sources for prototype

Prefer:
- Manipur Tourism official information
- government tourism documents supplied to the project
- curated destination records
- verified local knowledge entered by project admins

If internet access/source documents are unavailable at runtime, use local curated knowledge records rather than unsupported model memory.

---

# AI safety/content rules

- Avoid sensitive personal profiling.
- Do not expose private tourist data to government users.
- Do not infer individual identities from anonymous signals.
- Avoid unsupported crowd estimates.
- Do not fabricate official statistics.
- Never describe synthetic demo data as live data.
- Cultural/history content should include source or verification state.
- Avoid culturally insensitive or stereotyped language.
