# ARTIFACTS

Single source of truth for who writes and reads what. If a role seems to want
to write something not listed here, it's wrong; fix the role file, not the
artifact.

## Static context (you fill in; agents read, don't modify)

| Path | Purpose |
|---|---|
| `context/HACKATHON.md` | Rules, tracks, judging criteria, sponsor stack, timeline |
| `context/IDEA_SEED.md` | Your pitch, rough |
| `context/DATASET.md` | Where the data is, format, access notes |

## Work artifacts

| Path | Writer | Readers | Cap |
|---|---|---|---|
| `work/EXPLORATION_QUEUE.md` | questioner | explorer, profiler, orchestrator | 5 items/batch |
| `work/explore/NN-<slug>.md` | explorer | ideator, planner, critic | 1 screen each |
| `work/DATA_PROFILE.md` | profiler | questioner, planner, critic, packager, judge | 90 lines |
| `work/SPEC.md` | planner | critic, packager, judge | 100 lines |
| `work/CRITIQUE.md` | critic | questioner, planner, judge | 20 bullets |
| `work/SUBMISSION.md` | packager | judge, orchestrator | Form-ready draft |
| `work/JUDGE.md` | judge | orchestrator | 8 lines |
| `work/BUDGET.md` | orchestrator | orchestrator | append-only log |

## Versioning

Before overwriting any file in `work/`, move the current version to
`work/history/<name>-v<NN>.md`. History is out of context for all agents
except on explicit request.

Every top-level artifact in `work/` starts with metadata:

```markdown
ARTIFACT_ID: <name>-v<NN>
ARTIFACT_TYPE: <queue|profile|spec|critique|submission|judge>
PARENT_IDS: <comma-separated artifact ids, or none>
STATUS: <draft|ready|blocked>
```

The orchestrator uses these headers to decide whether an artifact is current.
Do not infer currency from modification time alone.

## What nothing writes

- No agent writes to `context/`
- No agent writes to `ORCHESTRATOR.md`, `ARTIFACTS.md`, or anything in `roles/`
  or `stages/`
- No agent writes to another agent's output file
- No agent deletes or moves another agent's artifact; the orchestrator does all
  versioning and cleanup.
