"""Tests for `GET /history` (issue #128, updated for issue #162).

Covers:
  * Returns an empty list when the redemption store is empty (no synthetic
    seed -- per the team's "no fake mock data" directive, issue #162).
  * After a real `/redeem` call, the live redemption appears at the top of
    `/history` with the expected fields populated.
  * Multiple redemptions sort newest-first by `redeemed_at_iso`.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from momentmarkt_backend.main import app, store


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_store() -> None:
    store.reset()


def test_history_returns_empty_when_store_is_empty() -> None:
    """Fresh DB / cold demo: no synthetic rows, just a clean empty payload."""
    response = client.get("/history")
    assert response.status_code == 200
    payload = response.json()
    assert payload == {"count": 0, "items": []}


def test_history_empty_respects_limit_query_param() -> None:
    """`?limit=N` is honoured even on an empty store (no rows, no error)."""
    response = client.get("/history?limit=3")
    assert response.status_code == 200
    payload = response.json()
    assert payload == {"count": 0, "items": []}


def test_history_returns_real_redemption_after_redeem() -> None:
    """After a real `/redeem`, the live row shows up with required fields."""
    generated = client.post("/opportunity/generate", json={"city": "berlin"}).json()
    offer_id = generated["persisted_offer"]["id"]
    redeem = client.post("/redeem", json={"offer_id": offer_id, "user_id": "mia"})
    assert redeem.status_code == 200

    response = client.get("/history?limit=10")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    item = payload["items"][0]
    required = {
        "id",
        "merchant_id",
        "merchant_display_name",
        "cashback_eur",
        "redeemed_at_iso",
        "context",
    }
    assert required.issubset(item.keys())
    assert item["merchant_id"] == "berlin-mitte-cafe-bondi"
    assert item["cashback_eur"] == 3.0
    assert item["context"] == "Rain trigger"
    assert isinstance(item["redeemed_at_iso"], str) and "T" in item["redeemed_at_iso"]


def test_history_sorted_descending_after_multiple_redemptions() -> None:
    """Multiple real redemptions should sort newest-first by `redeemed_at_iso`."""
    generated = client.post("/opportunity/generate", json={"city": "berlin"}).json()
    offer_id = generated["persisted_offer"]["id"]
    for ts in (
        "2026-04-25T13:31:00+02:00",
        "2026-04-25T13:33:00+02:00",
        "2026-04-25T13:32:00+02:00",
    ):
        resp = client.post(
            "/redeem",
            json={"offer_id": offer_id, "user_id": "mia", "t": ts},
        )
        assert resp.status_code == 200

    response = client.get("/history?limit=10")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 3
    timestamps = [item["redeemed_at_iso"] for item in items]
    assert timestamps == sorted(timestamps, reverse=True)
