# Partner discussion — 2026-04-25

Verbal sync between the two builders, transcribed and reduced to actionable change requests against `work/SPEC.md` (currently spec-v02). These are mandatory inputs for the next refinement round.

## 1. Trigger source clarification (reaffirms + sharpens existing direction)

The Opportunity Agent's three trigger inputs are **weather**, **events** (specifically: an event ending releases a wave of foot traffic worth catching), and **demand**.

"Demand" is concretely defined: per-merchant typical transaction-density curve for the day-of-week / time-of-day, with the agent firing when the live curve runs **below** the typical curve. The Google Maps "popular times" widget is the public-product analogy — same shape of signal, scraping it is brittle, so we **synthesize a Payone-style transaction-density fixture** per merchant. This was already in spec-v02; the reaffirmation is that **demand-gap detection is a first-class trigger**, not a side input. The pitch language should call out the three triggers explicitly: *weather + events + demand*.

## 2. Stack change — React Native (Expo), not Next.js

The consumer app is **React Native + Expo**, not Next.js. Both partners know RN; Flutter was rejected as too opinionated. Expo now runs through a native dev client so the demo can use Apple Maps and native modules.

This means:
- Consumer app = React Native + Expo + TypeScript. Recording surface = iOS Simulator with the native dev client. NOT a web phone-frame mock.
- Merchant inbox can stay web (Next.js or just a small static React app) — the partner-facing UI doesn't need RN. Decide which is faster to build.
- GenUI primitives are now **React Native primitives**, not web React components. The 6-primitive set must be RN-compatible (e.g. View, Text, Image, Pressable, ScrollView, plus one composed widget primitive).
- Styling uses the local React Native `s()` token helper; NativeWind was dropped after runtime instability.
- Time budget: Expo setup + simulator recording adds friction vs. a web mock. Account for ~1h of stack-stand-up in build phase 1.

## 3. Push notifications — for-real in architecture, faked in demo

For the demo, "we don't give a fuck" — surface remains an in-app card on weather-shift (as already specified in spec-v02). But the **architecture slide must show the production push path explicitly**, OpenAI-demo-style: "for the demo this is X; in production this is replaced by Y."

Concretely, the architecture diagram should label:
- A **periodic job** monitoring per-merchant demand vs. typical curve. (The Opportunity Agent IS this job; in production it runs on a scheduler — Helm chart / cron / queue worker. Mention this on the slide as a "production swap" callout.)
- The **push path** in production: Opportunity Agent → push notification server (e.g. Expo Push, FCM, APNs) → device. For the demo, this collapses to an in-app card; the slide arrow stays drawn, just labelled "demo: in-app surface; prod: push notification server."
- Same labelling pattern already planned for the SLM ("server-side for MVP, on-device in production") and the Payone fixture ("synthetic for MVP, real Payone density in production"). Make this **OpenAI-demo callouts the consistent visual language of the architecture slide.**

## 4. User-side intent signals (NEW — Surfacing Agent input)

The Surfacing Agent currently scores on `{intent_token, h3_cell_r8, weather_state, t}`. Add **user behavioral intent signals** as a scoring boost:

- Active screen time / device-active state.
- Map-app foreground time (proxy: user is actively browsing surroundings).
- In-app coupon-browsing activity (proxy: user is in shopping mindset).

These compose into a **high-intent boost** to the surfacing score. The pitch beat: when intent signals are high, we can be **more aggressive** with the offer — both in surfacing threshold (lower bar to fire) and offer value (higher cashback / bigger discount), because the conversion probability is higher.

**Buzz term to use** (partner remembered there was a good one but not which): the standard marketing/analytics terms are **"high-intent user"** or **"in-market signal"** or **"purchase-intent signal"**. Recommendation: lead with **"high-intent surfacing"** in the pitch — short, legible, and judges in this space will recognize it. Back-up term: **"in-market signal"** if a tech-video subtitle needs more precision.

For the MVP demo, these signals are **simulated** (e.g. a dev panel toggle for "high-intent: on/off" demonstrating that the same offer surfaces with a more aggressive headline / threshold when intent is high). Real on-device signal collection is roadmap, not MVP.

## 5. What the architecture slide must visibly show

Three "production swap" callouts, consistently styled:
1. Push path: in-app surface (demo) → push notification server (prod).
2. SLM extractor: server-side (demo) → on-device (prod).
3. Payone signal: synthetic transaction-density JSON (demo) → real Payone aggregation across Sparkassen (prod).

Plus:
- Periodic-job framing for the Opportunity Agent ("Helm chart / scheduled worker in prod").
- The `{intent_token, h3_cell_r8}` privacy boundary line, already specified in spec-v02.
- High-intent signal inputs feeding the Surfacing Agent.

## 6. What does NOT change

- Two-agent split (Opportunity vs. Surfacing). Cadence and prompt separation unchanged.
- GenUI mechanism (LLM emits JSON layout spec → schema validate → render via primitives). Just the primitive set is now RN-flavoured.
- Merchant inbox + auto-approve trust gradient. Unchanged.
- Berlin primary, Zürich config-swap. Unchanged.
- Privacy boundary `{intent_token, h3_cell_r8}` rendered on screen. Unchanged.
- Honest deferrals (no real Web Push delivery in demo, no on-device SLM, no real Payone, no live image gen, no Foursquare, no Tavily). Unchanged.
- 1-min hard caps on both videos; Sun 09:00 ET hard cutoff. Unchanged.
