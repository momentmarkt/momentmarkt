ARTIFACT_ID: spec-v01
ARTIFACT_TYPE: spec
PARENT_IDS: none
STATUS: ready

# City Wallet

## Pitch

An AI-native city wallet for the CITY WALLET track (DSV-Gruppe). Two agents, one product: an **Opportunity Agent** drafts offers + GenUI widget specs from real-time signals (weather, events, synthetic Payone-style transaction density) and routes them to a merchant inbox; a **Surfacing Agent** decides whether and how to surface an already-approved offer to the user — silence is the default. Centred on Mia, 28, Berlin lunch break: one well-timed push, a runtime-generated widget, a simulated checkout. Tagline: "the marketing department small merchants don't have, redeemed through the rail the bank already operates."

## Why it wins

- **Technical Depth**: real GenUI (LLM emits a JSON layout spec composing 6 React primitives — not template fill); two cooperating agents with different cadences and prompts; signal stack swappable per city by config; intent-token + H3 coarse-cell privacy boundary visible in the architecture even with the SLM ServerSide-for-MVP.
- **Communication & Presentation**: Mia demo scripted to 8 beats ≤90s; three GenUI widgets side-by-side from one merchant in three contexts is the single most legible "we built it" frame; rehearsed "why DSV / why Payone" lines; tech video walks the two-agent flow + GenUI spec on screen.
- **Innovation & Creativity**: inverts the brief — not "merchant sets goal → AI generates offer" but **AI proposes → merchant approves → trust gradient via "always auto-approve like this"**; aggregate cross-merchant intelligence as a 10s beat, defensible only because DSV aggregates across thousands of Sparkassen.

## The demo

Judge sees a phone-frame wallet on a Berlin map, calm and silent as Mia walks. Weather state from `data/weather/berlin.json` flips to "rain incoming"; Café Bondi has a live, auto-approved rain-driven offer. Push: "Es regnet bald. 80 m bis zum heißen Kakao." Tap renders a GenUI widget — `ImageBleedHero`, rainy-window mood, single CTA — composed at runtime from a JSON layout spec the LLM just emitted. QR redeem, simulated checkout, cashback success. Cut to merchant inbox: same offer, approved 3h ago by one rain-rule; toggle it on. Shortly show the Zurich map to demonstrate multi-city capability. Visible dataset use throughout: OSM POIs on the map, Open-Meteo driving the trigger, GTFS stops shaping proximity copy, `data/events/*.json` for the secondary scenario beat.

## Decisions

- stack: Next.js + TypeScript + Tailwind (consumer phone-frame + merchant inbox), FastAPI backend, SQLite. rules out: tRPC, Postgres, edge-only runtime. revisit if: Next API routes alone cover the FastAPI surface by hour 6.
- llm: Azure OpenAI. rules out: direct OpenAI/Anthropic billing, live on-device SLM in demo. revisit if: Azure endpoint flakes — swap OpenAI direct.
- agent split: Opportunity Agent (periodic, drafts offers + widget specs) vs. Surfacing Agent (real-time, scoring function only; LLM only for headline rewrite on fired notifications). rules out: per-evaluation LLM in surfacing; fused single agent. revisit if: scoring can't differentiate candidates by hour 13.
- data usage: Open-Meteo JSON drives the live trigger; OSM POIs (Berlin Mitte 937 nodes, Zürich HB 2096 nodes) populate the merchant catalog + map; GTFS stop sets within 1 km of Alexanderplatz / Zürich HB shape walk-time copy; `events/*.json` powers the secondary scenario; synthetic per-merchant transaction-density JSON drives Opportunity Agent demand-gap detection. rules out: Foursquare (gated, deferred per DATASET §FETCH_LATER), real ML for projected redemptions, live image gen. revisit if: any signal fails on demo machine — fall back to a frozen fixture snapshot of identical shape.
- cities: Berlin (primary) + Zürich (config-swap). revisit if: Berlin signals break — Zürich becomes primary.
- branding: neutral product UI; no Sparkassen identity in chrome. rules out: Sparkassen-Rot, S-logo, "Mit Sparkasse bezahlt" copy in redemption screen. revisit if: kickoff Q&A explicitly requests visible DSV affiliation.
- genui: 6 React primitives + LLM-emitted JSON layout spec, schema-validated with a known-good fallback render. rules out: free-form JSX from the LLM; static `<OfferCard />`. revisit if: schema validation fails >30% of generations after prompt iteration.
- Menu OCR / photo&pdf onboarding

## Non-goals

- Google Maps merchant import.
- Real ML for projected redemptions (transparent heuristic instead).
- Real-time image generation (pre-bucketed mood library keyed by `(trigger × category × weather)`).
- Live on-device SLM in the demo (deferred per FUTURE.md; architecture story only).
- Actual POS integration; full merchant analytics dashboard.
- Both sides equally weighted in the 1-min cut — consumer-centric, merchant as 30s callback.

## Build order

1. **Smallest end-to-end demo (0–6h)**: hand-author one offer JSON + one widget layout spec; render via 6 React primitives in a Next.js phone-frame; hard-coded weather trigger; fake redeem to a static success screen. Zero LLM, zero agents — but the Mia spine is already recordable as a fallback.
2. **GenUI live generation (6–9h)**: Opportunity Agent prompt emits the layout spec; schema validation + known-good fallback. Three structurally different widgets for the same merchant (rain / quiet / pre-event).
3. **Signal-driven offers (9–13h)**: load Open-Meteo + OSM + synthetic transaction JSON; deterministic gap-detection in Python; Opportunity Agent drafts 3–4 cards per merchant; one auto-approve rule live-toggleable.
4. **Surfacing + Mia path (13–17h)**: scoring function, silence threshold, push trigger on weather-shift; LLM headline rewrite on fired notifications only; QR + simulated checkout decrementing budget.
5. **Config swap + secondary scenario (17–20h)**: `zurich.yaml`, CHF, Zürich OSM/GTFS bind; one secondary scenario (see Open Q1).
6. **Architecture slide + record both videos (20–23h)**: privacy-boundary diagram, demo + tech videos recorded, cover image exported.
7. **Buffer + submit (23h–cutoff)**: Devpost form, repo public, submit by Sun Apr 26 07:00 ET.

**Recordable fallback at any point past hour 3**: hand-authored offer + pre-rendered widget + hard-coded trigger + static checkout. Loses GenUI live-generation and merchant-inbox proof; keeps the spine + dataset visibility for the demo video.

## Submission plan

- **Devpost form**: name, tagline, 3-line "what it does", 3-line "how built" (stack from Decisions), 3-line "challenges" (GenUI schema iteration; signal honesty; on-device deferral), team, track = CITY WALLET. Verify full required-field list once track is accepted.
- **Public GitHub repo**: MIT licence, README with demo gif + architecture diagram + run instructions + dataset attribution (Open-Meteo, OSM/Overpass, VBB + CH GTFS); `data/` small files committed, GTFS zips behind a fetch script.
- **Demo video (1-min hard cap)**: Mia spine cut to ≤55s — silent open, walk, trigger, GenUI widget, redeem, merchant rule toggle, Zürich swap. Rehearsed VO. Record by hour 22; backup take from the fallback build at hour 6.
- **Tech video (1-min hard cap)**: architecture slide → two-agent split → GenUI JSON spec on screen → privacy boundary → roadmap line on Payone production path. Slides + screen-record.
- **16:9 cover image**: phone-frame with the rain-trigger widget, Berlin map fragment behind, neutral palette. PNG ≥1920×1080.
- **Cutoff buffer**: target submit by Sun Apr 26 07:00 ET (2h before the 09:00 ET hard cutoff). All assets uploaded by 06:30; link sanity-check 06:45.

## Open questions

1. Secondary scenario — rain-different-city or evening-event-same-city? Resolves at hour 17 by which city has the cleaner GTFS/event binding by then.
2. Merchant mix and count for the demo (cafés / bakeries / bookstore / Eisdiele). Resolves at hour 3 once OSM POI filtering on `data/osm/berlin-mitte.json` returns a usable shortlist.
3. Auto-approve rule defaults beyond the one weather rule. Resolves at hour 13 alongside the inbox build.
4. Cover image file format + size limit (HACKATHON.md §still-unknown). Resolves by reading Devpost spec once track is accepted.
5. How explicitly the architecture slide labels "SLM running server-side for the demo, on-device in production." Resolves at pitch-script pass (hour 20); default = honest demo-seam labelling per THOUGHTS §11 Q&A trap.
6. Cover-asset and required-field list on Devpost beyond the known set (HACKATHON.md §submission). Resolves at track acceptance; do not block build.
