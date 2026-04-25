ARTIFACT_ID: submission-v03
ARTIFACT_TYPE: submission
PARENT_IDS: spec-v04, agent-io-v01, submission-v02
STATUS: blocked

# Submission draft

## Project title
City Wallet — AI proposes, merchants approve, the wallet stays quiet until it shouldn't

## Short description
A two-agent city wallet that drafts context-aware local offers from three live triggers — weather, events, demand — lets merchants approve them in one tap, and surfaces just one as a runtime-generated React Native widget, redeemable through a simulated bank rail.

## 1. Problem & Challenge
Small city merchants don't have a marketing department, and static loyalty coupons are noise to users and a chore to maintain for shop owners. The CITY WALLET brief asks for an AI-powered city wallet that detects the most relevant local offer for a user in real time, generates it dynamically, and makes it redeemable through a simulated checkout — serving end users first while letting merchants participate with minimal effort by setting simple rules. The hard challenge is twofold. First, on the user side: surface offers only when they genuinely fit (weather shift, an event ending nearby, a real-time demand gap at a specific merchant) and stay silent otherwise — UX, not technology, decides whether the offer is accepted or ignored. Second, on the merchant side: let independent shop owners stay in control without writing copy, designing widgets, or learning a tool. Today's coupon apps fail at both ends.

## 2. Target Audience
Two-sided, with the consumer at the centre of the demo:
- **End users in dense European city centres** — commuters, lunch-break walkers, tourists. Reference persona is **Mia**, 28, on a cold Berlin lunch break, walking near Alexanderplatz, browsing.
- **Local merchants** — independent cafés, bakeries, bookstores, Eisdielen. Sole interaction is an inbox with Approve / Edit / Skip / **Always auto-approve like this**, plus a handful of weather-, event- or demand-driven rules.
- **Sponsor stakeholder**: DSV-Gruppe and the Sparkassen network, for whom the simulated checkout maps to an existing payment rail and the Payone-style transaction-density signal already aggregates across thousands of merchants.

## 3. Solution & Core Features
Two cooperating agents, one neutral wallet UI, three live triggers:

- **Opportunity Agent** (periodic, merchant-side): reads weather (Open-Meteo), the OSM merchant catalog, an events stub, and a per-merchant transaction-density fixture; detects when **any of three triggers** fires — *weather* shift, *event* ending nearby, *demand* gap below the typical day-of-week / time-of-day curve — and drafts an offer **and** a matching GenUI widget layout spec. Routes them to a merchant inbox where the owner can approve one-by-one or promote a draft to "always auto-approve like this."
- **Surfacing Agent** (real-time, user-side): scores already-approved offers against the user's current context with a deterministic function. The score is **boosted by high-intent surfacing signals** — active screen time, map-app foreground time, in-app coupon browsing — so when the user is in-market the bar to fire is lower and the headline variant is more aggressive. Silence is the default, and a feature. The LLM is used only to rewrite the headline of the one offer that fires.
- **GenUI rendering on React Native**: the LLM emits a JSON layout spec composing **6 React Native primitives** (`View`, `Text`, `Image`, `Pressable`, `ScrollView`, plus one composed widget primitive). A schema validator gates each generation; a known-good fallback render protects the demo. Widgets render natively on iOS Simulator via Expo.
- **Merchant inbox** (small static React + Vite web app) with one live-toggleable auto-approve rule on stage, demonstrating the trust gradient from one-by-one approval to autopilot. The inbox also renders a **per-merchant demand-curve view**: typical day-of-week / time-of-day curve drawn faintly behind, today's live transaction-density curve in front, current gap highlighted; auto-approved offer cards point at the gap moment that triggered them. This is where the Payone production story lives visually, not in the consumer-side dev tooling.
- **Privacy boundary**: surfacing input is wrapped as `{intent_token, h3_cell_r8}` in code and rendered on-screen in a dev panel during the demo. The SLM extractor runs server-side for the MVP; on-device is roadmap.
- **High-intent dev-panel toggle**: flipping the toggle on stage re-surfaces the same offer with a lower threshold and a more aggressive headline variant, making the in-market boost legible to judges.
- **Simulated checkout**: QR scan → success screen → cashback budget decrement. No real POS, no real Web Push, no real bank API.
- **City config swap**: `cities/berlin.yaml` ↔ `cities/zurich.yaml` flips OSM bbox + weather URL + currency to CHF + Swiss-German copy, live on stage.

## 4. Unique Selling Proposition (USP)
**We invert the brief.** The standard pattern is "merchant sets a goal, AI generates an offer." We do the opposite: **AI proposes, merchant approves, trust grows by default** — with one tap, the merchant promotes any draft to "always auto-approve offers like this," turning the wallet from an inbox into an autopilot the merchant still understands.

Three things make this defensible against generic coupon-AI submissions:
1. **Real GenUI on React Native** — the LLM emits a layout spec composed of 6 RN primitives, schema-validated, rendered live on iOS Simulator. Not template fill, not a static `<OfferCard />`.
2. **High-intent surfacing as the user-side dial** — the Surfacing Agent composes an in-market boost from device-side intent proxies, so the same offer fires earlier and reads more aggressively when conversion probability is higher.
3. **A visible `{intent_token, h3_cell_r8}` privacy boundary** logged on screen, paired with three OpenAI-demo-style "production swap" callouts on the architecture slide — the wallet has a credible production path through the rail DSV-Gruppe already operates for Germany's Sparkassen.

## 5. Implementation & Technology
**Stack**
- **Consumer app**: React Native + Expo + TypeScript, styled with NativeWind, recorded on iOS Simulator. (Expo Go on a real device is the documented fallback.)
- **Merchant inbox**: small static React + Vite web app — partner-facing UI does not need RN.
- **Backend**: FastAPI (Python) + SQLite for offers, merchants, approvals, and demo state.
- **LLM**: Azure OpenAI behind LiteLLM (provider-swappable). Used by the Opportunity Agent for offer drafting + widget-spec emission, and by the Surfacing Agent only for headline rewrite on a fired surface.
- **Geo**: H3 (resolution 8 coarse cells) for the privacy boundary.
- **Data signals**: Open-Meteo (live weather, no auth), OpenStreetMap via Overpass (937 POIs in Berlin Mitte; 2096 around Zürich HB), VBB GTFS (403 stops within 1 km of Alexanderplatz, used for walk-time copy), an events stub gating the event-end trigger, and a hand-authored `data/transactions/berlin-density.json` fixture for 4 demo merchants standing in for Payone transaction density.
- **GenUI**: 6 React Native primitives (`View`, `Text`, `Image`, `Pressable`, `ScrollView` + one composed widget primitive) + LLM-emitted JSON layout spec, schema-validated, with a known-good fallback render.

**Architecture**
1. **Opportunity Agent** runs on a tick (in production: Helm chart / scheduled worker; called out on the architecture slide), pulls weather + events stub + transaction-density fixture, computes which of the three triggers fires, drafts `{offer, widget_spec}` per merchant, and writes to the inbox.
2. **Merchant** approves, edits, skips, or promotes the draft to an auto-approve rule. Approved offers land in the candidate pool.
3. **Surfacing Agent** receives a context update wrapped as `{intent_token, h3_cell_r8, weather_state, t}` plus the **high-intent boost** vector, deterministically scores candidates, applies the silence threshold, and either fires one in-app card or stays quiet. When high-intent is on, the threshold drops and the aggressive headline variant is unlocked.
4. **On fire**, the LLM rewrites only the headline; the React Native primitive tree is rendered from the validated layout spec.
5. **QR redeem** hits a `/redeem` endpoint, decrements a cashback budget, and the success screen renders.

**Three OpenAI-demo-style "production swap" callouts** on the architecture slide (consistent visual language):
- **Push path**: in-app surface (demo) → push notification server, e.g. Expo Push / FCM / APNs (prod).
- **SLM extractor**: server-side (demo) → on-device (prod).
- **Payone signal**: synthetic transaction-density JSON (demo) → real Payone aggregation across Sparkassen (prod).

**Honest scope choices** (deliberately deferred — see roadmap):
- No live on-device SLM in the demo; intent extraction runs server-side.
- No real Web Push, no service worker, no OS notification permission flow — surface is an in-app card by design.
- No real on-device collection of high-intent signals — simulated by the dev-panel toggle.
- No real-time image generation; pre-bucketed mood library keyed by `(trigger × category × weather)`.
- No real POS integration; checkout is simulated.
- No native iOS/Android build pipelines; Expo Go + iOS Simulator only.
- Tavily and Foursquare out of scope for the MVP (events use a hand-curated stub; merchant catalog is OSM).
- No CH GTFS bind in the Zürich swap (map + weather + currency only).

## 6. Results & Impact
**What is built and demonstrable in the 1-min demo**
- One Mia spine end-to-end on iOS Simulator: silent open → walk → **weather + demand-gap** fire → in-app surface → runtime-generated **GenUI widget** → **high-intent toggle** mutates the same offer → QR redeem → simulated checkout → merchant inbox showing the offer auto-approved 3h earlier under one rain rule → live `cities/zurich.yaml` swap.
- Three structurally different GenUI widgets (rain / quiet / pre-event) generated for the same merchant, side-by-side, proving the layout-spec engine is real.
- An on-screen dev panel logging the actual `{intent_token, h3_cell_r8}` payload entering the Surfacing Agent, with a visible high-intent boost arrow.

**Why it matters**
- Merchants get marketing they did not have to write, and stay in control by default. Three triggers — weather, events, demand — cover the situations when a static coupon would have been wrong.
- Users get one well-timed nudge, not a feed of dead coupons. Silence is treated as a product feature; high-intent surfacing earns the right to be more aggressive only when conversion probability is higher.
- For DSV-Gruppe, the simulated checkout maps cleanly onto the existing Sparkassen payment rail; the synthetic transaction-density fixture is a stand-in for the real Payone signal that already aggregates across thousands of merchants — replacing it is a config change, not an architecture change.

**Roadmap (one-line each, mentioned in the tech video)**
- Real Payone transaction density replaces the fixture — zero merchant onboarding cost.
- On-device SLM (RN-compatible runtime) moves intent extraction off the server.
- Real on-device high-intent collection (screen time, map-app foreground, in-app browsing) replaces the dev-panel toggle.
- Cross-merchant aggregate intelligence — defensible because DSV already aggregates across the Sparkassen network.

## Additional Information
- **Branding stance**: the product UI is intentionally neutral — no Sparkassen-Rot, no S-logomark, no "Mit Sparkasse bezahlt" copy in chrome. DSV-Gruppe / Sparkassen context lives in pitch narrative + architecture slide. Rationale: portability across partners and a product feel over a fan-project feel.
- **Persona relocation**: the brief's reference persona Mia is in Stuttgart; we relocated her to **Berlin** (with **Zürich** as the config-swap proof) because that is where our open-data signals are richest. Acknowledged on stage in one line.
- **Stack note**: consumer is React Native + Expo (not Next.js / a web phone-frame mock); merchant inbox stays web (small static React + Vite). GenUI primitives are React Native primitives. NativeWind handles styling continuity.
- **Recordable fallback** past hour 5 of the build: hand-authored offer + pre-rendered RN widget + hard-coded trigger + static checkout. Loses live GenUI generation, signal-driven offers, and the high-intent toggle; preserves the Mia spine + visible dataset use.
- **Dataset honesty**: events are a hand-curated stub, labelled as fixtures; transaction-density JSON is hand-authored for 4 demo merchants; high-intent signals are simulated via a dev-panel toggle; Foursquare data is gated and not used; Tavily live events are out of scope.

## Live Project URL
_pending_

## GitHub Repository URL
_pending_

## Technologies/Tags
React Native, Expo, TypeScript, NativeWind, React, Vite, FastAPI, Python, SQLite, Azure OpenAI, LiteLLM, GenUI, H3, OpenStreetMap, Overpass API, Open-Meteo, GTFS

## Additional Tags
City Wallet, DSV-Gruppe, Sparkassen, Payone, Berlin, Zürich, two-agent system, weather trigger, event trigger, demand-gap trigger, high-intent surfacing, in-market signal, context-aware recommendations, merchant inbox, auto-approve, simulated checkout, privacy boundary, intent token, schema-validated LLM output, iOS Simulator

## Project cover image
**Concept (16:9, no size/format limit)**: a single iPhone-style phone frame, three-quarters left, showing the Mia rain-trigger GenUI widget mid-render on iOS Simulator chrome — `ImageBleedHero`-style composition, rainy-window mood image, headline "Es regnet bald. 80 m bis zum heißen Kakao.", a € price line, and a single primary CTA. Behind the phone, a desaturated Berlin Mitte map fragment (Alexanderplatz visible) with three subtle H3 hex cells highlighted in the wallet's accent colour. Top-right corner: a small monospace dev-panel chip rendering `{intent_token: "mia.lunch.cold", h3_cell_r8: "881f1d4a8dfffff"}` with a tiny "high-intent: on" pill below it, to make the privacy boundary and the in-market dial legible at thumbnail size. Neutral palette (off-white background, deep navy, one warm accent for the CTA), no Sparkassen branding, no stock-photo people, no logo soup. Title lockup bottom-left: "City Wallet — AI proposes. Merchants approve. The wallet stays quiet until it shouldn't."

## Demo video script (max 60 sec)
**Total runtime target: 55 seconds. iOS Simulator phone on the left, Berlin map behind, dev panel beside. Live screen recording, no slides.**

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:05 | iOS Simulator opens to the wallet home — empty, calm. Map behind it, Mia avatar walking near Alexanderplatz. No pop-ups. | "This is Mia's wallet. By default, it stays quiet." |
| 0:05–0:14 | Time-lapse of Mia walking ~80 m. Weather state in the dev panel flips from cloudy to "rain incoming"; the live transaction-density curve for Café Bondi dips below typical for Saturday 13:30. Both triggers fire. Still no notification. | "Open-Meteo flips. Demand at Café Bondi runs below typical for a Saturday lunch — both triggers fire on a rule the merchant auto-approved this morning." |
| 0:14–0:21 | An in-app card slides up into the RN phone: "Es regnet bald. 80 m bis zum heißen Kakao." Mia taps. Dev panel beside the phone logs `{intent_token, h3_cell_r8}` entering the Surfacing Agent. | "One in-app surface. The only one she'll see this hour. Surfacing input: an intent token and a coarse H3 cell — that's the privacy boundary." |
| 0:21–0:30 | Card expands into a full GenUI widget — `ImageBleedHero`, rainy-window mood, walk-time chip, single CTA — composed at runtime from a JSON layout spec the LLM just emitted, rendered through 6 RN primitives. | "Generated at runtime. The LLM emitted this layout as JSON, schema-validated, six React Native primitives." |
| 0:30–0:36 | Presenter flips the dev-panel **high-intent** toggle to on. Same offer re-surfaces with a lower threshold and a more aggressive headline variant. | "High-intent on. Same offer, lower bar, sharper copy — the in-market dial." |
| 0:36–0:44 | Tap CTA → QR appears → simulated POS scans → success screen, cashback budget decrements. | "QR redeems through the rail the bank already operates. Simulated checkout, real flow." |
| 0:44–0:51 | Cut to merchant inbox (web): per-merchant demand curve on screen — typical Saturday curve faint behind, today's live curve dipping below it, gap highlighted. Same offer card sits next to the dip, marked "Auto-approved 3h ago — demand-gap rule." Toggle a second rule on. | "The merchant sees the dip. AI drafted an offer to fill it. They tapped one rule — auto-approved every time the curve drops like this." |
| 0:51–0:55 | Drop down to a config selector: switch from `berlin.yaml` to `zurich.yaml`. Map re-skins to Zürich HB, weather repulls, prices flip to CHF, copy to Swiss-German. | "One config swap — same engine, new city. That's the product." |

## Tech video script (max 60 sec)
**Total runtime target: 55 seconds. Architecture slide → live editor → live phone frame.**

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:08 | Architecture diagram: iOS Simulator phone (RN + Expo + TypeScript + NativeWind) ↔ FastAPI ↔ SQLite. Two agent boxes labeled **Opportunity Agent** and **Surfacing Agent** branching off, both calling Azure OpenAI through LiteLLM. | "React Native and Expo on the phone, FastAPI back, SQLite, Azure OpenAI behind LiteLLM. Two agents." |
| 0:08–0:20 | Zoom into Opportunity Agent box, annotated "periodic job — Helm chart / scheduled worker in prod." Three input arrows: Open-Meteo, events stub, `transactions/berlin-density.json` (with **OSM POIs** feeding the merchant catalog). Output: `{offer, widget_spec}` → merchant inbox. | "The Opportunity Agent is a periodic job. Three triggers — weather, events, demand-gap on a Payone-style fixture — drafts an offer and a JSON widget spec, routes them to the inbox." |
| 0:20–0:30 | Editor view: actual JSON layout spec on screen — `{ "type": "ImageBleedHero", "children": [...] }` — composing 6 React Native primitives. Schema validator passes; fallback render path highlighted. | "GenUI is real. The LLM emits a layout spec, six RN primitives, schema-validated, with a known-good fallback render." |
| 0:30–0:42 | Zoom into Surfacing Agent box: input wrapped as `{intent_token, h3_cell_r8}`, deterministic scoring, silence threshold, **high-intent boost arrow** feeding in. Side panel logs the exact payload. | "The Surfacing Agent scores deterministically. Intent token plus H3 coarse cell — boundary logged on screen. High-intent signals compose as a boost: lower threshold, sharper headline. The LLM only rewrites the headline of the one card that fires." |
| 0:42–0:52 | Three "production swap" callouts surface on the slide: (1) in-app surface → push server, (2) SLM server-side → on-device, (3) synthetic JSON → real Payone aggregation. | "Three production swaps, drawn explicitly: push server replaces the in-app surface, SLM moves on-device, synthetic transaction density becomes real Payone aggregation across Sparkassen." |
| 0:52–0:55 | Roadmap card: one line. | "The rail already exists. Cross-merchant intelligence is the next aggregation." |

## Other visuals
- **Architecture diagram** (used in tech video and pinned in README): RN+Expo phone ↔ FastAPI ↔ SQLite; Opportunity vs. Surfacing agent split with cadences and inputs labelled; LiteLLM/Azure OpenAI box; explicit `{intent_token, h3_cell_r8}` boundary line; **three OpenAI-demo "production swap" callouts** (push, SLM, Payone); Opportunity Agent annotated as "periodic job — Helm chart / scheduled worker in prod"; high-intent boost input arrow into the Surfacing Agent.
- **README hero gif**: 6-second loop of the rain-trigger in-app surface → GenUI widget render on iOS Simulator → high-intent toggle re-skin → redeem success.
- **Three-up GenUI screenshot**: same merchant, three contexts (rain / quiet / pre-event), rendered side-by-side from three different LLM-emitted layout specs on iOS Simulator.
- **Merchant inbox screenshot** (web): the four demo merchants, the demand-curve view visible (typical-vs-live with today's gap highlighted), the auto-approve rule toggled on, an auto-approved offer card anchored to the gap moment.
- **Zürich swap screenshot**: phone frame after `cities/zurich.yaml` is loaded — CHF prices, Swiss-German copy, Zürich HB map fragment.
- **Privacy-boundary + high-intent slide**: zoomed view of the on-screen dev panel showing the live `{intent_token, h3_cell_r8}` payload and the high-intent toggle state.
- **README assets to ship**: MIT licence, dataset attribution block (Open-Meteo, OSM/Overpass, VBB GTFS), Expo + FastAPI run instructions, fetch script for the GTFS zips kept out of the repo.

## Submission blockers
- **STATUS: blocked.** Three required submission assets are unaccounted for at draft time:
  - **GitHub Repository URL** is `_pending_` — repo is not yet created or made public. Must be public with MIT licence by Sun 06:45 ET per SPEC's submission plan.
  - **Demo video URL** is not yet recorded. SPEC schedules recording in the 15–17h block (Sun ~04:15–06:15 ET); 1-min hard cap.
  - **Tech video URL** likewise unrecorded; same window, same 1-min hard cap.
- **Live Project URL** is `_pending_` — SPEC does not commit to a deployed instance; demo is local on iOS Simulator. Leave as `_pending_` or omit on Devpost if the field is optional; do not fabricate a URL.
- **Open SPEC questions** that may surface in Devpost copy or judge Q&A: (1) auto-approve rule defaults beyond the rain rule (resolves ~hour 12), (2) merchant mix and count for the demo (target 4, resolves at hour 1 from OSM POI filtering), (3) whether the high-intent dev-panel toggle is on-screen as part of the demo cut or kept off-screen and narrated (default = visible toggle, resolves at video-script pass ~hour 15). None are blockers for form copy, but resolve before the tech-video record.
- **Honesty guardrails** — this draft does **not** claim live Web Push, live on-device SLM, real-time image generation, real POS integration, real on-device intent collection, Tavily live events, Foursquare merchant data, or a CH GTFS bind on the Zürich swap. If marketing copy is added later, it must not contradict these.
