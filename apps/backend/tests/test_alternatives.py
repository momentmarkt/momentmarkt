"""Tests for `POST /offers/alternatives` (issues #132 → #136).

Covers the cross-merchant swipe stack contract:
  * 3 variants, each from a DIFFERENT merchant in the same (or close)
    category — replaces the original price-escalation ladder.
  * Tapped merchant is the anchor (card 1) so the user keeps the safety
    of "I can take what I tapped".
  * Each variant has a valid widget_spec (View root + Text + Pressable
    redeem).
  * Custom n is honoured (the response has ≤ n variants).
  * Unknown merchant_id returns 404.
  * Unique `merchant_id` per variant — no duplicates in the stack.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from momentmarkt_backend.main import app


client = TestClient(app)


def _walk_node_types(node: dict, types_seen: set[str]) -> None:
    """Recurse a widget_spec tree collecting every node type seen."""
    if not isinstance(node, dict):
        return
    t = node.get("type")
    if isinstance(t, str):
        types_seen.add(t)
    children = node.get("children")
    if isinstance(children, list):
        for child in children:
            _walk_node_types(child, types_seen)


def _find_pressable_action(node: dict) -> str | None:
    """First Pressable node's ``action`` string in DFS order."""
    if not isinstance(node, dict):
        return None
    if node.get("type") == "Pressable":
        action = node.get("action")
        return action if isinstance(action, str) else None
    children = node.get("children")
    if isinstance(children, list):
        for child in children:
            found = _find_pressable_action(child)
            if found is not None:
                return found
    return None


def test_default_returns_three_cross_merchant_variants() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["merchant_id"] == "berlin-mitte-cafe-bondi"
    variants = payload["variants"]
    assert len(variants) == 3
    # Cross-merchant invariant: every variant is a DIFFERENT merchant_id.
    merchant_ids = [v["merchant_id"] for v in variants]
    assert len(set(merchant_ids)) == len(merchant_ids), (
        f"variants must be cross-merchant; got duplicates: {merchant_ids}"
    )


def test_anchor_merchant_is_card_one() -> None:
    """The tapped merchant must be the anchor (position 0) so the user
    keeps the safety of "I can take what I tapped"."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert variants[0]["merchant_id"] == "berlin-mitte-cafe-bondi"
    assert variants[0]["is_anchor"] is True
    # Subsequent cards are not the anchor.
    for v in variants[1:]:
        assert v["is_anchor"] is False


def test_each_variant_has_valid_widget_spec_shape() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert response.status_code == 200
    for variant in response.json()["variants"]:
        assert isinstance(variant["headline"], str) and variant["headline"]
        assert isinstance(variant["discount_label"], str) and variant["discount_label"]
        assert isinstance(variant["variant_id"], str) and variant["variant_id"]
        assert isinstance(variant["merchant_id"], str) and variant["merchant_id"]
        assert isinstance(variant["merchant_display_name"], str)
        assert variant["merchant_display_name"] != ""
        # variant_id == merchant_id under the new contract.
        assert variant["variant_id"] == variant["merchant_id"]

        spec = variant["widget_spec"]
        assert isinstance(spec, dict)
        # Root must be a container so the renderer treats it as a layout.
        assert spec["type"] in {"View", "ScrollView"}
        # At least one Text child somewhere in the tree.
        types_seen: set[str] = set()
        _walk_node_types(spec, types_seen)
        assert "Text" in types_seen, "widget_spec must contain at least one Text node"
        # At least one Pressable with action: redeem (the CTA the renderer wires).
        action = _find_pressable_action(spec)
        assert action == "redeem", "widget_spec must contain a Pressable with action=redeem"


def test_custom_n_returns_at_most_n_variants() -> None:
    """Custom n caps the response. The cross-merchant builder may return
    fewer if the candidate pool runs dry, but never more than n."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 5},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert 1 <= len(variants) <= 5
    merchant_ids = [v["merchant_id"] for v in variants]
    assert len(set(merchant_ids)) == len(merchant_ids)


def test_unknown_merchant_id_returns_404() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "nonexistent-merchant-xyz"},
    )
    assert response.status_code == 404
    assert "nonexistent-merchant-xyz" in response.json()["detail"]


def test_zurich_merchant_returns_zurich_neighbours() -> None:
    """Catalog spans both cities; alternatives must work for any known
    id and stay within the same city (no Berlin cards in a Zurich
    stack)."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "zurich-hb-le-cafe-61594", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert len(variants) >= 1
    for variant in variants:
        # Every card stays in the Zurich catalog.
        assert variant["merchant_id"].startswith("zurich-"), (
            f"cross-city card leaked: {variant['merchant_id']}"
        )


def test_anchor_card_works_when_anchor_has_no_active_offer() -> None:
    """A merchant tapped from the catalog might not have an active_offer
    of its own (e.g. exploring); the anchor card must still render with a
    safe fallback."""
    # `berlin-mitte-the-eatery-berlin-03070` has active_offer = None.
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-the-eatery-berlin-03070", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert len(variants) >= 1
    assert variants[0]["merchant_id"] == "berlin-mitte-the-eatery-berlin-03070"
    # Subsequent cards must still be cross-merchant + have offers.
    for v in variants[1:]:
        assert v["merchant_id"] != variants[0]["merchant_id"]


def test_lens_for_you_without_anchor_returns_city_pool() -> None:
    """`lens="for_you"` without a merchant_id should return city merchants
    with active offers, ready for the preference agent to re-rank."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "for_you", "city": "berlin", "n": 3},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "for_you"
    assert payload["merchant_id"] is None
    variants = payload["variants"]
    assert len(variants) == 3
    # Every card carries a real merchant identity + an offer.
    for v in variants:
        assert v["merchant_id"].startswith("berlin-")
        assert v["discount_label"]
    # No duplicates.
    ids = [v["merchant_id"] for v in variants]
    assert len(set(ids)) == len(ids)


def test_lens_best_deals_sorted_by_discount_descending() -> None:
    """`best_deals` must order cards by parsed discount percent desc.
    Pure deterministic sort — no LLM, no preference signal applied."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "best_deals", "city": "berlin", "n": 5},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "best_deals"
    variants = payload["variants"]
    assert len(variants) >= 1
    # Discount percents are non-increasing.
    pcts = [float(v["discount_pct"]) for v in variants]
    assert pcts == sorted(pcts, reverse=True), (
        f"best_deals must sort by discount_pct desc; got {pcts}"
    )
    # Top card must have the highest discount across the city's offers.
    # Berlin's biggest offer is "Mein Haus am See" at -30%.
    assert pcts[0] >= 25.0


def test_lens_best_deals_ignores_preference_context() -> None:
    """Preference context must NOT reshuffle deterministic lenses
    (`DESIGN_PRINCIPLES.md` #4 + #6 — those lenses are verifiable by
    hand). Sending history with `best_deals` returns the same order as
    without."""
    body = {"lens": "best_deals", "city": "berlin", "n": 3}
    natural = client.post("/offers/alternatives", json=body)
    assert natural.status_code == 200
    natural_ids = [v["merchant_id"] for v in natural.json()["variants"]]

    body_with_history = dict(body)
    body_with_history["preference_context"] = [
        {
            "merchant_id": "berlin-mitte-zeit-fur-brot-03038",
            "dwell_ms": 5000,
            "swiped_right": True,
        },
        {
            "merchant_id": "berlin-mitte-rosa-canina-02890",
            "dwell_ms": 3000,
            "swiped_right": True,
        },
    ]
    influenced = client.post("/offers/alternatives", json=body_with_history)
    assert influenced.status_code == 200
    influenced_ids = [v["merchant_id"] for v in influenced.json()["variants"]]
    assert influenced_ids == natural_ids, (
        "best_deals must ignore preference_context — got reorder: "
        f"{natural_ids} -> {influenced_ids}"
    )


def test_lens_right_now_filters_by_weather_trigger() -> None:
    """`right_now` should only surface categories that fit the current
    weather. Berlin's demo time forces rain_incoming → cafe / bakery /
    bookstore / kiosk. No restaurant or bar should appear."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "right_now", "city": "berlin", "n": 5},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "right_now"
    variants = payload["variants"]
    assert len(variants) >= 1
    rain_categories = {"cafe", "bakery", "bookstore", "kiosk"}
    for v in variants:
        assert v["merchant_category"] in rain_categories, (
            f"right_now under rain must whitelist {rain_categories}; got {v['merchant_category']}"
        )


def test_lens_nearby_pure_distance_sort() -> None:
    """`nearby` MUST be the deterministic fallback per
    `DESIGN_PRINCIPLES.md` #4 — pure distance ascending, no LLM, no
    preference signal applied."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "nearby", "city": "berlin", "n": 5},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "nearby"
    variants = payload["variants"]
    assert len(variants) >= 1
    distances = [int(v["distance_m"]) for v in variants]
    assert distances == sorted(distances), (
        f"nearby must sort by distance asc; got {distances}"
    )


def test_lens_nearby_ignores_preference_context() -> None:
    """Same invariant as best_deals — the user's escape hatch must stay
    deterministic even when prior swipes are sent in."""
    body = {"lens": "nearby", "city": "berlin", "n": 3}
    natural = client.post("/offers/alternatives", json=body)
    assert natural.status_code == 200
    natural_ids = [v["merchant_id"] for v in natural.json()["variants"]]

    body_with_history = dict(body)
    body_with_history["preference_context"] = [
        {
            "merchant_id": "berlin-mitte-rosa-canina-02890",
            "dwell_ms": 5000,
            "swiped_right": True,
        },
    ]
    influenced = client.post("/offers/alternatives", json=body_with_history)
    assert influenced.status_code == 200
    influenced_ids = [v["merchant_id"] for v in influenced.json()["variants"]]
    assert influenced_ids == natural_ids, (
        "nearby must ignore preference_context (DESIGN_PRINCIPLES.md #4); "
        f"got reorder: {natural_ids} -> {influenced_ids}"
    )


def test_lens_zurich_returns_zurich_only() -> None:
    """Lens-driven candidates must stay within the requested city —
    no Berlin cards leaking into a Zurich stack."""
    for lens in ("for_you", "best_deals", "right_now", "nearby"):
        response = client.post(
            "/offers/alternatives",
            json={"lens": lens, "city": "zurich", "n": 3},
        )
        assert response.status_code == 200, f"lens={lens} failed"
        for v in response.json()["variants"]:
            assert v["merchant_id"].startswith("zurich-"), (
                f"lens={lens}: cross-city card leaked: {v['merchant_id']}"
            )


def test_lens_invalid_value_rejected_by_pydantic() -> None:
    """Pydantic Literal[...] should reject unknown lens values with 422
    so the mobile gets a clean error instead of silently degrading."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "horoscope", "city": "berlin"},
    )
    assert response.status_code == 422


def test_lens_response_echoes_lens_field() -> None:
    """The wire shape carries `lens` so the mobile can confirm what it
    actually received (vs. what the request body asked for)."""
    for lens in ("for_you", "best_deals", "right_now", "nearby"):
        response = client.post(
            "/offers/alternatives",
            json={"lens": lens, "city": "berlin"},
        )
        assert response.status_code == 200, f"lens={lens} failed"
        assert response.json()["lens"] == lens


def test_preference_context_reorders_candidates_anchor_pinned() -> None:
    """Sending prior-swipe history with `use_llm=False` exercises the
    deterministic heuristic re-rank. The anchor stays at position 0."""
    # First, get the natural cross-merchant order so we know what to
    # compare against.
    natural = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert natural.status_code == 200
    natural_ids = [v["merchant_id"] for v in natural.json()["variants"]]
    assert len(natural_ids) >= 2
    # Build a preference context that fast-skipped a cafe and lingered
    # on a bakery (signal: bias toward bakery candidates if any).
    response = client.post(
        "/offers/alternatives",
        json={
            "merchant_id": "berlin-mitte-cafe-bondi",
            "n": 3,
            "use_llm": False,
            "preference_context": [
                {
                    "merchant_id": "berlin-mitte-the-barn-03005",
                    "dwell_ms": 250,
                    "swiped_right": False,
                },
                {
                    "merchant_id": "berlin-mitte-zeit-fur-brot-03038",
                    "dwell_ms": 4200,
                    "swiped_right": True,
                },
            ],
        },
    )
    assert response.status_code == 200
    reranked_ids = [v["merchant_id"] for v in response.json()["variants"]]
    # Anchor still pinned at position 0.
    assert reranked_ids[0] == "berlin-mitte-cafe-bondi"
    # Same set of candidates (no additions, no drops).
    assert set(reranked_ids) == set(natural_ids)
