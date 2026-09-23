# 10 — Hackathon realignment

The published problem statements for **Re-Imagining Manipur — Hackathon 2026**
arrived after most of the platform was built. This document maps what exists
onto what is asked, and sets the order of the work that closes the gap.

It supersedes `08-roadmap.md` for sequencing until the hackathon. The roadmap's
phases still describe the product beyond it.

## 1. What is asked

Seven statements are in scope (the published list skips 4):

| # | Statement | Asks for |
| --- | --- | --- |
| 1 | Smart Discovery Platform | One platform for destinations, experiences, events, food, stays, transport, with maps and itineraries |
| 2 | AI Personalized Travel Planner | Itineraries by interest, budget and time |
| 3 | Multilingual Tourism Assistant | Chatbot/voice across languages: places, directions, culture, food, emergencies, etiquette |
| 5 | Smart Homestay & Accommodation | Tourists booking verified homestays and community hosts directly |
| 6 | Taste of Manipur | Dishes, ingredients, food trails, restaurants, home kitchens |
| 7 | Smart Events & Festival Tourism | Central calendar, discovery, notifications, maps, ticketing, itinerary integration |
| 8 | One-Stop Digital Tourist Guide | All of the above plus shopping, heritage, emergency services, navigation, payments, feedback |

The Decision Room and the creator hub are not among them. They stay as the
platform's differentiator — the shared intelligence layer that makes the
tourist surface work — but they are not what is being graded.

## 2. Where the platform stood

| # | Status | Evidence |
| --- | --- | --- |
| 1 | Strong | 14 destinations, 28 experiences, 26 businesses, MapLibre maps with road routing (§27), Discover chat (§26) |
| 2 | Strong | Full planner: 2–3 options, budget, dates, partner logistics, Gemini grounding (§25) |
| 3 | **Missing** | No i18n, no translation, no voice anywhere |
| 5 | **Partial** | Homestays exist as businesses with rates, but `Booking.experienceId` is required — **a stay cannot be booked**, only enquired about |
| 6 | Weak | `food` is one experience category; one restaurant in seed. No dishes, ingredients or trails |
| 7 | Weak | 10 events in a thin model. No calendar screen, no registration, no reminders, no itinerary link |
| 8 | Partial | Payments, feedback, maps, heritage and guides exist. **No emergency services at all**; transport and shopping are one seed record each |

## 3. The workstreams

### A. Bookable stays — PS5, strengthens 1 and 8 — **done, §30**

`Booking` now carries a `kind` — experience, stay or event — with nightly date
ranges and rooms for a stay, on one shared reference series, payment path and
refund policy. `/explore/stays` lists the participating properties and takes a
request. Brought forward of C and the rest of D, because event ticketing needed
the same generalisation. Remaining gap: no availability check against
`AccommodationSnapshot`.

### B. Emergency and safety — PS8, PS3 — **done, §28**

National emergency numbers, nearest hospital/police/tourist office by
distance, share-my-location, full district list. Server-rendered so it works
without JavaScript. No invented telephone numbers; positions honest to
district level. Remaining gap: no offline cache (needs a service worker).

### C. Taste of Manipur — PS6

`Dish` and `FoodTrail` entities tied to destinations and businesses:
traditional dishes with ingredients and story, home kitchens as hosts, and a
food trail that drops into the planner as an itinerary template.

### D. Events and festivals — PS7 — **discovery done, §29**

`/explore/events` is a filterable calendar and `/explore/events/[id]` an event,
with venue, organiser, admission and provisional dates. Still to do: holding a
place, now that the ledger takes an `EVENT` booking; "add to my trip";
reminders, which need a delivery channel the platform does not have.

### E. Multilingual and voice — PS3

Meiteilon, Hindi and English. Server-side dictionary for interface strings,
on-demand Gemini translation for generated content, Web Speech API for voice
in and out on the Discover chat. Carries the etiquette and phrasebook content
the statement asks for.

### F. Transport and shopping — PS1, PS8

Thicken the two thinnest `BusinessType`s: transport options with indicative
fares on the routes the planner already computes, and artisan/shopping
listings tied to the handloom and craft experiences.

## 4. Order

**B → D(discovery) → A → D(ticketing) → C → F → E.**

Revised once under way: A moved ahead of C and of the rest of D, because
holding a place at an event and booking a room are the same problem, and
building event registration first would have meant a second booking system to
merge later.

Emergency first: a day's work, high demo value, and the only statement with
nothing at all behind it. Then events and food — mostly data plus one screen
each, and together they are what makes the platform read as the "super
platform" of statement 8. Then the stays refactor, the largest and riskiest.
Transport and shopping follow. Multilingual last: it touches every screen, and
it was already a deliberate deferral (§ build order).

## 5. Decisions taken

- **Desktop first.** Every workstream lands on `/explore` and the department
  and creator screens. The `/m` mobile app is not updated in this pass.
- **No responsive merge.** Unifying `/m` with `/explore` into one responsive
  application was considered and deliberately deferred; the two stay separate
  for now.
