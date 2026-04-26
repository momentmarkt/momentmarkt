"""Stress tests for the Opportunity Agent fallback path.

The fallback is what runs in the recorded demo when MOMENTMARKT_LLM_MODEL is
unset (or the LLM call fails). It must produce a renderable widget for every
merchant the demo could touch and must respect the AGENT_IO contract: the
Opportunity Agent ignores high-intent signals — Surfacing handles those.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from momentmarkt_backend.genui import validate_widget_node
from momentmarkt_backend.opportunity_agent import (
    fallback_draft,
    generate_offer,
)
from momentmarkt_backend.signals import build_signal_context


CANONICAL_BERLIN_MERCHANTS = [
    "berlin-mitte-cafe-bondi",
    "berlin-mitte-baeckerei-rosenthal",
    "berlin-mitte-kiezbuchhandlung-august",
    "berlin-mitte-eisgarten-weinmeister",
]


def _run(coro):
    return asyncio.run(coro)


class TestFallbackDraftPerMerchant:
    @pytest.mark.parametrize("merchant_id", CANONICAL_BERLIN_MERCHANTS)
    def test_draft_widget_validates(self, merchant_id: str) -> None:
        ctx = build_signal_context(city="berlin", merchant_id=merchant_id)
        draft = fallback_draft(ctx)
        assert validate_widget_node(draft["widget_spec"]) is True

    @pytest.mark.parametrize("merchant_id", CANONICAL_BERLIN_MERCHANTS)
    def test_offer_respects_per_merchant_max_discount(self, merchant_id: str) -> None:
        ctx = build_signal_context(city="berlin", merchant_id=merchant_id)
        draft = fallback_draft(ctx)
        max_pct = ctx["merchant"]["offer_budget"]["max_discount_percent"]
        assert draft["offer"]["discount_value"] <= max_pct

    @pytest.mark.parametrize("merchant_id", CANONICAL_BERLIN_MERCHANTS)
    def test_offer_carries_bilingual_copy(self, merchant_id: str) -> None:
        ctx = build_signal_context(city="berlin", merchant_id=merchant_id)
        draft = fallback_draft(ctx)
        copy = draft["offer"]["copy_seed"]
        for key in ("headline_de", "headline_en", "body_de", "body_en"):
            assert isinstance(copy[key], str) and copy[key].strip()


class TestGenerateOfferContract:
    def test_fallback_path_marks_used_fallback_when_llm_disabled(self) -> None:
        ctx = build_signal_context(city="berlin")
        result = _run(generate_offer(ctx, use_llm=False))
        assert result["generated_by"] == "fixture"
        assert result["widget_valid"] is True
        assert result["used_fallback"] is True
        assert "deterministic_fixture_offer" in result["generation_log"]

    def test_high_intent_does_not_alter_offer_or_widget(self) -> None:
        ctx = build_signal_context(city="berlin")
        plain = _run(generate_offer(ctx, high_intent=False, use_llm=False))
        boosted = _run(generate_offer(ctx, high_intent=True, use_llm=False))
        # The Opportunity Agent must not couple to high-intent — that's the
        # Surfacing Agent's job per AGENT_IO. If this assertion ever flips,
        # the demo has lost its agent split.
        assert plain["offer"] == boosted["offer"]
        assert plain["widget_spec"] == boosted["widget_spec"]
        assert (
            "high_intent_ignored_by_opportunity_agent"
            in boosted["generation_log"]
        )

    def test_persisted_offer_status_reflects_autopilot_rule(self) -> None:
        ctx = build_signal_context(city="berlin")
        result = _run(generate_offer(ctx, use_llm=False))
        assert result["persisted_offer"]["status"] == "auto_approved"
        assert result["persisted_offer"]["merchant_id"] == "berlin-mitte-cafe-bondi"

    def test_persisted_offer_pending_when_rule_not_approved(self) -> None:
        ctx = build_signal_context(
            city="berlin", merchant_id="berlin-mitte-baeckerei-rosenthal"
        )
        result = _run(generate_offer(ctx, use_llm=False))
        assert result["persisted_offer"]["status"] == "pending_approval"

    def test_persisted_offer_records_all_three_trigger_dimensions(self) -> None:
        ctx = build_signal_context(city="berlin")
        result = _run(generate_offer(ctx, use_llm=False))
        triggers = result["persisted_offer"]["trigger_reason"]
        assert set(triggers) == {
            "weather_trigger",
            "event_trigger",
            "demand_trigger",
        }
        assert triggers["weather_trigger"] == "rain_incoming"
        assert triggers["event_trigger"] is False
        assert triggers["demand_trigger"] is True

    def test_non_matching_weather_rule_does_not_persist_weather_trigger(self) -> None:
        ctx = build_signal_context(
            city="berlin", merchant_id="berlin-mitte-baeckerei-rosenthal"
        )
        result = _run(generate_offer(ctx, use_llm=False))
        triggers = result["persisted_offer"]["trigger_reason"]
        assert triggers["weather_trigger"] is None
        assert triggers["event_trigger"] is False
        assert triggers["demand_trigger"] is False

    def test_widget_spec_in_persisted_offer_matches_top_level(self) -> None:
        ctx = build_signal_context(city="berlin")
        result = _run(generate_offer(ctx, use_llm=False))
        # The merchant inbox + consumer view both read the persisted offer's
        # widget_spec; it must be exactly what's surfaced at the top level.
        assert result["persisted_offer"]["widget_spec"] == result["widget_spec"]

    def test_use_llm_without_model_env_falls_back(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # If a teammate flips ?use_llm=true on stage but Azure is wedged, the
        # demo must still render. The generation_log should record the failure.
        monkeypatch.delenv("MOMENTMARKT_LLM_MODEL", raising=False)
        ctx = build_signal_context(city="berlin")
        result = _run(generate_offer(ctx, use_llm=True))
        assert result["generated_by"] == "fixture"
        assert result["widget_valid"] is True
        assert any(
            "pydantic_ai_generation_failed" in entry
            for entry in result["generation_log"]
        )


class TestMerchantEnrichmentAttach:
    """Issue #165 — merchant enrichment must thread into the LLM prompt."""

    def test_attach_returns_context_with_enrichment_when_present(self) -> None:
        from momentmarkt_backend.merchant_enrichment import get_enrichment, reset_cache
        from momentmarkt_backend.opportunity_agent import _attach_merchant_enrichment

        reset_cache()
        ctx = build_signal_context(
            city="berlin", merchant_id="berlin-mitte-cafe-bondi"
        )
        attached = _attach_merchant_enrichment(ctx)
        # Don't break — falls back to bare context if enrichment missing.
        if get_enrichment("berlin", "berlin-mitte-cafe-bondi") is None:
            assert attached is ctx
            return
        assert "merchant_enrichment" in attached
        assert attached["merchant_enrichment"]["id"] == "berlin-mitte-cafe-bondi"
        assert isinstance(attached["merchant_enrichment"]["signature_items"], list)
        # Original context untouched (shallow copy semantics).
        assert "merchant_enrichment" not in ctx

    def test_attach_passes_through_when_enrichment_missing(self) -> None:
        from momentmarkt_backend.opportunity_agent import _attach_merchant_enrichment

        # Synthetic context with an unknown merchant id — must not raise and
        # must not invent a key.
        ctx = {
            "city_id": "berlin",
            "merchant": {"id": "nonexistent-merchant-id-xyz"},
        }
        out = _attach_merchant_enrichment(ctx)
        assert "merchant_enrichment" not in out


class TestZurichOpportunityFallback:
    def test_zurich_draft_validates_and_uses_clear_weather_mood(self) -> None:
        ctx = build_signal_context(city="zurich")
        result = _run(generate_offer(ctx, use_llm=False))
        assert result["widget_valid"] is True
        # mood_image_key encodes weather: forced "clear" → "clear.<cat>.<temp>"
        mood = result["offer"]["mood_image_key"]
        assert mood.startswith("clear."), mood
