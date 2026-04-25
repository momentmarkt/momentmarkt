ARTIFACT_ID: spec-v04
ARTIFACT_TYPE: spec
PARENT_IDS: spec-v03, agent-io-v01
STATUS: ready

# City Wallet

## Pitch

An AI-native city wallet for the CITY WALLET track (DSV-Gruppe). Two agents, one product: an **Opportunity Agent** drafts offers + GenUI widget specs from three live triggers — **weather, events, demand** (per-merchant transaction-density gap vs. the typical day-of-week / time-of-day curve) — and routes them to a merchant inbox; a **Surfacing Agent** decides whether and how to surface an already-approved offer, boosted by **high-intent surfacing** signals (active screen time, map-app foreground, in-app coupon browsing). Silence is the default. Centred on Mia, 28, Berlin lunch break: one well-timed in-app surface, a runtime-generated React Native widget, simulated checkout. Tagline: "the marketing department small merchants don't have, redeemed through the rail the bank already operates."

## Why it wins

- **Technical Depth**: real GenUI (LLM emits a JSON layout spec composing 6 React Native primitives — not template fill); two cooperating agents with different cadences and prompts; signal stack swappable per city by config; intent-token + H3 coarse-cell privacy boundary implemented in code and logged on screen; high-intent boost composes into the surfacing score in code (not just slideware).
- **Communication & Presentation**: Mia demo scripted to ≤55s on iOS Simulator; three GenUI widgets side-by-side from one merchant in three contexts; high-intent dev-panel toggle visibly re-skins the same offer with a more aggressive headline + lower threshold; rehearsed "weather + events + demand" and "why DSV / why Payone" lines; architecture slide uses three OpenAI-demo-style "production swap" callouts as a single visual language.
- **Innovation & Creativity**: inverts the brief — not "merchant sets goal → AI generates offer" but **AI proposes → merchant approves → trust gradient via "always auto-approve like this"** — paired with high-intent surfacing as the user-side dial.

## The demo

Judge sees a React Native phone (iOS Simulator) on a Berlin map, calm and silent as Mia walks. Weather state from `data/weather/berlin.json` flips to "rain incoming" AND the live transaction-density curve for Café Bondi dips below typical for Saturday 13:30 — both triggers fire; Bondi's auto-approved rain-rule offer is eligible. An in-app card slides into the phone: "Es regnet bald. 80 m bis zum heißen Kakao." Tap renders a GenUI widget — `ImageBleedHero`, rainy-window mood, single CTA — composed at runtime from a JSON layout spec the LLM just emitted, rendered through RN primitives (View / Text / Image / Pressable / ScrollView + one composed widget). A dev panel beside the phone logs the surfacing input as `{intent_token, h3_cell_r8}`, making the privacy boundary visible. Presenter flips the dev-panel **high-intent** toggle: same offer re-surfaces with a more aggressive headline + lower threshold, demonstrating in-market boost. QR redeem, simulated checkout, cashback success. Cut to merchant inbox (web): the per-merchant demand curve is on screen — typical Saturday curve faint behind, today's live curve dipping below it, the gap moment highlighted; the same offer card sits next to the dip, marked "Auto-approved 3h ago — demand-gap rule." Toggle a second rule on. End on a `cities/zurich.json` swap re-skinning map + weather + currency to CHF. Visible dataset use throughout: OSM POIs on the map, Open-Meteo driving the weather trigger, VBB GTFS stops within 1 km of Alexanderplatz shaping proximity copy, the transaction-density fixture gating the demand-gap (visibly so, in the merchant view).

## Decisions

- stack: consumer = React Native + Expo + TypeScript (NativeWind for styling) recorded on iOS Simulator; merchant inbox = small static React (Vite) web app; FastAPI backend; SQLite. rules out: Next.js phone-frame mock; Flutter; tRPC; Postgres. revisit if: Expo simulator flakes by hour 4 — fall back to Expo Go on a real device, then to a web phone-frame as last resort.
- llm: Azure OpenAI via LiteLLM. rules out: direct OpenAI/Anthropic billing; live on-device SLM in demo. revisit if: Azure endpoint flakes — swap to OpenAI direct via LiteLLM.
- agent split: Opportunity Agent (periodic, drafts offers + widget specs from weather + events + demand) vs. Surfacing Agent (real-time, deterministic scoring with high-intent boost; LLM only for headline rewrite on fired surfaces). rules out: per-evaluation LLM in surfacing; fused single agent. revisit if: scoring can't differentiate candidates by hour 12.
- triggers: weather + events + demand are all first-class. Demand = per-merchant live transaction-density curve below the typical day-of-week / time-of-day baseline ("Google Maps popular times" analogy, synthesized as a Payone-style fixture). rules out: demand as a side-input only; menu-OCR-driven triggers. revisit if: demand-gap fires too rarely to be visible — pre-script the dip in the fixture.
- agent I/O contract: see `context/AGENT_IO.md` (single source of truth for both agents' inputs, outputs, scoring, persistence). Locked-in calls: (1) `intent_token` is a hand-coded enum returned by an `extract_intent_token()` stub fn (architecture-slide swap: "demo: stub; prod: on-device SLM"); (2) headline rewrite cache key = `(offer_id, weather_state, intent_state)` for demo determinism + instant card-slide; (3) walk-ring = user h3 cell + 1 ring (~1 km radius); (4) demand-gap visualization renders **only in the merchant inbox** (a small typical-vs-live curve per merchant), never in the consumer-side dev panel. rules out: live LLM-extracted intent tokens in MVP; per-fire LLM calls without cache; consumer dev-panel demand chip. revisit if: any locked call breaks — fix in AGENT_IO.md first, then propagate.
- high-intent surfacing: composed boost on the surfacing score from {active screen time, map-app foreground proxy, in-app coupon-browsing proxy} — when high, lowers the fire threshold and unlocks a more aggressive headline variant. MVP simulates via a dev-panel toggle. Pitch term: "high-intent surfacing"; back-up "in-market signal". rules out: real on-device signal collection in MVP. revisit if: dev-panel toggle reads as gimmick — fold the boost into the silent path so it's only visible in the toggle moment.
- data usage: Open-Meteo JSON drives the weather trigger; OSM POIs (Berlin Mitte 937 nodes; Zürich HB 2096 nodes) populate the merchant catalog + map; VBB GTFS stops within 1 km of Alexanderplatz shape walk-time copy; `data/transactions/berlin-density.json` (authored phase 1, 4 merchants) drives demand-gap detection; events stub gates the event-end trigger. rules out: Foursquare (gated); real ML for projected redemptions; live image gen; CH GTFS bind for the Zürich swap. revisit if: a signal fails on the demo machine — fall back to a frozen fixture snapshot of identical shape.
- cities: Berlin (primary, full signal stack) + Zürich (config swap: OSM + weather + CHF copy, no GTFS). revisit if: Berlin signals break — Zürich becomes primary.
- branding: neutral product UI; no Sparkassen identity in chrome. rules out: Sparkassen-Rot, S-logomark, "Mit Sparkasse bezahlt" copy. revisit if: kickoff Q&A explicitly requests visible DSV affiliation.
- genui: 6 React Native primitives (View, Text, Image, Pressable, ScrollView + one composed widget) + LLM-emitted JSON layout spec, schema-validated with a known-good fallback render. rules out: free-form JSX from the LLM; static `<OfferCard />`; web-only React DOM primitives. revisit if: schema validation fails >30% of generations after prompt iteration.
- surface mechanism: in-app card sliding into the RN phone on weather-shift / demand-gap event. Architecture slide labels the production path as Opportunity Agent → push notification server (Expo Push / FCM / APNs) → device, drawn explicitly. rules out: real Web Push; service worker; OS notification permission flow in demo. revisit if: a judge Q&A pushes on delivery — answer with the labelled prod arrow.
- privacy boundary: surfacing input wrapped as `{intent_token, h3_cell_r8}` in code and rendered in an on-screen dev panel during the demo; SLM extractor runs server-side for MVP. rules out: live transformers.js / WebGPU in demo. revisit if: tech-video time runs short — keep the on-screen log, drop the slide callout.
- architecture slide visual language: three OpenAI-demo-style "production swap" callouts — (1) push path: in-app surface (demo) → push server (prod), (2) SLM: server-side (demo) → on-device (prod), (3) Payone: synthetic JSON (demo) → real cross-Sparkassen aggregation (prod) — plus a "periodic job (Helm chart / scheduled worker)" annotation on the Opportunity Agent. rules out: a single hand-wavy diagram without demo/prod seams. revisit if: slide gets too dense — drop visual polish before dropping any of the three callouts.

## Non-goals

- Google Maps merchant import; menu OCR; photo/PDF merchant onboarding.
- Real ML for projected redemptions (transparent heuristic instead).
- Real-time image generation (pre-bucketed mood library keyed by `(trigger × category × weather)`).
- Live on-device SLM in the demo (server-side for MVP; on-device on the prod arrow).
- Real Web Push delivery; service worker; OS notification permission flow.
- Real on-device collection of high-intent signals (simulated via dev-panel toggle).
- Native iOS/Android build pipelines (Expo Go + iOS Simulator only).
- Actual POS integration; full merchant analytics dashboard.
- "Aggregate cross-merchant intelligence" as a pitch beat (kept as a one-line roadmap mention in the tech video).
- Tavily live-events integration (sponsor tech out of scope; events stub used as-is).
- Secondary scenario beyond the Mia rain spine (no second-city cut, no evening-event beat).
- CH GTFS bind for the Zürich swap.
- LLM-generated personas (Mia hand-authored only; `data/personas/` slot dropped from README attribution).
- Both sides equally weighted in the 1-min cut — consumer-centric, merchant as a 30s callback.

## Build order

Total budget: ~17h work + 2h+ buffer. Hacking starts Sat Apr 25 13:15 ET; submit target Sun Apr 26 06:45 ET; hard cutoff Sun Apr 26 09:00 ET (~2h15m hard buffer).

0. **Hour 0 (~10 min)**: cover image (16:9, no size/format limit) + Devpost field list (Short Description + 6 numbered structured fields) already confirmed in `context/HACKATHON.md` — paste into `work/SUBMISSION_CHECKLIST.md` and move on.
1. **0–5h — smallest end-to-end demo on RN**: stand up Expo + TypeScript + NativeWind + iOS Simulator (~1h); hand-author one offer JSON + one widget layout spec; render via 6 RN primitives in the Expo app; hard-coded weather trigger; fake redeem to a static success screen. Author `data/transactions/berlin-density.json` for 4 merchants (≤45 min). Zero LLM, zero agents — Mia spine recordable as fallback by hour 5.
2. **5–8h — GenUI live generation**: Opportunity Agent prompt emits the JSON layout spec; schema validation + known-good fallback render. Three structurally different RN widgets for the same merchant (rain / quiet / pre-event).
3. **8–14.5h — signals + surfacing + Mia path + high-intent + merchant curve**: load Open-Meteo + OSM + transaction fixture + events stub; deterministic gap-detection + event-end trigger in Python; Opportunity Agent drafts 3–4 cards per merchant; one auto-approve rule live-toggleable in the merchant web inbox. Surfacing scoring + silence threshold + in-app-card trigger per `context/AGENT_IO.md`; LLM headline rewrite on fired surfaces only, with the `(offer_id, weather_state, intent_state)` cache. Wrap surfacing input as `{intent_token, h3_cell_r8}` (via `extract_intent_token()` stub returning a hand-coded enum) and render in dev panel (≥30 min). Add high-intent dev-panel toggle wired into the surfacing score (≥30 min). Build the **merchant inbox demand-curve view** (≥45 min): per-merchant typical-vs-live curve, today's gap highlighted, offer cards anchored to the gap moment that triggered them. QR + simulated checkout decrementing budget.
4. **14.5–15h — Zürich config swap**: `cities/zurich.json` flips OSM bbox + weather URL + currency to CHF + Swiss-German copy; smoke-check map + weather only.
5. **15–17h — architecture slide + record both videos + cover image**: slide built with the three production-swap callouts + periodic-job annotation + privacy boundary line + high-intent input arrow; demo + tech videos recorded; 16:9 cover image exported.
6. **17h–submit — Devpost form + buffer**: fill 6 structured fields + Short Description from rehearsed copy, make repo public, sanity-check links, submit by Sun 06:45 ET.

**Recordable fallback past hour 5**: hand-authored offer + pre-rendered RN widget + hard-coded trigger + static checkout. Loses GenUI live-generation, signal-driven offers, merchant-inbox proof, and high-intent toggle; keeps Mia spine + visible dataset use.

## Submission plan

- **Devpost form** (fields confirmed in HACKATHON.md): Short Description (1-line tagline) + the 6 numbered structured fields (Problem & Challenge / Target Audience / Solution & Core Features / USP / Implementation & Technology / Results & Impact), drafted from Pitch + Decisions + Build order; team; track = CITY WALLET.
- **Public GitHub repo**: MIT licence; README with demo gif + architecture diagram + run instructions (Expo + FastAPI) + dataset attribution (Open-Meteo, OSM/Overpass, VBB GTFS); `data/` small files committed, GTFS zips behind a fetch script. Personas slot omitted.
- **Demo video (1-min hard cap)**: Mia spine cut to ≤55s on iOS Simulator — silent open, walk, in-app surface, GenUI widget, high-intent toggle, redeem, merchant rule toggle, Zürich swap. Rehearsed VO. Record by hour 16; fallback take from hour 5 build kept as backup.
- **Tech video (1-min hard cap)**: architecture slide → two-agent split → three production-swap callouts → GenUI JSON spec on screen → on-screen `{intent_token, h3_cell_r8}` log + high-intent boost arrow → one-line roadmap mention of Payone aggregation + cross-merchant intelligence.
- **16:9 cover image**: phone-frame with the rain-trigger widget, Berlin map fragment behind, neutral palette (no size/format limit per HACKATHON.md).
- **Cutoff**: target submit Sun 06:45 ET; ~2h15m hard buffer to 09:00 ET cutoff. All assets uploaded by 06:15; link sanity-check 06:30.

## Open questions

1. Auto-approve rule defaults beyond the one weather rule shown. Resolves during phase 3 (~hour 12) — pick 2–3 plausible defaults from observed Opportunity drafts.
2. Merchant mix and count for the demo (cafés / bakeries / bookstore / Eisdiele). Resolves at hour 1 once OSM POI filtering on `data/osm/berlin-mitte.json` returns a usable shortlist; target 4 merchants to match the transaction-density fixture.
3. Whether the high-intent dev-panel toggle is on-screen as part of the demo cut or kept off-screen and narrated. Resolves at video-script pass (hour 15); default = visible toggle, judges should *see* the same offer mutate.
