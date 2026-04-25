# City Wallet — Planning & Talking Points

> Working document for the Hack-Nation Global AI Hackathon 2026 / DSV-Gruppe "Generative City-Wallet" challenge. Synthesizes the brief, the team's accumulated ideas, and the constraints from analysis so far. Refine in place.

---

## 1. The challenge in one paragraph

DSV-Gruppe (the central service provider for Germany's Sparkassen, parent of Payone and S-Markt & Mehrwert) wants a working MVP of an AI-native city wallet that **proactively** surfaces locally relevant offers in the right moment, using real-time context (weather, time, location, events, transaction density), and where **merchants participate with minimal effort** — they set goals/rules, the AI generates the actual offer copy, targeting, pricing, and even the UI widget at runtime. The reference scenario is "Mia in Stuttgart" — 28, on a 12-minute lunch break, cold and browsing, with a quiet café 80m away. The current world fails Mia with a 30-day generic coupon; the system we build closes that gap with a specific, well-timed offer generated *for this minute*.

**Strategic subtext:** This is a thinly veiled reinvention of Sparkassen's existing loyalty stack (S-Cashback, Sparkassen-Mehrwertportal, S-Gutscheine) which is static, catalog-driven, and underused. DSV's structural advantage is Payone (acquirer) + 50M Sparkasse customers + deep local merchant relationships — none of which Apple/Google/PayPal have. We're building the AI layer that makes that advantage visible.

---

## 2. Hard requirements pulled from the brief

Build all three:

1. **Context Sensing Layer** — real-time signal aggregation; must use ≥2 visible context categories from {weather, location, time, events, demand proxies}. Signals must be **configurable, not hardcoded** — a different city = config swap, not code change.
2. **Generative Offer Engine** — offers generated dynamically (not retrieved from a static DB). **GenUI required**: widget built at runtime — imagery, tone, layout — not template filling. Merchant-side rule interface required, even as mockup. On-device SLM encouraged for GDPR — only abstract "intent" reaches cloud.
3. **Seamless Checkout & Redemption** — QR / token / cashback. End-to-end demo from offer generation to simulated redemption. Merchant dashboard required, even static.

UX must explicitly answer:
- Where does the interaction happen? (push / in-app card / lock-screen / banner)
- Factual-informative vs. emotional-situational addressing?
- What happens in the first 3 seconds? (no scroll, no deliberation)
- How does the offer end? (expiry / acceptance / dismissal — all intentional)

Strong submissions: real context in action, 3-sec comprehension, closed loop, honest privacy framing, merchant-side present.
Weak submissions: dummy offers behind pretty UI, merchant side ignored, over-engineered AI under-engineered UX.

---

## 3. Core product framing

### "The marketing department small merchants don't have"

The pitch line. Local merchants don't lack data — they lack the marketing resources to act on it. Global e-commerce has dynamic pricing and personalization algorithms; the corner café has a chalkboard. We build the algorithmic layer for the merchant on the corner, riding on the bank's existing payment + relationship infrastructure.

### Two agents, not one

Separate cleanly. They have different cadences, latency budgets, prompts, and failure modes.

- **Opportunity Agent** — runs on the merchant graph, periodically. Notices gaps between predicted and desired demand. Drafts offers + widget specs for merchant approval. Output: opportunity cards in merchant inbox. Cadence: every few hours + signal-change triggered.
- **Surfacing Agent** — runs on the user graph, in real time. Picks the best already-approved offer for the current context and decides *whether and how* to surface it. Output: notification, in-app card, or silence. Cadence: continuous, lightweight.

The Opportunity Agent generates *offers waiting to fire*. The Surfacing Agent decides *which one fires for whom, when, and as what kind of widget*.

### Inversion: opportunity feed, not goal-setting

The brief frames merchant participation as "merchant sets goal → AI generates offer." We invert it: **AI sees the situation → AI proposes an offer → merchant approves**. The merchant app becomes an inbox of proposed offers, not a configuration screen. Each card shows detected reason, drafted offer, projection, and four buttons: Approve / Edit / Skip / **Always auto-approve like this**.

The "Always auto-approve like this" button is the trust-gradient feature — it lets the merchant build automation rules retroactively from examples instead of configuring abstract rules upfront. Day 1: manual approvals. Day 30: rain-day specials and pre-close pastry pushes run on autopilot within guardrails.

### The aggregate intelligence angle (10-second mention in pitch)

Once N merchants are on the platform, the agent learns cross-merchant patterns no individual merchant sees: "Bakeries in 8001 Zürich consistently see a 22% Monday-morning dip; merchants who run a pre-10am offer recover 60% of it." Each new merchant onboards into a smarter system. This is the data network effect that turns a coupon app into a defensible platform — and it's exactly what DSV-Gruppe (who already aggregates across thousands of Sparkassen) should structurally win.

---

## 4. Architecture

### Signal stack (Context Sensing Layer)

Adapter interfaces, swappable per city via config:

- `WeatherProvider` — Open-Meteo (no key, free, reliable). Real signal on demo day.
- `EventProvider` — city open-data API (Stuttgart, Berlin, Zürich) or curated JSON. Falls back to a hand-curated 5-event list if scraping fails.
- `TransactionDensityProvider` — **synthetic Payone feed**. JSON file per merchant with per-hour transaction counts over 7 days. Realistic distributions: weekday seasonality, weather correlation, lunch/dinner peaks. The interface is the real thing — only the data is faked.
- `LocationProvider` — browser GPS (or simulated GPS for demo).
- `TimeProvider` — system clock with overrides for demo replay.

Configurability requirement satisfied by `cities/stuttgart.yaml` + `cities/zurich.yaml`. Demo includes a 5-second config-swap moment.

### Privacy boundary (on-device SLM + intent token)

```
[on-device, browser]                    [server]
user GPS, movement,                →    intent token
declared prefs, recent              ┐   { "warm_drink_indoor",
dismissals, full menu graph         │     openness_to_walk: 0.6,
                                    │     urgency: 0.4,
                                    │     coarse_h3_cell: "..." }
                                    ↓
                                        candidate offers within cell
                                   ←    (no PII, no precise GPS)

[on-device]                        ←    re-rank against full local context
                                        render GenUI widget
```

Implementation:
- transformers.js + WebGPU running Phi-3-mini or Gemma-2B in the browser for intent extraction.
- Visible "running locally" badge in the UI.
- Coarse H3 cell (~500m resolution) sent server-side, never raw GPS.
- Fallback if WebGPU is flaky on the demo machine: same model behind a `/on_device_intent` endpoint, clearly labeled as a demo seam.

### Offer schema (the API contract between the two agents)

```typescript
Offer {
  id
  merchant_id
  status: "draft" | "pending_approval" | "approved" | "live" | "expired" | "redeemed_out"

  // Authored by Opportunity Agent
  title_de
  description_de
  eligible_items: MenuItemId[]
  discount: { type: "pct" | "bundle" | "fixed", value, original_price, offer_price }

  // Targeting — read by Surfacing Agent
  active_window: { start_ts, end_ts }
  target_radius_m
  target_filters: {
    weather_sensitive: bool,
    time_of_day_buckets: [],
    user_affinity_categories: [],
    dietary_compatible: [],
  }

  // GenUI spec — composed by the Opportunity Agent's drafting step
  widget_spec: { primitive, content, palette, copy_tone, imagery_hook }

  // Provenance (for explainability + learning)
  trigger_reason: "weather" | "perishable" | "slow_day" | "event_nearby"
  trigger_signal_snapshot: { weather_forecast, baseline_gap, ... }
  generated_at, approved_at, approved_by: "merchant" | "auto_rule_id"

  // Live state
  redemptions: [{ user_id, ts, amount }]
  budget_remaining_eur
  surface_count
}
```

Decisions baked in:
- `status: live` distinct from `approved` — approved offers may not yet be in their time window.
- `trigger_signal_snapshot` — stores what the world looked like at generation. Powers explainability ("why am I seeing this?"), enables future learning, defensible in the demo.
- `budget_remaining_eur` — decrements with redemptions; when zero, status flips to `expired`. Surfacing Agent must respect this.

---

## 5. Generative UI — the highest-risk, highest-leverage piece

The brief is explicit: "the offer widget is built at runtime, not retrieved from a template library." A polished React app with a fixed `<OfferCard />` component will lose to a less-polished one that demonstrably generates UI. This is the single technical bet most likely to differentiate.

### Approach: primitive library + LLM-emitted layout spec

Define ~6 widget primitives in React:

- `HeroCard` — large image bleed, single CTA, emotional copy
- `BundleCard` — two items + combined price + savings, value-forward
- `WeatherSituationCard` — weather glyph + 1-line situational copy + nearest merchant
- `MapTeaser` — small map fragment with merchant pin + walk time
- `CountdownStrip` — time-to-event urgency band
- `ImageBleedHero` — full-bleed mood image with overlay copy

LLM outputs a JSON layout spec composing these primitives with content, palette, copy tone, and imagery hooks. The client renders the spec.

### Why this works for 24h

- True runtime generation (passes the GenUI requirement).
- Variety is structural, not cosmetic — same offer at different contexts produces *different widgets*, not just different text.
- Bounded failure mode: if the spec fails schema validation, fall back to a known-good default rendering of the same offer text.
- Shippable in ~3 hours of focused work if the schema is right first try.

### Imagery without real-time generation

Pre-bucket a small library of mood-tagged stock images keyed by `(trigger_reason × merchant_category × weather_state)`. The LLM picks one. Looks generative; costs nothing in latency or API tokens.

Buckets to seed: `rainy-window`, `sunny-terrace`, `cosy-interior`, `busy-street`, `evening-warm`, `morning-light`, `fresh-pastry`, `steaming-cup`, `outdoor-event`.

### Demo proof: same merchant, three contexts, three widgets

| Context                | Primitive          | Tone      | Imagery        | Headline                             |
|------------------------|--------------------|-----------|----------------|--------------------------------------|
| Rain just started      | `ImageBleedHero`   | Emotional | rainy-window   | "Es regnet. 80 m bis zum Trockenen." |
| Quiet Tuesday afternoon| `BundleCard`       | Factual   | steaming-cup   | "Cappuccino + Brezel 4,90 € statt 6,30 €" |
| 40 min before concert  | `CountdownStrip`+`MapTeaser` | Urgent | busy-street    | "Noch 40 Min. Schnell ein Espresso." |

Show this side-by-side in the pitch. It's the GenUI proof and it answers the brief's UX question about factual vs. emotional addressing in one frame.

---

## 6. Opportunity Agent — flow

### Triggers
1. **Scheduled sweep** — every 3h per merchant, look 6–24h ahead.
2. **Signal-change** — forecast shifted, event added, transaction density anomaly. Re-evaluate affected merchants.
3. **Merchant-state** — new onboarding (cold-start sweep), guardrails edited, auto-approve rule added.

### Loop, per merchant

1. **Predict demand for next 24h, hour by hour.**
   `baseline(weekday, hour, category) × weather_multiplier × event_multiplier × seasonality_multiplier`. Baseline comes from synthetic Payone feed; multipliers from public signals.

2. **Detect gaps.**
   - `gap = desired - predicted` > threshold → SOFT-DEMAND opportunity.
   - `predicted > desired × 1.3` AND merchant goal "promote new product" → HIGH-TRAFFIC opportunity (awareness, no discount).
   - Menu item with `time_of_day=morning` past end-of-morning → PERISHABLE opportunity (pre-close push).
   - Real Payone signal: current hour transaction velocity vs. baseline → live "right now" opportunities.

3. **Draft offer + widget spec (LLM call).**
   Inputs: opportunity reason, eligible menu items (filtered by inferred tags), merchant voice, guardrails, target window, available imagery buckets.
   Outputs: title, description, eligible items, discount structure, target filters, widget spec, projected redemptions, projected margin impact.

4. **Approval routing.**
   Match against merchant's auto-approve rules. If match: status → `approved`, push to live pool. Else: status → `pending_approval`, push to opportunity feed.

5. **Deduplicate.**
   Same hour-window + overlapping items → keep higher projected margin. Recently rejected by merchant → suppress (the agent learns from rejection — show this in the demo).

### Two LLM calls, not one

Detection is deterministic; do it in Python. Drafting is generative; do it in the LLM. Fusing them loses the ability to show *why* an opportunity exists in the merchant card ("Heavy rain forecast 14–17h, your category drops 35% in this weather"). That trust-building "show your work" UX is what makes the merchant feed feel like an assistant, not a vending machine.

### Projected redemptions = transparent heuristic, not black box

```
projected_redemptions =
    wallet_users_in_radius(target_radius_m)
  × time_window_hours
  × historical_redemption_rate(category)
  × context_match_score(0..1)
```

Show the math in the merchant card on hover/tap. Judges respect honesty. Way more credible than "AI predicts 23 redemptions."

### Auto-approve rule schema

```typescript
AutoApproveRule {
  trigger_reason: "weather" | "perishable" | "slow_day" | "event_nearby" | "any"
  max_discount_pct: number
  max_offer_budget_eur: number
  allowed_hours: TimeRange[]
  allowed_days: Weekday[]
  max_per_day: number
}
```

Demo ships with one rule: "Auto-approve weather-driven offers, ≤20%, ≤€30/day, weekdays only." Live-toggle it during the demo.

### Merchant-facing card

Each opportunity shows: detected reason (one sentence) · proposed offer (title + items + price) · targeting summary · projection · actions (Approve / Edit / Skip / Always auto-approve like this).

---

## 7. Surfacing Agent — flow

### Triggers
1. App open → surface ranked offers immediately.
2. Geofence enter → 200m radius of an active offer the user qualifies for.
3. Context-shift → rain just started, user outdoors-and-mobile, relevant offer nearby → push notification.
4. Time-of-day → 11:30 weekday + user has "lunch within 10min" pattern → ambient surfacing.
5. Explicit search → fallback only.

For demo: script triggers 1 and 3. Trigger 3 is the wow moment.

### Loop, per surfacing decision

1. **Filter to eligible offers.**
   In radius, in target window, matches dietary/preference filters, not on user's dismissed list within cooldown, not for a merchant the user redeemed at in last 6h.

2. **Score each candidate.**
   ```
   score =
       w1 × context_fit
     + w2 × proximity_fit  (distance decay)
     + w3 × user_affinity
     + w4 × novelty
     + w5 × value
     - p1 × recent_notification_penalty
   ```
   Weights hand-tuned for hackathon, learnable in principle.

3. **Decide surfacing mode.**
   - `top_score < silence_threshold` → SURFACE NOTHING.
   - `top_score > push_threshold` AND trigger ∈ {context_shift, geofence} → PUSH.
   - Else → IN-APP CARD on next open.

4. **Generate surfacing copy.**
   Default: use offer's existing title verbatim.
   Contextual triggers (rain, near-event): one LLM call rewrites only the headline to reflect the moment. Body stays merchant-authored. Same offer, different headlines depending on context.

5. **Log and learn.**
   Record (user, offer, trigger, mode, scores, outcome ∈ dismissed/opened/redeemed/ignored). Feeds back into user_affinity.

### Critical: the silence threshold

A wallet that fires offers constantly is worse than one that doesn't fire at all. Set the threshold high. Quiet most of the time, brilliant at the right moment. **That's the whole product feel.** During the demo's normal walking the app stays silent — then *one* great offer fires when conditions align.

### Why this isn't an LLM-per-request system

Surfacing happens on app-open and geofence-cross. Sub-second matters. A scoring function returns in 5ms; an LLM call in 800ms+. Plus: per-evaluation LLM calls bankrupt the API budget and lose inspectability. The LLM does two narrow jobs on the consumer side: contextual headline rewrite (per *fired* notification, not per evaluation) and the on-demand "why am I seeing this?" explainer.

---

## 8. The Mia demo — the spine

Built exactly to the brief's reference scenario. Don't invent a different one.

| Beat | What's on screen | What's happening underneath | Narrator |
|------|------------------|------------------------------|----------|
| 1. Open | Phone-frame, Stuttgart map, calm wallet UI | Surfacing Agent: `top_score < silence_threshold`, no push | "Mia opens her wallet on a normal Tuesday. The system has nothing to say." |
| 2. Walk | Map updates, no notifications | On-device intent: `coarse_cell, "browsing", openness_to_walk: 0.6` sent up. Server returns 3 candidates. None cross threshold. | "She's browsing. The bank knows that — but doesn't push anything yet." |
| 3. Trigger | Push slides in: "Es regnet bald. 80 m bis zum heißen Kakao." | Weather signal updated. Café Bondi has a live, auto-approved rain-driven offer. Score crosses push threshold. | "Now the context shifts." |
| 4. Tap | GenUI widget renders: `ImageBleedHero` with rainy-window mood, warm palette, single CTA | Layout spec rendered client-side from JSON. | "The interface itself was generated for this moment." |
| 5. Redeem | QR + Sparkasse-styled success: "Mit Sparkasse bezahlt — 2,40 € Cashback gutgeschrieben" | Simulated checkout, decrements `budget_remaining_eur`, logs redemption. | "Redemption flows through the rail Sparkasse already operates." |
| 6. Cut | Merchant view: same offer, approved 3h ago by auto-rule | Opportunity Agent generated this from rain forecast + low Payone density. | "On the merchant side, this offer was the agent's idea, approved automatically under a rule the merchant set once." |
| 7. Toggle | Rule list, flip "auto-approve weather offers" on | | "From tomorrow, the merchant doesn't even open the app." |
| 8. Config swap | `cities/zurich.yaml` swapped, same UI runs in CHF, German-Swiss copy | | "Same system, different city. Config, not code." |

Plus one secondary scenario (event-driven or evening) to prove the engine generalizes beyond the canned Mia path.

---

## 9. Build order — 24 hours

1. **0–3h: GenUI primitives + offer schema.** Riskiest piece, needs iteration time. Define 6 React primitives, layout-spec JSON schema, three example specs hand-written and rendering correctly. **Gate: by hour 3, can we render three structurally different widgets from JSON?** If not, fall back to template-with-rich-content.

2. **3–6h: Opportunity Agent + Payone synthetic feed.** Generate per-merchant 7-day transaction-density JSON (5 Stuttgart merchants). Real Open-Meteo for Stuttgart. One real or synthetic event. Detection in Python; one LLM call drafts offer + widget spec. Output to merchant inbox UI.

3. **6–9h: Consumer app shell + Surfacing logic.** Phone-frame PWA. Scoring function. Mia scenario hardcoded as primary path. Renders generated GenUI specs.

4. **9–12h: On-device intent extractor.** transformers.js + WebGPU with a small model. Intent-token API. Visible "läuft lokal" badge. Server-side fallback path ready by hour 11.

5. **12–15h: Merchant rule UI + auto-approve + opportunity feed.** Functional sliders (max %, daily €, hours). Opportunity inbox with 3–4 pre-generated cards. One auto-approve rule live-toggleable.

6. **15–18h: Redemption flow + Sparkassen styling pass.** QR code, "Mit Sparkasse bezahlt" success screen, Cashback confirmation. German microcopy, Sparkassen-Rot, S-logomark in mocks.

7. **18–20h: City config swap + privacy framing slide.** `zurich.yaml` and live swap. Architecture diagram showing on-device/cloud boundary.

8. **20–22h: Pitch script + demo recording (backup) + secondary scenario.** Always record by 22h — live demos die at the worst time.

9. **22–24h: Buffer.** For what breaks at 21h.

### Hard cuts (don't build these, even if tempting)

- Menu-photo OCR onboarding (was a good idea; not in rubric, costs too many hours).
- Google Maps merchant import (same — gesture at it in a slide).
- Real ML for projected redemptions (transparent heuristic is more credible).
- Real-time image generation (pre-bucketed mood library).
- Per-evaluation LLM in Surfacing Agent (scoring function only).
- Actual POS integration (mention as roadmap; pitch sentence ready).
- Reviews mining, real menu management UI, full merchant analytics.

---

## 10. Tech stack

- **Frontend (consumer + merchant):** Next.js + TypeScript + Tailwind. Phone-frame for consumer in pitch. Vercel deploy.
- **Backend:** FastAPI or tRPC. SQLite or Supabase Postgres for state. Railway/Fly.io.
- **LLM:** OpenAI 4o-mini (Hack-Nation gives credits) or Claude Haiku via Anthropic. LiteLLM in front for swap.
- **On-device:** transformers.js + WebGPU. Phi-3-mini or Gemma-2B-it. Server-side fallback endpoint.
- **Signals:** Open-Meteo (weather, no key), city open-data (events, real or curated JSON), synthetic Payone JSON, browser GPS or simulated.
- **Geo:** H3 for coarse cells, Leaflet for map fragments.
- **Maps imagery:** Static map tile screenshots prebaked per merchant for the demo to avoid runtime tile loading.

Picking nothing the team hasn't shipped before. Clock runs out fast.

---

## 11. Pitch — what wins

### One-line product

**"The marketing department small merchants don't have, generated for the moment, redeemed through the rail the bank already operates."**

### What to show, in order

1. The Mia scenario, as scripted (≤90s).
2. Three GenUI widgets side-by-side from the same merchant in three contexts (≤20s).
3. Merchant-side: the auto-approved opportunity that became Mia's offer, plus the rule toggle (≤30s).
4. Config-swap to Zürich (≤5s).
5. Architecture slide with on-device/cloud privacy boundary highlighted (≤30s).
6. The roadmap line: "Today: synthetic Payone feed, 5 merchants, 1 city. Production: live Payone density across 300k+ acquired merchants, every Sparkasse, zero-touch onboarding for any merchant on a Sparkasse terminal."

### What to say about privacy (the rehearsed line)

"User movement, preferences, and dismissal history never leave the device. Only an abstract intent token and a coarse 500m geo-cell go to the server. The personalization happens locally, on-device, with a small open-source model. We treat GDPR as an architecture, not a checkbox."

### What to say if asked about Payone

"Payone is the unspoken differentiator. For the ~300k merchants the Sparkassen-Finanzgruppe already acquires, transaction velocity is observable in real time at zero onboarding cost. We're not asking merchants to install a POS plugin — for any merchant on a Sparkassen terminal, the demand signal is already flowing. Today we simulate it; the production path is the one no consumer-AI startup can replicate."

### What to say if asked about why DSV specifically

"Three things only DSV-Gruppe brings: Payone for the demand signal, the Sparkasse rail for redemption and trust, and existing relationships with thousands of local merchants through S-Markt & Mehrwert. A consumer AI startup can build the wallet — they cannot build the supply side. DSV already has the supply side; it's missing the AI layer. That's the layer we built."

### Trap to avoid in Q&A

Don't oversell the on-device SLM if it's running server-side in the demo. Be explicit: "production architecture has it client-side; for demo reliability we run it behind a labeled endpoint." Honesty about demo seams is respected; getting caught isn't.

---

## 12. UX answers (what the brief explicitly asked)

| Question | Our answer |
|----------|-----------|
| Where does the interaction happen? | Multi-channel: silent in-app card by default, push only when context-shift + high score, never lock-screen widget (intrusive). |
| Factual vs. emotional addressing? | Both, **selected by trigger**: weather/event triggers → emotional-situational. Quiet-period/value triggers → factual-informative. The GenUI engine picks based on the trigger reason. |
| First 3 seconds? | Single visual primitive (`HeroCard`/`ImageBleedHero`), one headline ≤8 words, one price, one CTA. No scroll, no taxonomy. Mood image carries the situation, headline carries the offer, CTA carries the action. |
| How does the offer end? | Expiry: silent removal + one-time "expired" toast if user reopens within an hour. Acceptance: simulated checkout, success screen with cashback amount, return to calm wallet. Dismissal: swipe-down, 24h cooldown for that merchant (offer stays in "saved" tab if user wants it back). All three: intentional, no surprise, no reentry friction. |

---

## 13. Open questions / decisions still to make

- [ ] Stuttgart only, or Stuttgart + Zürich for the config-swap demo? (Zürich is an easy add given team familiarity; Stuttgart matches the brief's reference scenario exactly.)
- [ ] Phi-3-mini vs. Gemma-2B-it on-device? (Gemma is friendlier with German; Phi is smaller. Test both at hour 9.)
- [ ] Does the secondary scenario use rain-different-city, or evening-event-same-city? (Evening-event shows engine breadth; same city is less context-switching for judges.)
- [ ] Merchant categories for the demo: 3 cafés / bakeries / one bookstore / one Eisdiele? (Variety helps GenUI demo; too many costs setup time.)
- [ ] Where to host the SLM fallback if WebGPU fails on demo machine — Replicate, Modal, or just run it in the FastAPI backend?
- [ ] How explicit do we get about Sparkassen branding — Sparkassen-Rot throughout, or neutral with a "Powered by Sparkasse" footer? (Probably the latter, to look like a product not a fan project.)

---

## 14. Reference sources to keep handy

- Open-Meteo: `https://open-meteo.com/`
- Stuttgart open data: `https://www.stuttgart.de/service/open-data.php`
- Foursquare Open Source Places (fallback merchant data): `github.com/foursquare/fsq-os-places`
- transformers.js docs: `huggingface.co/docs/transformers.js`
- H3 geo indexing: `h3geo.org`
- Hack-Nation Devpost (rules, prizes, schedule): `https://hack-nation.devpost.com/`
- DSV-Gruppe profile: `dsv-gruppe.de/dsv-gruppe/profil.html`
- S-Markt & Mehrwert (existing loyalty stack we're modernizing): `s-markt-mehrwert.de`
- Challenge contact: Tim Heuschele, `tim.heuschele@dsv-gruppe.de`