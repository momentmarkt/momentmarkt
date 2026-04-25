ARTIFACT_ID: submission-v01
ARTIFACT_TYPE: submission
PARENT_IDS: spec-v02, critique-v01
STATUS: blocked

# Submission draft

## Project title
City Wallet — AI-proposed, merchant-approved local offers

## Short description
A two-agent city wallet that drafts context-aware local offers from real-time signals, lets merchants approve them in one tap, and surfaces just one — only when it actually fits — as a runtime-generated GenUI widget redeemable through a simulated bank rail.

## 1. Problem & Challenge
Small city merchants do not have a marketing department. Static loyalty coupons are noise to users and a chore to maintain for shop owners. The CITY WALLET brief asks for an AI-powered city wallet that detects the most relevant local offer for a user in real time, generates it dynamically, and makes it redeemable through a simulated checkout — serving end users first while letting merchants participate with minimal effort by setting simple rules. The hard challenge is twofold: surface offers only when they genuinely fit (weather, time, location, demand), and let merchants stay in control without writing copy or designing UI. UX — when, how, and in what form an offer appears — decides whether it is accepted or ignored.

## 2. Target Audience
Two-sided, with the consumer at the centre of the demo:
- **End users in dense European city centres** — commuters, lunch-break walkers, tourists. Reference persona is **Mia**, 28, on a cold Berlin lunch break, walking near Alexanderplatz, browsing.
- **Local merchants** — independent cafés, bakeries, bookstores, Eisdielen. Sole interaction is an inbox with Approve / Edit / Skip / **Always auto-approve like this**, plus a handful of weather- or time-driven rules.
- **Sponsor stakeholder**: DSV-Gruppe and the Sparkassen network, for whom the simulated checkout maps to an existing payment rail (Payone-style transaction density as the production demand signal).

## 3. Solution & Core Features
Two cooperating agents, one neutral wallet UI:

- **Opportunity Agent** (periodic, merchant-side): reads weather (Open-Meteo), the OSM merchant catalog, and a hand-authored per-merchant transaction-density fixture; detects demand gaps; drafts an offer **and** a GenUI widget layout spec; routes them to a merchant inbox where they can be approved one-by-one or through an "always auto-approve like this" rule.
- **Surfacing Agent** (real-time, user-side): scores already-approved offers against the user's current context (weather shift, H3 coarse cell, time-of-day) with a deterministic function; uses the LLM only to rewrite the headline of the one offer that fires. Silence is the default and a feature.
- **GenUI rendering**: the LLM emits a JSON layout spec composing 6 React primitives (`ImageBleedHero`, hero text, walk-time chip, CTA, etc.). A schema validator gates it; a known-good fallback render protects the demo.
- **Merchant inbox** with one live-toggleable auto-approve rule (rain-driven), demonstrating the trust gradient.
- **Privacy boundary**: surfacing input is wrapped as `{intent_token, h3_cell_r8}` in code and rendered in an on-screen dev panel during the demo. The SLM extractor runs server-side for the MVP; on-device is roadmap.
- **Simulated checkout**: QR scan → success screen → cashback budget decrement. No real POS, no real Web Push, no real bank API.
- **City config swap**: `cities/berlin.yaml` ↔ `cities/zurich.yaml` flips OSM bbox + weather URL + currency to CHF + Swiss-German copy, live on stage.

## 4. Unique Selling Proposition (USP)
**We invert the brief.** The standard pattern is "merchant sets a goal, AI generates an offer." We do the opposite: **AI proposes, merchant approves, trust grows by default** — with one tap, the merchant can promote any draft to "always auto-approve offers like this," turning the wallet from an inbox into an autopilot the merchant still understands.

Combined with **real GenUI** (LLM emits a layout spec, not template fills) and a visible **`{intent_token, h3_cell_r8}` privacy boundary** logged on screen, the result is a wallet that feels like a product, not a coupon dispenser — and that has a credible production path through the rail DSV-Gruppe already operates for Germany's Sparkassen.

## 5. Implementation & Technology
**Stack**
- Frontend: Next.js + TypeScript + Tailwind CSS. Phone-frame consumer UI and merchant inbox in one app.
- Backend: FastAPI (Python) + SQLite for offers, merchants, approvals, and demo state.
- LLM: Azure OpenAI behind LiteLLM (provider-swappable). Used by the Opportunity Agent for offer drafting + widget-spec emission, and by the Surfacing Agent only for headline rewrite on a fired surface.
- Geo: H3 (resolution 8 coarse cells); Leaflet for map fragments.
- Data signals: Open-Meteo (live weather, no auth), OpenStreetMap via Overpass (937 POIs in Berlin Mitte; 2096 around Zürich HB), VBB GTFS (403 stops within 1 km of Alexanderplatz, used for walk-time copy), and a hand-authored `data/transactions/berlin-density.json` fixture for 4 demo merchants standing in for Payone transaction density.
- GenUI: 6 React primitives + JSON layout spec, schema-validated, with a known-good fallback render.

**Architecture**
1. Opportunity Agent runs on a tick, pulls weather + transaction-density fixture, computes demand gaps, drafts `{offer, widget_spec}` per merchant, and writes to the inbox.
2. Merchant approves, edits, skips, or sets an auto-approve rule. Approved offers land in the candidate pool.
3. Surfacing Agent receives a context update (`{intent_token, h3_cell_r8, weather_state, t}`), deterministically scores candidates, applies a silence threshold, and either fires one in-app card or stays quiet.
4. On fire, the LLM rewrites only the headline; the React primitive tree is rendered from the validated layout spec.
5. QR redeem hits a `/redeem` endpoint, decrements a cashback budget, and the success screen renders.

**Honest scope choices** (deliberately deferred — see roadmap):
- No live on-device SLM in the demo; intent extraction runs server-side. The architecture slide labels the production seam.
- No real Web Push / service worker / OS notification permission flow — surface is an in-app card by design.
- No real-time image generation; pre-bucketed mood library keyed by `(trigger × category × weather)`.
- No real POS integration; checkout is simulated.
- Tavily and Foursquare are out of scope for the MVP (events use a hand-curated 5-event stub per city; merchant catalog is OSM).
- No CH GTFS bind in the Zürich swap (map + weather + currency only).

## 6. Results & Impact
**What is built and demonstrable in the 1-min demo**
- One Mia spine end-to-end: silent open → walk → weather-driven in-app surface → runtime-generated GenUI widget → QR redeem → simulated checkout → merchant inbox showing the same offer auto-approved 3h earlier → live `cities/zurich.yaml` swap.
- Three structurally different GenUI widgets (rain / quiet / pre-event) generated for the same merchant, side-by-side, proving the layout-spec engine is real.
- An on-screen dev panel logging the actual `{intent_token, h3_cell_r8}` payload entering the Surfacing Agent.

**Why it matters**
- Merchants get marketing they did not have to write, and stay in control by default.
- Users get one well-timed nudge, not a feed of dead coupons. Silence is treated as a product feature.
- For DSV-Gruppe, the simulated checkout maps cleanly onto the existing Sparkassen payment rail; the synthetic transaction-density fixture is a stand-in for the real Payone signal that already aggregates across thousands of merchants.

**Roadmap (one-line each, mentioned in the tech video)**
- Real Payone transaction density replaces the fixture — zero merchant onboarding cost.
- On-device SLM (transformers.js + WebGPU) moves intent extraction off the server.
- Cross-merchant aggregate intelligence — defensible because DSV already aggregates across the Sparkassen network.

## Additional Information
- **Branding stance**: the product UI is intentionally neutral — no Sparkassen-Rot, no S-logomark, no "Mit Sparkasse bezahlt" copy in chrome. DSV-Gruppe / Sparkassen context lives in the pitch narrative and architecture slide. Rationale: portability across partners and a product feel over a fan-project feel.
- **Persona relocation**: the brief's reference persona Mia is in Stuttgart; we relocated her to **Berlin** (with **Zürich** as the config-swap proof) because that is where our open-data signals are richest. Acknowledged on stage in one line.
- **Recordable fallback** past hour 4 of the build: hand-authored offer + pre-rendered widget + hard-coded trigger + static checkout. Loses live GenUI generation and signal-driven offers; preserves the Mia spine + visible dataset use for the demo.
- **Dataset honesty**: events are a hand-curated 5-event-per-city stub, labelled as fixtures; transaction-density JSON is hand-authored for 4 demo merchants; Foursquare data is gated and not used.

## Live Project URL
_pending_

## GitHub Repository URL
_pending_

## Technologies/Tags
Next.js, TypeScript, React, Tailwind CSS, FastAPI, Python, SQLite, Azure OpenAI, LiteLLM, GenUI, H3, Leaflet, OpenStreetMap, Overpass API, Open-Meteo, GTFS

## Additional Tags
City Wallet, DSV-Gruppe, Sparkassen, Payone, Berlin, Zürich, two-agent system, context-aware recommendations, merchant inbox, auto-approve, simulated checkout, privacy boundary, intent token, schema-validated LLM output

## Project cover image
**Concept (16:9)**: a single iPhone-style phone frame, three-quarters left, showing the Mia rain-trigger GenUI widget mid-render — `ImageBleedHero` with a rainy-window mood image, headline "Es regnet bald. 80 m bis zum heißen Kakao.", a CHF/€ price line, and a single primary CTA. Behind the phone, a desaturated Berlin Mitte map fragment (Alexanderplatz visible) with three subtle H3 hex cells highlighted in the wallet's accent colour. Top-right corner: a small monospace dev-panel chip rendering `{intent_token: "mia.lunch.cold", h3_cell_r8: "881f1d4a8dfffff"}` to make the privacy boundary legible at thumbnail size. Neutral palette (off-white background, deep navy, one warm accent for the CTA), no Sparkassen branding, no stock-photo people, no logo soup. Title lockup bottom-left: "City Wallet — AI proposes. Merchants approve. The wallet stays quiet until it shouldn't."

## Demo video script (max 60 sec)
**Total runtime target: 55 seconds. Phone-frame on the left, Berlin map behind. Live screen recording, no slides.**

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:05 | Phone frame opens to the wallet home — empty, calm. Map behind it, Mia avatar walking near Alexanderplatz. No pop-ups. | "This is Mia's wallet. By default, it stays quiet." |
| 0:05–0:13 | Time-lapse of Mia walking ~80m. Weather widget on the wallet flips from cloudy to "rain incoming" (driven by `data/weather/berlin.json`). Still no notification. | "Open-Meteo flips. A demand gap opens at Café Bondi, 80m away — auto-approved this morning under a rain rule." |
| 0:13–0:20 | An in-app card slides up into the phone frame: "Es regnet bald. 80 m bis zum heißen Kakao." User taps. | "One in-app surface. The only one she'll see this hour." |
| 0:20–0:30 | The card expands into a full GenUI widget — `ImageBleedHero`, rainy-window mood, walk-time chip, single CTA. Beside the phone, a small dev panel reveals the surfacing input: `{intent_token, h3_cell_r8}`. | "Generated at runtime — the LLM emitted this layout as JSON, schema-validated, six React primitives." |
| 0:30–0:38 | Tap CTA → QR appears → simulated POS scans → success screen, cashback budget decrements. | "QR redeems through the rail the bank already operates. Simulated checkout, real flow." |
| 0:38–0:48 | Cut to merchant inbox: same offer card, marked "Auto-approved 3h ago — rain rule." Toggle a second auto-approve rule on. | "The merchant didn't write this. They tapped one rule. AI proposed; they stayed in control." |
| 0:48–0:55 | Drop down to a config selector: switch from `berlin.yaml` to `zurich.yaml`. Map re-skins to Zürich HB, weather repulls, prices flip to CHF, copy to Swiss-German. | "One config swap — same engine, new city. That's the product." |

## Tech video script (max 60 sec)
**Total runtime target: 55 seconds. Architecture slide → live editor → live phone frame.**

| t | Shot | Narration (VO) |
|---|------|----------------|
| 0:00–0:08 | Architecture diagram: phone-frame (Next.js + TS + Tailwind) ↔ FastAPI ↔ SQLite. Two agent boxes labeled **Opportunity Agent** and **Surfacing Agent** branching off, both calling Azure OpenAI through LiteLLM. | "Next.js front, FastAPI back, SQLite, Azure OpenAI behind LiteLLM. Two agents." |
| 0:08–0:20 | Zoom into Opportunity Agent box: arrows from Open-Meteo, OSM POIs (937 nodes Berlin, 2096 Zürich), and `transactions/berlin-density.json` flow in. Output: `{offer, widget_spec}` → merchant inbox. | "The Opportunity Agent runs periodically. Weather, OSM merchants, a transaction-density fixture standing in for Payone — drafts offers and a JSON widget spec, routes them to the inbox." |
| 0:20–0:32 | Editor view: actual JSON layout spec on screen — `{ "type": "ImageBleedHero", "children": [...] }` — composing 6 React primitives. Schema validator passes. | "GenUI is real. The LLM emits a layout spec, six primitives, schema-validated, with a known-good fallback render." |
| 0:32–0:44 | Zoom into Surfacing Agent box: input wrapped as `{intent_token, h3_cell_r8}`, deterministic scoring, silence threshold. Side panel on the live demo logs the exact payload. LLM only rewrites the headline. | "The Surfacing Agent scores deterministically. The input is an intent token plus an H3 coarse cell — that boundary is logged on screen. The LLM only rewrites the headline of the one card that fires." |
| 0:44–0:55 | Roadmap card: three lines — "Payone replaces the fixture. SLM moves on-device. Cross-merchant aggregation across the Sparkassen network." | "Production swaps the fixture for Payone, moves the extractor on-device, and aggregates across Sparkassen. The rail already exists." |

## Other visuals
- **Architecture diagram** (used in tech video and pinned in README): phone-frame ↔ FastAPI ↔ SQLite; Opportunity vs. Surfacing agent split with cadences and inputs labelled; LiteLLM/Azure OpenAI box; explicit `{intent_token, h3_cell_r8}` boundary line between client context and Surfacing Agent; "SLM server-side for MVP / on-device in production" callout.
- **README hero gif**: 6-second loop of the rain-trigger in-app surface → GenUI widget render → redeem success.
- **Three-up GenUI screenshot**: same merchant, three contexts (rain / quiet / pre-event), rendered side-by-side from three different LLM-emitted layout specs.
- **Merchant inbox screenshot**: the four demo merchants, the rain auto-approve rule visible and toggled on.
- **Zürich swap screenshot**: phone frame after `cities/zurich.yaml` is loaded — CHF prices, Swiss-German copy, Zürich HB map fragment.
- **Privacy-boundary slide**: zoomed view of the on-screen dev panel showing the live `{intent_token, h3_cell_r8}` payload.
- **README assets to ship**: MIT licence, dataset attribution block (Open-Meteo, OSM/Overpass, VBB GTFS), run instructions, fetch script for the GTFS zips kept out of the repo.

## Submission blockers
- **STATUS: blocked.** Three required submission assets are unaccounted for at draft time:
  - **GitHub Repository URL** is `_pending_` — repo is not yet created or made public. Must be public with MIT licence by Sun 06:45 ET per SPEC's submission plan.
  - **Demo video URL** is not yet recorded. SPEC schedules recording in the 14–16h block (Sun ~03:15–05:15 ET); 1-min hard cap.
  - **Tech video URL** likewise unrecorded; same window, same 1-min hard cap.
- **Live Project URL** is `_pending_` — SPEC does not commit to a deployed instance; demo is local. Leave as `_pending_` or omit on Devpost if the field is optional; do not fabricate a URL.
- **Cover-image format/size limits** — SPEC's Hour-0 task is to read the accepted Devpost CITY WALLET track page and record exact format + max-size into `work/SUBMISSION_CHECKLIST.md`. That checklist does not yet exist; the 16:9 concept above is ready but final export specs are pending Hour-0.
- **Devpost required-field list** — same Hour-0 dependency. The eight structured sections in this draft cover the standard Devpost layout, but a track-specific extra field discovered Sun 06:30 ET would kill the submission.
- **Open SPEC questions** that may surface in Devpost copy or judge Q&A: (1) auto-approve rule defaults beyond the rain rule, (2) merchant mix and count for the demo (target 4), (3) explicitness of "SLM server-side in demo, on-device in production" labelling on the architecture slide. None are blockers for form copy, but resolve before the tech-video record.
- **Honesty guardrails** — this draft does **not** claim live Web Push, live on-device SLM, real-time image generation, real POS integration, Tavily live events, or Foursquare merchant data. If marketing copy is added later, it must not contradict these.
