# Idea seed

## What we're building

An AI-native city wallet for the **CITY WALLET** track (DSV-Gruppe). Two agents, one product:

- **Opportunity Agent** — runs on the merchant graph, periodically. Detects gaps between predicted and desired demand from weather + events + (synthetic) Payone-style transaction density. Drafts an offer *and* a GenUI widget spec. Routes to a merchant inbox: Approve / Edit / Skip / **Always auto-approve like this**.
- **Surfacing Agent** — runs on the user graph, in real time. Picks the best already-approved offer for the current context and decides *whether* and *how* to surface it (push / in-app card / silence). Silence is a feature.

The Opportunity Agent makes offers waiting to fire. The Surfacing Agent decides what fires for whom, when, and as what kind of widget.

## Who it's for

Two-sided, but the demo centres the consumer. Reference persona is **Mia** from the brief — 28, lunch break, cold, browsing — relocated to **Berlin** because that's where our signals are richest. The merchant side gets ~30s in the pitch: same offer Mia just redeemed, shown as it appeared to the merchant 3h earlier, auto-approved under one rule.

Tagline:
> "The marketing department small merchants don't have, generated for the moment, redeemed through the rail the bank already operates."

## Why this wins THIS hackathon

Equal-weighted judging (Technical Depth / Communication / Innovation), 1-min demo + 1-min tech video, 24h.

- **Technical depth** — real **GenUI** (LLM emits a JSON layout spec composing 6 React primitives; not template fill). Two-agent system with different cadences, latency budgets, and prompts. Configurable signal stack (city = config swap, not code change). On-device-style privacy boundary (intent token + H3 coarse cell), even though the SLM itself ships server-side for the MVP — see `FUTURE.md`.
- **Communication** — the Mia demo is scripted to 8 beats, ≤90s. Three GenUI widgets side-by-side from the same merchant in three contexts is the single most legible "we actually built it" frame. Architecture slide makes the privacy boundary visible. Pitch lines for "why DSV?" and "why Payone?" are rehearsed.
- **Innovation** — the inversion: not "merchant sets goal → AI generates offer", but **AI proposes → merchant approves → trust gradient via "always auto-approve like this"**. Plus the aggregate-intelligence angle (cross-merchant pattern learning) as a 10-second pitch beat — defensible only because DSV already aggregates across thousands of Sparkassen.

Track-specific edge: Payone gives a real demand signal at zero merchant onboarding cost. We simulate it; the production story writes itself.

## Rough shape

- **Stack:** Next.js + TypeScript + Tailwind (consumer phone-frame + merchant inbox), FastAPI backend, SQLite, **Azure OpenAI via LiteLLM**, Open-Meteo for weather, hand-curated event JSON, synthetic per-merchant transaction-density JSON, H3 for geo cells, Leaflet for map fragments. No menu OCR, no real image gen, no real POS.
- **Cities:** `cities/berlin.yaml` (primary) ↔ `cities/zurich.yaml` (config-swap demo moment). Stuttgart dropped despite the brief — relocate Mia to Berlin, acknowledge in one line.
- **Branding:** neutral product, **no Sparkassen identity** in the UI. DSV/Sparkassen context lives in pitch narrative + architecture slide.
- **Demo spine:** Mia opens wallet (silent) → walks (silent) → rain trigger fires push → tap renders GenUI widget → QR redeem → cut to merchant view (offer was auto-approved 3h ago) → toggle rule on → swap to Zürich.
- **The wow moment:** *one* push notification, perfectly timed, that renders a widget composed for that exact context. The rest of the time, the wallet stays quiet — that's the product feel.

## Things to avoid

- Per-evaluation LLM calls in the Surfacing Agent. Scoring function only; LLM gets used for headline rewrite on *fired* notifications.
- Real-time image generation. Pre-bucketed mood library keyed by `(trigger × category × weather)`.
- Live SLM in the demo. Server-side LLM call behind an honestly-labelled architecture story (see `FUTURE.md`).
- Pretty UI over dummy offers. Offers must demonstrably come from real signals + LLM drafting.
- Trying to show both sides equally in 1 minute. Consumer-centric demo, merchant side as a 30s cut.
- Building features the rubric doesn't reward: menu OCR, Google Maps merchant import, real ML for projected redemptions, full merchant analytics, actual POS integration.

## Decisions already locked (see `FUTURE.md`)

- LLM provider = **Azure OpenAI** (LiteLLM in front).
- Demo cities = **Berlin + Zürich**, Stuttgart dropped.
- **No Sparkassen branding** in product UI.
- On-device SLM **deferred**; intent extraction runs server-side for the MVP, on-device is a roadmap line.

## Open seeds the planner should resolve

- Secondary scenario after Mia: rain-different-city or evening-event-same-city? (Carries the "engine generalizes" message.)
- Merchant set for the demo: how many cafés / bakeries / bookstore / Eisdiele? Variety helps the GenUI side-by-side; setup time costs.
- Auto-approve rule defaults beyond the one weather-driven rule.
- How explicit the "running locally — but server-side in this demo" framing should be in the architecture slide.
