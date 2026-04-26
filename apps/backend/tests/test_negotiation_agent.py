"""Tests for `negotiation_agent.py` (issue #142, sub-feature of #138).

Covers:
  * Cold start (empty history) returns a discount within
    ``[floor, ceiling]`` AND lands at the documented cold-start band
    fraction.
  * Right-swipe history biases the next offer toward the smaller
    discount the user accepted (never below floor).
  * Left-swipe history biases the next offer upward, with long-dwell =
    gentle escalation and short-dwell = hard escalation. Never exceeds
    ceiling.
  * Bounds-honoring contract: even with extreme/adversarial history,
    output ``discount_pct`` is always inside the merchant's bounds.
    This is the durable contract that protects DESIGN_PRINCIPLES'd
    "no paid placement / no silent over-discounting" invariants.
  * LLM-mode falls back to the heuristic on a simulated LLM failure
    (mocked dispatch raises).
  * The reasoning string is non-empty (audit log requirement).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from momentmarkt_backend.negotiation_agent import (
    MerchantBounds,
    NegotiatedOffer,
    NegotiationContext,
    SwipeReaction,
    _clamp_offer,
    _heuristic_negotiate,
    negotiate_offer,
)


def _bounds(
    floor: float = 5.0,
    ceiling: float = 25.0,
    *,
    brand_tone: str | None = None,
) -> MerchantBounds:
    return MerchantBounds(
        merchant_id="berlin-mitte-cafe-bondi",
        discount_floor_pct=floor,
        discount_ceiling_pct=ceiling,
        allowed_categories=["cafe"],
        brand_tone=brand_tone,
    )


# ---------------------------------------------------------------------------
# Cold start
# ---------------------------------------------------------------------------


def test_cold_start_lands_inside_band() -> None:
    bounds = _bounds(floor=5.0, ceiling=25.0)
    offer = negotiate_offer(NegotiationContext(bounds=bounds))
    assert bounds.discount_floor_pct <= offer.discount_pct <= bounds.discount_ceiling_pct
    # Documented cold-start fraction: floor + 20% of band = 5 + 4 = 9.
    assert offer.discount_pct == pytest.approx(9.0)
    assert offer.headline
    assert offer.reasoning


def test_cold_start_collapsed_band_returns_floor_eq_ceiling() -> None:
    """If the merchant authored floor == ceiling, every round must
    return that exact value. Edge case for the bounds-honoring contract."""
    bounds = _bounds(floor=12.0, ceiling=12.0)
    offer = negotiate_offer(NegotiationContext(bounds=bounds))
    assert offer.discount_pct == pytest.approx(12.0)


# ---------------------------------------------------------------------------
# Right-swipe biases downward
# ---------------------------------------------------------------------------


def test_right_swipe_biases_toward_floor() -> None:
    bounds = _bounds(floor=5.0, ceiling=25.0)
    history = [
        SwipeReaction(
            discount_pct_offered=15.0, dwell_ms=2000, swiped_right=True
        )
    ]
    offer = negotiate_offer(NegotiationContext(bounds=bounds, history=history))
    # User accepted 15% — next offer should be smaller (closer to floor).
    assert offer.discount_pct < 15.0
    assert offer.discount_pct >= bounds.discount_floor_pct


def test_repeated_right_swipes_never_dip_below_floor() -> None:
    """Adversarial: 20 consecutive right-swipes. Output must clamp at
    floor, not go negative or below the merchant's tolerance."""
    bounds = _bounds(floor=5.0, ceiling=25.0)
    discount = 20.0
    for _ in range(20):
        offer = negotiate_offer(
            NegotiationContext(
                bounds=bounds,
                history=[
                    SwipeReaction(
                        discount_pct_offered=discount,
                        dwell_ms=2000,
                        swiped_right=True,
                    )
                ],
            )
        )
        assert offer.discount_pct >= bounds.discount_floor_pct
        discount = offer.discount_pct


# ---------------------------------------------------------------------------
# Left-swipe biases upward
# ---------------------------------------------------------------------------


def test_left_swipe_long_dwell_escalates_gently() -> None:
    bounds = _bounds(floor=5.0, ceiling=25.0)
    history = [
        SwipeReaction(
            discount_pct_offered=10.0, dwell_ms=1500, swiped_right=False
        )
    ]
    offer = negotiate_offer(NegotiationContext(bounds=bounds, history=history))
    # Dwell >= 1200ms → gentle escalation (10% of band = 2pp).
    assert offer.discount_pct > 10.0
    assert offer.discount_pct <= bounds.discount_ceiling_pct
    # Gentle step: ~2pp on a 20pp band.
    assert offer.discount_pct == pytest.approx(12.0)


def test_left_swipe_short_dwell_escalates_harder() -> None:
    bounds = _bounds(floor=5.0, ceiling=25.0)
    history = [
        SwipeReaction(
            discount_pct_offered=10.0, dwell_ms=300, swiped_right=False
        )
    ]
    offer = negotiate_offer(NegotiationContext(bounds=bounds, history=history))
    # Dwell < 1200ms → hard escalation (20% of band = 4pp).
    assert offer.discount_pct > 10.0
    assert offer.discount_pct <= bounds.discount_ceiling_pct
    assert offer.discount_pct == pytest.approx(14.0)


def test_repeated_left_swipes_never_exceed_ceiling() -> None:
    """Adversarial: 20 consecutive hard left-swipes. Output must clamp
    at ceiling — the merchant's worst-case-tolerable discount."""
    bounds = _bounds(floor=5.0, ceiling=25.0)
    discount = 10.0
    for _ in range(20):
        offer = negotiate_offer(
            NegotiationContext(
                bounds=bounds,
                history=[
                    SwipeReaction(
                        discount_pct_offered=discount,
                        dwell_ms=200,
                        swiped_right=False,
                    )
                ],
            )
        )
        assert offer.discount_pct <= bounds.discount_ceiling_pct
        discount = offer.discount_pct
    # Final round should be pinned at ceiling.
    assert offer.discount_pct == pytest.approx(bounds.discount_ceiling_pct)


# ---------------------------------------------------------------------------
# Durable bounds-honoring contract (the DESIGN_PRINCIPLES guarantee)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("floor", "ceiling", "history_discount", "dwell", "right"),
    [
        # Pathological: history above ceiling (shouldn't happen, but the
        # agent must still clamp).
        (5.0, 25.0, 99.0, 100, False),
        # Pathological: history below floor.
        (5.0, 25.0, 0.0, 5000, True),
        # Empty band.
        (10.0, 10.0, 50.0, 500, False),
        # Tiny band.
        (10.0, 11.0, 30.0, 300, False),
        # Wide band, accepted huge discount.
        (0.0, 50.0, 45.0, 3000, True),
    ],
)
def test_bounds_honored_under_extreme_history(
    floor: float,
    ceiling: float,
    history_discount: float,
    dwell: int,
    right: bool,
) -> None:
    """The durable contract: regardless of history, ``discount_pct`` is
    inside the merchant's declared bounds. This is what makes the
    Negotiation Agent safe to wire into production — no swipe pattern
    can coerce it past the merchant's tolerance."""
    bounds = _bounds(floor=floor, ceiling=ceiling)
    offer = negotiate_offer(
        NegotiationContext(
            bounds=bounds,
            history=[
                SwipeReaction(
                    discount_pct_offered=history_discount,
                    dwell_ms=dwell,
                    swiped_right=right,
                )
            ],
        )
    )
    assert bounds.discount_floor_pct <= offer.discount_pct <= bounds.discount_ceiling_pct


def test_clamp_offer_caps_above_ceiling() -> None:
    bounds = _bounds(floor=5.0, ceiling=25.0)
    raw = NegotiatedOffer(discount_pct=99.0, headline="x", reasoning="x")
    clamped = _clamp_offer(raw, bounds)
    assert clamped.discount_pct == pytest.approx(25.0)
    assert "Clamped" in clamped.reasoning


def test_clamp_offer_caps_below_floor() -> None:
    """An LLM that returns a within-pydantic-range discount (e.g. 1%)
    that nonetheless sits below the merchant's floor must be brought
    UP to the floor — never below the merchant's tolerance."""
    bounds = _bounds(floor=5.0, ceiling=25.0)
    raw = NegotiatedOffer(discount_pct=1.0, headline="x", reasoning="x")
    clamped = _clamp_offer(raw, bounds)
    assert clamped.discount_pct == pytest.approx(5.0)
    assert "Clamped" in clamped.reasoning


def test_clamp_offer_passthrough_when_in_bounds() -> None:
    bounds = _bounds(floor=5.0, ceiling=25.0)
    raw = NegotiatedOffer(discount_pct=12.0, headline="x", reasoning="x")
    clamped = _clamp_offer(raw, bounds)
    assert clamped is raw  # short-circuit, no copy needed


def test_invalid_bounds_rejected() -> None:
    with pytest.raises(ValueError):
        MerchantBounds(
            merchant_id="x",
            discount_floor_pct=20.0,
            discount_ceiling_pct=10.0,
            allowed_categories=[],
        )


# ---------------------------------------------------------------------------
# Audit log: reasoning is always populated
# ---------------------------------------------------------------------------


def test_reasoning_is_non_empty_in_every_path() -> None:
    """The merchant portal's audit log requires a populated reasoning
    string for every generated offer (DESIGN_PRINCIPLES Principle 5:
    reasoning is inspectable)."""
    bounds = _bounds()
    cases = [
        NegotiationContext(bounds=bounds),  # cold start
        NegotiationContext(
            bounds=bounds,
            history=[
                SwipeReaction(
                    discount_pct_offered=12.0, dwell_ms=2000, swiped_right=True
                )
            ],
        ),
        NegotiationContext(
            bounds=bounds,
            history=[
                SwipeReaction(
                    discount_pct_offered=12.0, dwell_ms=200, swiped_right=False
                )
            ],
        ),
        NegotiationContext(
            bounds=bounds,
            history=[
                SwipeReaction(
                    discount_pct_offered=12.0, dwell_ms=2000, swiped_right=False
                )
            ],
        ),
    ]
    for ctx in cases:
        offer = _heuristic_negotiate(ctx)
        assert offer.reasoning.strip()
        assert offer.headline.strip()


# ---------------------------------------------------------------------------
# Brand-tone honored by heuristic copy
# ---------------------------------------------------------------------------


def test_brand_tone_no_urgency_suppresses_urgent_copy() -> None:
    """When the merchant declares 'no urgency' tone, the heuristic copy
    must not use 'last call'-style urgency phrasing on hard escalations."""
    bounds = _bounds(brand_tone="polite, no urgency")
    history = [
        SwipeReaction(
            discount_pct_offered=10.0, dwell_ms=200, swiped_right=False
        )
    ]
    offer = _heuristic_negotiate(NegotiationContext(bounds=bounds, history=history))
    assert "last call" not in offer.headline.lower()
    assert "closes soon" not in offer.headline.lower()


# ---------------------------------------------------------------------------
# LLM mode falls back to heuristic on failure
# ---------------------------------------------------------------------------


def test_llm_mode_falls_back_to_heuristic_on_failure() -> None:
    """When the LLM dispatch raises (network / provider / parse error),
    `negotiate_offer(use_llm=True)` must transparently return the
    heuristic result — never raise to the caller."""
    bounds = _bounds(floor=5.0, ceiling=25.0)
    history = [
        SwipeReaction(
            discount_pct_offered=10.0, dwell_ms=300, swiped_right=False
        )
    ]
    ctx = NegotiationContext(bounds=bounds, history=history)

    expected = _heuristic_negotiate(ctx)

    async def _boom(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("simulated provider failure")

    with patch(
        "momentmarkt_backend.negotiation_agent._negotiate_via_llm",
        side_effect=_boom,
    ):
        result = negotiate_offer(ctx, use_llm=True)

    assert result.discount_pct == pytest.approx(expected.discount_pct)
    assert bounds.discount_floor_pct <= result.discount_pct <= bounds.discount_ceiling_pct
    assert result.reasoning


def test_llm_mode_clamps_hallucinated_discount() -> None:
    """If the LLM returns a discount outside the merchant's bounds, the
    final clamp in `negotiate_offer` brings it back inside. This is the
    durable contract: no LLM hallucination can cross the floor/ceiling."""
    bounds = _bounds(floor=5.0, ceiling=25.0)
    ctx = NegotiationContext(bounds=bounds)

    async def _hallucinate(_ctx: NegotiationContext) -> NegotiatedOffer:
        return NegotiatedOffer(
            discount_pct=99.0,
            headline="99% off everything!",
            reasoning="LLM ignored bounds",
        )

    with patch(
        "momentmarkt_backend.negotiation_agent._negotiate_via_llm",
        side_effect=_hallucinate,
    ):
        result = negotiate_offer(ctx, use_llm=True)

    assert result.discount_pct == pytest.approx(bounds.discount_ceiling_pct)
    assert "Clamped" in result.reasoning
