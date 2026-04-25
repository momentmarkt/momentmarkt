# Stage 01: PLAN

## Enter when

- `work/DATA_PROFILE.md` exists and is non-empty
- `work/SPEC.md` does not exist

## Flow

```
invoke planner   # writes work/SPEC.md from scratch
```

One invocation. No loop here — critique/refine is stage 02.

## Rules

- **No refinement in this stage.** Planner produces v1 cold. Critique comes next.
- **If DATA_PROFILE.md says most sections are `_pending_`, return to stage 00** —
  planning without a profile will hallucinate.

## Exit to

Stage 02 (critique + refine).

## Invocation sketch (subagent)

Spawn one **planner** subagent with this prompt:

```
Run the role defined in roles/planner.md. Read that file first and follow
its instructions exactly.

Inputs (Read tool):
- context/HACKATHON.md
- context/IDEA_SEED.md
- work/DATA_PROFILE.md

Output (Write tool):
- work/SPEC.md

Stop after writing.
```
