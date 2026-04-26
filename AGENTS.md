# AGENTS.md

Shared instructions for any coding agent working in this repo.

## Source Of Truth

Read these before work:

- `work/SPEC.md`
- `context/PARTNER_DISCUSSION.md`
- `context/HACKATHON.md`
- `CLAUDE.md`

## GitHub Issue Protocol

- Use GitHub issues in `momentmarkt/momentmarkt` as the work queue.
- Self-assign by commenting on the issue before editing: `Taking this on <machine/agent>`.
- Also assign the issue to your GitHub user when permissions allow.
- Keep changes scoped to the issue.
- During active implementation, commit and push each coherent update before starting another substantive change.
- If blocked, comment the blocker and move to a different unclaimed issue.
- Push completed work before closing an issue.
- Close issues only after the relevant commit is on `origin/main` or after the PR is merged.
- When closing, include the commit hash or PR link in the closing comment.

## Standard Loop

1. Sync: `git pull --rebase origin main`.
2. Claim: comment on the issue and assign it to yourself.
3. Build: change only files required by the issue.
4. Verify: run the smallest relevant validation command.
5. Commit: use a concise message describing the delivered unit; prefer small coherent commits over large batches.
6. Push immediately after each commit: `git pull --rebase origin main && git push origin main`.
7. Close: close the issue with the pushed commit hash.

## Architecture Direction

- Canonical consumer implementation: Expo React Native, not Next.js.
- Canonical GenUI approach: LLM emits validated JSON layout specs rendered through React Native primitives.
- Required fallback: one hand-authored offer and widget must stay recordable even if LLM/API work fails.
- Do not make the demo depend on real Payone, real push notifications, live on-device SLM, or real POS.

## File Hygiene

- Do not commit `node_modules`, `.next`, Expo caches, Python virtualenvs, or `.env` files.
- Keep fixture data small and deterministic.
- Prefer simple, demo-safe implementation over architecture-complete systems.
