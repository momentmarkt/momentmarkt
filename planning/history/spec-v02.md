ARTIFACT_ID: spec-v02
ARTIFACT_TYPE: spec
PARENT_IDS: spec-v01, critique-v01
STATUS: ready

# City Wallet

## Pitch

An AI-native city wallet for the CITY WALLET track (DSV-Gruppe). Two agents, one product: an **Opportunity Agent** drafts offers + GenUI widget specs from real-time signals (Open-Meteo weather, OSM merchant catalog, a small hand-authored per-merchant transaction-density fixture) and routes them to a merchant inbox; a **Surfacing Agent** decides whether and how to surface an already-approved offer to the user — silence is the default. Centred on Mia, 28, Berlin lunch break: one well-timed in-app surface, a runtime-generated widget, a simulated checkout. Tagline: "the marketing department small merchants don't have, redeemed through the rail the bank already operates."

## Why it wins

- **Technical Depth**: real GenUI (LLM emits a JSON layout spec composing 6 React primitives — not template fill); two cooperating agents with different cadences and prompts; signal stack swappable per city by config; intent-token + H3 coarse-cell privacy boundary implemented in code and logged on screen during the demo, even though the SLM extractor runs server-side for the MVP.
- **Communication & Presentation**: Mia demo scripted to ≤55s; three GenUI widgets side-by-side from one merchant in three contexts is the single most legible "we built it" frame; rehearsed "why DSV / why Payone" lines; tech video walks the two-agent flow + GenUI spec on screen.
- **Innovation & Creativity**: inverts the brief — not "merchant sets goal → AI generates offer" but **AI proposes → merchant approves → trust gradient via "always auto-approve like this"**.

## The demo

Judge sees a phone-frame wallet on a Berlin map, calm and silent as Mia walks. Weather state from `data/weather/berlin.json` flips to "rain incoming"; Café Bondi has a live, auto-approved rain-driven offer. An in-app card slides into the phone frame: "Es regnet bald. 80 m bis zum heißen Kakao." Tap renders a GenUI widget — `ImageBleedHero`, rainy-window mood, single CTA — composed at runtime from a JSON layout spec the LLM just emitted. A small dev panel beside the phone logs the surfacing input as `{intent_token, h3_cell_r8}`, making the privacy boundary visible. QR redeem, simulated checkout, cashback success. Cut to merchant inbox: same offer, approved 3h ago by one rain-rule; toggle it on. End on a `cities/zurich.yaml` swap that re-skins map + weather + currency to CHF. Visible dataset use throughout: OSM POIs on the map, Open-Meteo driving the trigger, VBB GTFS stops within 1 km of Alexanderplatz shaping proximity copy, the transaction-density fixture gating the demand-gap that activated the offer.

## Decisions

- stack: Next.js + TypeScript + Tailwind (consumer phone-frame + merchant inbox), FastAPI backend, SQLite. rules out: tRPC, Postgres, edge-only runtime. revisit if: Next API routes alone cover the FastAPI surface by hour 5.
- llm: Azure OpenAI via LiteLLM. rules out: direct OpenAI/Anthropic billing; live on-device SLM in demo. revisit if: Azure endpoint flakes — swap to OpenAI direct via LiteLLM.
- agent split: Opportunity Agent (periodic, drafts offers + widget specs) vs. Surfacing Agent (real-time, deterministic scoring; LLM only for headline rewrite on fired surfaces). rules out: per-evaluation LLM in surfacing; fused single agent. revisit if: scoring can't differentiate candidates by hour 11.
- data usage: Open-Meteo JSON drives the live trigger; OSM POIs (Berlin Mitte 937 nodes; Zürich HB 2096 nodes) populate the merchant catalog + map; VBB GTFS stops within 1 km of Alexanderplatz shape walk-time copy; a hand-authored `data/transactions/berlin-density.json` fixture for 4 demo merchants (authored in phase 1) drives Opportunity Agent demand-gap detection. rules out: Foursquare (gated, deferred); real ML for projected redemptions; live image gen; CH GTFS bind for the Zürich swap (extract cost > demo payoff). revisit if: any signal fails on demo machine — fall back to a frozen fixture snapshot of identical shape.
- cities: Berlin (primary, full signal stack) + Zürich (config swap: OSM + weather + CHF copy only, no GTFS). revisit if: Berlin signals break — Zürich becomes primary.
- branding: neutral product UI; no Sparkassen identity in chrome. rules out: Sparkassen-Rot, S-logomark, "Mit Sparkasse bezahlt" copy. revisit if: kickoff Q&A explicitly requests visible DSV affiliation.
- genui: 6 React primitives + LLM-emitted JSON layout spec, schema-validated with a known-good fallback render. rules out: free-form JSX from the LLM; static `<OfferCard />`. revisit if: schema validation fails >30% of generations after prompt iteration.
- surface mechanism: in-app card sliding into the phone frame on weather-shift event. rules out: real Web Push, service worker, OS notification permission flow. revisit if: a judge Q&A specifically pushes on delivery — answer with roadmap.
- privacy boundary: surfacing input wrapped as `{intent_token, h3_cell_r8}` in code and rendered in an on-screen dev panel during the demo; SLM extractor runs server-side for MVP. rules out: live transformers.js / WebGPU in demo. revisit if: tech-video time runs short — keep the on-screen log, drop the slide callout.

## Non-goals

- Google Maps merchant import; menu OCR; photo/PDF merchant onboarding.
- Real ML for projected redemptions (transparent heuristic instead).
- Real-time image generation (pre-bucketed mood library keyed by `(trigger × category × weather)`).
- Live on-device SLM in the demo (server-side for MVP; on-device is roadmap).
- Real Web Push delivery; service worker; OS notification permission flow.
- Actual POS integration; full merchant analytics dashboard.
- "Aggregate cross-merchant intelligence" as a pitch beat (kept only as a one-line roadmap mention in the tech video).
- Tavily live-events integration (sponsor tech out of scope; events stub used as-is).
- Secondary scenario beyond the Mia rain spine (no second-city cut, no evening-event beat).
- CH GTFS bind for the Zürich swap.
- LLM-generated personas (Mia hand-authored only; `data/personas/` slot dropped from README attribution).
- Both sides equally weighted in the 1-min cut — consumer-centric, merchant as a 30s callback.

## Build order

Total budget: ~16h work + 2h buffer. Hacking starts Sat Apr 25 13:15 ET; submit target Sun Apr 26 07:15 ET; hard cutoff Sun Apr 26 09:00 ET (1h45m hard buffer).

0. **Hour 0 (~30 min, before any build)**: read the accepted Devpost CITY WALLET track page; record exact cover-image format + size limit and the full required-field list into `work/SUBMISSION_CHECKLIST.md`. This closes the previously-deferred submission unknowns up front.
1. **0–4h — smallest end-to-end demo**: hand-author one offer JSON + one widget layout spec; render via 6 React primitives in a Next.js phone-frame; hard-coded weather trigger; fake redeem to a static success screen. Author `data/transactions/berlin-density.json` fixture for 4 merchants (≤45 min). Zero LLM, zero agents — Mia spine already recordable as fallback.
2. **4–7h — GenUI live generation**: Opportunity Agent prompt emits the layout spec; schema validation + known-good fallback. Three structurally different widgets for the same merchant (rain / quiet / pre-event).
3. **7–13h — signals + surfacing + Mia path** (collapsed from prior phases 3+4): load Open-Meteo + OSM + transaction fixture; deterministic gap-detection in Python; Opportunity Agent drafts 3–4 cards per merchant; one auto-approve rule live-toggleable. Surfacing scoring + silence threshold + in-app-card trigger on weather-shift; LLM headline rewrite on fired surfaces only. Wrap surfacing input as `{intent_token, h3_cell_r8}` and render values in an on-screen dev panel (≥30 min inside this block). QR + simulated checkout decrementing budget.
4. **13–14h — Zürich config swap**: `cities/zurich.yaml` flips OSM bbox + weather URL + currency to CHF + Swiss-German copy; smoke-check map + weather render only. No GTFS bind.
5. **14–16h — architecture slide + record both videos + cover image**: privacy-boundary diagram, demo + tech videos recorded, 16:9 cover image exported per Hour-0 spec.
6. **16h–submit — Devpost form + buffer**: fill form using Hour-0 checklist, make repo public, sanity-check links, submit by Sun 07:15 ET.

**Recordable fallback past hour 4**: hand-authored offer + pre-rendered widget + hard-coded trigger + static checkout. Loses GenUI live-generation, signal-driven offers, and merchant-inbox proof; keeps the Mia spine + visible dataset use for the demo video.

## Submission plan

- **Devpost form** (fields confirmed at Hour 0): name, tagline, 3-line "what it does", 3-line "how built" (stack from Decisions), 3-line "challenges" (GenUI schema iteration; signal honesty; on-device deferral), team, track = CITY WALLET.
- **Public GitHub repo**: MIT licence; README with demo gif + architecture diagram + run instructions + dataset attribution (Open-Meteo, OSM/Overpass, VBB GTFS); `data/` small files committed, GTFS zips behind a fetch script. Personas slot omitted from attribution.
- **Demo video (1-min hard cap)**: Mia spine cut to ≤55s — silent open, walk, in-app surface, GenUI widget, redeem, merchant rule toggle, Zürich swap. Rehearsed VO. Record by hour 15; fallback take from the hour-4 build kept as backup.
- **Tech video (1-min hard cap)**: architecture slide → two-agent split → GenUI JSON spec on screen → on-screen `{intent_token, h3_cell_r8}` log → one-line roadmap mention of Payone production path + cross-merchant aggregation.
- **16:9 cover image**: phone-frame with the rain-trigger widget, Berlin map fragment behind, neutral palette. Format/size per Hour-0 checklist.
- **Cutoff**: target submit Sun 07:15 ET; 1h45m hard buffer to 09:00 ET cutoff. All assets uploaded by 06:45; link sanity-check 07:00.

## Open questions

1. Auto-approve rule defaults beyond the one weather rule shown. Resolves during the phase-3 inbox build (~hour 11) — pick 2–3 plausible defaults from observed Opportunity drafts.
2. Merchant mix and count for the demo (cafés / bakeries / bookstore / Eisdiele). Resolves at hour 1 once OSM POI filtering on `data/osm/berlin-mitte.json` returns a usable shortlist; target 4 merchants to match the transaction-density fixture.
3. How explicitly the architecture slide labels "SLM running server-side for the demo, on-device in production." Resolves at pitch-script pass (hour 14); default = honest demo-seam labelling.
