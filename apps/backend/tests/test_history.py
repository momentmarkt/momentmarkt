"""Tests for `GET /history` (issue #128).

Covers:
  * Returns the deterministic 8-entry seed when the redemption store is empty.
  * Respects `?limit=N` (uses the seed path on a fresh store).
  * Each item has the required fields populated.
  * Items are sorted desc by `redeemed_at_iso` (most recent first).
  * After a real `/redeem` call, the live redemption appears at the top of
    `/history` instead of the seed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from momentmarkt_backend.main import app, store


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_store() -> None:
    store.reset()


def test_history_returns_non_empty_seed_when_store_is_empty() -> None:
    response = client.get("/history")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 8
    assert len(payload["items"]) == 8


def test_history_respects_limit_query_param() -> None:
    response = client.get("/history?limit=3")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 3
    assert len(payload["items"]) == 3


def test_history_items_have_required_fields_populated() -> None:
    response = client.get("/history?limit=5")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 5
    required = {
        "id",
        "merchant_id",
        "merchant_display_name",
        "cashback_eur",
        "redeemed_at_iso",
        "context",
    }
    for item in items:
        assert required.issubset(item.keys())
        assert isinstance(item["id"], str) and item["id"]
        assert isinstance(item["merchant_id"], str) and item["merchant_id"]
        assert isinstance(item["merchant_display_name"], str) and item["merchant_display_name"]
        assert isinstance(item["cashback_eur"], (int, float))
        assert item["cashback_eur"] >= 0
        assert isinstance(item["redeemed_at_iso"], str) and "T" in item["redeemed_at_iso"]
        assert isinstance(item["context"], str) and item["context"]


def test_history_sorted_descending_by_redeemed_at() -> None:
    response = client.get("/history")
    assert response.status_code == 200
    items = response.json()["items"]
    timestamps = [item["redeemed_at_iso"] for item in items]
    assert timestamps == sorted(timestamps, reverse=True)
    # First item must be the most recent of the seed list.
    assert items[0]["merchant_display_name"] == "Café Bondi"


def test_history_returns_real_redemptions_when_present() -> None:
    # Drive a real redemption through the existing seed-then-redeem path so
    # /history returns store-backed rows rather than the seed.
    generated = client.post("/opportunity/generate", json={"city": "berlin"}).json()
    offer_id = generated["persisted_offer"]["id"]
    redeem = client.post("/redeem", json={"offer_id": offer_id, "user_id": "mia"})
    assert redeem.status_code == 200

    response = client.get("/history?limit=10")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    item = payload["items"][0]
    assert item["merchant_id"] == "berlin-mitte-cafe-bondi"
    assert item["cashback_eur"] == 3.0
    assert item["context"] == "Rain trigger"
