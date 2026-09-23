# 09 — Implementation Notes

This document records what was built, the decisions that are not obvious from
the code, and every place the implementation departs from `docs/01`–`docs/08`.
Those documents remain the specification; this one is the build log.

---

## 1. Status

**Roadmap Phase 0 — Hackathon MVP: complete.**
**Roadmap Phase 1 — Pilot: complete.** See §12.
**Roadmap Phase 2 — Government integration: complete.** See §13.
**Roadmap Phase 3 — Creator economy: complete.** See §14.
**Roadmap Phase 4 — Intelligence: complete.** See §15.
**Roadmap Phase 5 — Regional network: not built, deliberately.** See §16.
**Persistence — MySQL: live.** See §17.
**Authentication and identity: live.** See §18.
**Bookings and payments (Razorpay, test mode): live.** See §19.
**Telemetry intake: live.** See §20.
**Account administration: live.** See §21.
**Trips: persisted.** See §22.

All 16 screens in `docs/02-mvp-spec.md` are implemented, plus an About OneStop Manipur page
(`/about`; `/` opens the tourist home at `/explore`) and
a closing ecosystem screen. The full 5-minute demo path in `docs/07-demo-script.md`
runs end to end, and the closed loop is covered by tests rather than asserted in
prose.

| Gate (`CLAUDE.md` §13) | Where it happens |
|---|---|
| Understand the three-role ecosystem in under 60 seconds | `/` and `/ecosystem` |
| Ask a government question and get an evidence-backed answer | `/gov/ask` |
| Create a campaign and match creators | `/gov/campaigns` |
| Open a campaign and generate a content brief | `/creator/campaigns` → `/creator/studio` |
| Generate a personalised journey | `/explore` → `/explore/journey` |
| Destination story and a living-heritage experience | `/explore/destinations/[id]` → `/heritage` |
| Submit tourist feedback | `/explore/trip` |
| See the resulting signal in the government experience | `/gov/issues`, `/gov` |
| Ask whether the campaign worked | `/gov/ask?q=campaign` |
| Understand observed vs synthetic vs estimated | Provenance badge on every figure |

---

## 2. Stack

Defaults from `CLAUDE.md` §6, with the deviations noted.

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript (strict, `noUncheckedIndexedAccess`) | |
| Styling | Tailwind CSS v4, tokens in `src/app/globals.css` | |
| Validation | Zod — schemas are the single definition, types are inferred | |
| Data | MySQL via Prisma 7; working set cached in memory, writes mirrored | See §17 |
| Identity | Local accounts, scrypt, database sessions | See §18 |
| AI | Provider abstraction, `src/lib/ai/provider.ts` | See §5 |
| Maps | Schematic inline SVG, not Leaflet/MapLibre | See §6 |
| Charts | Inline SVG and CSS, no charting library | See §7 |
| Tests | Vitest — unit suites need no database; `tests/integration/` exercises MySQL | See §17.7, §18 |

The demo needs a local MySQL server (§17) but no network, no API key and no
external tile server.

---

## 3. Architecture

```
src/lib/        pure, shared by server and client — types, provenance, dates, geo, prompts
src/server/data/       seed loading, deterministic generation, store, repository
src/server/analytics/  deterministic computation — the only thing that produces a number
src/server/ai/         tools, government analyst, trip planner, storyteller, creator studio
src/server/actions/    server actions, the only write path
src/components/        ui primitives, charts, shared domain components, shell
src/app/               routes: /gov (G1-G5), /creator (C1-C5), /explore (E1-E6), /partner
```

Two rules hold the design together:

1. **`repository.ts` is the only read surface over tourism data.** Analytics, AI
   and UI all go through it — which is why the move to MySQL (§17) changed no
   analytics, AI or page code.
2. **Analytics is the only thing that produces a figure.** The AI layer receives
   evidence; it never calculates. This is enforced structurally — see §5.

---

## 4. Data layer

### The in-memory store was a deliberate choice

> **Superseded by §17.** The platform now persists to MySQL. This subsection is
> kept because it records why the hackathon build started without a database.

`CLAUDE.md` §6 defaults to PostgreSQL with Prisma or Drizzle, and §3 requires the
demo to work offline with predictable local services. Those pull in opposite
directions, so:

- the running prototype uses a seeded in-memory store (`src/server/data/store.ts`);
- the relational shape lives in `prisma/schema.prisma`, validated against the
  Prisma CLI, documented, and deliberately not imported anywhere in `src/`;
- the repository boundary means adopting it is a single-file change.

A hackathon demo that fails because Postgres is not running is a worse outcome
than one that carries its schema as a document.

### Metrics are computed, never stored

There are no pre-aggregated metric rows. Every demand index, trend,
concentration figure, sentiment average and campaign funnel step is computed
from interaction and feedback records on each request. That is why a check-in
made in the tourist interface changes the Tourism Pulse immediately, with no
recalculation job — and it is what `tests/closed-loop.test.ts` verifies.

### Deterministic generation

`src/server/data/generate.ts` produces 90 days of history from a seeded PRNG
(`DATA_SEED` in `src/lib/config.ts`). Nothing uses `Math.random` or wall-clock
time, so **Reset demo** returns the prototype to a byte-identical state. In demo
mode the clock is pinned to `DEMO_NOW` (16 September 2026) so every window,
trend and campaign date stays coherent whenever the demo is run.

---

## 5. How the AI layer is kept honest

`CLAUDE.md` §7 says the model must never invent a KPI. Rather than instructing it
not to, the architecture removes the possibility.

Every capability first produces a **complete deterministic result** from
application code and structured data. The provider is then handed that result
plus the structured evidence and asked only to rewrite the narrative around it:

- `AI_PROVIDER=mock` (default) — the deterministic text *is* the answer. No
  network, no key, identical output every run.
- `AI_PROVIDER=anthropic`, `openai` or `gemini` — the prose improves; the
  numbers, evidence, confidence and provenance are byte-for-byte the same.
- On a provider error, a 12-second timeout, a response cut off at its length
  limit, or a response that uses a figure the evidence does not contain — the
  deterministic text is returned and the response is marked as a fallback in
  the audit trail.

That last check is what makes "the model never invents a number" true rather
than requested. `strayFigures` in `src/lib/ai/provider.ts` lists every digit
group in the model's text and discards the prose if any is missing from the
evidence and the deterministic draft. It is deliberately strict: a rounded
figure (38% for 38.2%) counts as new, and the prompt tells the model so.
Numbers written as words are not checked.

| Provider | Default model | Notes |
|---|---|---|
| `anthropic` | `claude-sonnet-5` | Messages API |
| `openai` | `gpt-5.5` | Responses API, low reasoning effort, `store: false` |
| `gemini` | `gemini-3.8-flash` | `generateContent`, low thinking; key sent in a header, not the URL |

Each default can be overridden with `ANTHROPIC_MODEL`, `OPENAI_MODEL` or
`GEMINI_MODEL`. The defaults were chosen on 2026-09-21 by running the analyst
prompt against the models each key could list: all three answered in about
2–3 seconds with every figure grounded. `gemini-2.5-flash` is no longer offered
to new keys. What goes to a provider is the question, aggregated figures and
curated facts — no tourist records, contact details or feedback text. On
Gemini's free tier Google may use prompts to improve its products, so a real
deployment needs a paid key. The test suite pins `AI_PROVIDER=mock` and tests
the adapters against a stubbed network, so `npm run verify` never calls a
provider.

The government analyst (`src/server/ai/government-analyst.ts`) routes
deterministically: question → intent → a fixed set of authorised tools → evidence
→ assembled answer contract. The nine authorised tools are listed on `/gov/ask`,
and every answer carries the audit trail of which tool produced which figure.

Confidence is **derived**, never chosen (`deriveConfidence` in
`src/lib/provenance.ts`): a synthetic input caps it at MEDIUM, a sample under 30
forces LOW, and a forecast can never exceed MEDIUM.

Prompts are versioned in `src/lib/ai/prompts.ts` and the version is shown in the
interface.

---

## 6. Maps

`CLAUDE.md` §6 suggests Leaflet or MapLibre "or another practical map library".
Both need a tile server, which would make the demo depend on a network at exactly
the moment it cannot. `src/components/shared/TourismMap.tsx` draws a schematic
Manipur outline with projected destination markers instead. It is labelled
"schematic outline, for orientation only" on screen, and status is carried by
shape and label as well as colour. A real basemap is a pilot item.

---

## 7. Charts

Built as inline SVG and CSS, with a palette validated against the six
colour checks (lightness band, chroma floor, protanopia/deuteranopia separation,
normal-vision floor, contrast) rather than chosen by eye. Tokens are in
`globals.css`:

- **Categorical** (≤4 series): `#6a4899`, `#c9721c`, `#0f9c8a`, `#2a78d6`.
- **Ordinal ramp** for funnel stages: one hue, monotone lightness, six steps.
- Ranked bars are a single hue: bar length already encodes the value, so
  colouring by value would re-encode it.
- Every chart has a "Show as table" disclosure, so values stay reachable without
  colour, and a "How this is calculated" note.

---

## 8. Deviations from the specification

Each of these is a considered change, not an oversight.

### 8.1 Dataset volume — exceeds the suggested range

`docs/04-data-model.md` suggests 300–1000 interactions and 100–300 feedback
items. Built at that volume, a 30-day window held roughly 20–70 interactions per
destination, and the analytics became unusable: *every* destination fired a
"rising sharply" alert, and the promotion ranking was led by small-sample
artefacts (a destination with 17 interactions showed +153%).

The dataset is generated an order of magnitude larger (~9,500 interactions,
~2,000 feedback items over 90 days) so window comparisons are stable, while
staying unmistakably a prototype. The documented figure is kept as the floor in
`tests/seed-data.test.ts`, with the reasoning recorded there.

A related guard was added: `MIN_SAMPLE_FOR_TREND = 40`. Below it, a growth rate
cannot drive a recommendation or fire an alert, and the destination is listed
with "too few interactions to read a growth rate".

### 8.2 `data/tourism-signals.json` repurposed

It previously held per-destination aggregate metrics. Since every metric is now
computed from interactions, keeping aggregates too would have created two
sources of truth that could disagree. The file now holds the **generation
profile** for each destination — base volume, growth, event lift window,
sentiment base, issue mix, partner capacity — and the aggregates are derived.
The path and the `DEMO_SYNTHETIC` labelling are unchanged.

### 8.3 Ima Keithel district corrected

The seed placed it in Imphal East. Ima Keithel is in central Imphal
(Khwairamband), which is Imphal West, and the coordinates in the same record
already pointed there. Corrected, since `CLAUDE.md` §3 requires realistic
Manipur content.

### 8.4 Six headline KPIs plus a separate indicator index

`docs/02` requires six KPI cards; the master concept document lists twelve
indicators; `docs/06` caps the home screen at eight major modules. Resolved as
six headline tiles (exactly the six named in `docs/02`) plus one secondary
"Indicator index" module carrying the remaining six. Seven modules total.

### 8.5 The campaign funnel is split into two blocks

Content reach is real-world social scale; platform-observed steps cover only
people who used this prototype. Drawing them as one continuous funnel would
imply a conversion rate that does not exist. They are reported as separate
blocks, each scaled within itself, with an explicit note that they must not be
divided into one another.

### 8.6 The official data tier is empty on purpose

`data/official-statistics.json` declares the OFFICIAL tier with `connected:
false` and `value: null`. The Tourism Pulse renders it as an explicit "Not
connected" state rather than substituting a synthetic figure. This follows
`CLAUDE.md` §9 — do not claim official government integration unless one exists —
and it is the single thing this product must never get wrong.

### 8.7 An open issue reduces a promotion score rather than blocking it

The first implementation excluded any destination with an action-level issue from
promotion. That was defensible but produced worse policy: it meant the
department would neither promote nor fix. An open issue now applies a 0.7 factor
and attaches an explicit **condition** to the recommendation, so promotion and
the operational fix are proposed together. This is also what connects G5 to G3 in
the demo.

### 8.8 `agentRules: false` in `next.config.ts`

Next.js 16 appends its own block to any `CLAUDE.md` it finds on every `next dev`
run. `CLAUDE.md` is this repository's authoritative product specification, so
that behaviour is disabled.

---

## 9. Features folded in from the master concept document

The master `.docx` was checked against `docs/01`–`docs/08`. Most of it is already
covered. These were additive and are now built, each traceable to an existing
requirement rather than invented scope:

| From the master document | Where it lives | Traces to |
|---|---|---|
| Twelve Pulse indicators | Indicator index module on G1 | §5.2 of the master doc; `docs/02` requires six |
| Tourism Business Intelligence | Supply-base panel in the G2 detail drawer | `docs/04` `accommodation_capacity_view` |
| Adaptive itinerary ("it is raining tomorrow") | Re-plan controls on E2 and E6 | `docs/01` "adapts plans to changing conditions" |
| Anomaly detection | Seven named deterministic alert rules | `docs/02` G1 "notable alerts" |
| Auditability of government answers | Audit trail on every answer | `docs/05` evidence and provenance contract |
| Accessibility modes | Trip profile field; filters demanding sites and experiences | `docs/02` E1 "accessibility needs if provided" |
| Story-driven routes | Journey themes on E2 | `docs/02` E2 |
| Event calendar as an explanatory signal | `data/events.json`, used by "why did demand change" | `docs/04` `Event`; `docs/05` routing |
| "Ask the Place" | Ask panel on E3 and E4 | `docs/02` E3/E4 |

**Not folded in**, and why:

- **Full multilingual UI.** The master doc scopes this to pilot
  (English + Hindi + one local language). Language is modelled on feedback,
  creators and campaigns, and is used by creator matching, but the interface is
  English only. Local-language content packs are roadmap Phase 3.
- **Exportable briefing reports.** Roadmap Phase 2.
- **Demand forecasting.** Roadmap Phase 4. The only forecast in the MVP is the
  explicitly-labelled campaign simulation.

---

## 10. Privacy and safety as built

- Tourist records carry an opaque session id and nothing else. There is no
  account, no login, no contact field, no device fingerprint.
- Check-in requires an explicit consent checkbox, and declining is handled as a
  first-class path, not an error.
- Feedback is marked `anonymized` at creation and government views say so.
- Business contact visibility defaults to `ON_ENQUIRY` and is never rendered in a
  government analytics view.
- The API key is read only in `src/lib/ai/provider.ts`, which is server-only.
  Nothing secret is exposed through `NEXT_PUBLIC_*`.
- Moreh is excluded from automatic itinerary planning and from promotion
  recommendations, with a visible advisory reason.

---

## 11. Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # typecheck + lint + test + build
```

Defaults (`.env.example`): `DEMO_MODE=true`, `AI_PROVIDER=mock`. No key needed.

To use a live model, set `AI_PROVIDER` to `anthropic`, `openai` or `gemini`
and the matching `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`
(§5). Only the prose changes.

**During the demo**, the amber ▧ icon at the right end of every top bar marks the
prototype as demo data. It opens a panel that states the DEMO DATA label in
words, walks the running order from `docs/07-demo-script.md` step by step with
the line to say and a jump link, and resets the prototype to its seeded state.
The panel stays open across navigation until closed, so a presenter can step
through it. It replaced a full-width bar above every screen (§23).


---

## 12. Roadmap Phase 1 — Pilot

Every item in `docs/08-roadmap.md` Phase 1 is built, with one honest limit: the
prototype has no real partners, so what exists is the **mechanism** those
partners would use, exercised against seeded businesses.

| Phase 1 item | Built as |
|---|---|
| Real tourism partner data | Partner-reported availability replaces generated snapshots as soon as a partner reports. The mechanism is real; the partners are seeded. |
| Destination QR check-ins | `QrCode` renders a printable code per destination on G2; scanning opens `/explore/checkin/[id]`, a single-screen consent page |
| Hotel / homestay availability reporting | `/partner/availability` — one form, feeds the capacity view directly |
| Creator campaign workflow | Closed with departmental review on `/gov/partners`: approve, request changes, or mark published |
| Verified business onboarding | `/partner/onboarding` → `/gov/partners` verification queue |
| Basic booking / enquiry integration | `/partner/enquiries` — confirm, acknowledge or decline |
| Richer feedback analytics | Weekly issue trend and a district rollup on G3 |

### 12.1 A fourth interface

The supply side needed its own surface, so `/partner` was added and the role
switcher now carries four entries. This is not scope creep: `docs/08-roadmap.md`
lists a "tourism business portal" under long-term product families, and the
master concept document has a Business/Partner layer in its experience table.
Availability reporting, onboarding and enquiry handling are all Phase 1 items
that cannot exist without somewhere for a business to do them.

### 12.2 Verification now gates usable capacity

Building the onboarding flow surfaced a real defect in the Phase 0 analytics:
`computeCapacity` counted every availability snapshot, so a business could
register itself, declare 500 rooms, and inflate the figure the department uses
to decide whether a destination can absorb a campaign. That is precisely the
failure the capacity view exists to prevent.

Capacity is now counted only from businesses that are both `PARTICIPATING` and
`verified`. Places reported by unverified businesses are surfaced separately as
`pendingVerificationCapacity`, so an officer can see what would become available
on verification without it contaminating the usable number. The coverage note
changed to "verified, participating partners only" to match.

`tests/pilot.test.ts` covers this directly: a business declaring 500 places
while unverified moves the pending figure and nothing else, and verification is
what moves the usable figure.

### 12.3 Other decisions

- **Availability cannot be reported for a future date.** It is a report, not a
  forecast, and the two carry different provenance.
- **A correction replaces the day's record** rather than adding a second,
  contradictory row.
- **Requesting changes on content requires a note.** A rejection without a
  reason is not review.
- **Enquiries carry a party size and a date and nothing else.** No name, no
  phone, no email, because the prototype does not collect them. A contact
  channel would be added with the traveller's explicit consent, not by default.
- **One new dependency**: `qrcode`, used server-side to emit inline SVG. It adds
  no client JavaScript and no network call, so the offline guarantee holds.

---

## 13. Roadmap Phase 2 — Government integration

| Phase 2 item | Built as |
|---|---|
| Official tourism data ingestion | The **contract** rather than the data: `/gov/sources` states what would be loaded, what connecting it requires, and that the tier is not connected. No dataset is loaded and no figure is generated in its place. |
| Role-based government accounts | `src/lib/roles.ts` — Viewer, Tourism officer, Administrator, with seven permissions enforced **server side** in every restricted action |
| Historical tourism dashboards | `/gov/history` — weekly, fortnightly or monthly periods across the full retained history, with an explicit statement of what the series cannot support |
| District-level analytics | `/gov/districts` — demand, supply, satisfaction and alerts rolled up to district, including districts the platform does not cover |
| Event and campaign reporting | Campaign funnel on G4 and in the briefing; events feed the "why did demand change" routing |
| Source governance | `/gov/sources` — the register, with owner, cadence, reliability, the provenance each source confers, and whether it may be quoted externally |
| Exportable briefing reports | `/gov/briefing` — permission-gated, with every provenance label written into the exported text |

### 13.1 The role model is real even though the identity is not

Enterprise SSO is explicitly out of MVP scope (`CLAUDE.md` §11), so the role is
self-selected from a cookie. What is not simulated is the **enforcement**: every
restricted action calls `can()` server side and refuses with a reason. Switching
to Viewer genuinely fails campaign creation, launching, creator invitations,
content review and partner verification.

Two deliberate choices:

- **Restricted controls stay visible and refuse**, rather than being hidden. An
  officer needs to know a capability exists before they can ask for it, and a
  hidden button teaches nothing.
- **Refusals name who can do it**, not just that you cannot.

Replacing the cookie with an identity provider changes how the role is obtained
and nothing about what it means.

### 13.2 The briefing export gate

A briefing is the moment a figure leaves the interface that labels it. The
provenance badge does not survive a copy into an email, so
`renderBriefingText` writes the category into every line and marks anything
non-quotable inline with `[NOT FOR EXTERNAL QUOTATION]`. The predicate is
`isQuotableExternally` from the provenance contract — the same one the rest of
the product uses — so the rule cannot drift between the screen and the export.

Export is restricted to an administrator, because it is the one action that can
put a prototype figure in front of someone who will never see this interface.

### 13.3 What the historical view refuses to do

Ninety days spans one season. Presenting that as a year-on-year comparison, or
implying a normal range, would be the easiest way for this platform to mislead a
department, so `/gov/history` states plainly what the series cannot support and
offers no seasonality claim.

### 13.4 Two defects found while building Phase 2

Both were real, both are fixed, and both now have a test:

1. **Unverified self-reports counted as capacity.** Building the onboarding flow
   showed that a business could register, declare 500 rooms and inflate the
   figure used to decide whether a destination can absorb a campaign. Capacity is
   now counted only from verified, participating businesses, with pending
   capacity surfaced separately. (§12.2)
2. **Records timestamped after the demo clock.** The generator produced
   interactions later in the current day than `DEMO_NOW`, so a window ending at
   "now" disagreed with the history series by about sixty records. The generator
   now clamps to the clock, which also makes the current day a partial day, as it
   should be. `tests/seed-data.test.ts` asserts no record is ever in the future.

A third robustness fix came out of the same work: the development hot-reload
store is now versioned, so adding a collection to `MutableState` discards state
whose shape no longer matches instead of leaving a field reading as `undefined`.


---

## 14. Roadmap Phase 3 — Creator economy

| Phase 3 item | Built as |
|---|---|
| Verified creator onboarding | `/creator/onboarding` → verification queue on `/gov/partners` |
| Campaign marketplace | Already delivered as C2; drafts stay invisible to creators until launched |
| Platform analytics integrations where APIs permit | The **contract**, not a fake integration. C5 states that no account is linked, that reach is seeded, and that where a platform grants no analytics API reach would stay self-reported and be labelled as such |
| Fraud and anomaly detection | Six named integrity rules with stated thresholds (`src/server/analytics/integrity.ts`) |
| Payout workflow | Proposal → approval, gated on permission and blocked by an open hold-level check. Records what is owed; moves no money |
| Creator reputation | Computed from delivery, shown beside the declared profile score |
| Local-language content packs | **Not built.** See below |

### 14.1 Reputation is earned, and absence of evidence scores zero

The first implementation gave a brand-new creator 40 out of 100, because the
"review outcomes" and "compliance" components awarded full marks to someone who
had never submitted anything — they had no failures, so they scored as clean.
That is backwards: it rewards having no track record.

Every component now scores zero without evidence, so a new creator scores zero,
and `hasTrackRecord` lets the interface render "No record" rather than a bare
zero that reads as a judgement. The test asserts this directly.

A creator awaiting verification is also excluded from every shortlist, since a
shortlist is a departmental endorsement and should not precede the check.

### 14.2 Integrity flags are prompts, not accusations

Six deterministic rules: missing paid-partnership disclosure, duplicate content
link, submission outside the campaign window, burst submissions, reported reach
with no attributable platform signal, and a caption too thin to carry the
required guidance. Each names its threshold on screen. Two are HOLD severity and
block a payout; the rest are REVIEW and only ask someone to look.

### 14.3 Payouts record, they do not pay

`PAYOUT_NOTE` is on the screen: the platform records what is owed and who
approved it, holds no bank detail and moves no money. Production payout
processing is out of MVP scope (`CLAUDE.md` §11) and would sit behind the
department's own financial controls regardless. Approval is an administrator
permission and is refused while a hold-level check is open, because approval is
the last point at which a problem can still be caught.

### 14.4 Local-language content packs are not built

Roadmap Phase 3 lists them. The data model carries language throughout — feedback,
creators, campaigns, and creator matching scores language overlap — so the
structure is there. What is not there is translated content.

Writing Meitei, Tangkhul or Rongmei tourism and heritage copy from a model is
exactly the kind of thing this product exists to refuse: cultural and heritage
content has to be verifiable, and a mistranslation of a ritual or a place name is
not a typo, it is a harm. Translation needs native speakers and departmental
review. The hook is built; the content is a pilot activity with people, not a
generation task.

---

## 15. Roadmap Phase 4 — Intelligence

| Phase 4 item | Built as |
|---|---|
| Demand forecasting | `forecastDemand` — least squares trend plus measured weekday and weekend factors, with a residual-derived interval |
| Capacity modeling | Delivered in Phase 0 as the campaign simulation, against the same reported capacity |
| Destination balancing | Delivered in Phase 0 as `recommendCampaignTargets` with the concentration exclusion |
| Campaign optimization | `optimiseCampaign` — ranks what is actually constraining a campaign |
| Tourism infrastructure opportunity analysis | `findInfrastructureOpportunities` — interest set against the supply that could serve it |
| Scenario simulation | Delivered in Phase 0, reachable from `/gov/intelligence` |
| Destination sentiment trends | Delivered in Phases 1 and 2 as the weekly issue trend and district rollup |

All of it surfaces on `/gov/intelligence`, and `forecastDemand` and
`infrastructureOpportunity` were added to the authorised tool set so the analyst
can answer "what will demand look like" and "where should we invest".

### 15.1 What the forecast refuses to do

The method is deliberately simple and fully stated rather than opaque, because
the value here is not predictive power — ninety days cannot deliver that — it is
being honest about a projection a department might otherwise act on.

- **Horizon is capped at 14 days.** Beyond that the interval is wider than the
  signal, so a longer horizon is not offered rather than offered badly.
- **The interval widens with the horizon**, so the chart shows that a projection
  three days out is a far smaller claim than one two weeks out.
- **Confidence can never exceed MEDIUM**, and drops to LOW when the trend
  explains little of the variation.
- **It states that it cannot see annual seasonality.** Tourism is strongly
  seasonal; ninety days is one season. Presenting a trend line as a seasonal
  forecast is the single most damaging thing this platform could do to a
  department that trusted it.
- **Events inside the horizon are listed as unmodelled** rather than silently
  absorbed into the trend.

### 15.2 Optimisation ranks constraints, it does not predict uplift

`optimiseCampaign` orders the levers by what is actually limiting the outcome —
an open service problem first, then capacity, then whether anything is published,
then attribution, then breadth of creators, then the measurement window. It
attaches no predicted percentage to any of them, and says so, because there is no
comparison data that would support such a number.

### 15.3 A supply gap is a development priority, not a promotion target

`findInfrastructureOpportunities` scores interest against supply readiness —
reported spare places, participating businesses, bookable experiences — so a
destination that is well supplied cannot score as an opportunity however popular
it is. Every row says what is missing and recommends onboarding before promotion,
because promoting into a gap sends visitors somewhere that cannot host them.

---

## 16. Roadmap Phase 5 — Regional network: not built, deliberately

Phase 5 is expansion to Meghalaya, Nagaland, Mizoram, Arunachal Pradesh, Tripura
and Sikkim. It is the one phase that has not been implemented, and the reason is
the same principle the rest of the product is built on.

Building it would mean seeding destinations, heritage facts, businesses,
creators and tourism signals for six states that this project has no data for and
no curation process behind. That is not a prototype dataset, it is fabricated
tourism content about real places — including heritage and cultural material —
presented inside an interface whose entire argument is that it tells you where
every figure came from. A judge who clicked into Meghalaya and found invented
destination records would be right to distrust everything else on the screen.

**What already supports it.** The data model is state-agnostic: `District` is a
first-class entity, every destination hangs off one, provenance and source
governance are per-source rather than per-state, and the repository boundary
means a second state is more data, not more code. `/gov/districts` already shows
districts the platform does not cover as a coverage gap rather than as zero,
which is exactly the shape a multi-state view would take.

**What it actually needs**, and none of it is code:

1. A curation and verification process with each state's tourism department.
2. A data sharing arrangement covering what may be published and by whom.
3. Native-speaker and departmental review of heritage and cultural content.
4. A decision about whose provenance labels govern a shared record.

Until those exist, the honest deliverable is the architecture that would accept
them, and a clear statement that the data does not exist yet. That statement is
this section.


---

## 17. Persistence — MySQL

The platform ran on a seeded in-memory store through Phases 0 to 5. It now runs
on MySQL. This section records what changed, what deliberately did not, and the
two decisions that are worth arguing with.

### 17.1 What is in place

| | |
|---|---|
| Server | MySQL 9.1 (WAMP), database `manipur_tourism` |
| Client | Prisma 7.10.0 with `@prisma/adapter-mariadb` |
| Schema | 25 models, 25 native enums, 36 foreign keys, 99 indexes |
| Seed | 7,376 rows from the same curated files and generator as before |

`prisma/schema.postgres.prisma` keeps the Postgres form as the production
target. The differences are MySQL limitations only: scalar `String[]` becomes
`Json` because MySQL has no array type, prose columns carry `@db.Text`
because MySQL defaults `String` to `VARCHAR(191)`, and url/title columns
carry `@db.VarChar(512)`. No enum was lost.

### 17.2 InnoDB is stated by the migration, not assumed of the server

WAMP ships MySQL with `default_storage_engine=MyISAM`. The first migration
failed on it with `max key length is 1000 bytes`, but the key limit was the
symptom. MyISAM has **no foreign keys and no transactions**, so it cannot hold
this schema at all: the whole point of the relational move is that the database
rejects an orphan row rather than trusting the writer.

Rather than depend on the server being configured correctly — which would make
a correct deployment a matter of someone remembering — every migration states
`ENGINE=InnoDB` itself. `scripts/enforce-innodb.mjs` applies it, and
`npm run db:migrate` runs it between generating the SQL and applying it. The
project is therefore independent of `my.ini`.

`tests/integration/persistence.test.ts` asserts the consequence directly: an
orphan feedback row is rejected. On MyISAM that test would pass silently by
inserting it.

### 17.3 The working set is held in memory, and why that is not laziness

Reads do not query per request. `initState()` loads the working set once at
server start and the analytics modules keep reading synchronously.

This looks like the wrong answer until you measure the working set. Every
analytics module computes over the full analysis window, and **the analysis
window is the whole table** — a 90 day window covers 100% of interactions and
100% of feedback. A SQL filter would return the same rows.

It would also be actively worse. `computeDemand` loops over destinations and
asks for each one's interactions; `computeSentiment` does the same for
feedback. Pushing those into SQL turns one read into 28 round trips, repeated
by every module a dashboard touches.

So the choice is not "memory versus database". It is "one read, or a hundred
reads returning the same rows".

**The limitation this accepts.** The cache is per process. A second Next.js
process would not see the first one's writes until it restarted. That is
correct for a single-system deployment and wrong for a horizontally scaled one.

**The scaling path is already in the schema, not a rewrite.** `TourismMetric`
holds pre-computed rollups. When the interaction table outgrows memory, a job
writes rollups and the analytics read those instead of raw rows — a change
behind `load.ts`, not above it.

### 17.4 Writes go to both places

`src/server/data/persist.ts` mirrors each store mutation into MySQL. The store
mutates the cache so the next read sees the write immediately, then writes the
row so it survives the process.

`persist.ts` holds no business rules on purpose. It decides no provenance, no
status and no id. Those belong to the store and the actions above it, and
keeping them out of the persistence layer is what stops a write path quietly
acquiring a second, divergent copy of the rules.

### 17.5 What this cost the rest of the codebase: almost nothing

The async cascade touched **5 action files and 3 test files**. The 15 analytics
modules, 5 AI modules and all 32 pages needed **no change at all**, because they
read through the repository and the repository still returns rows synchronously.

That was the point of the repository boundary, and it is the first time it has
been tested by anything real.

### 17.6 A client component was importing the server data layer

The build caught something the in-memory store had hidden. Three client
components imported `FACT_TYPE_LABEL` and `FACT_TYPE_NOTE` from
`src/server/ai/storyteller`. Harmless while the data layer was plain
JavaScript over JSON; once it reached Prisma, Turbopack tried to bundle
`node:fs` into the browser and the build failed.

The constants are presentation labels, so they moved to
`src/lib/fact-types.ts`. The lesson is the useful part: the `src/server/`
convention is a convention, and a value import crosses it silently. The build is
now the thing that enforces it.

### 17.7 Tests

The unit tests still run against the seed-built in-memory state and need no
database — they test computation, and a database would only make them slower and
flakier. `tests/integration/persistence.test.ts` covers what actually changed:
that a write reaches MySQL, that it survives a reload, that the cache and the
database agree afterwards, and that referential integrity is enforced. It skips
itself when `DATABASE_URL` is absent.

### 17.8 Reset had to be rewritten, and it was nearly a silent failure

"Reset demo" used to rebuild the in-memory state from the seed files. Left
alone, that would have been the worst defect in this change: the rebuilt state
is not database-backed, so after a single press every subsequent write would
have stopped reaching MySQL — while the interface carried on looking correct.
A platform whose argument is that you can always tell where a figure came from
cannot ship a button that quietly disconnects the numbers from their store.

Reset now re-seeds the database and re-reads it. That also restores the seeded
rows a demo run modifies — a business that was verified, an enquiry that was
answered, availability that was reported — which deleting only the newly
created rows would have left behind.

`seedDatabase()` moved to `src/server/data/seed-database.ts` so the CLI and the
reset action restore byte-identical datasets, and the integration suite asserts
that the state is still `persistent` after a reset and that a following write
reaches MySQL.

### 17.9 Trips

`Trip` and `ItineraryItem` were held in memory only until §22.

---

## 18. Authentication and identity

The permission model was real from Phase 2 onward; identity was not. The
government role came from a cookie anyone could set to `ADMINISTRATOR`, and
the partner and creator interfaces ran as two hardcoded records. This section
records what replaced them and — more importantly — the holes that were found
on the way.

### 18.1 The holes this closed

Replacing the demo identities surfaced three authorisation defects that were
worse than the missing sign-in:

| Where | What any caller could do |
|---|---|
| `reportAvailability` | Report capacity for any business, by putting its id in the form |
| `/partner?business=…` | Read any partner's enquiries and availability, by editing the URL |
| `respondToEnquiry` | Confirm or decline another business's enquiry — ownership was never checked |
| `applyToCampaign`, `submitCampaignContent`, `buildBrief` | Act as any creator, by naming them |

The fix is one rule, applied everywhere: **the acting identity comes from the
session, never from the request.** An id in a form or a URL is a claim anyone
can make. No Server Action now accepts a business or creator id for the actor;
`tests/auth.test.ts` asserts that a hostile id in the payload is ignored and
that another business's enquiry is refused with the same wording as a missing
one, so the response does not confirm which ids exist.

Content submission also gained an ownership check it never had: a creator can
only submit against a campaign they have joined. Without it a signed-in creator
could still post into any campaign's review queue — and from there into its
payout proposals.

### 18.2 What is in place

| | |
|---|---|
| Accounts | `UserAccount`: government accounts carry a role; partner and creator accounts are bound to exactly one business or creator profile |
| Passwords | scrypt from `node:crypto`, N=2^15 r=8 p=3 (an OWASP-listed equivalent), self-describing so the cost can be raised later |
| Sessions | `AuthSession` in MySQL; the cookie holds 256 random bits and the table holds only their SHA-256 |
| Cookie | httpOnly, SameSite=Lax, Secure outside development, 12 hour absolute lifetime |
| Lockout | 5 consecutive failures lock the account for 15 minutes |
| Sign-in | `/login`, with a same-origin, same-interface return path only |
| Registration | Partner and creator onboarding open the account and sign the person in |

Government accounts cannot be self-registered: a role that grants campaign
launch or payout approval has to be issued by the department, from
`/gov/accounts` (§21).

### 18.3 Where the checks live

The Next.js authentication guide is specific that layouts are not an access
control: they do not re-render on navigation and do not stop nested segments or
Server Actions from running. So:

- **Every protected page** calls `requireGovernment()`, `requirePartner()` or
  `requireCreator()` from `src/server/auth/session.ts`.
- **Every Server Action** reads the actor from the same module and refuses when
  there is none. `can(null, …)` is always false, so an anonymous caller is
  refused by the same check that refuses a viewer.
- **`src/proxy.ts`** only redirects a visitor with no cookie at all to the sign-in
  page. It never touches the database, because it runs on every request
  including prefetches. It must live in `src/`, beside `src/app`: at the
  project root Next ignores it without a warning, which is how it went
  unnoticed until the HTTP walkthrough. The page guards still held, but a
  guard that fires after the layout has streamed can only send a client-side
  redirect inside a 200, not a 307.
- **Layouts** read the account only to label the header.

An account whose business or creator profile is deleted keeps its row (the
foreign key sets the binding to null) but grants nothing: it cannot sign in, and
an open session for it resolves to no one.

Identity is never served from the in-memory cache that holds tourism data. A
revoked session or a disabled account has to stop working immediately and in
every process, which a per-process cache cannot promise.

### 18.4 Decisions worth arguing with

**scrypt, not argon2id.** argon2id is the first choice in OWASP's guidance, but
the maintained Node bindings are native modules that need a compiler toolchain
on Windows and a rebuild on every Node upgrade. scrypt is memory-hard, in the
standard library, and listed by OWASP. The stored hash records its parameters,
so moving to argon2id later can happen on next login without a reset.

**Database sessions, not signed JWTs.** A stateless token cannot be revoked
before it expires. For accounts that can launch government campaigns and approve
payouts, signing out has to actually end the session, and disabling an account
has to take effect at once. Both are tested.

**The same error for every credential failure.** An unknown email costs the same
scrypt work as a wrong password (a decoy hash), and both return one message, so
neither the wording nor the timing reveals which emails have accounts. A
disabled account is only reported as disabled after the password is proven.

### 18.5 Demo accounts

When `DEMO_MODE` is on, the seed creates five accounts — officer,
administrator, viewer, partner (`biz-013`) and creator (`creator-001`) — with a
shared published password, and the sign-in page lists them with one-click
buttons. The buttons submit the real password through the real check; there is
no bypass. With `DEMO_MODE` off the seed deletes them, because a published
password must never open anything alongside real data. Their addresses use the
reserved `.test` domain, so mail can never be delivered to them.

Reset keeps demo accounts and their sessions — so resetting does not sign you
out — while removing accounts created during the run, whose businesses the
re-seed deletes.

### 18.6 Not done

- ~~No account administration screen.~~ Built: see §21.
- **No self-service password reset.** An administrator can reset any password
  (§21); a "forgot password" link needs an email channel the platform does not
  have.
- **No enterprise SSO**, which stays out of scope (CLAUDE.md §11). The seam is
  `authenticate()` in `src/server/auth/accounts.ts`: an identity provider would
  replace how an account proves who it is, not what its role permits.
- **Registration reveals whether an email is taken.** Sign-in does not, but
  "an account with that email already exists" does. Closing that needs email
  verification, which needs the same missing email channel.
- **Sign-in is rate limited per account, not per IP**, so it slows guessing
  against one account but not a spray across many.

---

## 19. Bookings and payments

### 19.1 A scope decision, made explicitly

CLAUDE.md §11 lists "full OTA/payment platform" as out of scope *unless
explicitly requested*. On 21 September 2026 it was explicitly requested:
"we can use razorpay test mode and complete the process". This section is that
build. It is deliberately narrower than an OTA:

- **Experiences only.** An experience has a price per person. Accommodation has
  no room types or rates in the data, so it cannot be priced honestly, and is
  not bookable.
- **Request, accept, pay.** No experience has an inventory the platform could
  sell against, so nothing is sold instantly. The traveller asks, the host
  accepts or declines, and only an accepted request can be paid for.
- **Test mode.** A `rzp_live_` key is refused unless `PAYMENTS_ALLOW_LIVE=true`.
  Every payment surface shows a "Test payments" badge while a test key is in use.
- **No payout to hosts.** Money lands in the platform's Razorpay account. The
  partner page shows what each host is owed; settling it is manual (§19.7).

Enquiries remain, for hosts who are not on the platform yet: only a business
with a partner account can answer a request, so only its experiences show
"Request to book". In the demo that is `biz-013`, whose homestay night in
Ukhrul (`exp-012`, ₹1,400 per person) is the bookable experience.

### 19.2 The lifecycle

```
REQUESTED ──accept──▶ AWAITING_PAYMENT ──paid──▶ CONFIRMED ──day passes──▶ COMPLETED
    │                      │                        │
    ├─decline─▶ DECLINED   ├─deadline─▶ EXPIRED      ├─guest─▶ CANCELLED_BY_GUEST
    └─day begins─▶ EXPIRED └─cancel─▶ CANCELLED_*    └─host──▶ CANCELLED_BY_HOST
```

The rules live in `src/server/bookings/policy.ts` and nowhere else, so the page
that states a rule and the code that applies it cannot disagree:

| Rule | Value |
|---|---|
| Bookable days | Tomorrow (in India) to 180 days ahead |
| Payment window | 24 hours after the host accepts, or the start of the day if sooner |
| Guest cancellation | Full refund until 48 hours before the day; none after |
| Host cancellation | Always a full refund |
| Open requests per browser | 5 |

Expiry needs no scheduler: every read closes whatever has lapsed, scoped to the
rows it reads. An unscoped pass would let one caller's clock close another
traveller's booking — in a test that moves the clock forward, a real one.

### 19.3 Where the money is decided

| Step | Where | What the browser can influence |
|---|---|---|
| Amount | Fixed at request time from the experience price, in integer paise | Nothing |
| Order | Created server side through Razorpay's Orders API | Nothing |
| Checkout | Razorpay's own script; card and UPI details never reach this platform | Which method they pay with |
| Confirmation | Signature check, then the payment is **re-read from Razorpay** | Nothing — the callback is a message, not evidence |

A payment whose order, amount or currency does not match the ledger is ignored.
An authorised payment is captured by the server. A payment that arrives for a
booking that is no longer payable — cancelled, or paid by another order — is
refunded automatically.

One grace rule: a payment finished just *after* the 24-hour deadline is
honoured if the checkout was opened before it and the day has not begun. A
traveller who clicked "Pay" at 23:59 should not be refunded at 00:01.

### 19.4 Exactly once

A browser callback, a webhook and a page-load reconciliation can all report the
same payment, in any order, at the same moment. Every transition in
`src/server/bookings/ledger.ts` is therefore a conditional update ("to CONFIRMED
where still AWAITING_PAYMENT"), and a caller acts only if its update changed a
row. The integration suite fires all three at once and asserts one confirmation,
one captured payment and one analytics signal; it does the same for two
simultaneous cancellations and one refund.

Like identity, the ledger never goes through the in-memory cache — only MySQL
can say which of two processes got there first.

### 19.5 Without a public URL

Razorpay's webhooks cannot reach a laptop. They are supported
(`/api/payments/razorpay`, signature-checked, de-duplicated by event id) but
not required: the booking page reconciles against Razorpay whenever the booking
has an unpaid order or a refund in flight. A traveller who pays and closes the
tab before the callback returns is confirmed the next time the page is opened.

Refunds are written before they are sent. If Razorpay refuses one, the row is
kept as FAILED and retried on the next reconciliation; a retry has to claim the
row first, so two page loads cannot send it twice. Retrying is safe in any case,
because Razorpay will not refund more than was captured.

### 19.6 Privacy

A booking holds the only personal data the platform keeps about a traveller:
name, phone, and optionally email, given with an explicit consent checkbox.

- The **host** sees them, for that booking only.
- The **traveller** reaches the booking from the browser that made it (a guest
  cookie, stored hashed) or from a private link (a key, stored hashed). A
  reference alone opens nothing — it is printed and read out on the phone.
- The **department** sees counts and sums per destination
  (`bookingSummaryByDestination`), never a name, a phone number or a reference.
- **Analytics** receive `BOOKING_CONFIRMED` and `BOOKING_CANCELLED` signals on
  the anonymous session, like every other tourist signal. They add nothing to
  the demand index — the request already counted as intent — and feed the
  campaign funnel's new "Paid bookings" step.

The guest cookie is separate from the analytics session on purpose: in demo
mode every tourist shares one analytics id, and sharing a booking would be a
disclosure.

### 19.7 Not done

- **Paying hosts out.** Razorpay Route could split a payment to a host's linked
  account at capture, but that needs each host's KYC. Until then the partner
  page shows what is owed and the department settles manually.
- **No notifications.** A host learns of a request by opening the partner page;
  a traveller learns of an acceptance by opening their booking. Both need the
  email or SMS channel the platform does not have.
- **No invoices or GST.** A receipt is the booking page.
- **Personal data is not yet purged.** Closed bookings keep the guest's contact
  details. A retention period (and a job to apply it) is a decision for the
  department, not a default to pick here.
- **Demo reset deletes the ledger.** Razorpay keeps its own record of every test
  payment; only the platform's copy goes.

---

## 20. Telemetry intake

### 20.1 What was wrong

The analytics were real; the signals under them were not trustworthy as data.

| Problem | Consequence |
|---|---|
| Outside demo mode, every signal got a fresh random session id | One visitor looked like a hundred; no count of visitors meant anything |
| `getLatestTrip()` returned the last trip *anyone* planned | Every tourist saw the previous person's journey, and checked in against it |
| `saveCurrentTrip(id)` saved any trip by id | A trip id worked as a credential |
| "Already checked in" asked whether anyone had, in this server process | The second tourist at a site was told they already had |
| A page view was a Server Action with no checks | Reloading counted again; nothing stopped a script inventing views |
| No consent choice for passive signals | CLAUDE.md §9 asks for a consent flag; only check-ins had one |
| The seed wrote ~7,000 synthetic signals even with `DEMO_MODE=false` | A real deployment would have started with invented history |

### 20.2 The shape now

```
browser ── sendBeacon ──▶ /api/telemetry ─┐
                                          ├──▶ ingest() ──▶ store ──▶ MySQL
Server Actions (search, plan, check-in,   │     │
  booking, payment webhook) ──────────────┘     └──▶ TelemetryCounter (per day, per outcome)
```

Every tourist signal now enters through `ingest()` in
`src/server/telemetry/ingest.ts`. The analytics modules did not change: they
still read `TourismInteraction` rows. What changed is which rows can exist.

### 20.3 The visitor

`src/server/telemetry/visitor.ts`. A browser gets a random `mt_visitor` cookie;
the session id on every signal is `sess-` plus a truncated SHA-256 of it, so
the cookie itself is never stored. `TouristSession` holds the effective
analytics choice, which is what lets a payment confirmed by a webhook — with no
browser present — respect it.

This replaces the fixed `sess-live-demo` id in demo mode as well. The demo
still resets to a known state, because a reset clears every observed signal.

### 20.4 Consent

A one-time notice on Explore Manipur: "OK, count my visits" or "Don't record
my visits", equally easy. `/explore/privacy` shows what is counted, switches
the choice either way, and can delete what this browser was already counted
for.

- **Before answering**, visits are counted: the notice is a choice, not a
  wall. This follows CLAUDE.md §9 (anonymous identifiers, aggregation, a consent
  flag), and `TouristSession.consentAnalytics` already defaulted to true.
- **Global Privacy Control** (`Sec-GPC: 1`) counts as "don't" until the
  visitor explicitly says yes, and such a browser is not shown the notice.
- **Check-ins and feedback** are recorded whatever the choice: each is sent on
  purpose, behind its own consent step, and declining analytics must not
  silently discard a complaint.
- **Declining never disables a feature.** Trips, bookings and the storyteller
  work the same; they just leave no signal.

Whether counting should instead wait for a yes is a policy decision for the
department, and a one-line change in `analyticsAllowed()`.

### 20.5 What the intake checks

| Check | Rule |
|---|---|
| Who may send what | A browser may send `DESTINATION_VIEW` and `NAVIGATION_START` only. Searches, plans, check-ins and bookings are recorded by the server as a side effect of the action, so they cannot be posted |
| Origin | Same-site only (`Sec-Fetch-Site`, or `Origin` for older browsers) |
| Automated clients | Crawler and HTTP-library user agents are dropped |
| Size | 16 KB and 25 events per batch |
| References | The destination and experience must exist |
| Metadata | A browser may attach a `surface` label and nothing else — no free text, no coordinates |
| Repeats | A view of the same place within 30 minutes, or a navigation start within 10, is one signal. One check-in per visitor, place and day |
| Retries | Each browser event carries an id; the database's unique key catches a retry that lands in another process |
| Floods | Per visitor, browser events get a burst of 30 then one every two seconds, applied before the repeat checks so a resent event is still throttled |

The endpoint answers 204 to any well-formed batch, whatever was kept, so
probing it reveals nothing. What was dropped, and why, is counted in
`TelemetryCounter` and shown on `/gov/sources` under **Live signal intake**,
next to the share of the working set that is real rather than synthetic.

The repeat windows and rate limits are per process and use wall-clock time,
not the demo clock, which never moves.

### 20.6 Starting without synthetic history

`SEED_SYNTHETIC_SIGNALS` (default: the value of `DEMO_MODE`) decides whether
the seed writes generated interactions, feedback, availability snapshots and
enquiries. With it off, the database starts with only the catalogue, and every
signal in it came through the intake. Every page was loaded against that empty
state as each role; all render, with their empty states.

The demo businesses, creators and campaigns are still seeded either way, and
labelled DEMO_SYNTHETIC. Replacing them with a real catalogue is a data-loading
task, not an intake one.

### 20.7 Not done

- **Scheduled rollups.** Analytics still compute from raw rows on each request.
  At one district's pilot volume that is fine; at state volume they need
  precomputed daily aggregates and a job runner.
- ~~Trips are still in memory.~~ Persisted: see §22.
- **Retention.** Signals are kept indefinitely. A retention period is a
  departmental decision.
- **Per-IP limits.** Limits are per visitor cookie; clearing cookies resets
  them. Behind a proxy, a trusted client-IP header would allow a second limit.
- **Offline queueing.** A beacon sent with no connection is lost. The field-use
  offline mode in the roadmap would need a persisted queue.

---

## 21. Account administration

### 21.1 What it does

`/gov/accounts`, for administrators only (`account:manage`, granted to no other
role). Other government roles see why the page is empty, not the list: it is
staff email addresses.

| Action | On | Notes |
|---|---|---|
| Issue | Government accounts | The only way a government account comes into being outside the seed |
| Change role | Government accounts | Applies on the holder's next page load; sessions read the role from the database |
| Disable / enable | Any account | Disabling ends every session; enabling does not revive them |
| Unlock | Any locked account | Clears the 5-failure lockout early |
| Reset password | Any active account | Issues a new temporary password and ends every session |

Every signed-in account can change its own password at `/account/password`,
which keeps the session making the change and ends the others.

### 21.2 Temporary passwords, without email

The platform has no email channel, so an administrator hands a new starter
their first password in person. That password:

- is 16 characters from an unambiguous alphabet (about 92 bits), grouped in
  fours so it can be read out;
- is shown once, in the result of the action, and stored only as a scrypt hash;
- expires after 72 hours;
- must be replaced at first sign-in. Until it is, every page redirects to
  `/account/password` and every Server Action treats the account as signed
  out, because someone other than the holder has seen it.

### 21.3 Not locking the department out

- **No self-service changes to one's own standing.** An administrator cannot
  disable, demote or reset themselves; another administrator has to.
- **The last active administrator cannot be removed**, by demotion or by
  disabling. The count and the change run in one serializable transaction, so
  two administrators demoting each other at the same moment cannot both
  succeed — the integration suite runs exactly that race and asserts one
  administrator remains. The loser is told another change happened, and is not
  retried silently.

### 21.4 Audit trail

`AccountAuditEvent` records issue, role change, disable, enable, unlock,
password reset and password change, with who did it and when. Emails are
copied into the row so it still reads correctly later, and no password —
temporary or chosen — is ever written to it; the tests check the stored rows
for the passwords they issued. The demo reset leaves the audit trail alone.

### 21.5 Demo accounts

The seed keeps demo accounts' hashes so a reset does not sign anyone out. If an
administrator resets or changes a demo account's password during a
demonstration, the next seed puts the published password back and clears the
temporary-password state, so the one-click sign-in keeps working.

### 21.6 Not done

- **Partner and creator accounts cannot be issued here.** They register
  themselves with their business or creator profile, which is where the
  binding comes from.
- **No bulk import** of department staff, and no directory sync — the seam for
  enterprise SSO remains `authenticate()` (§18.6).
- **No second factor.** For administrators in particular, TOTP would be the
  next step.

---

## 22. Trips

### 22.1 What was wrong

Trips lived only in memory, so a restart lost every plan. That was the known
gap. Two worse faults turned up while closing it:

- **Planning a journey failed against MySQL.** Each stop on a plan raises an
  `ITINERARY_ADD` signal that names its trip, and `TourismInteraction.tripId`
  is a foreign key to `Trip`. With no trip row the database refused the
  signal, and the action failed for every visitor who allowed analytics.
  Feedback sent during a planned trip failed the same way.
- **Record ids restarted at 0001 with every process.** `nextId()` was a
  per-process counter, so after a restart:
  - new signals took ids MySQL already held and were dropped as duplicates;
  - feedback failed to save;
  - a new campaign, business or creator (written with an upsert) replaced
    whichever existing record held that id.

  Ids are now creation time plus 40 random bits. `ingest()` also stops
  treating every unique-key failure as a duplicate beacon, which is what had
  hidden the problem: only an event carrying a client event id can collide
  legitimately.

### 22.2 How trips work now

- **Every plan gets a fresh id.** It used to be `trip-<session>`, so a second
  plan overwrote the first, and signals raised for the first plan then pointed
  at the second.
- **Trips are read from MySQL when a page needs one**, like bookings, not held
  in the cached working set. No analytics read trips, so caching them would
  only grow memory. `src/server/data/trips.ts` holds the rules, and without a
  database it applies the same rules to the in-memory state.
- **Every read takes the visitor's session.** A trip id is never enough, and a
  write refuses to overwrite a trip that belongs to another session.
- **A trip is `DRAFT` when planned and `SAVED` when the visitor saves it.**
  Before, planning set `SAVED` and the save button set `ACTIVE`.
  - The next plan replaces the visitor's draft.
  - Saved journeys stay, up to 10. Past that the visitor chooses one to delete,
    rather than the oldest vanishing unasked.
- **The current trip is the one updated most recently** — planned, re-planned,
  saved or switched to — using a new `updatedAt` column. `createdAt` cannot
  order trips in demo mode, where `now()` is fixed.
- **The journey page lists the other saved journeys**, with "Open" and
  "Delete".
- **The privacy page counts the visitor's stored journeys and can delete them
  all.**
- **Deleting a trip keeps the demand signals raised while planning it.** The
  database clears their trip reference (`ON DELETE SET NULL`), and the
  demand they record still counts.
- **A stored trip whose JSON no longer parses is skipped**, not thrown, so a
  later change to the trip profile cannot break a returning visitor's page.

### 22.3 A reset bug on the way

`ensureVisitor()` remembered which `TouristSession` rows it had written, for
the life of the process. A demo reset empties that table, so a returning
visitor's next trip failed its foreign key to `TouristSession`. The memory is
now kept per loaded state, and a reset loads a new state. The integration suite
reproduces the reset and plans again.

### 22.4 Not done

- **No retention period.** Saved journeys stay until the visitor deletes them.
  A job to remove trips well past their end date belongs with the scheduled
  jobs (next).
- **A journey lives in one browser.** Visitors have no accounts by design, so
  clearing cookies loses access to it: the rows stay, but nothing can reach
  them.

---

## 23. App shell

Every screen now shares one frame (`src/components/shell/ShellFrame.tsx`,
entered through `AppShell.tsx`), replacing four near-identical headers and a
demo bar above them.

- **The top bar switches interfaces.** Tourist, Department, Creator, Partner,
  then About. It spans the full width, with the account menu and the demo icon
  at the right end.
- **Each interface's sections are in a sidebar** at the left edge, headed by
  the interface's name. Content fills the rest of the width, to a cap of
  1680px, rather than sitting in a centred 1100–1600px column.
- **Below the `lg` breakpoint (1024px)** the sidebar and the interface switch
  move into a drawer behind a menu button. The tourist interface keeps its
  bottom tab bar there as well.
- **The demo bar is now an icon.** In demo mode, a small amber ▧ icon, the
  same glyph and colour as the DEMO DATA provenance badge, sits in the top
  right corner of every screen and opens the demo panel (§11). Figures still
  carry their own provenance badges, so a screenshot without the panel open is
  still labelled where it matters.
- **About OneStop Manipur and the ecosystem page use the same frame** without a sidebar.
  Sign-in and password pages keep their focused, frameless layout.
- **A button colour is a variant, not a class override.** `cn()` joins classes
  without resolving conflicts, so `className="bg-white text-brand-800"` on a
  primary button lost the text colour to the variant and rendered white on
  white. Dark surfaces use `variant="inverse"`.
- **The logo is the full wordmark**, OneStop Manipur on Loktak teal with the AI picked
  out, so it never reads as the purple of a selected item.
- **Sidebar sections carry icons**, each on its own colour tile that turns
  solid when the section is current. They come from `lucide-react`, the one
  dependency this adds. Layouts name an icon by string (`icon: 'Route'`),
  since a component cannot pass from a server layout into the client frame;
  `src/components/shell/nav-icons.tsx` maps the names.

---

## 24. Journeys screen

The tourist interface no longer has a separate home. `/explore` is the
planner and the visitor's journeys on one screen:

- **The planner is a conversation.** The request appears as the visitor's
  message, and the reply names the journey, its days and stops, and the
  model's introduction, with "View journey" and "Save". The thread is kept in
  `sessionStorage` for the tab, so opening a journey and coming back keeps it.
  A reply whose journey has since been replaced or deleted says so instead of
  linking to nothing.
- **The list beside it is every stored journey**, saved or not
  (`listTrips()`), with what the visitor typed to get it. The first is the
  current journey, the one the live trip follows.
- **A journey opens at `/explore/journey/[id]`**, read through the session like
  every trip read, with "← Your journeys" back to the planner. A missing or
  foreign id shows "This journey is not available".
- **Re-planning acts on the journey that is open** (`replanJourney(tripId,
  condition)`), not on the current one, and validates the condition server
  side. The live trip page keeps `replanCurrentTrip()`.
- **`/explore/journey` redirects** to the current journey, or to the most
  recent plan, or to the planner, so older links still work.

(§25 replaced "Travel with this journey" with starting a journey.)
- **The trending destinations and the three value cards left with the old
  home.** Destinations are already ranked by interest on their own page, and
  About OneStop Manipur carries the pitch.

---

## 25. The complete planner

A request used to produce one list of places, and the latest plan counted as
the visitor's current trip. It now produces two or three complete options, the
visitor chooses one, and a journey is current only while it is actually under
way.

### 25.1 What the visitor gives

- **Words**, as before. They can now also carry the group and the budget:
  "for 4 people", "a family of five", "with my parents" (3), "solo";
  "₹25,000", "30k rupees", "1.5 lakh", "a budget of 18000". A small number
  after "under" or "within" is taken as days, not rupees.
- **Dates and times**, optional, in the composer: the day and time of arrival
  and of departure, in Manipur time. Given dates decide the number of days,
  overriding any number in the words. The planner refuses a start before
  today, an end before the start, and more than 10 days.
- **Travellers and a budget**, optional, in the composer. They override what
  the words said. A budget amount sets the stay level (simple, comfortable,
  premium) by what it allows per person per day, unless a level was chosen.

### 25.2 The day, rebuilt

- **Each day starts where the night was spent**, not in Imphal every morning.
  The day's anchor is the best remaining place that fits the day, with drives
  over an hour counted against it and none over five hours allowed.
- **The last day leans back towards Imphal**, where the trip ends, and with a
  departure time it must leave the drive back plus two hours before the flight.
- **Arrival shortens the first day**: nothing starts until an hour after
  landing, and after a late arrival the day is left empty rather than crammed.
- **A night is spent where the day ends** when a verified partner has a stay
  within 45 minutes. Otherwise it is spent back in Imphal when the day ends
  within two hours of it, or where the day ends, flagged "no partner stay
  yet".
- **The theme follows the places planned**, not only the first interest named.

### 25.3 What a plan includes

- **Only verified, participating partners** are planned: the rule that decides
  who counts towards capacity. Each partner record now has a `rate` (amount,
  per night or per day, and what it covers: a room, a guide or a vehicle), so
  a cycle-tour operator is never mistaken for car hire. Rates in the seed are
  demo data, like the experience prices, and are labelled as such.
- **Stays**: a room per two travellers, cheapest first on a simple budget, most
  comfortable first on a premium one, and otherwise nearest the room share of
  the budget given (a planning convention of 35%).
- **Transport**: a car with driver per four travellers, for every day, from the
  partner with vehicles nearest Imphal.
- **Guides**: at most one a day, for the first stop of a kind a guide adds to
  (heritage, history, adventure, wildlife), from a partner based there or within
  15 minutes whose own place shares a kind of interest with the stop.
- **Cost**: stays, transport, guides and experience places, each line with how
  it was reached, against the budget. It states what it leaves out: meals not
  included with a stay, entry fees, getting to Imphal, and any night with no
  partner stay. It is labelled an estimate, and demo data where the rates are.

### 25.4 Options

The best match is always first. The others, in order of preference, until
there are three:

1. **Another route**: somewhere else entirely where enough remains, otherwise
   without the places the best match builds its days on. Kept only if at least
   a third of its places differ.
2. **Lower cost**, first when the best match is over the budget: simpler stays
   and one paid experience, kept only if it saves 8% or more.
3. **Slower pace** or **More to see**, kept only if its places differ.
4. **Shorter drives**: everything within about two and a half hours of Imphal.
5. **A wider mix**: culture, nature or heritage added to a narrow request.

A narrow request can end up with only two options. Options share an
`optionGroupId`. They are drafts: the next request discards the options that
were never chosen, and choosing one discards its siblings.

**Choosing is what counts as putting places on an itinerary.** The
ITINERARY_ADD demand signals are raised then, once, for the chosen plan's
places. They used to be raised for every plan made; three options per request
would have tripled them, and a plan that was only looked at is not intent.

### 25.5 Current, upcoming, finalised, past

- An **option** is never current, even if its dates cover today.
- A **chosen** journey is current while now falls inside its travel window
  (arrival to departure, Manipur time; the whole day where no time is given),
  **upcoming** before it, **past** after it, and **finalised** when it has no
  dates.
- A **started** journey (status ACTIVE) is current whatever its dates, until it
  is ended. Starting one ends any other under way.
- The live trip, check-ins and feedback follow the current journey. With none,
  the live trip page offers to start one.
- The clock is the app's clock, so in demo mode today is 16 September 2026, as
  on every other screen, and the date pickers start there.
- Journeys show both dates: **Plan for** (the travel window, or "dates not set")
  and **Planned on** (when the plan was made).

### 25.6 Places found online

With `AI_PROVIDER=gemini`, after planning, one Google Search grounded request
covers every place of every option (`src/lib/ai/web-search.ts`).

- **Only area names are sent**, never the visitor's own words.
- **The model is not trusted to name places.** A place is kept only when a
  segment of the answer that Google grounded in search results contains it,
  and it carries those results as its sources. Lines naming an unknown area or
  kind, a link instead of a name, or a registered partner are dropped.
- **No price is ever taken from the web.** A note containing any figure is
  dropped.
- **Each place is tagged "Not a partner · found online"**, and listed beside
  the plan's partner stays, transport and guides, never priced or costed.
- Results are cached for 12 hours per set of places, and each visitor gets six
  searches an hour, since each is a billed call. A failed search says so and
  offers to try again. With any other provider the search is off and says so.

### 25.7 Data

- Migration `20260922060000_complete_planner`: `Trip.startDate` and `endDate`
  become nullable, and `arriveTime`, `departTime`, `logisticsJson`,
  `optionGroupId`, `optionLabel` and `startedAt` are added.
  `TourismBusiness.rateJson` is added. Dates on existing trips were cleared,
  since they had been set automatically, never chosen.
- Rates live in `data/businesses.json`; `npm run db:seed` loads them.

### 25.8 Not done

- **Partner availability is not checked** against the dates. Partners report
  availability daily, but not for future dates.
- **Nothing is booked.** Stays, transport and guides are planned and costed;
  experiences can still be requested as bookings (§19).
- **Re-planning changes places, not times.** A rain or closure swap keeps the
  replaced stop's start time.
- **Search results are unverified by design**, and the grounding links are
  Google redirect URLs, which may expire.

## 26. Discover

Destinations and Experiences were two sections with two lists. They are one
screen now, `/explore/discover`, with one entry in the sidebar and the tab bar.
`/explore/destinations` and `/explore/experiences` redirect there, keeping a
category, an enquiry (`?experience=`) or a booking request (`?book=`). A
destination's own page, `/explore/destinations/[id]`, is unchanged.

### 26.1 The screen

- **Destinations or Experiences**, beside the title, switch the list. Both
  lists are two cards to a row.
- **A destination card carries its experiences**, up to four small cards below
  its tags, with "+N more here" leading to that place's experiences.
- **An experience card names its place**, with the place's artwork, linked.
- The booking and enquiry forms moved here from the old Experiences page.

### 26.2 The chat

There is no search box. "Chat with AI" opens the chat in the left third of the
screen, beside the list, or over the whole screen on a phone.

- **Nothing is indexed.** The data is a few dozen curated records, so a message
  is matched against place names and experience titles directly, and an open
  question ("quiet nature spots") gets the same term match the old search had.
- **The chat's memory is one pointer.** Each reply names the place or
  experience it was about (`focus`), and the next message is sent with it. A
  short follow-up with no name in it ("when should I go?") is read against it.
  The transcript itself stays in the browser tab (sessionStorage).
- **What is asked picks the reply**: an overview on first mention, what to do
  there, when to go and how long to stay, photos and videos, or a plan. A
  further question about the same place is answered from its verified facts,
  as "Ask the place" on its page (E3) would, and its cards are not shown again.
- **Every reply ends with next steps**, from seeing the place, to what to do
  there, to booking a local experience and planning a trip with it. A step
  already taken in the conversation is not offered again, and booking and
  planning are never the ones trimmed.
- **"Plan a trip with X"** opens the planner with "A trip that includes X"
  filled in, not sent. The planner now honours a place named in a request: it
  scores well above interest matches ("Included because you asked for X"),
  though access and safety rules still apply (Moreh is still never planned).
- **Clicking a place** opens the same popup as a trip's "Explore" button
  (`buildDestinationPreview`, now shared by the page, the trip and the chat).

### 26.3 Photos, videos and the web

Asking for photos, videos or anything "online" about a place, or pressing
"Photos and videos of X", looks the place up (`lib/ai/web-media.ts`):

- **Wikipedia**: the article's summary, and up to six photographs from it.
  Each photograph links to its file page for author and licence. An article is
  used only if it is plainly about the place.
- **YouTube**: Gemini's grounded search proposes video links; each is kept
  only if YouTube's oEmbed confirms it exists and its title names the place.
  A video loads from `youtube-nocookie.com`, and only when pressed.
- **Facts**: up to five sentences from the same search, each kept only if
  Google's grounding ties it to results, shown with those sources. A sentence
  that mentions a price is dropped.
- It is all labelled Public / external, "not verified by OneStop Manipur".
- **Only the place's name and district are sent**, never the visitor's words:
  the lookup takes a destination id. A name the chat does not recognise is not
  looked up.
- The Gemini part counts against the same six searches an hour as §25.6, and a
  complete result is cached for 12 hours. Wikipedia is asked regardless, so
  with the search off or used up the chat still shows the article and photos,
  and says why the rest is missing.

### 26.4 Not done

- **Only destinations are looked up online**, not experiences or businesses.
- **Photographs are not moderated** beyond coming from the Wikipedia article;
  a photograph there that is not of the place would show.
- **A video's title is the only check that it is about the place.**

## 27. Maps on Trip and Discover

A real, tiled map (MapLibre GL, `src/components/map/`) replaces the schematic
outline on the tourist screens. The outline (`TourismMap`) stays as the
offline fallback and on the Department screens.

### 27.1 Screens

- **List / Map toggle** on Discover and on a trip (`?view=map`): the map
  becomes the main view, with the same places listed in text beside it (below
  it on a phone). Discover's filters and Destinations/Experiences keep the view.
- **Trip**: stops numbered in timeline order across days (the timeline shows
  the same numbers), coloured by day; day routes; nights away from a stop;
  Imphal as start and finish; day filter; "Play the route" flies through the
  stops in 3D. The timeline view keeps a smaller map card; Live trip shows one
  opened on today.
- **Discover**: a pin per place, with its kind of place and number of
  experiences. Pins that sit on top of each other (Imphal's sights) are fanned
  out. With the chat open, an answer moves the map to the places it names.
- **Every pin** has a tooltip on hover or focus. Pressing it opens a card with
  a photograph, the verified summary, **Explore** (the trip page's popup),
  **Directions** (Google Maps, in the visitor's own app), and Book/Enquire or
  "Plan a trip here".
- Basemaps: streets with hill shading, satellite, and "3D hills" (terrain).

### 27.2 External services

All are public and need no key. Only public coordinates and place names are
sent; nothing typed by the visitor.

| What | Service | When it is missing |
| --- | --- | --- |
| Street map | OpenFreeMap (OpenStreetMap data) | The offline outline is shown |
| Satellite | Esri World Imagery | Switch back to Map |
| Relief, 3D | AWS Terrain Tiles (Mapzen) | Flat map |
| Road routes | OSRM public server (`ROUTING_URL`; `off` disables) | Dashed straight line, labelled |
| Card photo | Wikipedia/Wikimedia, cached 12 h, no Gemini call | Generated artwork |

Road distance and driving time per day come from OSRM and are labelled as
such. The plan's own times are still the planner's estimates.

### 27.3 Build note

MapLibre 6 loads its web worker from a file next to its own module, and the
bundler does not ship that file. `scripts/copy-maplibre-worker.mjs` (run on
`postinstall`) copies it to `public/maplibre/`, and the map calls
`setWorkerUrl`. Without it the style loads but no street tile is ever
fetched. The map counts as ready once its style has loaded, not after every
first tile, so a slow connection still gets pins at once.

### 27.4 Not done

- The public OSRM and OpenFreeMap servers are fine for a demo, not for
  production traffic; a real deployment would host or buy both.
- No clustering: with 14 destinations the fan-out is enough.
- No "where am I" location on the Live trip map.

## 28. Emergency and safety

The first workstream of the hackathon realignment (docs/10). Problem
statement 8 asks for emergency services in the one-stop platform; nothing
covered it before.

### 28.1 The page

`/explore/emergency`, in the tourist sidebar as its own section (risk tone,
`ShieldAlert`).

- **Three primary call cards** — 112, 108, 100 — as `tel:` links, 112
  emphasised. Then the other lines: 101, 1363, 1091, 1098, 1077.
- **Nearest help** (`NearbyHelp`, the only client component): on a press it
  reads the browser's location, sorts the facilities by straight-line
  distance, and shows the closest four with directions. It also renders the
  coordinates with **Copy location message** and, where the browser supports
  it, **Share** — a message someone else can act on.
- **By district**: the complete facility list, always rendered, so the page is
  useful when location is refused or unavailable.

Everything needed in an emergency is server-rendered HTML and `tel:` links:
the page works with JavaScript off. Locating the visitor is an addition to a
list that is already complete, never a precondition.

### 28.2 Honesty about what is known

Judges and visitors both get told what the data is:

- **Numbers** are India's published national short codes only (112, 100, 101,
  108, 1091, 1098, 1077, 1363). They are real, nationally routed and free.
  `OFFICIAL`.
- **No per-facility telephone number is listed.** None could be verified, and
  an unanswered number in an emergency is worse than none. 112 reaches them
  all, and the page says so.
- **Facilities** are real public institutions (RIMS, JNIMS, district hospitals,
  district police control rooms, the Directorate of Tourism). `PUBLIC_EXTERNAL`.
- **Positions are district-level only** (`precision: DISTRICT_CENTRE`, the
  centroid from `districts.json`). So "Directions" searches the map for the
  building *by name* rather than routing to a centroid, which outside Imphal
  would be a field. Distances are labelled straight-line, with a note that
  hill roads are longer and can close in the monsoon.

### 28.3 Privacy

- The page records nothing. A visit here is not tourism intelligence and the
  department has no reason to know who opened it — so no `ViewSignal`,
  deliberately.
- Location is read only on an explicit press, stays in the component, is never
  sent to the server and is never stored. The page says so where it is shown.

### 28.4 Data

`data/emergency-contacts.json` and `data/safety-facilities.json`, schemas in
`src/lib/types/safety.ts`, parsed in `seed.ts`, read through
`getEmergencyContacts` / `getSafetyFacilities` / `getSafetyFacilitiesIn`.
Curated reference data, so no Prisma model — the same treatment as heritage
experiences.

### 28.5 Not done

- **No offline cache.** The page needs the network to load at all, because the
  tourist layout is dynamic. Genuine offline access needs a service worker,
  which is an app-wide decision, not a page-level one. This is the largest
  remaining gap in the workstream.
- Facility coordinates are district centroids; surveyed positions would let the
  distances be honest to the kilometre.
- Not on the `/m` mobile app: this pass is desktop-only by decision.
- No state disaster bulletin, road-closure feed or embassy/FRRO contacts.

## 29. Events and festivals

Workstream D of docs/10, problem statement 7. Events existed as ten thin
records surfaced inside destination pages; they are now a section of their own.

### 29.1 The model, extended

`eventSchema` gains `venue`, `organiser`, `admission`
(`FREE` | `REGISTRATION` | `TICKETED`), `ticketPrice`, `capacity`,
`officialUrl` and `datesProvisional`. All are optional or defaulted, so the
existing rows stayed valid. `EVENT_CATEGORY_LABEL` and `EventCategory` are now
exported rather than inlined at each call site.

`datesProvisional` is the honest one. Most Manipuri festivals follow the
traditional lunar calendar and are confirmed by their organisers each year, so
the interface shows those dates as expected — a "Dates confirmed nearer the
time" badge on the list and a sentence on the event — instead of stating them
as fixed.

### 29.2 Screens

- **`/explore/events`** — everything not yet finished, soonest first, grouped
  by month, with a sticky month heading. Filter by kind and by district; both
  are plain links over `searchParams`, so the page stays a server component and
  filtering works without JavaScript.
- **`/explore/events/[id]`** — one event: the destination's artwork as a hero,
  when (with "in 3 weeks"), where, organiser, how to get in, expected
  attendance, and the ways on — the destination, **Plan a trip around it**,
  directions, the organiser's own page. Other events at the same place follow.

In the tourist sidebar as its own section (`CalendarCheck`, warn tone).

### 29.3 What the seed says, and does not

Ticket prices are attached only to the clearly synthetic, platform-run walks
and workshops (`ev-011` Ima Keithel food trail, `ev-012` Loktak dawn
photography). **No price is attached to a real state or community festival** —
maTAI does not sell entry to Sangai or to Ningol Chakouba, and their entry
terms are the organiser's to set. Each event page says so.

Two events were added to exercise the admission states, and `ev-013` (INA Day
at Moirang) to fill the April window.

### 29.4 Not done

- **No registration or ticketing yet.** The event page says so where the
  button would be. `Booking` is hard-wired to an experience
  (`Booking.experienceId` is required), so holding a place at an event needs
  the same generalisation that bookable stays need — see docs/10 workstream A.
  Doing A first makes this a small addition rather than a second, parallel
  booking system.
- No "add to my trip" from an event, and no reminders. Reminders need a
  delivery channel; the platform has no email or push infrastructure.
- No map view of the calendar, though the pieces (§27) exist.
- Not on the `/m` mobile app: this pass is desktop-only.

## 30. One ledger, three kinds of booking

Workstream A of docs/10, problem statement 5. Pulled ahead of the rest of D
because event ticketing needs the same generalisation: building it twice would
have meant two reference series, two payment paths and two sets of refund
rules.

### 30.1 What changed

`Booking.experienceId` was required, so only an experience could be booked. A
booking now carries a `kind`:

| Kind | Points at | Priced per | Dates |
| --- | --- | --- | --- |
| `EXPERIENCE` | `experienceId` | person | one day |
| `STAY` | `businessId` (the property) | room per night | `date` → `endDate` |
| `EVENT` | `eventId` | person | the event's day |

`experienceId` is nullable, `eventId`, `endDate` and `rooms` are new. The
migration is additive: every existing row is an experience booking, which is
what the default gives it, so nothing was rewritten or lost.

The state machine, the reference series, the payment window, the expiry pass
and the refund rules are untouched and shared. A stay is requested, accepted by
the host, paid for and cancelled exactly as an experience is — which is right
for a homestay, where the host decides whether they have the room.

### 30.2 Pricing

`amountPaise` is the only thing that differs, and it is computed in one place
in `createBookingRequest`:

- experience, event: `unitPricePaise × partySize`
- stay: `unitPricePaise × nights × rooms`

`unitPricePaise` therefore means "per person" or "per room per night"
depending on the kind, which `bookingSubject()` turns into words
(`src/server/bookings/subject.ts`) so the tourist, host and mobile screens
cannot describe the same booking differently. Nights are arrival to departure,
exclusive of the departure day; at most 30 nights and 6 rooms per request.

The room rate is read from the property inside `requestStay`, never taken from
the form, so a page cannot quote a price the host has not set.

### 30.3 Stays on the tourist side

`/explore/stays` lists the six participating homestays and hotels that quote a
room rate, filterable by kind and district. `/explore/stays/[id]` shows the
property and the request form.

A property whose host has no partner account cannot answer a request, so
rather than take one nobody would read, the page says it is not bookable
online yet and points to the destination instead. `isStay()` is deliberately
narrow: a guide and a tour operator also have rates, but theirs buy a person's
time, not a room, so only `covers: ROOM` with `unit: NIGHT` qualifies.

### 30.4 Tests

`tests/bookings.test.ts` covers the new pure rules (nights across a month end,
departure before arrival, the 30-night cap, room-night pricing).
`tests/integration/bookings.test.ts` takes a stay through MySQL: three nights
in two rooms priced at room-nights rather than guests, the duplicate rule
keyed on the property, and the same acceptance and checkout path as an
experience. 26 pass there, 379 across the suite.

### 30.5 Not done

- **Event tickets are not wired up yet**, though the ledger now holds them.
  That is the rest of workstream D.
- No availability check against `AccommodationSnapshot`: a request can be made
  for nights the host has already filled, and they decline it by hand. Holding
  inventory needs a lock the prototype does not have.
- Enquiries are still experience-scoped, so the non-bookable stay has no form.
- Not on the `/m` mobile app: this pass is desktop-only.

### 30.6 Unrelated failure found on the way

`tests/integration/auth.test.ts` has six failures that predate this work:
it looks for a demo account with `governmentRole: 'OFFICER'`, and
`DEMO_ACCOUNTS` only has `ADMINISTRATOR`, so `officer` is undefined. Not
caused by, and not fixed by, this change.
## Rename: maTAI → OneStop Manipur

The product is now **OneStop Manipur**. Every visible name changed: page
titles, the wordmark (One**Stop**), the About page, the Android app name and
package id (`in.onestopmanipur.app`), prompts, data-source owners and docs.
Partner badges read "OneStop partner". Internal identifiers keep the old
prefix on purpose — CSS classes (`matai-pin`), map source ids (`matai-dem`)
and browser storage keys (`matai-planner-chat-v2`) — because renaming the
storage keys would drop visitors' saved planner threads for no visible gain.
The repository is still called maTAI-OS.

## 31. Holding a place at an event

Finishes workstream D of docs/10. The ledger already took an `EVENT` booking
(§30); this gives it an organiser, a capacity and a form.

### 31.1 Only an event with a host can be booked

`Event` gains `organiserBusinessId`. Without one, no place can be held — and
that is the point. A state or community festival has no partner on the
platform and its entry terms are not ours to take money for, so Sangai,
Ningol Chakouba and Khongjom Day stay "open to all, turn up".

Four events name a partner: the Imphal heritage walk (Battlefield Routes
Manipur), the Ima Keithel food trail (Meitei Kitchen Table), the Loktak dawn
photography meet (Sendra Sunrise Boats) and a Tangkhul village evening
(`biz-013`, the seeded demo partner — so the whole request → accept → pay path
can be walked with the demo account).

The event page shows the form only when the organiser is a participating
partner **with an account to answer with**; otherwise it says the organiser
does not take bookings here, and once the event has begun it says that
instead.

### 31.2 Capacity

`placesTaken(eventId)` sums `partySize` over every booking still alive,
including requests the organiser has not answered. An event can therefore read
as full while some of those are later declined — the safer way round for a room
of twelve, and the places come back the moment a request is declined, which is
covered by a test.

Expiry is scoped with a new `{ eventId }` `ExpiryScope` rather than `'ALL'`:
a count at one event must never close another traveller's booking elsewhere.

### 31.3 A free place is confirmed, not checked out

A `REGISTRATION` event costs nothing, so its booking has `amountPaise: 0`.
`createBookingRequest` allows a zero price for an `EVENT` only, and
`respondToBooking` confirms a zero-amount booking outright on acceptance
rather than moving it to `AWAITING_PAYMENT` — there is no checkout worth
sending someone to for nothing. Ticketed places still go through Razorpay
unchanged.

### 31.4 Two bugs found while wiring it up

- **The `Event` table was missing every field added in §29.** The interface
  reads events from the JSON seed, so the pages were right, but the database
  copy — which the foreign key and the department views use — still had only
  name, time and place. Added, with a migration.
- **Seeding would have failed.** `event.createMany` ran before
  `tourismBusiness.createMany`, so the new organiser foreign key had nothing
  to point at. Events now seed after businesses, and are truncated before
  them.

### 31.5 Getting the rows in without losing data

`npm run db:seed` truncates bookings, trips, sessions and interactions — it is
a destructive development operation, as its own comment says. Rather than run
it, the new and changed event rows were upserted into the `Event` table alone,
leaving every booking and browser-made trip in place. Worth remembering: after
changing a file in `data/`, the database copy needs syncing, and a full seed is
not the only way.

### 31.6 Not done

- No "add to my trip" from an event, and no reminders: reminders need a
  delivery channel the platform still does not have.
- The organiser sees an event booking in the partner inbox through the shared
  `bookingSubject()`, but there is no per-event view of who is coming.
- Not on the `/m` mobile app: this pass is desktop-only.

## 32. Taste of Manipur

Workstream C of docs/10. Two new entities, `Dish` and `FoodTrail`, live in
`src/lib/types/food.ts` — JSON seed data (`data/dishes.json`,
`data/food-trails.json`), no Prisma model and no migration, because nothing
about a dish needs to be written to: it is read-only reference knowledge, the
same shape as an emergency contact or a safety facility (§28), not supply like
a `Booking`.

### 32.1 A dish is knowledge first, a listing second

`Dish.businessId` is optional, and left unset on most of the eleven seeded
dishes: Nga Thongba (Loktak) and the two Ukhrul hill dishes are real food
worth knowing about before a visitor gets there, even though no partner on
the platform serves them yet. The dish page says so plainly — "No partner
serves this here yet — ask locally" — rather than inventing a host or hiding
the dish until one signs up. Only four dishes carry a `businessId`, all
pointing at the two food-adjacent partners that already existed in the seed:
Meitei Kitchen Table (`biz-012`, a restaurant at Ima Keithel) and Moirang
Local Food Trails (`biz-005`, home kitchens). This is the same honesty
convention as the safety facilities' missing phone numbers (§28) and an
event's "does not take bookings through this platform" (§31.1) — a gap shown
is more trustworthy than a gap papered over.

### 32.2 A trail is an order, not a booking

`FoodTrail.dishIds` is an ordered list; each dish keeps its own
`destinationId`, so a trail can span more than one place (`trail-003`, the
Ukhrul hill trail, and in principle a trail could cross Loktak and Andro)
without the trail entity needing a second, redundant list of stops. This
mirrors `Experience.additionalDestinationIds` (§27's "also visits" chips),
which is the only existing precedent for a multi-stop thing in this schema —
but a trail is a loose, walkable order a visitor follows themselves, not a
guided tour with a time. Three trails are seeded: a market morning in Ima
Keithel, a home-kitchen half-day in Moirang, and the Ukhrul hill trail.

There is no structured itinerary-template entity anywhere in the codebase —
`prisma/schema.prisma`'s `ItineraryItem` is a trip's own saved stop, not a
reusable template, and grepping the whole repo for "template" turns up
nothing else. So "drops into the planner" (docs/10 §3.C) is done the same way
an event or a destination already does it: `planHref` builds a freeform
"A trip that includes …" query string that the Gemini-backed planner
(`src/server/ai/trip-planner.ts`) reads like any other request. Building a
structured template that the planner assembles mechanically, rather than
reads as a sentence, is future work, not something this pass claims.

### 32.3 Provenance

Every dish and trail row is `provenance: 'DEMO_SYNTHETIC'`, `sourceId:
'src-demo-seed'` — the same as every event, including the real festivals
(Sangai, Ningol Chakouba) already in the seed. That is a deliberate match to
the existing convention rather than a new one: in this codebase `provenance`
tracks how a seed row entered the pipeline, not whether the underlying fact
is real, and `factType` (`DOCUMENTED` / `ORAL_TRADITION` / `INTERPRETATION` /
`PRACTICAL`, used on `VerifiedFact`) is the field that exists for cultural
authenticity — not a distinction this pass needed to add to `Dish`.

### 32.4 Not done

- No dish photography — dishes render on their destination's generated scene
  via `DestinationVisual`, the same fallback every destination without a
  curated photo already uses.
- No allergy filtering beyond the `vegetarian` flag and free-text ingredients.
- Not on the `/m` mobile app: this pass is desktop-only.

## 33. Transport and shopping

Workstream F of docs/10. `TRANSPORT` had one business in the whole seed and
`ARTISAN` three, so both read as an afterthought on a platform that claims to
be a "one-stop" guide (PS1, PS8). This pass thickens both rather than
building either a fare marketplace or a shopping cart — no new `BusinessType`
values, no new booking kind, no rate shape beyond the existing per-day
`VEHICLE` rate.

### 33.1 What changed

- Seven new businesses: three `ARTISAN` (handloom stalls at Ima Keithel, a
  weavers' cooperative at Ukhrul, a border bazaar at Moreh) and four
  `TRANSPORT` (Imphal to Moirang/Loktak, Imphal to Moreh, Imphal to
  Tamenglong, Imphal to the Dzukou trailhead). `TourismBusiness` is now 33
  rows, up from 26.
- `TourismBusiness` gains an optional `products: string[]` — "what an artisan
  or shop sells, in their own words", not an inventory, nothing here is
  stock-checked. Added to the three pre-existing `ARTISAN` rows too.
- `DestinationDetails` gains two sections, both conditional on having
  something to show: "Shop & craft" (main column, near the experiences card)
  lists an artisan's own description and product chips; "Getting there"
  (aside, near "Before you go") lists a transport operator's description and
  reported rate. New `getArtisansFor` / `getTransportFor` in repository.ts,
  filtered to `PARTICIPATING` the same way `getBusinessesFor` already is for
  stays. Both flow through `buildDestinationPreview`, so they show wherever
  that does — the destination page, the trip's "Explore" popup, and the
  Discover chat's place card — without any of those three needing to know
  the section exists.
- The border businesses (Moreh) stay `PENDING_VERIFICATION` with an explicit
  "subject to current access advisories" note in their description, matching
  the existing seeded `Moreh Market Food Walk` (§ pre-existing) rather than
  presenting a sensitive border town as an ordinary shopping trip.

### 33.2 No live-service fare quoting

The plan (docs/10 §3.F) says "indicative fares on the routes the planner
already computes." `src/server/geo/road-route.ts` can compute a live
distance/duration between two points via OSRM, but `buildDestinationPreview`
is synchronous and read by three call sites; making it async to fetch a route
on every destination-page render would be a wider change than this workstream
warrants, for a number that would usually come back from cache anyway. What
ships instead is exactly what a stay or a guide already shows: the operator's
own reported day rate and their own description of the route in their words
("Imphal to Moreh road"). A live per-km fare estimate is future work, not
something this pass claims.

### 33.3 A day working alongside a second session on the same database

This pass landed while another Claude session was concurrently adding a
`LandingPage` feature to the same repository and the same dev MySQL database
— a genuinely shared, hard-to-reverse resource, unlike everything else this
prototype touches. Two things followed from that:

- `prisma migrate dev --create-only` diffs `schema.prisma` against the live
  database, not against "my change since I last looked." With the other
  session's `LandingPage` model already sitting in `schema.prisma` but not
  yet migrated, the generated migration bundled both changes into one file.
  Filing an unrelated feature's table under this workstream's migration name
  would have been wrong regardless of whose code it was, so the generated
  `migration.sql` was hand-trimmed to just
  `ALTER TABLE tourismbusiness ADD COLUMN productsJson JSON NULL` and applied
  with `prisma migrate deploy`, which applies a migration file as written
  without re-diffing. Confirmed clean with `prisma migrate status` before and
  after.
- The new/changed business rows were synced into MySQL the same way §31.5
  synced events — a one-off script upserting through `persistBusiness`, not
  `db:seed`, which truncates bookings and trips.
- Live verification in a browser is the one piece not done in this pass. The
  running dev server's in-memory cache predates these rows and only refreshes
  on process restart; restarting right now would hit the other session's own
  in-progress `landingPage.findMany()` query against a table that does not
  exist yet (confirmed by running `tests/integration/persistence.test.ts` in
  isolation), so it would take the shared server down for both sessions
  before their migration lands. Everything short of that is checked: the
  migration is applied, all 33 business rows are confirmed upserted, and
  `tsc`/`eslint` are clean. The Ukhrul destination page's "Getting there"
  card was confirmed rendering correctly against the pre-existing transport
  row before this session's edits began, which is the same code path the new
  rows go through.

### 33.4 Not done

- No live browser check of the new rows (§33.3) — pending a shared dev server
  restart.
- No live fare quoting (§33.2).
- No shared-seat or per-kilometre rate shape — every transport row quotes a
  private day hire, same as the one that existed before this pass.
- Not on the `/m` mobile app: this pass is desktop-only.
