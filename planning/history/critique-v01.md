ARTIFACT_ID: critique-v01
ARTIFACT_TYPE: critique
PARENT_IDS: spec-v01
STATUS: ready

# Critique of SPEC v01

- [blocker] Build order sums to 23h plus buffer, but only ~17h45m exists between hacking-start (Sat 13:15 ET) and the spec's own 07:00 ET target submit (19h45m to the 09:00 hard cutoff). Spec is overscoped by 5+ hours and the timeline is internally inconsistent. Narrow scope: collapse phases 3+4 into one 6h block, cut phase 5 Zürich rebind to a 30-min YAML swap with no GTFS bind, drop the secondary scenario beat. Rebudget to 16h work + 2h buffer.
- [blocker] "Synthetic per-merchant transaction-density JSON" is named as the Opportunity Agent's primary demand-gap input, but DATASET.md does not stage it and no build phase generates it. Either insert an explicit ≤45-min step in phase 2 to author a fixture file for the 4 demo merchants, or cut demand-gap detection from Opportunity Agent and ground it on weather + events only.
- [blocker] "Intent-token + H3 coarse-cell privacy boundary" is asserted in Why-it-wins Tech Depth, but no Decision commits to it and no build phase implements it. The architecture-slide claim alone will not survive judge Q&A. Add a 30-min step in phase 4 to wrap the surfacing input in `{intent_token, h3_cell_r8}` and log it on screen, or delete the claim from the pitch.
- [major] Push-notification mechanism is unspecified. Real web push needs service-worker + permission flow that is not in the build order; the fallback is a fake in-app pop-in. Decide now: rename "push" to "in-app surface" in the demo script and render an in-frame card. Do not let this surface as an undefined detail at hour 18.
- [major] Innovation claim "aggregate cross-merchant intelligence" appears in Why-it-wins but is not in Decisions, build order, or the demo script — no artifact backs it. Cut from pitch; demote to roadmap line in the tech video.
- [major] Decisions item 8 is the bare fragment "Menu OCR / photo&pdf onboarding" with no rules-out / revisit-if clause. Move to Non-goals (it already is implicitly, per IDEA_SEED) and delete the fragment.
- [major] Open Q4 (cover-image format/size) and Q6 (Devpost required-field list) are tagged "do not block build", but the CITY WALLET track is already accepted and a missing required asset discovered Sun 06:30 ET kills the submission. Resolve both at hour 0 by reading the Devpost track page; do not defer.
- [major] Phase 5 commits to a Zürich GTFS/CHF rebind in 3h, but the CH GTFS feed is an 80 MB nation-wide zip requiring lat/lon filtering to ~40 stops — no time budgeted for this extract. Pre-cook a `data/gtfs/zurich-hb-stops.json` fixture as a 20-min addition to phase 3, or drop GTFS from the Zürich swap and let it be a map+weather-only swap.
- [minor] Tavily sponsor API is not used anywhere; DATASET.md notes both city event endpoints 404'd and the events file is a hand-curated stub. A 30-min Tavily live-events query in phase 3 plugs a real signal gap and earns the sponsor-tech beat. Add it or explicitly note "Tavily out of scope" in the spec.
- [minor] DATASET.md stages a `personas/` slot for 10 LLM-generated personas; spec uses only hand-authored Mia and never references the slot. Drop personas from the README dataset attribution to avoid implying unused infrastructure.

## Routed back to exploration

no
