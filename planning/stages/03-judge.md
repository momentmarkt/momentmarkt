# Stage 03: JUDGE

## Enter when

- Stage 02 has exited (either clean or by iteration cap)

## Flow

```
invoke judge     # writes work/JUDGE.md
```

One invocation. Terminal.

## Rules

- **If VERDICT: YES** — terminate. The planning phase is done. Start building.
- **If VERDICT: NO** — return to stage 02 for one more refine cycle, UNLESS
  the stage 02 iteration cap has already been hit, in which case:
  - print the verdict + reason to the user
  - surface the top `[blocker]` bullets
  - ask the user whether to continue refining or ship with known issues
  - this is the only point where you ask the user a blocking question

## Exit to

Done, or stage 02 (one more cycle), or user decision.

## Invocation sketch (subagent)

Spawn one **judge** subagent with this prompt:

```
Run the role defined in roles/judge.md. Read that file first and follow
its instructions exactly.

Inputs (Read tool):
- context/HACKATHON.md
- work/SPEC.md
- work/CRITIQUE.md
- work/SUBMISSION.md

Output (Write tool):
- work/JUDGE.md

Stop after writing. Do not propose fixes.
```
