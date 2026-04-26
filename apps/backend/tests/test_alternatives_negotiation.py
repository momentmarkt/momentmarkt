"""Integration tests for the /offers/alternatives × negotiation_agent
wiring (issue #164).

Pre-#164 the alternatives endpoint surfaced variants at each merchant's
nominal discount with no per-user adjustment; the negotiation agent
shipped fully implemented + tested but unreachable from the live offer
flow. This module is the durable contract for the wiring:

  * Every variant carries a ``negotiation_meta`` block with the four
    fields the merchant audit log expects.
  * ``discount_pct`` is **always** within ``[floor_pct, ceiling_pct]``
    — the bounds-honouring guarantee enforced by the agent (and a
    final clamp in ``alternatives.apply_negotiation``).
  * ``nominal_discount_pct`` is exposed alongside the negotiated value
    so the demo dev panel can show the merchant's published number
    next to the served one.

The tests cover the three production-relevant call shapes:
  - anchored ``for_you`` (the merchant-tap path),
  - the ``best_deals`` lens (deterministic, no preference signal),
  - ``for_you`` with a ``preference_context`` swipe history (the
    round-N negotiation path).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from momentmarkt_backend.main import app


client = TestClient(app)


def _assert_negotiation_meta_shape(meta: dict) -> None:
    """Every variant's negotiation_meta must carry the four fields the
    merchant audit log + dev panel read off the wire."""
    assert isinstance(meta, dict), f"negotiation_meta must be a dict, got {type(meta)}"
    for key in ("floor_pct", "ceiling_pct", "applied_pct", "reason"):
        assert key in meta, f"negotiation_meta missing required key: {key}"
    assert isinstance(meta["floor_pct"], (int, float))
    assert isinstance(meta["ceiling_pct"], (int, float))
    assert isinstance(meta["applied_pct"], (int, float))
    assert isinstance(meta["reason"], str) and meta["reason"], (
        "negotiation_meta.reason must be a non-empty string per the agent's "
        "inspectability contract (DESIGN_PRINCIPLES.md #5)."
    )
    # Bounds invariant — the durable contract from negotiation_agent.py.
    assert meta["floor_pct"] <= meta["ceiling_pct"], (
        f"floor must be <= ceiling, got [{meta['floor_pct']}, {meta['ceiling_pct']}]"
    )
    assert meta["floor_pct"] <= meta["applied_pct"] <= meta["ceiling_pct"], (
        "applied_pct must be within [floor_pct, ceiling_pct] — bounds-honouring"
        f" guarantee violated: {meta}"
    )


def test_anchored_for_you_attaches_negotiation_meta_to_every_variant() -> None:
    """The merchant-tap path is the canonical flow — every card in the
    swipe stack must surface a complete negotiation_meta block."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "lens": "for_you", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert variants, "expected at least one variant on the anchored for_you path"
    for variant in variants:
        # nominal_discount_pct must be present so the dev panel can show
        # the merchant's published number next to the served one.
        assert "nominal_discount_pct" in variant, (
            f"variant missing nominal_discount_pct: {variant.get('merchant_id')}"
        )
        meta = variant.get("negotiation_meta")
        _assert_negotiation_meta_shape(meta)
        # The served discount must equal the negotiation's applied_pct.
        assert variant["discount_pct"] == meta["applied_pct"], (
            "discount_pct must mirror negotiation_meta.applied_pct so the "
            "wire stays internally consistent."
        )


def test_best_deals_lens_negotiation_bounds_enforced() -> None:
    """Best-deals lens has no anchor + no preference signal — the
    negotiation agent must still produce in-bounds discounts on the
    cold-start path for every variant."""
    response = client.post(
        "/offers/alternatives",
        json={"city": "berlin", "lens": "best_deals", "n": 5},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert variants, "best_deals must surface at least one variant for berlin"
    for variant in variants:
        meta = variant["negotiation_meta"]
        _assert_negotiation_meta_shape(meta)
        # Hard cap: no demo discount can exceed 50% — protects against a
        # malformed catalog string ("90% off") leaking through.
        assert meta["ceiling_pct"] <= 50.0, (
            f"ceiling exceeds the demo's 50% hard cap: {meta}"
        )


def test_preference_context_history_changes_applied_discount() -> None:
    """A right-swipe in the preference_context for a given merchant
    should bias that merchant's NEXT round downward (toward floor) per
    the negotiation heuristic. We assert the agent ran with the
    history (applied <= nominal for the swiped merchant)."""
    target_merchant = "berlin-mitte-mein-haus-am-see-02998"  # has -30% offer
    response = client.post(
        "/offers/alternatives",
        json={
            "merchant_id": target_merchant,
            "lens": "for_you",
            "n": 5,
            "preference_context": [
                {
                    "merchant_id": target_merchant,
                    "dwell_ms": 500,
                    "swiped_right": True,
                }
            ],
        },
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    target = next(
        (v for v in variants if v["merchant_id"] == target_merchant), None
    )
    assert target is not None, (
        f"anchor variant {target_merchant} must be in the response stack"
    )
    meta = target["negotiation_meta"]
    _assert_negotiation_meta_shape(meta)
    # User accepted last round → next offer biases DOWNWARD toward the
    # merchant's floor. Heuristic step is bounded but always <= nominal.
    assert meta["applied_pct"] <= target["nominal_discount_pct"] + 1e-6, (
        "right-swipe history should bias applied_pct DOWN toward floor; "
        f"got applied={meta['applied_pct']} > nominal="
        f"{target['nominal_discount_pct']}"
    )


def test_negotiation_meta_reason_is_non_empty_audit_string() -> None:
    """The reason string is the merchant audit-log surface (production)
    + the demo dev panel surface — must always be present + populated."""
    response = client.post(
        "/offers/alternatives",
        json={"city": "berlin", "lens": "nearby", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert variants, "nearby lens must surface variants for berlin"
    for variant in variants:
        reason = variant["negotiation_meta"]["reason"]
        assert isinstance(reason, str) and reason.strip(), (
            f"negotiation reason must be a populated string: {variant}"
        )
