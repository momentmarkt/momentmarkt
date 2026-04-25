# MomentMarkt

Generative city wallet prototype for the DSV-Gruppe CITY WALLET challenge.

Current implementation direction is tracked in `work/SPEC.md`: Expo React
Native consumer app, small merchant web surface, FastAPI/fixtures as needed.

## Run The Mobile App

```bash
pnpm install
pnpm mobile:ios
```

The mobile app now uses a local Expo development client instead of Expo Go.
The first `pnpm mobile:ios` run compiles the native iOS app with Xcode and can
take several minutes; after that, hot reload works against the native dev
client. This is required for native modules such as Apple Maps via
`react-native-maps`.

Useful commands:

```bash
pnpm mobile:start
pnpm mobile:android
pnpm mobile:web
pnpm mobile:typecheck
```

The Expo app lives in `apps/mobile`. It is the canonical consumer demo surface;
the older untracked Next.js scaffold under `src/` is obsolete per `spec-v03`.

## Run The Merchant Inbox

```bash
pnpm merchant:dev
```

Useful commands:

```bash
pnpm merchant:typecheck
pnpm merchant:build
```

The merchant inbox lives in `apps/merchant`. It shows the Cafe Bondi Opportunity
Agent draft, auto-approved rain+demand rule, a second rule toggle, and aggregate
surfaced/accepted/redeemed/budget counters for the 20-30s merchant cut.

## Current Demo Spine

1. Mia opens MomentMarkt in Berlin Mitte; wallet stays silent.
2. Rain + Cafe Bondi demand gap triggers the Surfacing Agent.
3. A generated-looking React Native widget renders from JSON primitives.
4. The dev panel shows `{intent_token, h3_cell_r8}` and score/threshold reasons.
5. High-intent toggle lowers the threshold and changes the headline.
6. Mia redeems through a QR/token screen and simulated girocard cashback.
7. Merchant inbox shows the same offer auto-approved 3h earlier.

Architecture slide source lives in `assets/architecture-slide.md`.

## Run The Backend

```bash
pnpm backend:start
```

The FastAPI service lives in `apps/backend` and exposes:

- `GET /health`
- `GET /cities`
- `GET /signals/{city}`
- `POST /opportunity/generate`

It is fixture-first and demo-safe. Pass `{"use_llm": true}` to
`/opportunity/generate` after configuring LiteLLM provider environment variables
to try live Opportunity Agent generation; failed LLM calls fall back to validated
fixture JSON.

Validate with:

```bash
pnpm backend:test
```

## Planning Workflow

A file-driven multi-agent workflow for hackathon planning with a data-exploration
front stage. Designed to run via subagents (Claude Code's Task tool) with a
coordinator Claude Code instance as the dispatcher.

## Shape

```
    stage 00: EXPLORE                      stage 01: PLAN
┌──────────────────────────┐           ┌──────────────────┐
│ ideator → explorer*      │ ────▶     │ planner          │
│ (loop until budget or    │           │ writes SPEC.md   │
│  empty queue)            │           └────────┬─────────┘
└──────────────────────────┘                    │
         ▲                                      ▼
         │                             stage 02: CRITIQUE + REFINE
         │                             ┌──────────────────────────┐
         │ EXPLORATION_REQUEST.md ◀────│ critic                   │
         │                             │ writes CRITIQUE.md       │
         │                             │ optional: request more   │
         │                             │ exploration              │
         │                             └────────┬─────────────────┘
         │                                      │
         │                                      ▼
         │                             planner refines SPEC.md
         │                                      │
         │                                      ▼
         │                             stage 03: JUDGE
         │                             ┌──────────────────┐
         └─ or loop again              │ judge → YES/NO   │
                                       └──────────────────┘
```

## Files you fill in before first run

- `context/HACKATHON.md` — rules, tracks, judging criteria, sponsor stack, timeline
- `context/IDEA_SEED.md` — your raw pitch (keep it short; 5–10 min of freehand)
- `context/DATASET.md` — where the data lives, format, known docs, access notes

(Start from the `.template` files next to each.)

## How to run

Feed `ORCHESTRATOR.md` to your top-level Claude Code session. It dispatches
every stage by spawning subagents with the role files in `roles/` and the
stage files in `stages/`. It never does agent work itself — it only reads
artifacts from `work/` and routes.

See `examples/README.md` for invocation sketches.

## The invariant

Every role file starts with `OUTPUT:` specifying the single file that role
writes. Agents never output into the coordinator's context — only into their
assigned artifact. The coordinator reads artifacts, never agent stdout. This is
load-bearing; if you relax it, context pollution returns.
