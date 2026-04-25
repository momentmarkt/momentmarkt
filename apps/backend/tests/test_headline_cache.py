from __future__ import annotations

import asyncio

from momentmarkt_backend.opportunity_agent import generate_offer
from momentmarkt_backend.signals import build_signal_context
from momentmarkt_backend.storage import DemoStore
from momentmarkt_backend.surfacing_agent import evaluate_surface


def _run(coro):
    return asyncio.run(coro)


def test_headline_cache_survives_store_restart(tmp_path) -> None:
    db_path = tmp_path / "momentmarkt-cache.sqlite3"
    context = build_signal_context(city="berlin")

    first_store = DemoStore(str(db_path))
    generated = _run(generate_offer(context))
    first_store.upsert_offer(generated["persisted_offer"])
    first = _run(
        evaluate_surface(
            store=first_store,
            wrapped_user_context=context["wrapped_user_context"],
            user_id="mia",
            city_id="berlin",
            use_llm=False,
        )
    )
    assert first["fired"] is True
    assert first["cache_hit"] is False

    restarted_store = DemoStore(str(db_path))
    second = _run(
        evaluate_surface(
            store=restarted_store,
            wrapped_user_context=context["wrapped_user_context"],
            user_id="mia",
            city_id="berlin",
            use_llm=True,
        )
    )
    assert second["fired"] is True
    assert second["cache_hit"] is True
    assert second["headline_generated_by"] == "cache"
    assert second["headline_final"] == first["headline_final"]
    assert second["generation_log"] == []
