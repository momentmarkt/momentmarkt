# CLAUDE.md

## Current Authority

- Canonical spec: `work/SPEC.md` (`spec-v04`, `STATUS: ready`).
- Partner override context: `context/PARTNER_DISCUSSION.md`.
- Hackathon constraints and Devpost fields: `context/HACKATHON.md`.

## Product Direction

- Product name: **MomentMarkt** unless the team explicitly decides otherwise.
- Track: DSV-Gruppe CITY WALLET.
- Consumer app is **React Native + Expo + TypeScript** recorded on iOS Simulator or Expo Go.
- Merchant inbox can be the fastest credible web surface.
- The old untracked Next.js scaffold under `src/` is obsolete according to `spec-v04`.

## Coordination Rules

- Before editing implementation files, claim or create a GitHub issue in `mmtftr/momentmarkt` and comment that you are taking it.
- Assign the GitHub issue to yourself when you take it. If you cannot assign yourself, leave a clear comment with your GitHub username / machine / agent.
- One issue per laptop/agent at a time unless explicitly coordinated.
- Push the completed work before closing the issue.
- During active implementation, commit and push each coherent update before moving on to the next UI/design/backend change so teammates can review and continue from `origin/main`.
- Only close issues after the relevant commit is on `origin/main` or after a PR is merged.
- When closing an issue, comment with the commit hash or PR link and a short completion note.
- Do not delete or overwrite another teammate's untracked work without a direct sync.
- Do not revive the obsolete Next.js phone-frame direction unless `work/SPEC.md` changes.
- Keep the hour-5 fallback recordable: Expo app + one hand-authored offer + one rendered widget + fake redeem.

## Issue Workflow

1. Read `work/SPEC.md`, `context/PARTNER_DISCUSSION.md`, and this file.
2. Pick one open GitHub issue from `https://github.com/mmtftr/momentmarkt/issues`.
3. Comment `Taking this on <machine/agent>` and assign it to yourself.
4. Pull/rebase latest `origin/main` before editing.
5. Make the smallest scoped change for that issue.
6. Validate locally with the fastest relevant command.
7. Commit each coherent update with a concise message; do not batch unrelated UI, docs, backend, or packaging work.
8. Pull/rebase again, then push immediately after that commit.
9. Close the issue only after push/merge, referencing the commit.
10. Move to the next unclaimed issue.

## Build Priorities

1. Phase 0: submission checklist, coordination notes, cover placeholder.
2. Phase 1: Expo baseline and recordable fallback flow.
3. Phase 1: `data/transactions/berlin-density.json` for 4 merchants.
4. Phase 2: GenUI JSON schema and RN primitive renderer.
5. Phase 2: live LLM generation through LiteLLM/Azure.
6. Phase 3: signals, surfacing score, high-intent toggle, merchant inbox, redeem loop.
7. Phase 4: Zurich config swap only if core demo is stable.
8. Phase 5/6: architecture slide, videos, README, Devpost.

## Demo Truth Boundary

- Demo surface: in-app card. Production story: push notification server via Expo Push/FCM/APNs.
- Demo SLM: server-side or simulated. Production story: on-device Phi-3/Gemma.
- Demo Payone: synthetic transaction-density JSON. Production story: real Payone/Sparkassen aggregated density.
- Privacy token visible in dev panel: `{intent_token, h3_cell_r8}`.

## Secrets And Safety

- Never commit `.env`, API keys, bearer tokens, Supabase service role keys, or local build caches.
- Treat pasted Supabase bearer/session tokens as exposed and do not reuse them.
- Prefer fixtures and deterministic fallbacks over fragile live dependencies for the 60-second demo.
