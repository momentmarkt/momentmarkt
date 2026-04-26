"""Tests for `POST /offers/alternatives` (issue #132).

Covers the swipe-to-pick variant ladder contract:
  * 3 variants ordered cheapest → most generous.
  * Each variant has a valid widget_spec (View root + Text + Pressable redeem).
  * Custom n=5 returns 5 variants spanning floor → ceiling.
  * Unknown merchant_id returns 404.
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


def test_default_returns_three_variants_ordered_cheapest_to_most_generous() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["merchant_id"] == "berlin-mitte-cafe-bondi"
    variants = payload["variants"]
    assert len(variants) == 3
    discounts = [v["discount_pct"] for v in variants]
    assert discounts == sorted(discounts), "variants must escalate cheapest → most generous"
    # Default range is 5..25.
    assert discounts[0] == 5.0
    assert discounts[-1] == 25.0


def test_each_variant_has_valid_widget_spec_shape() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi"},
    )
    assert response.status_code == 200
    for variant in response.json()["variants"]:
        # Headline + label populated.
        assert isinstance(variant["headline"], str) and variant["headline"]
        assert isinstance(variant["discount_label"], str) and variant["discount_label"]
        assert variant["discount_label"].startswith("−")
        assert isinstance(variant["variant_id"], str) and variant["variant_id"]

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


def test_custom_n_returns_n_variants() -> None:
    response = client.post(
        "/offers/alternatives",
        json={
            "merchant_id": "berlin-mitte-cafe-bondi",
            "base_discount_pct": 5.0,
            "max_discount_pct": 25.0,
            "n": 5,
        },
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert len(variants) == 5
    discounts = [v["discount_pct"] for v in variants]
    assert discounts == sorted(discounts)
    assert discounts[0] == 5.0
    assert discounts[-1] == 25.0


def test_unknown_merchant_id_returns_404() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "nonexistent-merchant-xyz"},
    )
    assert response.status_code == 404
    assert "nonexistent-merchant-xyz" in response.json()["detail"]


def test_zurich_merchant_works_too() -> None:
    """Catalog spans both cities; alternatives must work for any known id."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "zurich-hb-le-cafe-61594"},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert len(variants) == 3
    # variant_id must embed the merchant id so the mobile can match-back.
    for variant in variants:
        assert variant["variant_id"].startswith("zurich-hb-le-cafe-61594")


def test_variants_have_distinct_discount_labels() -> None:
    """Avoid showing three identical labels — defeats the swipe-to-pick UX."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi"},
    )
    assert response.status_code == 200
    labels = [v["discount_label"] for v in response.json()["variants"]]
    assert len(set(labels)) == len(labels)
