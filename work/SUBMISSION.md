ARTIFACT_ID: submission-v06
ARTIFACT_TYPE: submission
PARENT_IDS: spec-v04, agent-io-v01, submission-v05
STATUS: ready-to-paste (videos + cover image still pending)

# Devpost submission — MomentMarkt

> Devpost form fields are reproduced verbatim from `context/HACKATHON.md`
> (case + asterisk-required-marker preserved). Each structured field is
> drafted from `work/SPEC.md` (`spec-v04`) + `context/AGENT_IO.md` +
> `context/PARTNER_DISCUSSION.md`, and reflects the as-shipped system at
> 2026-04-26 morning: drawer-first wallet IA, live `/merchants/{city}`
> search over real Berlin OSM places, tap-to-swap Berlin ↔ Zurich,
> `/signals/{city}` driving weather, GenUI focused offer view, iOS-native
> gesture set, SF Symbols throughout, Pydantic AI agents on Azure
> OpenAI, FastAPI on Hugging Face Spaces. Vocabulary aligned to spec-v04
> (two-agent split, AI-proposes-merchant-approves, high-intent surfacing,
> GenUI as JSON layout spec, intent-token + H3 privacy boundary, simulated
> girocard checkout). No Sparkassen branding in product UI; DSV-Gruppe /
> Sparkassen context lives only in pitch narrative.

## Project title

**MomentMarkt — the marketing department small merchants don't have**

## Short Description *

The marketing department small merchants don't have, generated for the moment, redeemed through the rail the bank already operates. Built for the DSV-Gruppe **CITY WALLET** track.

## Structured Project Description

### 1. Problem & Challenge *

Small city merchants — independent cafés, bakeries, bookstores, Eisdielen — don't have a marketing department. Static loyalty coupons are noise to users and a chore for shop owners; they fire on the wrong days, in the wrong weather, against the wrong demand curves. The DSV-Gruppe **CITY WALLET** brief asks for an AI-powered city wallet that detects the most relevant local offer for a user in real time, generates it dynamically, and makes it redeemable through a simulated checkout — serving end users first while letting merchants participate with minimal effort. The hard challenge is twofold. On the user side: surface offers only when they genuinely fit (a weather shift, an event ending nearby, a real-time demand gap at a specific merchant) and stay silent otherwise — UX, not technology, decides whether the offer is accepted or ignored. On the merchant side: independent owners must stay in control without writing copy, designing widgets, or learning a tool. Today's coupon apps fail at both ends.

### 2. Target Audience *

Two-sided, with the consumer at the centre of the demo cut.

- **End users in dense European city centres** — commuters, lunch-break walkers, weekend wanderers, tourists. Reference persona is **Mia, 28**, on a cold Berlin lunch break near Rosenthaler Platz, browsing without a goal. The wallet stays silent by default; she opens it, the drawer reveals a fuzzy-searchable list of ~35 real OSM cafés, bakeries, and kiosks within 500 m (St. Oberholz, Zeit für Brot, ocelot, Mein Haus am See), tapped one merchant opens a focused GenUI offer rendered live from a JSON layout spec.
- **Local merchants** — independent shop owners on a Sparkassen terminal. Sole interaction is the merchant inbox: Approve / Edit / Skip / **Always auto-approve like this**, plus a per-merchant demand-curve view that points at the gap moment that triggered each draft.
- **Sponsor stakeholder — DSV-Gruppe** — central service provider for Germany's Sparkassen, with Payone as the acquirer and S-Markt & Mehrwert as the existing loyalty stack. The simulated girocard checkout maps onto the rail Sparkassen already operate; the synthetic transaction-density fixture is a stand-in for the real Payone signal.

### 3. Solution & Core Features *

Two cooperating agents, one drawer-first wallet UI, three live triggers, one live demo cut.

- **Drawer-first wallet IA.** Full-bleed Apple Map background, frosted weather pill top-left (live `/signals/{city}` temperature + SF Symbol condition glyph), gear + clock SF Symbol buttons top-right, gorhom bottom-sheet wallet drawer with three snap points (25 / 55 / 80 %). No bottom tab bar. iOS-native gestures throughout: swipe-right + swipe-down dismiss on Settings / History / QR; edge-pan pop pattern.
- **Live merchant search.** Wallet drawer ships a search bar + "Offers for you" list backed by the FastAPI `/merchants/{city}` endpoint with 200ms debounce, fuzzy substring match across name / category / neighborhood, and an offline-fallback list so the demo recording never breaks. Berlin Mitte catalog is hydrated from real **OpenStreetMap Overpass** places near Mia's centre — recognisable names like St. Oberholz, Zeit für Brot, The Barn, ocelot, Mein Haus am See — not synthetic placeholders.
- **Tap-to-swap city.** Tapping the weather pill flips the entire wallet Berlin ↔ Zurich in one frame: map flies to the new region, merchants reload from `/merchants/{city}`, weather refetches from `/signals/{city}`, surfacing input swaps, currency + locale flip to CHF + Swiss-German. This is the marquee "this is generative, not template fill" moment.
- **Opportunity Agent** (periodic, merchant-side). Reads weather (Open-Meteo), the OSM merchant catalog, an events stub, and a per-merchant transaction-density fixture; fires when *weather*, *event-end*, or *demand-gap* (live curve below the typical day-of-week / time-of-day curve) trips. Drafts an offer **and** a matching GenUI widget layout spec, routes both to the merchant inbox.
- **Surfacing Agent** (real-time, user-side). Deterministically scores already-approved offers against the wrapped user context, applies the **high-intent boost** (active screen time, map-app foreground, in-app coupon browsing), respects a silence threshold by default, picks top-1, and calls the LLM exactly once — to rewrite only the headline of the card that fires.
- **GenUI focused offer view on React Native.** Tapping a merchant card slides the drawer into a focused offer screen rendered through the GenUI pipeline: an LLM-emitted JSON layout spec composing 6 RN primitives (`View`, `Text`, `Image`, `Pressable`, `ScrollView`, plus one composed widget primitive), schema-validated, with a known-good fallback render. Three structurally different widgets for the same merchant in three contexts (rain / quiet / pre-event).
- **Merchant inbox** (web Vite app) with a per-merchant demand-curve view, one live-toggleable auto-approve rule on stage, the trust gradient ("always auto-approve like this") visible, and a moments feed mirroring the customer-side widget render.
- **Visible privacy boundary** `{intent_token, h3_cell_r8}` rendered in a Settings → Demo & Debug dev panel; **high-intent toggle** re-skins the same offer with a lower threshold and a more aggressive headline; **simulated girocard checkout** with cashback budget decrement; **`cities/berlin.json` ↔ `cities/zurich.json`** swap on stage triggered by the weather pill tap.
- **SF Symbols throughout.** Emoji glyphs replaced by typed `expo-symbols` SF Symbols — `cup.and.saucer` for cafés, `birthday.cake` for bakeries, `cloud.heavyrain` for incoming rain — so the wallet reads as native iOS instead of cross-platform fallback.

### 4. Unique Selling Proposition (USP) *

**We invert the brief.** The standard pattern is *"merchant sets a goal, AI generates an offer."* MomentMarkt does the opposite: **AI proposes, merchant approves, trust grows by default** — one tap promotes any draft to *"always auto-approve offers like this,"* turning the wallet from an inbox into an autopilot the merchant still understands. Three things make this defensible against generic coupon-AI submissions.

1. **Real GenUI on React Native** — the LLM emits a JSON layout spec composed of 6 RN primitives, schema-validated, rendered live on iOS Simulator inside a focused offer view that slides up from the wallet drawer when a merchant is tapped. Not template fill, not a static `<OfferCard />`. Three structurally different widgets for the same merchant in three contexts (rain / quiet / pre-event) prove the engine is real.
2. **Tap-to-swap generative city** — one tap on the frosted weather pill flips the entire wallet between Berlin and Zurich: live map fly-to, live `/merchants/{city}` reload, live `/signals/{city}` weather refetch, currency + Swiss-German copy. Same engine, new city, no rebuild — the *"generative"* claim made visible in one gesture.
3. **High-intent surfacing as the user-side dial + a visible `{intent_token, h3_cell_r8}` privacy boundary** logged on screen, paired with three OpenAI-demo-style "production swap" callouts (push notification, on-device SLM, real Payone density) that map cleanly onto the rail DSV-Gruppe already operates for Germany's Sparkassen — a credible production path no consumer-AI startup can replicate.

### 5. Implementation & Technology *

**Stack.** Consumer app: React Native + Expo + TypeScript on iOS Simulator (Expo dev client; native build required for Apple Maps via `react-native-maps`). UI primitives: `expo-symbols` for SF Symbols, `@gorhom/bottom-sheet` for the wallet drawer, `react-native-reanimated` for the map fly-to + drawer-coupled fades, `react-native-gesture-handler` for the iOS swipe-right + swipe-down dismiss patterns. Merchant inbox: small React + Vite web app with a port of the GenUI WidgetRenderer + cream design tokens, plus a two-pane operator dashboard mirroring the customer-side widget. Backend: FastAPI + SQLite, deployed publicly on Hugging Face Spaces (https://peaktwilight-momentmarkt-api.hf.space/, see `/health` and `/docs`). LLM: **Pydantic AI** agents with a provider-swappable model string; demo runs on **Azure OpenAI** (gpt-5.5 via `rapidata-hackathon-resource`), and any LLM failure falls back to validated fixture JSON so the demo never breaks. Geo: H3 resolution-8 coarse cells (~1 km) for the privacy boundary.

**Live endpoints.** `GET /health`, `GET /cities`, `GET /signals/{city}` (Open-Meteo-backed live weather + trigger evaluation + privacy envelope), `GET /merchants/{city}?q=...` (fuzzy search across the catalog), `GET /merchants/{id}/events` (activity feed for the merchant dashboard), `POST /opportunity/generate`, `POST /surfacing/evaluate`. Mobile uses `useSignals(city)` (200ms cache) for the weather pill and the search list debounces queries at 200ms with abortable in-flight cancellation.

**Datasets actually used in the demo.** **Open-Meteo** (live weather, no auth) drives the temperature + condition glyph in real time. **OpenStreetMap via Overpass** — ~35 places hydrated near Rosenthaler Platz captured 2026-04-26 (St. Oberholz, Zeit für Brot, The Barn, ocelot, Mein Haus am See, Süße Sünde, Blumen Vanessa, etc.) populate the Berlin merchant catalog and search list. Zurich runs a smaller hand-curated catalog around Zürich HB to demonstrate the config-swap path while keeping the demo recordable. **VBB GTFS** stops within 1 km of Alexanderplatz shape walk-time copy. An events stub gates the event-end trigger. A hand-authored `data/transactions/berlin-density.json` for 4 demo merchants stands in for the real Payone transaction density.

**Architecture.** Opportunity Agent runs on a tick (in production: Helm chart / scheduled worker — called out on the architecture slide), pulls signals, computes which of the three triggers fired, drafts `{offer, widget_spec}` per merchant, writes to the inbox. Merchant approves, edits, skips, or promotes the draft to an auto-approve rule. Surfacing Agent receives a context update wrapped as `{intent_token, h3_cell_r8, weather_state, t, high_intent}`, deterministically scores candidates over the walk-ring (user h3 + 1 ring), applies the silence threshold, and either fires one in-app card or stays quiet. On fire, the LLM rewrites only the headline (cache key `(offer_id, weather_state, intent_state)` for demo determinism); the React Native widget tree is rendered from the validated layout spec inside a focused offer view that slides up from the wallet drawer. Tap CTA → QR → simulated girocard checkout → cashback budget decrement.

**Three OpenAI-demo-style "production swap" callouts** on the architecture slide, consistent visual language: (1) **push path** — in-app surface (demo) → push notification server, e.g. Expo Push / FCM / APNs (prod); (2) **SLM extractor** — `extract_intent_token()` server-side stub (demo) → on-device Phi-3-mini / Gemma-2B (prod); (3) **Payone signal** — synthetic `berlin-density.json` (demo) → real Payone aggregation across Sparkassen (prod). **Honest scope** (deliberately deferred): no live on-device SLM, no real Web Push, no real on-device collection of high-intent signals, no real-time image generation (pre-bucketed mood library keyed by `(trigger × category × weather)`), no real POS, no native build pipelines, no Tavily, no Foursquare, no CH GTFS bind on the Zürich swap.

### 6. Results & Impact *

**Built and demonstrable in the 1-min demo on iOS Simulator.** One Mia spine end-to-end: silent open onto a full-bleed Apple Map, frosted live-weather pill top-left, drawer at 25 % showing the search bar + "Offers for you" list of real OSM cafés, bakeries, and kiosks → swipe drawer up, fuzzy-search "St. Oberholz" or "Bondi" through the live `/merchants/berlin` endpoint → tap a merchant, focused offer view slides in rendering a runtime-generated **GenUI widget** from the LLM-emitted JSON spec → high-intent toggle re-skins the same offer (lower threshold, sharper copy) → QR redeem → simulated girocard checkout with cashback budget decrement → cut to merchant inbox showing the same offer auto-approved 3 h earlier under one rain rule, anchored to the demand-curve gap moment that triggered it → **tap the weather pill, the wallet flips Berlin → Zurich**: map flies to Zürich HB, merchants reload, weather refetches from Open-Meteo, surfacing input swaps, currency flips to CHF. Three structurally different GenUI widgets (rain / quiet / pre-event) generated for the same merchant prove the layout-spec engine is real. A Settings → Demo & Debug dev panel logs the actual `{intent_token, h3_cell_r8}` payload entering the Surfacing Agent, with a visible high-intent boost arrow. The FastAPI backend is publicly deployed on Hugging Face Spaces so judges can hit `/cities`, `/signals/berlin`, `/merchants/berlin?q=oberholz`, and `/opportunity/generate` without running anything locally.

**Why it matters.** Merchants get marketing they did not have to write, and stay in control by default. Three triggers — weather, events, demand — cover the situations where a static coupon would have been wrong. Users get one well-timed nudge or a calm searchable wallet, never a feed of dead coupons; silence is treated as a product feature, and high-intent surfacing earns the right to be more aggressive only when conversion probability is higher. For DSV-Gruppe, the simulated checkout maps cleanly onto the existing Sparkassen payment rail; the synthetic transaction-density fixture is a stand-in for the real Payone signal that already aggregates across thousands of merchants — replacing it is a config change, not an architecture change. The Berlin ↔ Zurich tap-to-swap is the same: new city is a JSON config, not a rebuild.

**Roadmap.** Real Payone density replaces the fixture (zero merchant onboarding cost). On-device SLM moves intent extraction off the server. Real on-device high-intent collection replaces the dev-panel toggle. Cross-merchant aggregate intelligence — defensible because DSV already aggregates across the Sparkassen network. Persisted redemptions + a real `/history` endpoint (in flight today) replace the local-only redemption log so the wallet's clock-icon History overlay reflects backend-sourced state.

---

## Additional Information

- **Branding stance.** Product UI is intentionally neutral — no Sparkassen-Rot, no S-logomark, no "Mit Sparkasse bezahlt" copy in chrome. DSV-Gruppe / Sparkassen context lives in pitch narrative + architecture slide. Rationale: portability across partners, product feel over fan-project feel.
- **Persona relocation.** The brief's reference persona Mia is in Stuttgart; we relocated her to **Berlin** (with **Zürich** as the tap-to-swap proof) because that is where our open-data signals are richest and where we have a real OSM merchant catalog. Acknowledged on stage in one line.
- **IA refactor.** The bottom tab bar shipped earlier (#103) was dropped in favour of a drawer-first IA: gear + clock SF Symbol icons over the map's top-right, frosted weather pill top-left. The wallet drawer is the durable surface; Settings + History are slide-in overlays with iOS-native swipe-right + swipe-down dismiss + edge-pan pop.
- **Stack note.** Consumer is React Native + Expo (not Next.js / a web phone-frame mock); merchant inbox stays web (small Vite + React app with a port of the GenUI WidgetRenderer). GenUI primitives are React Native primitives. Backend agents are Pydantic AI with an Azure OpenAI provider; the model string is env-swappable.
- **Recordable fallback** past hour 5 of the build: hand-authored offer + pre-rendered RN widget + hard-coded trigger + static checkout. Loses live GenUI generation, signal-driven offers, and the high-intent toggle; preserves the Mia spine + visible dataset use. Wallet drawer's search list also has an offline-fallback Berlin Mitte list so it stays responsive if the HF Space is unreachable.
- **Dataset honesty.** Berlin merchant catalog is real OSM Overpass; Zurich catalog is hand-curated for the demo (real OSM Zurich is in flight). Events are a hand-curated stub; transaction-density JSON is hand-authored for 4 demo merchants; high-intent signals are simulated via a dev-panel toggle; Foursquare data is gated and not used; Tavily live events are out of scope.

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

Quick judge probes:
- `https://peaktwilight-momentmarkt-api.hf.space/health` → `{"status":"ok"}`
- `https://peaktwilight-momentmarkt-api.hf.space/docs` → interactive OpenAPI schema
- `https://peaktwilight-momentmarkt-api.hf.space/cities` → Berlin + Zürich configs
- `https://peaktwilight-momentmarkt-api.hf.space/signals/berlin` → live trigger evaluation, demand-gap, privacy envelope
- `https://peaktwilight-momentmarkt-api.hf.space/merchants/berlin?q=oberholz` → live fuzzy search over the real OSM catalog

The mobile demo itself runs on iOS Simulator against this backend — there is no public consumer URL because the wallet is a native RN app, not a web page. The merchant inbox is deployed publicly at https://momentmarkt.doruk.ch/.

## GitHub Repository URL

https://github.com/momentmarkt/momentmarkt

## Demo video URL

_pending_ (recorded in build phase 5; ≤55s on iOS Simulator)

## Tech video URL

_pending_ (recorded in build phase 5; ≤55s; architecture slide → live editor → live phone)

## Project cover image

`assets/cover.png` (16:9; rendered from `assets/cover.html`). Concept: a single iPhone-style phone frame (three-quarters left) showing the wallet drawer expanded over a full-bleed Berlin Mitte Apple Map, frosted weather pill top-left ("Berlin · 11° · Mitte" with `cloud.heavyrain` SF Symbol), gear + clock SF Symbol buttons top-right, drawer revealing the search bar and the focused GenUI offer for Cafe Bondi mid-render — `ImageBleedHero`-style composition, rainy-window mood image, headline "Es regnet bald. 80 m bis zum heißen Kakao.", a € price line, and a single primary CTA. Behind the phone: a desaturated Berlin Mitte map fragment (Rosenthaler Platz visible) with three subtle H3 hex cells highlighted in the wallet's accent colour. Top-right corner: a small monospace dev-panel chip rendering `{intent_token: "lunch_break.cold", h3_cell_r8: "881f1d489dfffff"}` with a tiny "high-intent: on" pill below it. Neutral cream palette, deep navy, one warm accent for the CTA. No Sparkassen branding, no stock-photo people, no logo soup. Title lockup bottom-left: *"MomentMarkt — AI proposes. Merchants approve. The wallet stays quiet until it shouldn't."*

## Technologies / Tags

React Native, Expo, TypeScript, expo-symbols, gorhom bottom-sheet, react-native-reanimated, react-native-gesture-handler, react-native-maps, React, Vite, FastAPI, Python, SQLite, Pydantic AI, Azure OpenAI, Hugging Face Spaces, GenUI, H3, OpenStreetMap, Overpass API, Open-Meteo, GTFS, SF Symbols

## Additional Tags

City Wallet, DSV-Gruppe, Sparkassen, Payone, Berlin, Zürich, two-agent system, weather trigger, event trigger, demand-gap trigger, high-intent surfacing, in-market signal, context-aware recommendations, drawer-first IA, tap-to-swap city, live merchant search, focused offer view, merchant inbox, auto-approve, simulated checkout, simulated girocard, privacy boundary, intent token, schema-validated LLM output, iOS Simulator, iOS-native gestures

---

## Demo video script (≤60s hard cap; target 55s)

iOS Simulator phone on the left, Berlin map behind, dev panel beside. Live screen recording, no slides.

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:06 | iOS Simulator opens to the wallet — full-bleed Apple Map of Berlin Mitte, frosted "Berlin · 11° · Mitte" weather pill top-left (live Open-Meteo), gear + clock icons top-right, wallet drawer at 25 % snap showing the search bar and a row of real OSM merchants. No pop-ups. | "This is Mia's wallet over a real Berlin map. Live weather, real merchants — and by default it stays quiet." |
| 0:06–0:14 | Mia drags the drawer up to 80 %. Search list reveals real OSM places — St. Oberholz, Zeit für Brot, ocelot, Mein Haus am See. She types "ober" — list debounces to St. Oberholz; backend `/merchants/berlin?q=ober` log flashes in the dev panel. | "Live search over real OpenStreetMap places near Rosenthaler Platz, fetched from FastAPI on Hugging Face Spaces, debounced 200 ms." |
| 0:14–0:24 | Mia taps Cafe Bondi. Drawer flips into a focused offer view rendering the GenUI widget — rainy-window mood, walk-time chip, single CTA — composed at runtime from a JSON layout spec the LLM just emitted, rendered through 6 RN primitives. Dev panel logs `{intent_token, h3_cell_r8}` entering the Surfacing Agent. | "Tap a merchant — focused offer slides in. Generated at runtime: the LLM emitted this layout as JSON, schema-validated, six React Native primitives. Privacy boundary visible: an intent token and an H3 coarse cell." |
| 0:24–0:30 | Presenter flips the dev-panel **high-intent** toggle to on. Same offer re-surfaces with a lower threshold and a more aggressive headline variant. | "High-intent on. Same offer, lower bar, sharper copy — the in-market dial." |
| 0:30–0:36 | Tap CTA → QR appears → simulated girocard checkout → success screen, cashback budget decrements. | "QR redeems through the rail the bank already operates. Simulated girocard, real flow." |
| 0:36–0:44 | Cut to merchant inbox (web): per-merchant demand-curve view — typical Saturday curve faint behind, today's live curve dipping below it, gap highlighted. Same offer card sits next to the dip, marked "Auto-approved 3h ago — demand-gap rule." Toggle a second rule on. | "The merchant sees the dip. AI drafted an offer to fill it. They tapped one rule — auto-approved every time the curve drops like this." |
| 0:44–0:55 | Back to the phone. Presenter taps the frosted weather pill. Map flies to Zürich HB, merchants reload, weather refetches, currency flips to CHF, neighborhood label flips to "HB". | "One tap on the weather pill. Map flies, merchants reload, weather refetches, currency flips. Same engine, new city. That's the product." |

## Tech video script (≤60s hard cap; target 55s)

Architecture slide → live editor → live phone frame.

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:08 | Architecture diagram: iOS Simulator phone (RN + Expo + TypeScript, expo-symbols, gorhom bottom-sheet, react-native-maps) ↔ FastAPI on Hugging Face Spaces ↔ SQLite. Two agent boxes labelled **Opportunity Agent** and **Surfacing Agent** branching off, both Pydantic AI agents calling Azure OpenAI. | "React Native and Expo on the phone, FastAPI on Hugging Face Spaces, SQLite, Pydantic AI agents on Azure OpenAI. Two agents." |
| 0:08–0:18 | Zoom into Opportunity Agent box, annotated *"periodic job — Helm chart / scheduled worker in prod."* Three input arrows: Open-Meteo, events stub, `transactions/berlin-density.json` (with **OSM Overpass** feeding the merchant catalog). Output: `{offer, widget_spec}` → merchant inbox. | "The Opportunity Agent is a periodic job. Three triggers — weather, events, demand-gap on a Payone-style fixture — drafts an offer and a JSON widget spec, routes them to the inbox." |
| 0:18–0:28 | Editor view: actual JSON layout spec on screen — `{ "type": "ImageBleedHero", "children": [...] }` — composing 6 React Native primitives. Schema validator passes; fallback render path highlighted. Cut to phone: tap a merchant in the search list, focused offer view renders that exact spec. | "GenUI is real. The LLM emits a layout spec, six RN primitives, schema-validated, with a known-good fallback. Tap a merchant — focused offer view renders that spec." |
| 0:28–0:40 | Zoom into Surfacing Agent box: input wrapped as `{intent_token, h3_cell_r8}`, deterministic scoring, silence threshold, **high-intent boost arrow** feeding in. Side panel logs the exact payload. | "The Surfacing Agent scores deterministically. Intent token plus H3 coarse cell — boundary logged on screen. High-intent signals compose as a boost: lower threshold, sharper headline. The LLM only rewrites the headline of the one card that fires." |
| 0:40–0:50 | Three "production swap" callouts surface on the slide: (1) in-app surface → push server, (2) SLM server-side → on-device, (3) synthetic JSON → real Payone aggregation. Cut to phone: tap weather pill, Berlin → Zurich. | "Three production swaps, drawn explicitly: push replaces the in-app surface, SLM moves on-device, synthetic density becomes real Payone aggregation. And one tap on the weather pill swaps the city — same engine, new config." |
| 0:50–0:55 | Roadmap card: one line. | "The rail already exists. Cross-merchant intelligence is the next aggregation." |

---

## Submission checklist

- [x] Short Description finalized (1 sentence, tagline)
- [x] Problem & Challenge finalized
- [x] Target Audience finalized
- [x] Solution & Core Features finalized — drawer-first IA, live merchant search, tap-to-swap, GenUI focused offer view all reflected
- [x] Unique Selling Proposition (USP) finalized — tap-to-swap city promoted to USP #2
- [x] Implementation & Technology finalized — Pydantic AI + Azure + HF Space + live `/merchants/{city}` + `/signals/{city}` reflected
- [x] Results & Impact finalized
- [x] GitHub repo URL filled
- [x] Live Project URL filled (Hugging Face Space backend; mobile is iOS Simulator)
- [ ] Demo video URL — recording remains user's last-mile
- [ ] Tech video URL — recording remains user's last-mile
- [x] 16:9 cover image — `assets/cover.png` exported (concept locked, render committed)
- [x] Branding honesty preserved (no Sparkassen UI chrome)
- [x] Dataset honesty preserved (real OSM Berlin, hand-curated Zurich, events stub, hand-authored density, simulated high-intent)
- [x] Demo truth boundary table consistent with README.md and CLAUDE.md
- [x] All referenced URLs verified live (HF `/health` 200, `/docs` 200, GitHub 200)
