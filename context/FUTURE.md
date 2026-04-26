# Future / Out of Scope for MVP

> Decisions and deferrals for the Hack-Nation submission. Items here are intentionally not built in the 24h window. Locks in choices that override the open questions in `THOUGHTS.md` §13.

---

## Deferred to post-hackathon

### On-device SLM (intent extraction)

Originally planned: transformers.js + WebGPU running Phi-3-mini or Gemma-2B in the browser, emitting an abstract intent token to the server.

**Punted because:** WebGPU reliability on the demo machine is a coin flip, the labeled-fallback path adds complexity, and the privacy story can be told architecturally without a live local model in the demo.

**Replacement for MVP:** intent extraction runs server-side as a normal LLM call. The privacy boundary is described in the architecture slide and roadmap — "production architecture moves this on-device" — but no live transformers.js / WebGPU code ships.

**What we lose:** the visible "läuft lokal" badge moment. Compensate by leaning on the architecture diagram and the rehearsed privacy line.

**What we keep:** the H3 coarse-cell pattern and the intent-token shape — those are cheap and still demonstrate the boundary, even when the extractor lives server-side.

---

## Decisions locked in (overrides §13 of THOUGHTS.md)

### Branding: no Sparkassen identity

No Sparkassen-Rot, no S-logomark, no "Mit Sparkasse bezahlt" copy in the redemption screen. The product is presented as a neutral wallet. DSV-Gruppe context lives in the pitch narrative and architecture story, not in the UI chrome.

**Why:** looks-like-product beats looks-like-fan-project; avoids licensing/IP awkwardness; keeps the demo portable to other partners.

### LLM provider: Azure OpenAI

All generative calls (offer drafting, widget spec emission, contextual headline rewrite, "why am I seeing this?" explainer) go through Azure OpenAI via the Pydantic AI provider dispatcher. The configured backend is Azure, with fixture fallbacks for demo safety.

**Why:** team has credits and existing endpoint; avoids OpenAI direct / Anthropic billing setup during the hack.

### Demo cities: Berlin + Zürich

The config-swap demo runs `cities/berlin.yaml` ↔ `cities/zurich.yaml`. **Stuttgart is dropped** as a demo city.

**Why:** team familiarity with both cities; better open-data coverage for Berlin than Stuttgart; Zürich gives the CHF / Swiss-German copy contrast for the config-swap moment.

**Consequence — Mia scenario:** the brief's reference scenario is "Mia in Stuttgart." We relocate her to Berlin (primary) with Zürich as the config-swap proof. Worth a one-line acknowledgement in the pitch ("we kept the persona, moved the city to where our signals are richest") so judges don't think we missed the brief.

---

## Still open (carried forward from §13)

- Secondary scenario flavor: rain-different-city vs. evening-event-same-city.
- Merchant mix and count for the demo.
- Auto-approve rule defaults beyond the one weather-driven rule shown in the demo.
