# CLAUDE.md

## Current Authority

- Canonical spec: `work/SPEC.md` (`spec-v04`, `STATUS: ready`).
- Partner override context: `context/PARTNER_DISCUSSION.md`.
- Hackathon constraints and Devpost fields: `context/HACKATHON.md`.

## Product Direction

- Product name: **MomentMarkt** unless the team explicitly decides otherwise.
- Track: DSV-Gruppe CITY WALLET.
- Consumer app is **React Native + Expo + TypeScript** recorded through the native Expo dev client on iOS Simulator.
- Merchant inbox can be the fastest credible web surface.
- The old untracked Next.js scaffold under `src/` is obsolete according to `spec-v04`.

## Merchant-Facing UI Copy (CRITICAL)

The merchant inbox (`apps/merchant/`) is a real product surface seen by shop owners during the demo. Copy must read like a polished SaaS, not a project hand-off.

**Never put these in user-facing strings (UI labels, helper text, error messages, button copy, agent replies, captions, footers, headers, tooltips):**

- Issue numbers (`#166`, `#167`, `Issue #168`, `phase-3`, etc.)
- Spec or doc references (`SPEC.md`, `spec-v04`, `END_GOAL_ARCHITECTURE`, `AGENT_IO`)
- Implementation details (`Pydantic AI`, `OCR`, `LLM`, `FastAPI`, `fixture`, `endpoint`, `polling`, `JSON schema`, `Pydantic`)
- Provider/credential names (`AZURE_OPENAI_*`, `MOMENTMARKT_LLM_PROVIDER`, environment variable names, `.env`)
- Phase or roadmap labels (`v2`, `coming in #...`, `phase 3`, `placeholder for...`)
- Demo-truth-boundary explanations (`Real OCR runs on the menu`, `Google Maps + transaction data come from the demo fixtures`, `synthetic`, `simulated`)
- Internal session/state vocabulary (`onboarding session`, `merchant_id`, `session id`)

**Do this instead:**

- Speak in merchant outcomes ("We pulled your hours," "We'll show you when you're full," "Approve in one tap").
- Errors: tell the merchant what they can do, not what failed internally. Bad: "Couldn't reach the menu agent — check that AZURE_OPENAI_* env vars are set." Good: "Couldn't reach the menu assistant just now. Keep editing items directly — we'll save your changes either way."
- Loading states: short and human ("Reading your menu," "Saving…"), never narrating the pipeline architecture.
- If a feature is genuinely unimplemented and the user reaches it, write neutral forward copy ("Coming up next") rather than naming the issue or phase.

These rules apply to **every string in `apps/merchant/src/`** — TSX/JSX text, `aria-label`, `alt`, `placeholder`, `title`, toast messages, server-side strings rendered to the merchant. They also apply to backend strings that round-trip into merchant-visible UI (e.g., agent reply text, HTTP error `detail` fields shown in toasts).

If you're tempted to write internals into a label "for clarity," you don't have the right label yet — keep iterating until the label says what it does in merchant terms.

## Coordination Rules

- Before editing implementation files, claim or create a GitHub issue in `momentmarkt/momentmarkt` and comment that you are taking it.
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
2. Pick one open GitHub issue from `https://github.com/momentmarkt/momentmarkt/issues`.
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
5. Phase 2: live LLM generation through Pydantic AI / Azure OpenAI (`gpt-5.5`, provider dispatched via `MOMENTMARKT_LLM_PROVIDER=azure`).
6. Phase 3: signals, surfacing score, high-intent toggle, merchant inbox, redeem loop.
7. Phase 4: Zurich config swap only if core demo is stable.
8. Phase 5/6: architecture slide, videos, README, Devpost.

## Demo Truth Boundary

- Demo surface: in-app card. Production story: push notification server via Expo Push/FCM/APNs.
- Demo SLM: server-side or simulated. Production story: on-device Phi-3/Gemma.
- Demo Payone: synthetic transaction-density JSON. Production story: real Payone/Sparkassen aggregated density.
- Demo LLM: Pydantic AI → Azure OpenAI (`gpt-5.5`) for offer drafting + headline rewrite, with fixture fallback. Production story: same Pydantic AI surface, swappable provider, paired with the on-device SLM extractor for `intent_token`.
- Privacy token visible in dev panel: `{intent_token, h3_cell_r8}`.

## Secrets And Safety

- Never commit `.env`, API keys, bearer tokens, Supabase service role keys, or local build caches.
- Treat pasted Supabase bearer/session tokens as exposed and do not reuse them.
- Prefer fixtures and deterministic fallbacks over fragile live dependencies for the 60-second demo.
