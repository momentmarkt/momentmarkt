from __future__ import annotations

import asyncio

from momentmarkt_backend.semantic_novelty import (
    _novelty_from_similarity,
    offer_text,
    semantic_novelty,
)


def _run(coro):
    return asyncio.run(coro)


def test_semantic_novelty_is_neutral_without_recent_surfaces() -> None:
    result = _run(semantic_novelty({"id": "offer-1"}, []))
    assert result.novelty == 1.0
    assert result.source == "no_recent_surfaces"


def test_semantic_novelty_is_neutral_when_provider_unconfigured(monkeypatch) -> None:
    monkeypatch.delenv("MOMENTMARKT_SEMANTIC_NOVELTY", raising=False)
    result = _run(
        semantic_novelty(
            {
                "merchant_name": "Cafe Bondi",
                "category": "cafe",
                "copy_seed": {"headline_de": "Heisser Kakao jetzt"},
            },
            [
                {
                    "offer_id": "old-offer",
                    "merchant_name": "Cafe Bondi",
                    "category": "cafe",
                    "headline_final": "Heisser Kakao jetzt",
                    "copy_seed": {"headline_de": "Heisser Kakao jetzt"},
                    "trigger_reason": {"demand_trigger": True},
                }
            ],
        )
    )

    assert result.novelty == 1.0
    assert result.source == "semantic_novelty_unconfigured"


def test_novelty_curve_downweights_only_high_similarity() -> None:
    assert _novelty_from_similarity(0.77) == 1.0
    assert _novelty_from_similarity(0.89) == 0.675
    assert _novelty_from_similarity(1.0) == 0.35


def test_offer_text_contains_copy_and_trigger_context() -> None:
    text = offer_text(
        {
            "merchant_name": "Cafe Bondi",
            "category": "cafe",
            "copy_seed": {
                "headline_de": "Es regnet bald",
                "headline_en": "Rain is coming",
                "body_de": "80 m entfernt",
                "body_en": "80 m away",
            },
            "trigger_reason": {"weather_trigger": "rain_incoming"},
        }
    )

    assert "Cafe Bondi" in text
    assert "Es regnet bald" in text
    assert "rain_incoming" in text
