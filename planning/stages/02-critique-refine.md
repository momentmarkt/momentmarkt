# Stage 02: CRITIQUE + REFINE

## Enter when

- `work/SPEC.md` exists and has not yet been critiqued for its current version

## Flow

```
invoke critic    # writes work/CRITIQUE.md, optionally work/EXPLORATION_REQUEST.md

if EXPLORATION_REQUEST.md exists:
    return to stage 00 (the ideator will consume and delete it)
    on return to stage 02, re-invoke critic with updated DATA_PROFILE.md
    (the critic may produce a different critique this round)

version current SPEC.md to work/history/
invoke planner   # writes new work/SPEC.md, using CRITIQUE.md as mandatory input
```

## Rules

- **Iteration cap: 3 refine cycles.** After the third refine, force exit to
  stage 03 regardless of critique severity. If blockers remain, the judge will
  say NO and you'll come back — but the cap prevents infinite polish loops.
- **Exploration re-entry is optional, not required.** The critic decides. If
  `EXPLORATION_REQUEST.md` is not written, no data work happens.
- **After re-exploration, re-critique before refining.** The new profile may
  resolve the issue on its own; don't assume refinement is still needed.
- **Version before overwriting.** Every `SPEC.md` overwrite moves the current
  version to `work/history/spec-v<NN>.md` first. Same for `CRITIQUE.md`.

## Exit to

Stage 03 (judge) — either when critic says "Routed back to exploration: no" AND
a refine has happened, OR when the iteration cap trips.

## Invocation sketch (subagents)

Spawn a **critic** subagent with this prompt:

```
Run the role defined in roles/critic.md. Read that file first and follow
its instructions exactly.

Inputs (Read tool):
- context/HACKATHON.md
- work/SPEC.md
- work/DATA_PROFILE.md
- work/explore/

Outputs (Write tool):
- work/CRITIQUE.md
- work/EXPLORATION_REQUEST.md  (only if the critic decides to route back)

Stop after writing.
```

Then version the prior spec and spawn a refinement **planner** subagent:

```bash
mkdir -p work/history
mv work/SPEC.md work/history/spec-v<NN>.md
```

Subagent prompt:

```
Run the role defined in roles/planner.md in refinement mode. Read that file
first and follow its instructions exactly — every CRITIQUE bullet is a
mandatory change request.

Inputs (Read tool):
- context/HACKATHON.md
- context/IDEA_SEED.md
- work/DATA_PROFILE.md
- work/history/spec-v<NN>.md
- work/CRITIQUE.md

Output (Write tool):
- work/SPEC.md   (wholly replaces; do not append)

Stop after writing.
```
