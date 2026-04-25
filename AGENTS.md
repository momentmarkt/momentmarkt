# AGENTS.md

Shared instructions for any coding agent working in this repo.

## Source Of Truth

Read these before work:

- `work/SPEC.md`
- `context/PARTNER_DISCUSSION.md`
- `context/HACKATHON.md`
- `CLAUDE.md`

## GitHub Issue Protocol

- Use GitHub issues in `mmtftr/momentmarkt` as the work queue.
- Self-assign by commenting on the issue before editing: `Taking this on <machine/agent>`.
- Keep changes scoped to the issue.
- If blocked, comment the blocker and move to a different unclaimed issue.

## Architecture Direction

- Canonical consumer implementation: Expo React Native, not Next.js.
- Canonical GenUI approach: LLM emits validated JSON layout specs rendered through React Native primitives.
- Required fallback: one hand-authored offer and widget must stay recordable even if LLM/API work fails.
- Do not make the demo depend on real Payone, real push notifications, live on-device SLM, or real POS.

## File Hygiene

- Do not commit `node_modules`, `.next`, Expo caches, Python virtualenvs, or `.env` files.
- Keep fixture data small and deterministic.
- Prefer simple, demo-safe implementation over architecture-complete systems.
