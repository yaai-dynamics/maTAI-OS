# 04 — Data Model

## Modeling approach

Use a relational core with clear ownership and provenance. Add vector search only for unstructured knowledge retrieval.

## Core entities

### District
- id
- name

### Destination
- id
- name
- districtId
- category
- latitude
- longitude
- summary
- ecoSensitivity
- capacitySignal
- status

### Attraction
- id
- destinationId
- name
- category
- description

### VerifiedFact
- id
- destinationId
- title
- text
- sourceId
- sourceType
- verifiedAt
- tags

### Event
- id
- name
- destinationId
- startAt
- endAt
- category
- expectedAttendance
- sourceId

### TourismBusiness
- id
- name
- businessType
- districtId
- destinationId
- status
- description
- contactVisibility

Business types:
- HOTEL
- HOMESTAY
- TOUR_OPERATOR
- GUIDE
- RESTAURANT
- EXPERIENCE_PROVIDER
- ARTISAN
- TRANSPORT

### Experience
- id
- businessId
- destinationId
- title
- category
- description
- durationMinutes
- price
- verified
- availabilityStatus

### Creator
- id
- displayName
- homeDistrict
- bio
- categories
- languages
- platforms
- audienceSummary
- creatorScore
- status

### CreatorCampaign
- id
- name
- objective
- destinationId
- audience
- budget
- rewardPool
- startAt
- endAt
- status
- createdBy

### CreatorApplication
- id
- campaignId
- creatorId
- status
- proposedConcept
- submittedAt

### CampaignContent
- id
- campaignId
- creatorId
- title
- platform
- contentUrl
- caption
- status
- submittedAt

### CampaignMetric
- id
- campaignContentId
- metric
- value
- recordedAt
- provenance

Metrics may include:
- VIEWS
- WATCH_TIME
- CLICKS
- DESTINATION_PAGE_VISITS
- ITINERARY_ADDS
- CHECKINS
- BOOKINGS

### TouristSession
- id
- anonymousId
- consentLocation
- createdAt

### Trip
- id
- touristSessionId
- startDate
- endDate
- preferencesJson
- status

### ItineraryItem
- id
- tripId
- destinationId
- date
- startTime
- durationMinutes
- rationale
- sequence

### TourismInteraction
- id
- anonymousSessionId
- destinationId
- experienceId
- tripId
- type
- timestamp
- provenance
- metadataJson

### Feedback
- id
- destinationId
- experienceId
- rating
- text
- language
- submittedAt
- provenance
- anonymized

### AccommodationSnapshot
- id
- businessId
- date
- totalCapacity
- availableCapacity
- occupancyRate
- provenance

### TourismMetric
- id
- metric
- entityType
- entityId
- value
- unit
- periodStart
- periodEnd
- provenance
- confidence
- sourceCount
- calculationMethod

### DataSource
- id
- name
- type
- owner
- refreshFrequency
- reliabilityLevel
- description

### Alert
- id
- entityType
- entityId
- severity
- title
- description
- detectedAt
- source
- status

### KnowledgeDocument
- id
- title
- documentType
- sourceUrl
- sourceAuthority
- text
- verified
- publishedAt

## Key relationships

```text
District 1─* Destination
Destination 1─* Attraction
Destination 1─* VerifiedFact
Destination 1─* Event
Destination 1─* Experience
TourismBusiness 1─* Experience
Creator 1─* CreatorApplication
CreatorCampaign 1─* CreatorApplication
CreatorCampaign 1─* CampaignContent
CampaignContent 1─* CampaignMetric
TouristSession 1─* Trip
Trip 1─* ItineraryItem
Destination 1─* TourismInteraction
Destination 1─* Feedback
TourismBusiness 1─* AccommodationSnapshot
DataSource 1─* TourismMetric
```

## Analytics views

Create materialized or application-level views where practical:

### destination_demand_view
Combines:
- search events
- destination views
- itinerary additions
- navigation starts
- check-ins

### destination_sentiment_view
Combines:
- rating average
- feedback volume
- issue taxonomy

### campaign_funnel_view
Combines:
- views
- visits
- itinerary additions
- check-ins
- bookings

### accommodation_capacity_view
Combines:
- latest snapshots
- total capacity
- available capacity

## Provenance contract

Every analytics result should expose:

```ts
type Provenance =
  | 'OFFICIAL'
  | 'PARTNER_REPORTED'
  | 'PLATFORM_OBSERVED'
  | 'PUBLIC_EXTERNAL'
  | 'DEMO_SYNTHETIC'
  | 'ESTIMATED'
  | 'FORECAST';
```

## Prototype simplification

For the hackathon, it is acceptable to seed:
- 10–15 destinations
- 20–50 businesses
- 15–20 creators
- 4–5 campaigns
- 300–1000 tourism interactions
- 100–300 feedback items

Label the seed dataset as `DEMO_SYNTHETIC` unless sourced otherwise.
