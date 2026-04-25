"""
semantic_map.py — batched LLM-over-text utility for the explorer.

The explorer uses this to run a cheap OpenAI model over many text items
concurrently, with cost tracking. Prefer this over ad-hoc `for item in items:
client.chat.completions.create(...)` loops.

Env vars:
    OPENAI_API_KEY        required
    SEMANTIC_MAP_MODEL    default "gpt-4.1-nano" — override for different tiers
    PRICE_IN_PER_1M       default 0.10 — input token $/1M for cost estimate
    PRICE_OUT_PER_1M      default 0.40 — output token $/1M for cost estimate

Usage (library):

    from semantic_map import semantic_map
    import asyncio

    items = load_texts()  # list[str]
    prompt = "Classify the following text into one of: news, opinion, ad. " \\
             "Return JSON: {{category: string, confidence: number}}. Text: {item}"

    results, stats = asyncio.run(semantic_map(items[:500], prompt))
    print(stats)
    # results: list[{input, output, tokens_in, tokens_out}]

Usage (CLI):

    cat texts.txt | python scripts/semantic_map.py \\
        'Classify as positive|negative|neutral. JSON: {{sentiment: string}}. Text: {item}'

Design notes:
- Always requests JSON output (response_format=json_object). If you need prose,
  write a wrapper; prose-at-scale is usually the wrong move.
- Bounded concurrency via semaphore. Default 10; raise if rate limits permit.
- Failures per-item are caught and returned as {"error": "..."} so a single
  bad item doesn't kill the batch.
- Cost estimate uses env-configured prices; defaults target cheap-tier OpenAI
  models. Update PRICE_* if you switch tiers.
"""

import asyncio
import json
import os
import sys
import time
from typing import Any

try:
    from openai import AsyncOpenAI
except ImportError:
    sys.stderr.write("pip install openai\n")
    raise

MODEL = os.environ.get("SEMANTIC_MAP_MODEL", "gpt-4.1-nano")
PRICE_IN = float(os.environ.get("PRICE_IN_PER_1M", "0.10"))
PRICE_OUT = float(os.environ.get("PRICE_OUT_PER_1M", "0.40"))

_client = AsyncOpenAI()


async def _one(sem: asyncio.Semaphore, prompt_template: str, item: str, system: str) -> dict:
    async with sem:
        try:
            prompt = prompt_template.format(item=item)
            resp = await _client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content
            return {
                "input": item,
                "output": json.loads(content) if content else None,
                "tokens_in": resp.usage.prompt_tokens,
                "tokens_out": resp.usage.completion_tokens,
            }
        except Exception as e:
            return {"input": item, "output": None, "error": str(e), "tokens_in": 0, "tokens_out": 0}


async def semantic_map(
    items: list[Any],
    prompt_template: str,
    system: str = "Return strict JSON matching the schema the user describes.",
    concurrency: int = 10,
) -> tuple[list[dict], dict]:
    """Run the prompt template over every item concurrently.

    Args:
        items: texts (or other stringifiable items) to process.
        prompt_template: a format string with `{item}` where the item goes.
            Use doubled braces `{{` and `}}` for literal JSON examples.
        system: system message. Default nudges strict JSON.
        concurrency: max in-flight requests.

    Returns:
        (results, stats) where results is per-item and stats has totals.
    """
    sem = asyncio.Semaphore(concurrency)
    t0 = time.time()
    items = [str(it) for it in items]
    results = await asyncio.gather(*[_one(sem, prompt_template, it, system) for it in items])
    ti = sum(r["tokens_in"] for r in results)
    to = sum(r["tokens_out"] for r in results)
    errors = sum(1 for r in results if r.get("error"))
    stats = {
        "n": len(results),
        "errors": errors,
        "seconds": round(time.time() - t0, 2),
        "tokens_in": ti,
        "tokens_out": to,
        "cost_usd": round((ti * PRICE_IN + to * PRICE_OUT) / 1_000_000, 4),
        "model": MODEL,
    }
    return results, stats


def _cli() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("usage: echo 'text1\\ntext2' | python semantic_map.py '<prompt template with {item}>'\n")
        sys.exit(1)
    template = sys.argv[1]
    items = [line.strip() for line in sys.stdin if line.strip()]
    if not items:
        sys.stderr.write("no input items on stdin\n")
        sys.exit(1)
    results, stats = asyncio.run(semantic_map(items, template))
    print(json.dumps({"stats": stats, "results": results}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    _cli()
