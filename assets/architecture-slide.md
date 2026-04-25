# Architecture Slide Source

Use this as the source copy for the 60-second tech video architecture slide.

## Title

MomentMarkt: generated local offers, governed by context

## Core Flow

```text
Weather + Events + Payone-style demand density
              |
              v
Opportunity Agent (scheduled job)
  - spots rain, event exits, and demand gaps
  - drafts offer + GenUI JSON widget spec
  - routes to merchant inbox / auto-approve rules
              |
              v
Surfacing Agent (device-time decision)
  - scores relevance and silence threshold
  - high-intent signals lower threshold
  - sends only { intent_token, h3_cell_r8 }
              |
              v
React Native wallet surface -> QR token -> simulated girocard cashback
```

## Three Production Swaps

| Demo | Production |
| --- | --- |
| In-app card slide-in | Expo Push / FCM / APNs push path |
| Server-side/simulated SLM | On-device Phi-3/Gemma intent extraction |
| Synthetic `berlin-density.json` | Payone/Sparkassen aggregated transaction density |

## Privacy Boundary

```json
{
  "intent_token": "intent.warm-drink.browse.lunch",
  "h3_cell_r8": "881f1d489dfffff"
}
```

Exact GPS, dwell history, redemption history, and profile preferences stay on device in the production architecture.

## One-Line Speaker Note

"For the demo, we show the seams: synthetic Payone density, server-side intent, and in-app surfacing. In production, those swap to Payone aggregation, on-device SLMs, and real push delivery without changing the product loop."
