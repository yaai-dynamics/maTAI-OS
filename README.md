# OneStop Manipur

**Manipur Tourism Intelligence Platform** — AI-powered tourism ecosystem for
Manipur connecting tourists, local tourism businesses, creators and the
Tourism Department through one shared tourism knowledge and intelligence
layer.

*The name: one stop for everyone in Manipur's tourism — the visitor planning a
trip, the host taking a booking, the creator telling the story and the
department deciding what to do next. (Formerly maTAI.)*

**Live:** <https://onestop-manipur.vercel.app> — phones open the mobile app at `/m`, computers the desktop site.

> **This is a prototype.** Figures are synthetic and labelled as such throughout.
> There is no integration with the Department of Tourism, and the official data
> tier is shown as explicitly *not connected* rather than filled with a generated
> number. Nothing here should be quoted as a tourism statistic.

---

## Interfaces

| | Who | What it does |
|---|---|---|
| **Explore Manipur** (`/explore`) | Tourists | A journey built from your own words, destinations explained rather than listed, local experiences, and a feedback loop |
| **Decision Room** (`/gov`) | Tourism Department | Tourism Pulse, destination intelligence, issues and sentiment, campaign and creator command, and an evidence-first AI analyst |
| **Create for Manipur** (`/creator`) | Creators | Campaign discovery, grounded AI content briefs, submission review, and analytics tied to tourism outcomes |
| **Tourism Partners** (`/partner`) | Homestays, guides, operators, artisans | Register for verification, report availability daily, and handle enquiries |

The government interface also carries district analytics, historical dashboards,
forecasting and opportunity analysis, partner and content review queues, creator
integrity and payouts, data source governance, and an exportable briefing.

They are not separate apps that share a logo. A destination, a campaign and a
feedback item are the same record in all three, which is why a tourist check-in
changes a government dashboard with no export step in between.

`/` opens the tourist home (`/explore`): the journey planner as a chat, with the
visitor's journeys listed beside it, each opening on its own page. The product overview — the interfaces,
the closed loop and the provenance rules — is **About OneStop Manipur** at `/about`, which
is also the page to present from.

Every screen shares one frame: the top bar switches between the interfaces and
About, and the current interface's sections sit in a sidebar on the left (a
menu drawer on smaller screens).

---

## Quick start

Requires **MySQL 8 or later**. No API key and no network are needed — the AI
layer runs deterministically offline by default.

```bash
npm install
cp .env.example .env         # then set DATABASE_URL

npm run db:migrate           # create the schema
npm run db:seed              # load 7,376 curated + generated rows
npm run dev                  # http://localhost:3000
```

```bash
npm run verify       # typecheck + lint + test + build
npm run test         # 299 unit tests + 63 against MySQL
```

The unit tests need no database. The integration tests skip themselves
unless `DATABASE_URL` is set.

### Signing in

Tourists need no account — `/explore` is public. The department, tourism
partners and creators sign in at `/login`.

With `DEMO_MODE=true` the seed creates five demo accounts (officer,
administrator, viewer, partner, creator) and the sign-in page lists them with
one-click buttons. The shared password is `manipur-demo-2026` and is published
on purpose, which is why these accounts are removed whenever `DEMO_MODE` is
off. See `docs/09-implementation-notes.md` §18.

Administrators issue department accounts, change roles, disable, unlock and
reset passwords at `/gov/accounts`. A new or reset account gets a temporary
password, shown once, that must be replaced at first sign-in. See §21.

### Bookings and payments

Travellers can request to book experiences whose host is on the platform. The
host accepts or declines at `/partner/bookings`, and an accepted request is
paid through **Razorpay in test mode**. To switch payment on, put test keys
from the Razorpay dashboard (Test Mode → API Keys) in `.env`:

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

Pay with UPI ID `success@razorpay` or card `4111 1111 1111 1111` (any future
expiry, any CVV). Live keys are refused. See `docs/09-implementation-notes.md`
§19.

### The trip planner

A request, with optional dates and times, travellers and a budget, comes back
as two or three options: the best match, another route, and a cheaper or
differently paced version. Each includes where every night is spent, a car
with driver, guides where they help, and local experiences, all from
**verified partners at their own rates**, and a cost estimate against the
budget. The visitor chooses one to keep. A journey is **current** once it is
started, or while today falls inside its dates.

With `AI_PROVIDER=gemini`, the planner also searches the web for stays, guides
and transport that are **not partners**. They are listed beside the plan,
tagged "Not a partner · found online", with their sources and never a price.
See `docs/09-implementation-notes.md` §25.

After `npm run db:migrate` on an existing database, run `npm run db:seed` to
load the partner rates the planner costs with. Without them it plans places
but no stays, transport or guides.

### Visit counting

Tourist signals — page views, directions, plans, check-ins — enter through one
intake (`/api/telemetry` for the browser, `ingest()` on the server) that checks
consent, origin, references, repeats and rate. Visitors see a one-time notice
and can stop or delete their counting at `/explore/privacy`. The department
sees what the intake recorded and dropped on `/gov/sources`.

`SEED_SYNTHETIC_SIGNALS=false` seeds without generated history, so a real
deployment starts with only observed data. See `docs/09-implementation-notes.md` §20.

### Database notes

`npm run db:migrate` pins every table to `ENGINE=InnoDB` via
`scripts/enforce-innodb.mjs`. This matters on WAMP, which defaults MySQL to
MyISAM — a storage engine with no foreign keys and no transactions, which this
schema requires. Use that script rather than calling `prisma migrate` directly.

`prisma/schema.postgres.prisma` keeps the Postgres form of the schema as the
production target. Only three mechanical differences exist; see
`docs/09-implementation-notes.md` §17.

---

## The 5-minute demo

Open any screen. The amber **▧** icon at the right end of the top bar marks
the prototype as demo data, and opens a panel that:

- states the **DEMO DATA** label in words;
- walks the running order from `docs/07-demo-script.md` step by step, with the
  line to say and a jump link for each;
- resets the prototype to its deterministic seeded state.

Running order: `G1 → G5 → G4 → C2 → C3 → E1 → E2 → E3 → E4 → E6 → G3 → G5 → /ecosystem`

The loop closes for real: the feedback submitted on **E6** is counted and
categorised on **G3** seconds later, and the campaign funnel on **G5** moves with
it. That path is covered by `tests/closed-loop.test.ts`.

---

## What makes it more than a dashboard

**Every number says where it came from.** Seven provenance categories are
enforced in code, the weakest input decides how a combined figure is labelled,
and no government figure renders without one.

**The model never produces a figure.** Each capability computes a complete
deterministic result first; the AI provider is handed that result and the
evidence and asked only to rewrite the narrative. With `AI_PROVIDER=mock` the
deterministic text *is* the answer, so the demo runs offline and identically
every time. With `anthropic`, `openai` or `gemini` (and that provider's key)
the prose is rewritten by the model, and any rewrite that carries a figure the
evidence does not contain is thrown away in favour of the deterministic text.

**Confidence is derived, not chosen.** A synthetic input caps it at MEDIUM, a
sample under 30 forces LOW, and a forecast can never exceed MEDIUM.

**Recommendations show their workings.** Creator matching is a deterministic
score across six weighted factors, every one of them displayed. Promotion
recommendations exclude destinations that are already concentrated, and attach
conditions rather than hiding problems.

**It refuses to overclaim.** Campaign movement is reported as association, never
cause. Capacity figures always carry their coverage limit, and only verified
partners count towards them. The official data tier stays empty until a real
integration exists. The historical view states plainly that ninety days cannot
support a seasonality claim.

**Exports carry their own labels.** A briefing leaves the interface that shows
the provenance badge, so the export writes every category into the text and
marks anything that must not be quoted externally.

---

## Documentation

| | |
|---|---|
| `CLAUDE.md` | Product instructions and constraints — the authority |
| `docs/01-product-vision.md` | Vision and positioning |
| `docs/02-mvp-spec.md` | The 16 screens |
| `docs/03-user-flows.md` | Flows and personas |
| `docs/04-data-model.md` | Entities and analytics views |
| `docs/05-ai-spec.md` | AI capabilities, tools and the answer contract |
| `docs/06-design-system.md` | Design direction and components |
| `docs/07-demo-script.md` | The 5-minute script |
| `docs/08-roadmap.md` | Phases |
| `docs/09-implementation-notes.md` | **What was built, and every deviation from the above** |

Read `docs/09-implementation-notes.md` first if you are picking this up: it
records the decisions that are not obvious from the code.

---

## Data

Seed JSON is in `/data`, validated by Zod at load — the app refuses to start on
malformed tourism data.

| File | |
|---|---|
| `districts.json`, `destinations.json` | 16 districts, 14 destinations |
| `verified-facts.json` | 47 curated facts, each tagged documented / oral tradition / interpretation / practical |
| `businesses.json`, `experiences.json` | 26 businesses, 28 bookable experiences |
| `creators.json`, `campaigns.json` | 16 creators, 5 campaigns |
| `events.json` | Event calendar, used to explain demand changes |
| `knowledge-documents.json`, `data-sources.json` | Method and policy documentation the analyst can cite |
| `heritage-experiences.json` | Living-heritage layers for E4 |
| `feedback.json`, `tourism-signals.json` | Curated feedback, and the generation profile for the signal history |
| `official-statistics.json` | The OFFICIAL tier — deliberately empty |

90 days of interaction and feedback history is generated deterministically from a
fixed seed, so **Reset demo** returns the prototype to a byte-identical state.

---

## Architecture

```
src/lib/               pure and shared — types, provenance, dates, geo, AI provider, prompts
src/server/data/       seed loading, deterministic generation, store, repository
src/server/analytics/  deterministic computation — the only thing that produces a number
src/server/ai/         tools, government analyst, trip planner, storyteller, creator studio
src/server/actions/    server actions — the only write path
src/components/        ui primitives, charts, shared domain components, shell
src/app/               /gov (G1-G5), /creator (C1-C5), /explore (E1-E6), /partner, /, /ecosystem
prisma/schema.prisma   live MySQL schema (schema.postgres.prisma = production target)
```

`repository.ts` is the only read surface over tourism data. Moving to MySQL
changed 5 action files and 3 test files; the 15 analytics modules, 5 AI modules
and all 32 pages needed no change at all.

---

## Deliberately out of scope

Each of these is a recorded scope decision, not an omission: a full OTA
(bookings are request-and-accept for experiences only, §19), real
channel-manager integrations, live social platform APIs,
enterprise government SSO, production spatial AR, a complete GIS platform, live
statewide visitor counting, creator payout processing, a social network, and
large-scale recommendation training.

See `docs/08-roadmap.md` for when each is intended to arrive.

## Status

Roadmap **Phase 0 — Hackathon MVP: complete.** All 16 screens, the deterministic
analytics layer, the grounded AI layer, the seeded data layer and the closed loop.

Roadmap **Phase 1 — Pilot: complete.** Partner portal, destination QR check-ins,
partner availability reporting, verified business onboarding, departmental
content review, enquiry handling, and weekly plus district-level feedback
analytics.

Roadmap **Phase 2 — Government integration: complete.** Role-based access
enforced server side, historical dashboards, district analytics, data source
governance, the official-tier ingestion contract, and a permission-gated
briefing export that writes provenance into the text.

Roadmap **Phase 3 — Creator economy: complete.** Verified creator onboarding, six
deterministic integrity checks, reputation computed from delivery rather than
declared, and a payout workflow that records what is owed without moving money.

Roadmap **Phase 4 — Intelligence: complete.** Demand forecasting with a capped
horizon and a widening interval, campaign constraint analysis, and infrastructure
opportunity analysis — each stating what it cannot see.

Roadmap **Phase 5 — Regional network: not built, deliberately.** It would require
fabricating destinations, heritage facts and tourism signals for six states this
project has no data for. See `docs/09-implementation-notes.md` §16 for what the
architecture already supports and what it actually needs.

33 routes, covered by 175 tests.

## Android APK (Capacitor)

The Android app is a Capacitor shell that loads the deployed OneStop Manipur site, since the app needs its Next.js server for API routes, the database and AI calls. It opens the mobile tourist view at `/m` (see below).

- **CI:** `.github/workflows/android-apk.yml` builds a debug APK on every push to `main`, and you can also run it by hand from the Actions tab. Download it from the run's **Artifacts** (`onestop-manipur-debug-apk`).
- **Server URL:** set the repository variable `CAP_SERVER_URL` (Settings → Secrets and variables → Actions → Variables) to the deployed URL — `https://onestop-manipur.vercel.app` — or pass `server_url` when running it by hand. Without it, the APK shows an offline placeholder.
- **Installing:** the artifact is a zip; unzip it and open the `.apk` on an Android phone, allowing "install unknown apps". It is a debug build, for sideloading rather than the Play Store, and Android only. The app id is `in.onestopmanipur.app`, so it installs beside (not over) any build from before the rename.
- **Local:** `CAP_SERVER_URL=https://your-site npm run cap:android`, then open `android/` in Android Studio. `android/` is generated and gitignored.

## Mobile tourist view (`/m`)

A phone-first version of Explore Manipur lives under `src/app/m` (screens) and `src/components/mobile` (UI). It has its own shell, with a bottom tab bar and safe-area padding, and reuses the same server actions, data layer and AI as the desktop `/explore` pages. The desktop pages are unchanged.

| Route | Screen |
| --- | --- |
| `/m` | Home: planner entry, popular places, living heritage, quieter gems, local hosts |
| `/m/plan` | E1 chat planner and saved trips |
| `/m/journey/[id]` | E2 trip: day by day, map, costs; keep / start / end |
| `/m/discover` | Search and browse places and experiences, list or map |
| `/m/place/[id]` | E3 destination |
| `/m/place/[id]/heritage` | E4 living heritage |
| `/m/experience/[id]`, `/book` | E5 experience, enquiry and booking request |
| `/m/trip` | E6 live trip: check-in and feedback |
| `/m/bookings`, `/m/bookings/[reference]` | Bookings, payment, cancellation |
| `/m/privacy` | Visit counting and stored trips |

**Theme and photos.** The mobile app uses a minimalist monochrome theme (`src/app/m/mobile.css`, scoped so desktop keeps its palette), with real colour photographs of destinations. The photos are downloaded once from Wikimedia Commons by `node scripts/fetch-destination-photos.mjs` into `public/photos/`, with author and licence in `data/destination-photos.json`. They are served locally, so the demo works offline, and each destination page credits its photo. A destination without a suitable photo keeps its generated artwork. Check new photos by eye before committing them.

Shared components that link to `/explore/...` are kept inside `/m` by `src/components/mobile/LinkScope.tsx`, using the mapping in `src/lib/mobile/routes.ts`. Open `http://localhost:3000/m` in a phone-sized browser window during development.

## Hosting on Vercel

The Next.js server (pages, AI calls, analytics) runs on Vercel; MySQL stays on its own server. `vercel.json` pins the functions to Mumbai (`bom1`), the closest region to the database in Bengaluru, and the `vercel-build` script generates the Prisma client before building.

1. Import the repository at vercel.com (framework: Next.js; defaults are fine).
2. Add every key from `.env` under Project Settings → Environment Variables. Set `NEXT_PUBLIC_BASE_URL` to the Vercel URL. These keys live only on Vercel and in local `.env`, never in GitHub or the APK.
3. Deploy, then set the GitHub Actions variable `CAP_SERVER_URL` to the Vercel URL and re-run the Android APK workflow.

The server keeps the tourism working set in memory and writes every change to MySQL. On Vercel, a second concurrent instance sees another instance's new feedback only once it loads again, which is fine at demo traffic. A single long-running process (`npm run build && npm start` on a server) avoids this entirely.
