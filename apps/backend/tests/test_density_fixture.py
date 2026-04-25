"""Invariant checks on the Payone-style transaction-density fixture.

`data/transactions/berlin-density.json` is the synthetic source of truth for
demand-gap detection in the demo. The fixture is hand-authored, so it is
trivial to drift between the typical curve, the live samples, and the
pre-computed `demand_gap` block. These tests pin the math so a future edit
can't silently break the merchant-inbox curve view.
"""

from __future__ import annotations

import pytest

from momentmarkt_backend.fixtures import load_density


REQUIRED_MERCHANT_KEYS = {
    "id",
    "display_name",
    "category",
    "location",
    "distance_m",
    "currency",
    "demo_window",
    "typical_density_curve",
    "live_samples",
    "demand_gap",
    "trigger_tags",
    "merchant_goal",
    "inventory_goal",
    "offer_budget",
    "autopilot_rule_hints",
}


@pytest.fixture(scope="module")
def density() -> dict:
    return load_density("berlin")


@pytest.fixture(scope="module")
def merchants(density) -> list[dict]:
    return density["merchants"]


class TestFixtureShape:
    def test_at_least_one_canonical_demo_merchant(self, merchants) -> None:
        canonical = [m for m in merchants if m.get("canonical_demo_merchant")]
        # Exactly one to keep `_select_merchant` deterministic.
        assert len(canonical) == 1
        assert canonical[0]["id"] == "berlin-mitte-cafe-bondi"

    def test_four_merchants_match_spec_target(self, merchants) -> None:
        # The SPEC commits to a 4-merchant catalog. Adding/removing requires
        # an explicit decision and merchant-inbox copy update.
        assert len(merchants) == 4

    @pytest.mark.parametrize(
        "merchant_id",
        [
            "berlin-mitte-cafe-bondi",
            "berlin-mitte-baeckerei-rosenthal",
            "berlin-mitte-kiezbuchhandlung-august",
            "berlin-mitte-eisgarten-weinmeister",
        ],
    )
    def test_merchant_has_all_required_keys(
        self, merchants, merchant_id: str
    ) -> None:
        merchant = next(m for m in merchants if m["id"] == merchant_id)
        missing = REQUIRED_MERCHANT_KEYS - set(merchant)
        assert missing == set(), f"{merchant_id} missing keys: {missing}"


class TestDemandGapMath:
    def test_gap_density_points_equals_typical_minus_live(self, merchants) -> None:
        for m in merchants:
            gap = m["demand_gap"]
            assert (
                gap["gap_density_points"]
                == gap["typical_density"] - gap["live_density"]
            ), m["id"]

    def test_gap_ratio_matches_typical_density_division(
        self, merchants
    ) -> None:
        # Authored values are rounded to 2 decimals, so allow tolerance.
        for m in merchants:
            gap = m["demand_gap"]
            expected = gap["gap_density_points"] / gap["typical_density"]
            assert abs(gap["gap_ratio"] - expected) <= 0.011, m["id"]

    def test_triggers_demand_gap_iff_above_threshold(self, merchants) -> None:
        for m in merchants:
            gap = m["demand_gap"]
            should_fire = (
                gap["gap_ratio"] >= gap["threshold_ratio"]
                and gap["status"] == "below_typical"
            )
            assert gap["triggers_demand_gap"] is should_fire, m["id"]

    def test_at_least_two_merchants_trigger_for_visible_demo(
        self, merchants
    ) -> None:
        # The merchant-inbox view needs >1 fired offer to make the
        # demand-gap dimension visibly distinct from a single fluke.
        firing = [m for m in merchants if m["demand_gap"]["triggers_demand_gap"]]
        assert len(firing) >= 2

    def test_canonical_merchant_fires(self, merchants) -> None:
        bondi = next(m for m in merchants if m["canonical_demo_merchant"])
        assert bondi["demand_gap"]["triggers_demand_gap"] is True


class TestTypicalCurveAlignsWithDemoMoment:
    def test_demo_moment_present_in_typical_curve(self, merchants) -> None:
        # Demo time is 13:30 local. Each merchant must have a 13:30 point so
        # the merchant-inbox curve view can highlight the gap moment.
        for m in merchants:
            times = {p["time"] for p in m["typical_density_curve"]["points"]}
            assert "13:30" in times, m["id"]

    def test_typical_density_at_1330_matches_demand_gap_typical(
        self, merchants
    ) -> None:
        for m in merchants:
            point = next(
                p for p in m["typical_density_curve"]["points"] if p["time"] == "13:30"
            )
            assert (
                point["density"] == m["demand_gap"]["typical_density"]
            ), m["id"]


class TestLiveSamplesAlignWithDemandGap:
    def test_1330_sample_matches_demand_gap_live(self, merchants) -> None:
        for m in merchants:
            sample = next(
                s for s in m["live_samples"] if "13:30:00" in s["time_local"]
            )
            assert (
                sample["density"] == m["demand_gap"]["live_density"]
            ), m["id"]

    def test_each_merchant_has_samples_bracketing_demo_moment(
        self, merchants
    ) -> None:
        # The merchant inbox needs at least one sample before AND after the
        # demo moment so the live curve has shape, not a single point.
        for m in merchants:
            times = [s["time_local"] for s in m["live_samples"]]
            assert any("13:00:00" in t or "13:15:00" in t for t in times), m["id"]
            assert any("13:45:00" in t or "13:30:00" in t for t in times), m["id"]


class TestOfferBudgetSafety:
    def test_offer_budget_caps_are_positive(self, merchants) -> None:
        for m in merchants:
            budget = m["offer_budget"]
            assert budget["max_discount_percent"] > 0, m["id"]
            assert budget["max_cashback_eur"] > 0, m["id"]
            assert budget["total_budget_eur"] > 0, m["id"]

    def test_max_cashback_does_not_exceed_total_budget(self, merchants) -> None:
        # A single redemption that exhausts the rule's daily budget is a
        # demo-staging hazard; ensure at least a few redemptions fit.
        for m in merchants:
            budget = m["offer_budget"]
            assert (
                budget["total_budget_eur"] >= 3 * budget["max_cashback_eur"]
            ), m["id"]
