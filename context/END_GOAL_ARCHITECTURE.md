# MomentMarkt — End-Goal Architecture

A strategy memo capturing the full architectural vision so future
contributors and the post-hackathon Devpost story can recover the team's
thinking from the repo. Written after the cross-merchant swipe stack
landed (commit `d1212e5`), the four-surface UX framing was documented
(`context/UX_STRATEGY.md`), and the multi-agent vision was filed as
issue #138. Cross-referenced from `work/SPEC.md` and `README.md`. Sits
alongside `context/DESIGN_PRINCIPLES.md` (the invariants this
architecture must respect) and `context/UX_STRATEGY.md` (the surface
framing this architecture serves).

## 1. The wedge

Competitors do **personalized offers**: the merchant authors a static
offer string, the system distributes it to users with a personalization
layer on top deciding who sees what and when. The merchant's creativity
is the bottleneck; the AI's job is routing.

MomentMarkt does **generative offers within merchant-set bounds**: the
merchant authors **no offer copy at all**. They set bounds — discount
floor and ceiling, allowed categories, opening hours, optional brand
tone. An LLM generates the actual offer in real time (discount level,
headline copy, bundle composition, GenUI widget) the moment an agent
watching context (weather, demand gap, time-of-day, user intent)
decides conditions match. The merchant never authors a single offer
string. The LLM never crosses the merchant's worst-case floor. Every
offer the user sees is generated for *this moment, this user, this
merchant's tolerance*, and never existed five seconds before the
trigger fired. That is the product wedge — and the reason the LLM has
margin to do work the merchant literally cannot do alone.

## 2. The five-agent topology

| Agent | Role | Status today |
|---|---|---|
| **Opportunity** | Given context, what offer should this merchant make? | Shipped — `opportunity_agent.py` |
| **Surfacing** | Given user signals, should we surface this now? | Shipped — `surfacing_agent.py` |
| **Preference** | Given swipe history, which alternatives match this user? | Shipped — `preference_agent.py` |
| **Negotiation** | Given user reaction, how aggressively to adjust within bounds? | Module landing today (issue #142); wiring is v2 |
| **Bounds Manager** | What constraints did this merchant set? | Stubbed via fixtures today; v2 is the merchant portal (issue #138) |

Three agents already ship. The Negotiation Agent is the structural
piece that makes the wedge real — it is what turns swipe + dwell into
*new* offer generation at *new* discount tiers within the merchant's
bounds, not just re-ranking what already exists ("user rejected −5%
three times, dwelled 1.4s on −15% last visit → next offer is −18%,
capped by merchant's −25% floor"). The Bounds Manager is the structural
piece that makes the merchant side real — today bounds are baked into
fixture catalogs; v2 has the merchant authoring them through a portal,
seeing every generation in an audit log, and click-to-block any
specific output.

## 3. The four consumer surfaces

The wallet is built around four surfaces — Map, Drawer, List, Swipe
Stack — each with a distinct role. Map is spatial context; Drawer is
the wallet vessel; List is unfiltered ground truth; Swipe is the LLM's
stage for active curation. Removing any one collapses a real user
need. The full framing, the three product-shape decisions (a / b / c)
they compose into, and the v1→v2→v3 progression are documented in
`context/UX_STRATEGY.md`. This document does not repeat that material;
it points at it because the surface design is *upstream* of the agent
topology — the agents exist to populate surfaces the user can already
reason about.

## 4. The two merchant surfaces

The merchant side is the inverse of the consumer side: instead of
*receiving* generated offers, the merchant *bounds* them.

**Web dashboard** (`apps/merchant/`). The durable surface. Bounds
setting (floor, ceiling, categories, hours, brand tone), audit log of
every generation under those bounds with click-to-block, performance
metrics, and the per-merchant demand-curve view that anchors each
offer to the trigger that fired it. Today's two-pane inbox + agent 14's
in-flight expansion form the foundation; the bounds-setting UI is the
v2 addition.

**Mobile companion** (post-hackathon). The structural symmetry with
the consumer wallet. Push notifications when offers fire under the
merchant's bounds, quick-glance status, swipe-to-block in the audit
log — the merchant's swipe surface mirrors the consumer's. This isn't
decoration: it is the merchant's escape hatch from a system that
otherwise generates on their behalf 24/7.

## 5. The data layer

Six endpoints, each carrying a clear demo/production swap.

- `GET /merchants/{city}` — real OSM Overpass catalog (39 Berlin
  Mitte / 30 Zurich HB), the unfiltered ground truth that backs the
  list view (per `DESIGN_PRINCIPLES.md` #1).
- `GET /signals/{city}` — live Open-Meteo weather + Payone-style
  density fixture; in production, real Payone aggregation.
- `POST /offers/alternatives` — cross-merchant variants for the swipe
  stack; the lens parameter (issue #137) is landing today via agent 12.
- `POST /redeem` and `GET /history` — persisted redemptions and the
  aggregated log behind the wallet's clock-icon overlay.
- `POST /opportunity/generate` — LLM-driven offer + GenUI widget
  generation, schema-validated with a fixture fallback.
- `POST /surfacing/evaluate` — deterministic scoring with the
  high-intent boost; LLM only rewrites the headline of a card that
  fires.

Every endpoint is real today. Every dataset is honest about its
demo-vs-production swap (see the table in `README.md`).

## 6. The privacy boundary

Per the demo truth boundary in `CLAUDE.md`, an on-device SLM
(Phi-3-mini / Gemma-2B) is the production swap; the backend LLM stands
in for the demo. In production, only the wrapped enum
`{intent_token, h3_cell_r8}` reaches the backend — dwell time, swipe
direction, full intent inference never leave the device. The wedge
compounds into a privacy story that is *structural*, not theatrical:
because the merchant authors bounds rather than offers, and the LLM
generates within those bounds based on on-device signals, the system
that maximises offer relevance also minimises centralised user data.

The eight anti-manipulation invariants this architecture must respect
(list-as-ground-truth, no paid placement, on-device preferences,
deterministic Nearby fallback, inspectable reasoning, LLM as one of
several mechanisms, predictable text search, no cross-session
expectation breaks) are documented in `context/DESIGN_PRINCIPLES.md`.
This document does not repeat them; the architecture exists to make
them enforceable.

## 7. The progression: v1 → v2 → v3

| Stage | Capability unlocked | Issues / commits |
|---|---|---|
| **v1 (today)** | Wallet-first IA, drawer + map + list + swipe stack, Opportunity + Surfacing + Preference agents shipped, cross-merchant swipe stack as the bridge | `d1212e5`, `482dc06`, issues #128 / #132 / #134 / #136 / #140 |
| **v2 (lens swipe primary)** | Swipe becomes home surface; four lenses (For you / Best deals / Right now / Nearby) make the LLM's role transparent; Negotiation Agent module lands and wires into the For you lens | Issue #137 (lens UI); issue #142 (Negotiation Agent module); landing today via agents 12/13 |
| **v3 (full multi-agent + merchant portal)** | Bounds Manager replaces fixtures; merchant portal surfaces bounds-setting + audit log + click-to-block; mobile companion app for merchants; on-device SLM replaces server stub | Issue #138 (multi-agent); agent 14 extending `apps/merchant/` |

Each stage preserves the previous stage's surfaces (per
`UX_STRATEGY.md`). Nothing is removed; the home moves and a new layer
of agency is added — for the user (lenses) at v2, for the merchant
(bounds) at v3.

## 8. Why this wins

The product wedge is not decoration. It is the structural reason the
LLM has work to do that the merchant cannot do alone — generating the
exact discount that converts *this* user without giving more away than
necessary, bounded by the merchant's worst-case tolerance. Pure
personalization sits on top of pre-authored offers and lets the LLM
route; generative-within-bounds gives the LLM margin to optimise.

The merchant gives **parameters, not copy**. That is different from
every loyalty / coupon competitor, which asks the merchant to be the
creative bottleneck. Different also from every "AI marketing tool"
competitor, which asks the merchant to review LLM-authored copy. The
merchant authors no copy ever and reviews via bounds, not approvals.

The privacy story is **structural, not theatrical**. On-device SLM
extraction means the system that knows the most about the user has the
least data centralised. Consent banners are a substitute for
architecture; this is the architecture.

The architecture is **honest**. Every layer has a documented production
swap and a demo stand-in (push path, SLM extractor, Payone signal,
LLM provider, merchant portal, on-device negotiation). Three of five
agents ship today; the remaining two are documented in issues with
acceptance criteria. The judges see coherence; the post-hackathon team
sees a roadmap with no hidden architectural surprises.
