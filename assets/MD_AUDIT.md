# MD audit (autodone 2026-04-25)

> Survey of every `.md` file in the repo. Quality and Necessity are 1-5
> (5 = load-bearing). Action column was applied where safe; ambiguous
> calls are flagged for human review at the bottom.
>
> Hard-rule "do not touch" set (per audit brief): `CLAUDE.md`, `AGENTS.md`,
> `README.md`, `LICENSE`, `work/SPEC.md`, `work/SUBMISSION.md`,
> everything in `context/`, `assets/architecture-slide.md`,
> `assets/architecture-diagrams.md`, `assets/COVER_RENDER.md`,
> `assets/LOGO_RENDER.md`, `assets/cover.html`, `assets/demo-day/*`.
> These were audited but not modified.

## Summary

- **Total files audited:** 44 (`.md` under repo root, excluding
  `node_modules`, `.git`, `.venv`, `.expo`).
- **Auto-deleted / merged:** 0. Everything tracked is either load-bearing
  for submission or referenced by another tracked doc; no obvious dead
  weight that's safe to delete unilaterally.
- **Mermaidified:** 3 sections across 3 files (backend request flow,
  orchestrator stage loop, stage 00 explore loop).
- **Flagged for human review:** 4 (planning-workflow scaffolding;
  README's "Planning Workflow" section; `spec-v03` reference in README;
  pytest-cache `README.md` files on disk).

## Inventory

| Path | Lines | Last commit | Quality | Necessity | Action | Notes |
|------|------:|-------------|--------:|----------:|--------|-------|
| `CLAUDE.md` | 65 | 874248b 2026-04-25 | 5 | 5 | KEEP (locked) | Authoritative product/coordination policy. |
| `AGENTS.md` | 47 | 0822498 2026-04-25 | 5 | 5 | KEEP (locked) | Dup of CLAUDE.md issue protocol but shorter; both are referenced by name in agent prompts. |
| `README.md` | 227 | a523f11 2026-04-26 | 4 | 5 | KEEP (locked) | Public face. Contains stale "Planning Workflow" section (L171-228) and a `spec-v03` reference on L51 — see human-review. |
| `ARTIFACTS.md` | 53 | c6552c8 2026-04-25 | 4 | 3 | KEEP | Planning-workflow scaffolding; cited by `ORCHESTRATOR.md` and 6 role files. Pre-build reference. |
| `ORCHESTRATOR.md` | 83 | c6552c8 2026-04-25 | 4 | 3 | MERMAIDIFY-section | Added a stage-decision flowchart inline. Loop prose retained. |
| `examples/README.md` | 169 | c6552c8 2026-04-25 | 3 | 2 | KEEP (recommend cleanup) | Subagent invocation cookbook from planning phase. Useful only if someone re-runs the pipeline. |
| `apps/backend/README.md` | 80 | b169293 2026-04-25 | 4 | 4 | MERMAIDIFY-section | Added request-flow Mermaid showing fixture-first / LLM-opt-in / fallback edges. |
| `assets/architecture-diagrams.md` | 156 | 7e2edfe 2026-04-25 | 5 | 5 | KEEP (locked) | Reference-tone for all other Mermaid additions. |
| `assets/architecture-slide.md` | 197 | 2685fc1 2026-04-25 | 5 | 5 | KEEP (locked) | Slide source. ASCII diagrams could become Mermaid but the file is locked. |
| `assets/COVER_RENDER.md` | 64 | 812c13d 2026-04-25 | 4 | 4 | KEEP (locked) | Render recipe for cover.html. Pure reference. |
| `assets/LOGO_RENDER.md` | 113 | df70911 2026-04-26 | 4 | 4 | KEEP (locked) | SVG → PNG render recipes. Pure reference. |
| `assets/demo-day/runthrough.md` | 238 | b5215bc 2026-04-25 | 5 | 5 | KEEP (locked) | Beat-by-beat recording script. Long but high-signal; would benefit from a Mermaid timeline but file is locked. |
| `assets/demo-day/recovery.md` | 135 | b5215bc 2026-04-25 | 5 | 5 | KEEP (locked) | Per-failure-mode workaround sheet. High-signal. |
| `assets/outreach/dsv-tim-heuschele.md` | 78 | 37dc18d 2026-04-25 | 5 | 4 | KEEP | Post-submission outreach email + variants. Prose by design (audit brief: don't mermaidify). |
| `context/AGENT_IO.md` | 171 | 9c010df 2026-04-25 | 5 | 5 | KEEP (locked) | Agent I/O contract. Excellent candidate for two Mermaid diagrams (privacy boundary + scoring) but `context/` is locked. |
| `context/DATASET.md` | 84 | c6552c8 2026-04-25 | 4 | 3 | KEEP (locked) | Pre-staged dataset inventory. Reference-tone, no mermaid help. |
| `context/FUTURE.md` | 51 | f4af5d8 2026-04-25 | 3 | 3 | KEEP (locked) | Lock-in record overriding THOUGHTS §13. |
| `context/HACKATHON.md` | 113 | 57432bd 2026-04-25 | 5 | 5 | KEEP (locked) | Devpost field list + judging criteria — referenced everywhere. |
| `context/IDEA_SEED.md` | 58 | f4af5d8 2026-04-25 | 4 | 3 | KEEP (locked) | Original pitch seed; superseded by SPEC but useful for narrative origin. |
| `context/PARTNER_DISCUSSION.md` | 65 | 57432bd 2026-04-25 | 5 | 5 | KEEP (locked) | Partner sync that drove spec-v03 → spec-v04 changes. CLAUDE.md cites as "partner override context." |
| `context/THOUGHTS.md` | 432 | bc80936 2026-04-25 | 3 | 3 | KEEP (locked) | Earliest synthesis. Self-flagged at top: "some early framing has been overridden." Long, partly stale, but cited as Q&A vocabulary source. Would benefit from heavy mermaidification (§4 architecture, §6 Opportunity flow, §7 Surfacing flow, §8 Mia demo) but file is locked. |
| `data/README.md` | 114 | c6552c8 2026-04-25 | 4 | 4 | KEEP | Refresh recipes for the staged datasets. Pure reference (audit brief: don't mermaidify). |
| `data/fsq/FETCH_LATER.md` | 49 | c6552c8 2026-04-25 | 4 | 3 | KEEP | Foursquare gated-fetch recipe. Pure reference. |
| `roles/critic.md` | 100 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Planning-pipeline role spec. Used during stages 02; not needed post-build. |
| `roles/explorer.md` | 99 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Same. |
| `roles/judge.md` | 41 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Same. |
| `roles/packager.md` | 97 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Same. |
| `roles/planner.md` | 87 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Same. |
| `roles/profiler.md` | 65 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Same. |
| `roles/questioner.md` | 62 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Same. |
| `stages/00-explore.md` | 86 | c6552c8 2026-04-25 | 4 | 2 | MERMAIDIFY-section | Added explore-loop Mermaid alongside the pseudocode block. |
| `stages/01-plan.md` | 43 | c6552c8 2026-04-25 | 4 | 2 | KEEP | One-shot stage; pseudocode is a single line, no mermaid help. |
| `stages/02-critique-refine.md` | 84 | c6552c8 2026-04-25 | 4 | 2 | KEEP (recommend cleanup) | Already-pseudocoded loop; mermaid would add little. |
| `stages/03-judge.md` | 47 | c6552c8 2026-04-25 | 4 | 2 | KEEP | Terminal one-shot; same. |
| `work/BUDGET.md` | 42 | 57112f6 2026-04-25 | 4 | 3 | KEEP | Append-only orchestrator log of the planning pipeline. Historical record of how spec got from v01 → v04. |
| `work/EXPLORATION_QUEUE.md` | 34 | 57432bd 2026-04-25 | 3 | 2 | KEEP (recommend cleanup) | Pre-build exploration questions. None executed; pipeline jumped straight to plan-r1 per BUDGET.md. |
| `work/README.md` | 9 | c6552c8 2026-04-25 | 3 | 2 | KEEP | One-paragraph orientation for `work/` subdirs. |
| `work/SPEC.md` | 82 | 030a3ef 2026-04-25 | 5 | 5 | KEEP (locked) | Canonical `spec-v04`. "The demo" and "Build order" sections are dense prose but already covered by the architecture-diagrams.md sequence diagram. |
| `work/SUBMISSION.md` | 158 | 2685fc1 2026-04-25 | 5 | 5 | KEEP (locked) | Devpost field drafts. Prose by design (Devpost = prose). |
| `work/SUBMISSION_CHECKLIST.md` | 85 | a361774 2026-04-25 | 4 | 4 | KEEP | Live submission checklist, partly checked. |
| `work/history/critique-v01.md` | 21 | 57432bd 2026-04-25 | 3 | 2 | KEEP | Versioned critique snapshot. Per ARTIFACTS.md spec, history is preserved. |
| `work/history/spec-v01.md` | 70 | 57432bd 2026-04-25 | 3 | 2 | KEEP | Versioned spec. |
| `work/history/spec-v02.md` | 76 | 57432bd 2026-04-25 | 3 | 2 | KEEP | Versioned spec. |
| `work/history/submission-v01.md` | 142 | 57432bd 2026-04-25 | 3 | 2 | KEEP | Versioned submission draft. |
| `.pytest_cache/README.md` | 9 | (untracked) | 1 | 1 | (NOT IN GIT) | Pytest auto-generated; already covered by `__pycache__/` ignore but `.pytest_cache/` itself is not in `.gitignore`. See human-review. |
| `apps/backend/.pytest_cache/README.md` | 9 | (untracked) | 1 | 1 | (NOT IN GIT) | Same. |

## Auto-cleanups applied

- **Deleted:** none. Every tracked `.md` file is either in the locked
  set, referenced by at least one other tracked doc, or is a versioned
  history snapshot per `ARTIFACTS.md`. Conservative call: nothing meets
  the brief's deletion bar ("referenced by NOTHING + obviously dead").
- **Merged:** none, same reason.
- **Mermaidified:**
  - `apps/backend/README.md` § "Request flow" — fixture-first vs.
    LLM-opt-in flow with fallback edges.
  - `ORCHESTRATOR.md` § "Your loop" — stage-decision flowchart matching
    the inspect-`work/` step list.
  - `stages/00-explore.md` § "Flow" — ideator → parallel explorers →
    ideator loop with budget/empty-queue exits.

In all three cases the existing prose / pseudocode block was kept and
the Mermaid block was added alongside, per the brief's "don't replace
text wholesale" rule.

## Recommendations needing human review

These are deliberate non-actions; the bar to act on them is "human says
yes."

1. **Planning-workflow scaffolding is dormant.** The `roles/`,
   `stages/`, `examples/README.md`, `ORCHESTRATOR.md`, `ARTIFACTS.md`,
   `work/EXPLORATION_QUEUE.md`, and `work/BUDGET.md` files describe a
   planning pipeline that completed at `spec-v04` and is not used by the
   build. They are referenced only by each other and by README's
   "Planning Workflow" section. **Options:** (a) leave as-is —
   process documentation has historical value; (b) move under a
   `work/planning-pipeline/` subdir to clearly mark them as pre-build
   scaffolding; (c) delete after submission. None of these are
   safe-by-default mid-hackathon, so flagging.

2. **README "Planning Workflow" section (L171-228) reads as
   active-direction.** It describes an agent pipeline that is finished
   and not used to build the product. For a public Devpost-linked
   README, this is mildly confusing — a casual reader might think
   they're meant to use this scaffolding. README is in the locked set
   so I did not edit it. **Recommendation:** trim or move under a
   collapsible `<details>` block so the run/architecture sections lead.

3. **`README.md` L51 references `spec-v03`** ("the older untracked
   Next.js scaffold under `src/` is obsolete per `spec-v03`") but the
   canonical spec is now `spec-v04`. Trivial staleness; would normally
   fix in this pass but README is locked. **Recommendation:** change
   "per `spec-v03`" → "per `spec-v04`" in a follow-up.

4. **`.pytest_cache/README.md` exists at repo root and under
   `apps/backend/`.** Both are auto-generated by pytest and are NOT
   tracked in git (verified with `git ls-files`). However,
   `.pytest_cache/` is not in `.gitignore` (only `__pycache__/` and
   `.venv/` are). If a teammate runs `git add -A` from a fresh checkout
   after running tests, these would land in the repo. **Recommendation:**
   add `.pytest_cache/` to `.gitignore`. Out of scope for this audit
   commit (gitignore edit, not a doc edit).

## "This file is shit" findings worth surfacing

- **`context/THOUGHTS.md`** (432 lines) is the longest file in the repo
  by far and self-flags at the top that "some early framing has been
  overridden." It still holds the best Why-DSV / Why-Payone Q&A
  vocabulary, so it's not deletable, but its §4 (Architecture), §6
  (Opportunity Agent flow), §7 (Surfacing Agent flow), §8 (Mia demo)
  read like step-lists begging to become Mermaid sequence/flowcharts.
  Locked from this audit; **strong candidate for a follow-up
  mermaidification pass post-submission.**

- **`work/BUDGET.md`** is a chatty append-only log including some
  cancelled-agent breadcrumbs (e.g. "stage=00 q-r1 (codex,
  claude-opus-4-7[1m] meta error) → fail:1, no output"). Useful as a
  forensic record of how the plan converged; not useful as a doc anyone
  reads twice. Fine to leave; flagging only because Quality is rated
  generously here.

- **`examples/README.md`** has 6h-old subagent-prompt cookbook content
  that would only ever be re-used if someone re-ran the planning loop.
  Keep, but it's the lowest-leverage 169 lines in the repo.

## See also

- `assets/architecture-diagrams.md` — reference Mermaid file used as
  the tone/legend template for the new diagrams.
- `ARTIFACTS.md` — declares which files are written by which roles;
  the basis for "no agent writes to another agent's file" hygiene.
- Tracking issue: https://github.com/mmtftr/momentmarkt/issues/47
