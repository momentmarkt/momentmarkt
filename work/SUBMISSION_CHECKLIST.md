ARTIFACT_ID: submission-checklist-v02
ARTIFACT_TYPE: checklist
PARENT_IDS: spec-v04, hackathon-2026-04-25, submission-v06
STATUS: ready

# Submission Checklist

Source of truth: `context/HACKATHON.md` and `work/SUBMISSION.md` (`submission-v06`, ready-to-paste).

Target submit: Sun Apr 26 06:45 ET.
Hard cutoff: Sun Apr 26 09:00 ET.

## Required Devpost Fields — drafted in `work/SUBMISSION.md`

- [x] Short Description — *"The marketing department small merchants don't have, generated for the moment, redeemed through the rail the bank already operates. Built for the DSV-Gruppe CITY WALLET track."*
- [x] Problem & Challenge — Mia/Berlin lunch scenario, two-sided framing
- [x] Target Audience — consumers + local merchants + DSV/Sparkassen
- [x] Solution & Core Features — drawer-first IA, live merchant search, tap-to-swap city, Opportunity + Surfacing agents, GenUI focused offer view, merchant inbox
- [x] Unique Selling Proposition (USP) — AI proposes/merchant approves, real GenUI on RN, tap-to-swap generative city, visible `{intent_token, h3_cell_r8}` privacy boundary
- [x] Implementation & Technology — Expo + TypeScript, FastAPI + SQLite, Pydantic AI + Azure OpenAI, OSM/Overpass, Open-Meteo, HF Spaces deploy
- [x] Results & Impact — 1-min Mia spine end-to-end, three structurally different GenUI widgets, live HF Space judges can hit

## Required Assets

- [x] Public GitHub repo — github.com/momentmarkt/momentmarkt
- [ ] Demo video, 1 minute hard cap — **PENDING**
- [ ] Tech video, 1 minute hard cap — **PENDING**
- [ ] 16:9 cover image — **PENDING**
- [x] Live or recordable demo surface — backend live at https://peaktwilight-momentmarkt-api.hf.space (verified `/health` 200, `/opportunity/generate` returns LLM-grounded JSON), Expo iOS Simulator recordable

## Pipeline Verified Live (2026-04-26 morning)

- [x] HF Spaces auto-deploys on push to main (deploy-hf.yml workflow, last 3 deploys succeeded in <10s)
- [x] `/demo/seed berlin` → 36 drafted, 3 skipped (was 1 before #161/#172)
- [x] `/demo/seed zurich` → 13 drafted, 21 skipped
- [x] `/opportunity/generate use_llm=true` against live HF: returns `generated_by: "pydantic_ai"` with German body copy that grounds in `signature_items` from `data/merchants/enriched/berlin.json` (e.g. "Cinnamon Roll" + "Third-Wave-Café mit warmem Holz und Keramik" both pulled directly from the enrichment file)
- [x] `/merchants/{id}/events` returns activity feed
- [x] Negotiation Agent wired into `/offers/alternatives` — each variant carries `negotiation_meta` with bounds-clamped discount

## Demo Claims To Preserve

- In-app card for the demo; production path is push notifications.
- Server-side/simulated SLM for MVP; production path is on-device Phi-3/Gemma.
- Synthetic Payone-style transaction density for MVP; production path is real Payone/Sparkassen aggregation.
- Privacy boundary visible as `{intent_token, h3_cell_r8}`.
- GenUI is JSON layout spec rendered through React Native primitives, not static coupons.
- Silence is a product feature: the wallet should not always surface an offer.

## Outstanding Issues Worth Watching

- #173 — re-run merchant enricher with Azure creds locally → flips 69 entries from `offline_heuristic` to LLM-grounded enrichment. Even with `offline_heuristic` source the LLM-drafted German copy is grounded correctly (verified live), so this is a polish item, not a blocker.
- #92 — this checklist; tracks final submission package.
- Mobile: parallel agents still polishing Discover/Browse/RedeemOverlay (#175, #177, #180).

## Final Sanity Checks

- [x] No stale `CityWallet` branding — product name is MomentMarkt throughout
- [x] No claims of real Payone integration — SUBMISSION.md frames synthetic density as a stand-in
- [x] No claims of real Web Push in the demo — push path is called out as a production swap
- [x] No claims of live on-device SLM in the demo — SLM extractor framed as production swap
- [ ] Repo has no secrets or session tokens — verify before submit
- [x] README run instructions match the actual Expo/FastAPI layout — verified earlier in session

## Hand-off to peaktwilight

The 6 things only you can do:

1. Record the 1-min demo video (Mia spine: drawer → search → tap merchant → focused GenUI offer → high-intent toggle → QR redeem → cut to merchant inbox → tap weather pill → city flip)
2. Record the 1-min tech video (architecture diagram + 3 production-swap callouts + live HF Space hit)
3. Generate 16:9 cover image
4. Paste SUBMISSION.md fields into Devpost form
5. (Optional but high-value) Re-run `python -m momentmarkt_backend.scripts.enrich_merchants berlin && ... zurich` locally with Azure creds to flip enrichment to `source: "llm"`; commit the regenerated JSON
6. Submit before 09:00 ET hard cutoff
