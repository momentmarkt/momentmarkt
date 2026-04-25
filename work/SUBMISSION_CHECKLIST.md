ARTIFACT_ID: submission-checklist-v01
ARTIFACT_TYPE: checklist
PARENT_IDS: spec-v03, hackathon-2026-04-25
STATUS: ready

# Submission Checklist

Source of truth: `context/HACKATHON.md` and `work/SPEC.md` v03.

Target submit: Sun Apr 26 06:45 ET.
Hard cutoff: Sun Apr 26 09:00 ET.

## Required Devpost Fields

- [ ] Short Description
- [ ] Problem & Challenge
- [ ] Target Audience
- [ ] Solution & Core Features
- [ ] Unique Selling Proposition (USP)
- [ ] Implementation & Technology
- [ ] Results & Impact

## Required Assets

- [ ] Public GitHub repo
- [ ] Demo video, 1 minute hard cap
- [ ] Tech video, 1 minute hard cap
- [ ] 16:9 cover image, no confirmed size/format limit
- [ ] Live or recordable demo surface

## Current Product Copy Direction

Product name: **MomentMarkt**.

Short description draft:

> MomentMarkt is a generative city wallet that turns live weather, events, and Payone-style demand signals into hyperlocal offers, surfaced only when the moment is right.

## Demo Claims To Preserve

- In-app card for the demo; production path is push notifications.
- Server-side/simulated SLM for MVP; production path is on-device Phi-3/Gemma.
- Synthetic Payone-style transaction density for MVP; production path is real Payone/Sparkassen aggregation.
- Privacy boundary visible as `{intent_token, h3_cell_r8}`.
- GenUI is JSON layout spec rendered through React Native primitives, not static coupons.
- Silence is a product feature: the wallet should not always surface an offer.

## Field Notes

### Short Description

Mention: generative city wallet, live context, hyperlocal offers, right moment.

### Problem & Challenge

Use Mia/Berlin rain lunch scenario. Explain static coupon failure and small-merchant personalization gap.

### Target Audience

Two-sided: city consumers plus local merchants; DSV/Sparkassen as infrastructure stakeholder.

### Solution & Core Features

Three modules: context sensing, generative offer engine, seamless redemption/merchant view.

### Unique Selling Proposition

Lead with: offers are generated from context instead of stored in a coupon database. Include privacy and merchant auto-approve rule.

### Implementation & Technology

Mention: Expo React Native, TypeScript, NativeWind, FastAPI, SQLite, LiteLLM/Azure OpenAI, schema-validated GenUI JSON, OSM/Open-Meteo/VBB/transaction fixtures.

### Results & Impact

Frame around inner-city retail, merchant demand smoothing, Sparkassen/Payone advantage, privacy-preserving local commerce.

## Final Sanity Checks

- [ ] No stale `CityWallet` branding unless intentionally used as generic category.
- [ ] No claims of real Payone integration.
- [ ] No claims of real Web Push in the demo.
- [ ] No claims of live on-device SLM in the demo.
- [ ] Repo has no secrets or session tokens.
- [ ] README run instructions match the actual Expo/FastAPI layout.
