# MomentMarkt Backend

FastAPI service for the demo-safe backend path:

- Loads fixture signals from `data/weather`, `data/events`, and `data/transactions`.
- Produces Opportunity Agent drafts in the locked `context/AGENT_IO.md` shape:
  `{ "offer": {...}, "widget_spec": {...} }`.
- Validates generated widget specs before returning them.
- Persists drafted offers, inbox events, surfacing events, headline cache entries,
  and simulated redemptions to SQLite.
- Evaluates the Surfacing Agent with deterministic scoring, silence thresholds,
  high-intent boost, and top-1 selection.
- Falls back to deterministic known-good JSON when LiteLLM or provider credentials are unavailable.

## Run

```bash
uv run --project apps/backend uvicorn momentmarkt_backend.main:app --reload
```

Open `http://127.0.0.1:8000/docs`.

Key endpoints:

- `POST /opportunity/generate` drafts and persists an Opportunity Agent offer.
- `POST /surfacing/evaluate` evaluates the top approved offer for a wrapped user context.
- `POST /redeem` records a simulated checkout and decrements merchant budget.
- `GET /merchants/{merchant_id}/summary` returns offer counters and budget state.

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
