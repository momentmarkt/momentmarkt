# Agent I/O contract

Locked-in contract for the two agents in the City Wallet, derived from a partner sync on 2026-04-25 that pinned down four ambiguities in spec-v03. All build code, future docs, and demo decisions defer to this file when they conflict with prose elsewhere.

## The two agents

- **Opportunity Agent** — periodic, per-merchant. Drafts offers + GenUI widget specs from three triggers (weather / events / demand). Writes to merchant inbox.
- **Surfacing Agent** — real-time, per-user. Picks one already-approved offer for the user's current context, applies a high-intent boost, rewrites only the headline of the one that fires.

Both call the LLM exactly once per output (Opportunity per draft; Surfacing per fire). All scoring and trigger logic is deterministic Python.

## Privacy boundary (single wrapper)

Every Surfacing Agent input crosses one wrapper. Server-side and downstream LLM calls never see raw user data — they see derived labels.

```
{
  intent_token,         # short string label, see below
  h3_cell_r8,           # ~1 km coarse hex
  weather_state,        # derived from cell + weather snapshot
  t,                    # timestamp
  high_intent: {
    active_screen_time_recent_s,
    map_app_foreground_recent,    # bool proxy
    coupon_browse_recent          # bool: opened wallet's offers tab in last 2 min
  }
}
```

Architecture-slide framing: in production the SLM extracting `intent_token` runs on-device; only the wrapper leaves the device. In MVP the same extractor is a server-side stub fn (see below). Slide labels: "demo: `extract_intent_token()` stub; prod: on-device SLM (transformers.js + WebGPU)."

## Intent tokens — locked MVP shape

Hand-coded enum returned by `extract_intent_token(raw_signals) -> str`. The stub stands in for the on-device SLM; the production swap is the architecture story.

Demo set (initial; expand only if a demo cut requires it):

- `lunch_break.cold` — between meetings, chilly out, hungry-fast (Mia's slot)
- `commute.evening_rushed` — going home, no time to dawdle
- `tourist.midday_browsing` — open to discovery
- `weekend_wander` — leisurely Saturday, no goal
- `late_night.solo` — out late, alone

The Mia simulator emits one of these on each tick during the demo.

## Walk-ring

User's h3 cell + 1 ring = 7 hexes ≈ 1 km radius. Candidate-pool query filters merchants in this ring. Don't expand without re-tuning the silence threshold.

## Headline rewrite cache — locked

LLM is called exactly once per fire to rewrite the offer headline. Cache key:

```
(offer_id, weather_state, intent_state) -> headline_final
```

Hit → instant render. Miss → LLM call, store. Cache lives in-process dict for MVP (SQLite-backed if we want persistence across restarts, optional).

Drift handled by key composition: when state changes, key changes, fresh call. No manual invalidation.

Why: demo determinism (every take reads identically), latency (no 400 ms gap on card-slide), trivial cost.

## Demand-gap visualization — locked: merchant inbox only

Demand-gap signal renders **only in the merchant inbox**, not in the consumer-side dev panel. The Payone production story belongs with the merchant.

Merchant inbox grows a small chart per merchant:
- Typical day-of-week / time-of-day curve drawn faintly behind
- Live transaction-density curve drawn in front
- Today's gap highlighted (live below typical)

When an offer was auto-approved by a demand-gap rule, the inbox card visibly points at the gap moment that triggered it.

Consumer-side dev panel stays minimal: only `{intent_token, h3_cell_r8}` and the high-intent toggle. Nothing about demand.

## Opportunity Agent — explicit I/O

**Inputs (per merchant per tick)**
- Merchant card: `{id, category, h3_r8, open_hours, active_rules}`
- Weather: current + ~2 h forecast for merchant cell (`data/weather/*.json`)
- Events: events ending in next ~30 min, walk-time < 10 min (`data/events/*.json`)
- Demand: `live_density(t)` and `baseline_density(day_of_week, t)` (`data/transactions/berlin-density.json`)
- Recent draft history: skip if a similar offer was just rejected

**Trigger fn (deterministic, Python)**
```
weather_trigger = state in {rain, cold, heat, ...}
event_trigger   = exists e: e.ends_in <= 30min and walk_time(merchant, e.location) <= 10min
demand_trigger  = (baseline - live) / baseline > THETA_DEMAND
fire = weather_trigger or event_trigger or demand_trigger
```

**LLM call (one per draft, cheap model)**
Inputs: merchant card, fired triggers + their data, category templates, mood-library key (`(trigger × category × weather)`).
Output (single JSON):
```
{
  "offer": {
    "discount_type": "percent" | "fixed" | "item",
    "discount_value": ...,
    "valid_window": { "start": ts, "end": ts },
    "copy_seed": { "headline_de", "headline_en", "body_de", "body_en" },
    "mood_image_key": "rain.cafe.cold",
    "cta": "Hol dir den Kakao"
  },
  "widget_spec": { ...JSON tree of 6 RN primitives... }
}
```

**Persisted to SQLite**
- `offers(id, merchant_id, status, trigger_reason, copy_seed, widget_spec, valid_window, created_at)`
- Status flow: `pending_approval | approved | auto_approved | rejected`
- `inbox_events(merchant_id, offer_id, event_type, t)` drives merchant UI

**Outputs to other agents**: nothing direct. Surfacing reads the offers table.

## Surfacing Agent — explicit I/O

**Inputs (real-time, on context-change event)**
- Wrapped user context (see Privacy Boundary)
- Candidate pool: `SELECT * FROM offers WHERE status IN ('approved','auto_approved') AND now BETWEEN valid_window.start AND valid_window.end AND merchant.h3 IN walk_ring(user.h3)`

**Scoring (deterministic, NO LLM)**
```
base = relevance(offer.category, intent_token)
     * proximity(merchant.h3, user.h3)            # walk-time decay
     * trigger_strength(offer.trigger_reason)     # rain offer scores higher when actually raining
     * novelty(user_id, offer.id)                 # shown recently? down-weight

boost = w1*screen_time_norm + w2*map_fg + w3*coupon_browse
final = base * (1 + ALPHA * boost)
```

**Silence threshold (the product feature)**
```
threshold = THETA_ACTIVE if boost >= BETA else THETA_SILENT     # THETA_ACTIVE < THETA_SILENT
```
If `max(final) < threshold` → silence. Log decision. No render. (Why the wallet stays quiet most of the time — design, not bug.)

**Pick top-1**
Single highest-scoring offer. Never fire two.

**LLM call (only on fire, cheap model)**
1. Cache lookup `(offer_id, weather_state, intent_state)` → cached `headline_final`. Hit → done.
2. Miss → LLM rewrites `offer.copy_seed` for current context. Aggressive variant when `boost >= BETA`. Store result.

**Persisted / rendered**
- `surface_events(user_id, offer_id, score, intent_state, fired, t)`
- On fire: in-app card slides into RN phone with `headline_final`; tap → render the cached `widget_spec` via the 6 RN primitives.

## What each agent does NOT do

**Surfacing does not:**
- Generate offer body, discount, image, or widget layout — those are part of the offer record from Opportunity.
- Regenerate the GenUI widget per fire — the cached `widget_spec` from draft time is the contract.
- See raw user data — only the wrapped context.

**Opportunity does not:**
- Score across users. It runs per merchant on their own clock.
- Approve its own offers. Merchant approves (one-tap) or a rule auto-approves.
- Surface anything to users. That's Surfacing's job.

## Open implementation parameters (resolved during build)

Tunable constants — pick during phase 3 calibration so the scripted Mia dip fires reliably and the high-intent toggle visibly changes the outcome.

- `THETA_DEMAND` — demand-gap fire threshold (initial guess: 0.3 = 30 % below baseline)
- `THETA_SILENT, THETA_ACTIVE, BETA, ALPHA` — surfacing thresholds and intent boost coefficient
- `w1, w2, w3` — high-intent boost weights (default 1.0 each, tune so toggle is visible)
- Walk-time function: straight-line distance × 1.4 / `4.5 km/h` is fine for demo.
