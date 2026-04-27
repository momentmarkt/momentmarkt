ARTIFACT_ID: submission-v07
ARTIFACT_TYPE: submission
PARENT_IDS: spec-v04, agent-io-v01, submission-v06
STATUS: ready-to-paste (videos + cover image still pending)

# Devpost submission — MomentMarkt

> Devpost form fields are reproduced verbatim from `context/HACKATHON.md`
> (case + asterisk-required-marker preserved). Each structured field is
> drafted from the team's pitch, `work/SPEC.md` (`spec-v04`), and the
> as-shipped state at 2026-04-26 morning: **Discover swipe deck** (Tinder-style
> right/left swipes that feed a preference history back to the LLM re-ranker),
> a **transparent Wallet** that lists every available offer for trust, an
> **Opportunity Agent** that ingests menus on merchant sign-up and drafts
> offers from weather + events + demand-curve gaps, a **Surfacing Agent** that
> notifies only when the moment fits, an iOS-native swipe map + drawer + city
> swap, a **4-section merchant dashboard** (Today / Offers / Bounds / Settings)
> with discount limits, category restrictions and approval rules, and a
> publicly deployed FastAPI backend on Hugging Face Spaces. Privacy boundary
> is `{intent_token, h3_cell_r8}` — anonymized intent plus a coarse 1 km cell.
> Vocabulary aligned to spec-v04 (two-agent split, AI-proposes-merchant-approves,
> high-intent surfacing, GenUI as JSON layout spec, simulated girocard
> checkout). No Sparkassen branding in product UI; DSV-Gruppe / Sparkassen
> context lives only in pitch narrative.

## Project title

**MomentMarkt — you set the rules, the machine does the rest.**

## Short Description *

MomentMarkt is Tinder for local deals — but everyone's hot and the dates pay for themselves. Every swipe teaches your wallet what you like; AI agents curate, customise and create offers from real-world signals; merchants onboard by uploading a menu and stay in control with simple guardrails. Built for the DSV-Gruppe **CITY WALLET** track.

## Structured Project Description

### 1. Problem & Challenge *

Small city merchants — independent cafés, bakeries, bookstores, Eisdielen — don't have a marketing department. Static loyalty coupons are noise to users and a chore for shop owners; they fire on the wrong days, in the wrong weather, against the wrong demand curves. The DSV-Gruppe **CITY WALLET** brief asks for an AI-powered city wallet that detects the most relevant local offer for a user in real time, generates it dynamically, and makes it redeemable through a simulated checkout — serving end users first while letting merchants participate with minimal effort. The hard challenge is twofold. **On the user side**: surface offers only when they genuinely fit (a weather shift, an event ending nearby, a real-time demand gap at a specific merchant) and stay silent otherwise — and when the user *is* browsing without a goal, give them a fast, fun way to teach the wallet what they like. UX, not technology, decides whether the offer is accepted or ignored. **On the merchant side**: independent owners must onboard in minutes and stay in control without writing copy, designing widgets, or learning a tool. Today's coupon apps fail at both ends.

### 2. Target Audience *

Two-sided, with the consumer at the centre of the demo cut.

- **End users in dense European city centres** — commuters, lunch-break walkers, weekend wanderers, tourists. Reference persona is **Mia, 28**, on a cold Berlin lunch break near Rosenthaler Platz, browsing without a goal. She opens the app to a swipe deck of nearby offers — right to save, left to pass — and the wallet quietly learns. Later, when the rain rolls in 80 m from a café she swiped right on twice, the wallet pings her once.
- **Local merchants** — independent shop owners on a Sparkassen terminal. They onboard by uploading a menu PDF or photo: agents ingest it, organise it, draft starter offers, and pre-fill weekday/weekend curves and quiet-hour blackouts. Day-to-day they live in a 4-section dashboard — **Today** (live curve + drafts anchored to gaps), **Offers** (approve / edit / skip / *always auto-approve like this*), **Bounds** (category restrictions, discount limits, approval rules), **Settings** (hours, blackouts, contact).
- **Sponsor stakeholder — DSV-Gruppe** — central service provider for Germany's Sparkassen, with Payone as the acquirer and S-Markt & Mehrwert as the existing loyalty stack. The simulated girocard checkout maps onto the rail Sparkassen already operate; the synthetic transaction-density fixture is a stand-in for the real Payone signal.

### 3. Solution & Core Features *

Three cooperating agents, two surfaces, one product.

- **Tinder-style Discover deck (consumer).** A swipe stack of nearby offers anchored on a tilted Apple Map of Berlin Mitte. Right swipe saves to the wallet *and* logs a positive preference signal; left swipe passes *and* logs a negative one. Seen cards persist across sessions. Each lens fetch threads the running swipe history back to the LLM as `preferenceContext`, so the next batch is re-ranked toward what the user actually likes. The reservation price reveals itself one gesture at a time.
- **Transparent Wallet (consumer).** A drawer-first wallet listing every offer the user has accepted *and* every active offer in their walk-ring — fuzzy-searchable across name, category and neighborhood. Nothing hidden, nothing dark-pattern. Trust is built by being a catalog, not a feed. Offers expire on their own timer and disappear on schedule.
- **Moment notification (consumer).** When the stars align — Mia is near a café, rain is 15 minutes out, and her swipe history liked it — the **Surfacing Agent** fires *one* in-app card. Not a feed. Not a digest. One card, one moment. Silence is the default.
- **Menu-upload merchant onboarding.** A merchant drops a menu PDF or photo, the **Menu Agent** OCRs and structures it into items + categories + price bands, the **Opportunity Agent** uses that grounding to draft 3–4 plausible starter offers in the merchant's voice, and the dashboard pre-fills typical weekday/weekend curves plus quiet-hour blackouts. Time-to-first-offer is measured in minutes, not days.
- **Merchant guardrails dashboard (4 sections).** **Today**: live demand curve overlaid on the typical day-of-week / time-of-day baseline, with the gap moment highlighted and any auto-approved drafts anchored to it. **Offers**: per-draft Approve / Edit / Skip / *Always auto-approve like this*. **Bounds**: category restrictions ("never discount alcohol"), discount limits ("max 25 % off"), approval rules ("auto-approve weather-trigger drafts under 15 %"). **Settings**: hours, blackouts, contact, payout. The merchant sets the rules once; the agents stay inside them forever.
- **Three live triggers (Opportunity Agent).** Reads weather (Open-Meteo), the OSM merchant catalog, an events stub, and a per-merchant transaction-density fixture; fires when *weather*, *event-end*, or *demand-gap* (live curve below the typical curve) trips. Drafts an offer **and** a matching GenUI widget layout spec, routes both to the merchant inbox.
- **Negotiation Agent (merchant-side).** When the merchant edits a draft, the agent proposes alternative variants — different headlines, different discount levels — each clamped to the merchant's bounds.
- **GenUI focused offer view on React Native.** Tapping a merchant card slides into a focused offer screen rendered through the GenUI pipeline: an LLM-emitted JSON layout spec composing 6 RN primitives (`View`, `Text`, `Image`, `Pressable`, `ScrollView`, plus one composed widget primitive), schema-validated, with a known-good fallback render.
- **Tap-to-swap city.** Tapping the weather pill flips the wallet Berlin ↔ Zurich in one frame: map flies, merchants reload from `/merchants/{city}`, weather refetches from `/signals/{city}`, currency + locale flip to CHF + Swiss-German. Same engine, new config.
- **Visible privacy boundary** `{intent_token, h3_cell_r8}` rendered in a Settings → Demo & Debug dev panel. Personal information never leaves the device — only an anonymized intent enum and a coarse ~1 km H3 cell. **High-intent toggle** re-skins the same offer with a lower threshold and sharper headline. **Simulated girocard checkout** with cashback budget decrement.
- **SF Symbols throughout.** `expo-symbols` `cup.and.saucer` for cafés, `birthday.cake` for bakeries, `cloud.heavyrain` for incoming rain — the wallet reads as native iOS, not cross-platform fallback.

### 4. Unique Selling Proposition (USP) *

**We invert the brief.** The standard pattern is *"merchant sets a goal, AI generates an offer."* MomentMarkt does the opposite: **AI proposes, merchant approves, the user swipes, trust grows by default.** Four things make it defensible.

1. **Tinder-grade preference learning over local deals.** The Discover swipe deck is not just a UX metaphor — every swipe is a labelled preference signal that re-ranks the next LLM fetch in the same session and persists across sessions. Reservation price reveals itself; nobody had to ask.
2. **The wallet is transparent on purpose.** Every accepted *and* every active offer in the user's walk-ring is listed, fuzzy-searchable, never hidden behind a "for you" curtain. That's the trust surface — and it's the moat against feed-style coupon apps that hide what they're not showing.
3. **Real GenUI on React Native.** The LLM emits a JSON layout spec composed of 6 RN primitives, schema-validated, rendered live on iOS Simulator inside a focused offer view. Three structurally different widgets for the same merchant in three contexts (rain / quiet / pre-event) prove the engine is real — not template fill, not a static `<OfferCard />`.
4. **Menu-upload onboarding + four-section guardrail dashboard.** A merchant goes from PDF to live drafts in minutes; agents stay forever inside category restrictions, discount limits, and approval rules the merchant set once. Paired with the visible `{intent_token, h3_cell_r8}` privacy boundary and three OpenAI-demo-style "production swap" callouts (push notification, on-device SLM, real Payone density) that map cleanly onto the rail DSV-Gruppe already operates, this is a credible path to production no consumer-AI startup can replicate.

### 5. Implementation & Technology *

**Stack.** Consumer app: React Native + Expo + TypeScript on iOS Simulator (Expo dev client; native build required for Apple Maps via `react-native-maps`). UI primitives: `expo-symbols` for SF Symbols, `@gorhom/bottom-sheet` for the wallet drawer, `react-native-reanimated` for the map fly-to + swipe-deck physics, `react-native-gesture-handler` for the iOS swipe-right + swipe-down dismiss patterns. Merchant app: React + Vite, deployed at https://momentmarkt.doruk.ch/, with menu-upload onboarding (drop → OCR → confirm → hours) and a 4-section dashboard (Today / Offers / Bounds / Settings). Backend: FastAPI + SQLite, deployed publicly on Hugging Face Spaces (https://peaktwilight-momentmarkt-api.hf.space/, see `/health` and `/docs`). LLM: **Pydantic AI** agents with a provider-swappable model string; demo runs on **Azure OpenAI** (gpt-5.5 via `rapidata-hackathon-resource`), with validated fixture fallback so the demo never breaks. Geo: H3 resolution-8 coarse cells (~1 km) for the privacy boundary.

**Agents.** Four cooperating Pydantic AI agents.
- **Menu Agent** — runs at merchant sign-up, OCRs the uploaded menu, structures it into items + categories + price bands, hands the result to the Opportunity Agent for grounding.
- **Opportunity Agent** — periodic (in production: scheduled worker / Helm chart). Pulls signals (weather, events stub, transaction-density fixture, merchant catalog), evaluates the three triggers, drafts `{offer, widget_spec}` per merchant grounded in the menu, routes to the merchant inbox.
- **Negotiation Agent** — wired into `/offers/alternatives`. When a merchant edits a draft, proposes variants with different headlines / discount levels, each clamped to the merchant's Bounds.
- **Surfacing Agent** — real-time, user-side. Deterministically scores already-approved offers against the wrapped user context, applies the **high-intent boost** (active screen time, map-app foreground, in-app coupon browsing) and the **swipe-history preference signal**, respects a silence threshold, picks top-1, and calls the LLM exactly once — to rewrite only the headline of the card that fires.

**Live endpoints.** `GET /health`, `GET /cities`, `GET /signals/{city}` (Open-Meteo-backed live weather + trigger evaluation + privacy envelope), `GET /merchants/{city}?q=...` (fuzzy search), `GET /merchants/{id}/events` (activity feed), `POST /opportunity/generate`, `POST /surfacing/evaluate`, `POST /offers/alternatives` (Negotiation Agent). Mobile uses `useSignals(city)` (200ms cache) for the weather pill; the Discover deck threads the running swipe history into each lens fetch as `preferenceContext`.

**Datasets actually used in the demo.** **Open-Meteo** (live weather, no auth) drives the temperature + condition glyph in real time. **OpenStreetMap via Overpass** — ~35 places near Rosenthaler Platz captured 2026-04-26 (St. Oberholz, Zeit für Brot, The Barn, ocelot, Mein Haus am See, Süße Sünde, Blumen Vanessa, etc.) populate the Berlin merchant catalog, swipe deck and search list. The merchant enricher CLI grounds drafts in real menu signature items and ambience copy from `data/merchants/enriched/berlin.json`. Zurich runs a smaller hand-curated catalog around Zürich HB. **VBB GTFS** stops within 1 km of Alexanderplatz shape walk-time copy. An events stub gates the event-end trigger. A hand-authored `data/transactions/berlin-density.json` for 4 demo merchants stands in for the real Payone transaction density.

**Three OpenAI-demo-style "production swap" callouts** on the architecture slide: (1) **push path** — in-app surface (demo) → push notification server, e.g. Expo Push / FCM / APNs (prod); (2) **SLM extractor** — `extract_intent_token()` server-side stub (demo) → on-device Phi-3-mini / Gemma-2B (prod); only the wrapper `{intent_token, h3_cell_r8}` ever leaves the device; (3) **Payone signal** — synthetic `berlin-density.json` (demo) → real Payone aggregation across Sparkassen (prod). **Honest scope** (deliberately deferred): no live on-device SLM, no real Web Push, no real on-device collection of high-intent signals, no real-time image generation, no real POS, no native build pipelines, no Tavily, no Foursquare, no CH GTFS bind on the Zurich swap.

### 6. Results & Impact *

**Built and demonstrable in the 1-min demo.** End-to-end Mia spine on iOS Simulator: open the app → **Discover swipe deck** of real OSM cafés, bakeries and kiosks anchored on a tilted Berlin Mitte map; right-swipe St. Oberholz, left-swipe a juice bar, right-swipe Zeit für Brot — preference history visibly threads back into the next lens fetch in the dev panel → drag up the **Wallet drawer**: every accepted offer plus every active offer in the walk-ring, fuzzy-searchable, transparent → tap a merchant: focused **GenUI offer view** rendered live from an LLM-emitted JSON layout spec → high-intent toggle re-skins the same offer (lower threshold, sharper copy) → QR redeem → simulated girocard checkout, cashback budget decrements → cut to the **merchant dashboard**: Today section shows the live demand curve dipping below the typical Saturday curve, the auto-approved draft anchored to the gap, Bounds section visible with discount limits and category restrictions; flip to the **Onboarding** preview — drop a menu PDF, see the OCR confirm step, see the per-day curve pre-fill → back to the phone, tap the weather pill: map flies to Zurich HB, merchants reload, weather refetches, currency flips to CHF. Three structurally different GenUI widgets (rain / quiet / pre-event) for the same merchant prove the engine is real. Settings → Demo & Debug logs the actual `{intent_token, h3_cell_r8}` payload entering the Surfacing Agent. The FastAPI backend is publicly deployed so judges can hit `/cities`, `/signals/berlin`, `/merchants/berlin?q=oberholz`, and `/opportunity/generate` without running anything locally.

**Why it matters.** Users get a fast, fun way to teach the wallet what they like (swipe), a transparent catalog of every active offer (trust), and exactly one well-timed nudge when the moment fits (silence-as-feature). Merchants get marketing they did not have to write, time-to-first-offer measured in minutes via menu upload, and bounds the agents stay inside forever. For DSV-Gruppe, the simulated checkout maps cleanly onto the existing Sparkassen payment rail; the synthetic transaction-density fixture is a stand-in for the real Payone signal that already aggregates across thousands of merchants — replacing it is a config change, not an architecture change. Berlin ↔ Zurich is the same: new city is a JSON config, not a rebuild.

**Roadmap.** Real Payone density replaces the fixture (zero merchant onboarding cost). On-device SLM moves intent extraction off the server. Real on-device high-intent + swipe-preference collection replaces the dev-panel toggle and the in-memory history. Cross-merchant aggregate intelligence — defensible because DSV already aggregates across the Sparkassen network. Persisted redemptions and a real `/history` endpoint replace the local-only redemption log so the wallet's clock-icon History overlay reflects backend-sourced state.

---

## Additional Information

- **Branding stance.** Product UI is intentionally neutral — no Sparkassen-Rot, no S-logomark, no "Mit Sparkasse bezahlt" copy in chrome. DSV-Gruppe / Sparkassen context lives in pitch narrative + architecture slide. Rationale: portability across partners, product feel over fan-project feel.
- **Persona relocation.** The brief's reference persona Mia is in Stuttgart; we relocated her to **Berlin** (with **Zürich** as the tap-to-swap proof) because that is where our open-data signals are richest and where we have a real OSM merchant catalog. Acknowledged on stage in one line.
- **Discover-first IA.** The earlier drawer-first framing was promoted: Discover is now a center-hero navbar tab with a lifted FAB-style spark circle (#181), and the swipe deck is the user's first surface. The Wallet drawer remains the durable transparency surface; Settings + History are slide-in overlays with iOS-native swipe-right + swipe-down dismiss + edge-pan pop.
- **Stack note.** Consumer is React Native + Expo (not Next.js / a web phone-frame mock); merchant app stays web (React + Vite, deployed at https://momentmarkt.doruk.ch/) with menu-upload onboarding and a 4-section dashboard. GenUI primitives are React Native primitives. Backend agents are Pydantic AI with an Azure OpenAI provider; the model string is env-swappable.
- **Recordable fallback** past hour 5 of the build: hand-authored offer + pre-rendered RN widget + hard-coded trigger + static checkout. Loses live GenUI generation, signal-driven offers, and the high-intent toggle; preserves the Mia spine + visible dataset use. Wallet drawer's search list also has an offline-fallback Berlin Mitte list so it stays responsive if the HF Space is unreachable.
- **Dataset honesty.** Berlin merchant catalog is real OSM Overpass; Zurich catalog is hand-curated for the demo. Events are a hand-curated stub; transaction-density JSON is hand-authored for 4 demo merchants; high-intent signals are simulated via a dev-panel toggle; Foursquare data is gated and not used; Tavily live events are out of scope.

## Demo truth boundary

Three "production swap" callouts, drawn explicitly on the architecture slide and reproduced verbatim in `README.md` and `CLAUDE.md`:

| Capability | Demo (today) | Production (architectural roadmap) |
|---|---|---|
| **Surface path** | In-app card slides into the RN wallet on trigger fire | Opportunity Agent → push notification server (Expo Push / FCM / APNs) → device |
| **SLM extractor** | `extract_intent_token()` server-side stub returning a hand-coded enum | On-device Phi-3-mini / Gemma-2B; only the wrapper `{intent_token, h3_cell_r8}` leaves the device |
| **Payone signal** | Hand-authored `data/transactions/berlin-density.json` (4 merchants) | Real Payone aggregation across Sparkassen — already flowing for any merchant on a Sparkassen terminal |

Other deliberate scope cuts kept out of the demo: no real Web Push, no live on-device collection of high-intent signals (dev-panel toggle simulates), no real-time image generation (pre-bucketed mood library keyed by `(trigger × category × weather)`), no real POS, no native iOS/Android build pipelines, no Tavily, no Foursquare, no CH GTFS bind on the Zürich swap.

## Live Project URL

**Backend (FastAPI on Hugging Face Spaces):** https://peaktwilight-momentmarkt-api.hf.space/
**Merchant app:** https://momentmarkt.doruk.ch/

Quick judge probes:
- `https://peaktwilight-momentmarkt-api.hf.space/health` → `{"status":"ok"}`
- `https://peaktwilight-momentmarkt-api.hf.space/docs` → interactive OpenAPI schema
- `https://peaktwilight-momentmarkt-api.hf.space/cities` → Berlin + Zürich configs
- `https://peaktwilight-momentmarkt-api.hf.space/signals/berlin` → live trigger evaluation, demand-gap, privacy envelope
- `https://peaktwilight-momentmarkt-api.hf.space/merchants/berlin?q=oberholz` → live fuzzy search over the real OSM catalog

The mobile demo itself runs on iOS Simulator against this backend — there is no public consumer URL because the wallet is a native RN app, not a web page.

## GitHub Repository URL

https://github.com/momentmarkt/momentmarkt

## Demo video URL

_pending_ (recorded in build phase 5; ≤55s on iOS Simulator)

## Tech video URL

_pending_ (recorded in build phase 5; ≤55s; architecture slide → live editor → live phone)

## Project cover image

`assets/cover.png` (16:9). Concept: an iPhone-style frame (three-quarters left) showing the **Discover swipe deck** mid-swipe — a Cafe Bondi card tilting right with a green "Save" overlay, a faint next card ("Zeit für Brot") peeking behind, anchored over a tilted full-bleed Berlin Mitte Apple Map; frosted weather pill top-left ("Berlin · 11° · Mitte" with `cloud.heavyrain` SF Symbol), gear + clock SF Symbol buttons top-right. Behind the phone: a desaturated Berlin Mitte map fragment (Rosenthaler Platz visible) with three subtle H3 hex cells highlighted in the wallet's accent colour. Top-right corner: a small monospace dev-panel chip rendering `{intent_token: "lunch_break.cold", h3_cell_r8: "881f1d489dfffff"}` with a tiny "high-intent: on" pill below it. Neutral cream palette, deep navy, one warm accent for the CTA. No Sparkassen branding, no stock-photo people, no logo soup. Title lockup bottom-left: *"MomentMarkt — you set the rules. The machine does the rest."*

## Technologies / Tags

React Native, Expo, TypeScript, expo-symbols, gorhom bottom-sheet, react-native-reanimated, react-native-gesture-handler, react-native-maps, React, Vite, FastAPI, Python, SQLite, Pydantic AI, Azure OpenAI, Hugging Face Spaces, GenUI, H3, OpenStreetMap, Overpass API, Open-Meteo, GTFS, SF Symbols, OCR

## Additional Tags

City Wallet, DSV-Gruppe, Sparkassen, Payone, Berlin, Zürich, swipe deck, preference learning, transparent wallet, four-agent system, Menu Agent, Opportunity Agent, Surfacing Agent, Negotiation Agent, weather trigger, event trigger, demand-gap trigger, high-intent surfacing, in-market signal, context-aware recommendations, Discover-first IA, tap-to-swap city, live merchant search, focused offer view, menu-upload onboarding, merchant guardrails, auto-approve, simulated checkout, simulated girocard, privacy boundary, intent token, schema-validated LLM output, iOS Simulator, iOS-native gestures

---

## Demo video script (≤60s hard cap; target 55s)

iOS Simulator phone on the left, Berlin map behind, dev panel beside. Live screen recording, no slides.

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:08 | iOS Simulator opens to **Discover** — tilted Apple Map of Berlin Mitte behind a swipe deck; top card is St. Oberholz with a rainy-mood image, frosted "Berlin · 11° · Mitte" weather pill top-left, gear + clock icons top-right. Mia swipes right (Save). Next card: a juice bar — swipe left. Next: Zeit für Brot — swipe right. Dev panel logs each preference signal flowing back into `preferenceContext`. | "MomentMarkt is Tinder for local deals — but everyone's hot and the dates pay for themselves. Every swipe teaches the wallet what Mia likes, so the next batch is already re-ranked." |
| 0:08–0:14 | Mia drags the bottom Wallet drawer up. Inside: every offer she swiped right on, plus every active offer in her walk-ring, fuzzy-searchable. She types "ober" → list debounces to St. Oberholz; backend `/merchants/berlin?q=ober` log flashes in the dev panel. | "The wallet is transparent on purpose. Every active offer in the walk-ring, listed and searchable. No hidden 'for you' curtain. That's the trust." |
| 0:14–0:24 | Mia taps Cafe Bondi. Drawer flips into a focused offer view rendering the GenUI widget — rainy-window mood, walk-time chip, single CTA — composed at runtime from a JSON layout spec the LLM just emitted, six RN primitives. Dev panel logs `{intent_token, h3_cell_r8}` entering the Surfacing Agent. | "Tap a merchant — focused offer slides in. Generated at runtime: the LLM emitted this layout as JSON, schema-validated, six React Native primitives. Privacy boundary visible: anonymized intent, coarse one-kilometre cell. Personal info never leaves the device." |
| 0:24–0:30 | Presenter flips the dev-panel **high-intent** toggle to on. Same offer re-surfaces with a lower threshold and a more aggressive headline variant. | "When the stars align — near a café, rain incoming, lunch time — the wallet pings her once. High-intent on: same offer, lower bar, sharper copy." |
| 0:30–0:36 | Tap CTA → QR appears → simulated girocard checkout → success screen, cashback budget decrements. | "QR redeems through the rail the bank already operates. Simulated girocard, real flow." |
| 0:36–0:46 | Cut to merchant dashboard (web): **Today** shows the live demand curve dipping below the typical Saturday curve, the auto-approved Bondi card anchored to the dip. Tab to **Bounds**: discount cap at 25 %, category restriction "no alcohol", auto-approve rule "weather drafts under 15 %". Quick flip to the **Onboarding** preview — drop a menu PDF, OCR processing spinner, MenuConfirm step shows extracted items. | "Merchants onboard by uploading a menu — agents OCR it, organise it, draft the first offers. Day-to-day they live in four sections: Today, Offers, Bounds, Settings. They set the rules once. The agents stay inside them forever." |
| 0:46–0:55 | Back to the phone. Presenter taps the frosted weather pill. Map flies to Zürich HB, merchants reload, weather refetches, currency flips to CHF, neighborhood label flips to "HB". | "One tap on the weather pill. Map flies, merchants reload, weather refetches, currency flips. Same engine, new city. You set the rules. The machine does the rest." |

## Tech video script (≤60s hard cap; target 55s)

Architecture slide → live editor → live phone frame.

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:08 | Architecture diagram: iOS Simulator phone (RN + Expo + TypeScript, expo-symbols, gorhom bottom-sheet, react-native-maps) ↔ FastAPI on Hugging Face Spaces ↔ SQLite. Four agent boxes labelled **Menu Agent**, **Opportunity Agent**, **Negotiation Agent**, **Surfacing Agent** — all Pydantic AI agents calling Azure OpenAI. | "React Native and Expo on the phone, FastAPI on Hugging Face Spaces, SQLite. Four Pydantic AI agents on Azure OpenAI." |
| 0:08–0:18 | Zoom into Menu Agent → Opportunity Agent flow: a menu PDF feeds the Menu Agent, which structures items + categories + price bands; Opportunity Agent reads the structured menu plus three signal inputs (Open-Meteo, events stub, `transactions/berlin-density.json`, OSM Overpass catalog). Output: `{offer, widget_spec}` → merchant inbox. | "Menu Agent runs at sign-up — OCRs the menu, structures it. Opportunity Agent grounds offer drafts in those real items, fired by three triggers: weather, events, demand-gap on a Payone-style fixture. Drafts an offer plus a JSON widget spec, routes them to the inbox." |
| 0:18–0:28 | Editor view: actual JSON layout spec on screen — `{ "type": "ImageBleedHero", "children": [...] }` — composing 6 React Native primitives. Schema validator passes; fallback render path highlighted. Cut to phone: tap a card in the swipe deck, focused offer view renders that exact spec. | "GenUI is real. The LLM emits a layout spec, six RN primitives, schema-validated, with a known-good fallback. Tap a card — focused offer view renders that spec." |
| 0:28–0:40 | Zoom into Surfacing Agent box: input wrapped as `{intent_token, h3_cell_r8}`, deterministic scoring, silence threshold, **high-intent boost arrow** plus a **swipe-preference history arrow** feeding in. Side panel logs the exact payload. Negotiation Agent shown as a side-loop on the merchant edit path, clamped to Bounds. | "Surfacing Agent scores deterministically. Intent token plus H3 cell — boundary logged on screen. Swipe history and high-intent compose as boosts: lower threshold, sharper headline. Negotiation Agent proposes variants when the merchant edits — always clamped to their Bounds." |
| 0:40–0:50 | Three "production swap" callouts surface on the slide: (1) in-app surface → push server, (2) SLM server-side → on-device, (3) synthetic JSON → real Payone aggregation. Cut to phone: tap weather pill, Berlin → Zurich. | "Three production swaps, drawn explicitly: push replaces the in-app surface, SLM moves on-device, synthetic density becomes real Payone aggregation. And one tap on the weather pill swaps the city — same engine, new config." |
| 0:50–0:55 | Roadmap card: one line. | "The rail already exists. Cross-merchant intelligence is the next aggregation." |

---

## Submission checklist

- [x] Short Description finalized — Tinder-for-deals tagline + DSV track
- [x] Problem & Challenge finalized
- [x] Target Audience finalized — three audiences, menu-upload + 4-section dashboard reflected
- [x] Solution & Core Features finalized — Discover swipe deck, transparent Wallet, moment notification, menu-upload onboarding, 4-section guardrails dashboard, three triggers, four agents, GenUI, tap-to-swap, privacy boundary
- [x] Unique Selling Proposition (USP) finalized — swipe-as-preference-signal, transparent wallet, real GenUI, menu-upload + guardrails
- [x] Implementation & Technology finalized — four-agent stack including Menu Agent + Negotiation Agent reflected, merchant app URL added
- [x] Results & Impact finalized — Discover-first demo flow + onboarding preview reflected
- [x] GitHub repo URL filled
- [x] Live Project URL filled (HF Space backend + merchant app)
- [ ] Demo video URL — recording remains user's last-mile
- [ ] Tech video URL — recording remains user's last-mile
- [x] 16:9 cover image — `assets/cover.png` (concept refreshed to lead with swipe deck)
- [x] Branding honesty preserved (no Sparkassen UI chrome)
- [x] Dataset honesty preserved (real OSM Berlin, hand-curated Zurich, events stub, hand-authored density, simulated high-intent)
- [x] Demo truth boundary table consistent with README.md and CLAUDE.md
- [x] All referenced URLs verified live (HF `/health` 200, `/docs` 200, GitHub 200)
