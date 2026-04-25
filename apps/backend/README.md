# MomentMarkt Backend

FastAPI service for the demo-safe backend path:

- Loads fixture signals from `data/weather`, `data/events`, and `data/transactions`.
- Produces Opportunity Agent drafts in the locked `context/AGENT_IO.md` shape:
  `{ "offer": {...}, "widget_spec": {...} }`.
- Validates generated widget specs before returning them.
- Falls back to deterministic known-good JSON when LiteLLM or provider credentials are unavailable.

## Run

```bash
uv run --project apps/backend uvicorn momentmarkt_backend.main:app --reload
```

Open `http://127.0.0.1:8000/docs`.

## Validate

```bash
uv run --project apps/backend --extra dev pytest
```

## Optional LLM Path

The endpoint is fixture-first by default. To try live generation through LiteLLM,
install the optional extra and pass `use_llm: true`:

```bash
MOMENTMARKT_LLM_MODEL=azure/<deployment-name> \
uv run --project apps/backend --extra llm uvicorn momentmarkt_backend.main:app --reload
```

LiteLLM reads the usual provider variables, such as `AZURE_API_KEY`,
`AZURE_API_BASE`, and `AZURE_API_VERSION`. If anything fails, the service returns
a validated fallback and includes the fallback reason in `generation_log`.

Per the agent contract, high-intent signals are ignored by Opportunity
generation. Surfacing uses them later for thresholding and headline rewrites.
