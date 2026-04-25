"""Stress-y end-to-end checks on the FastAPI surface."""

from __future__ import annotations

from fastapi.testclient import TestClient

from momentmarkt_backend.main import app


client = TestClient(app)


def test_cities_lists_berlin_and_zurich() -> None:
    response = client.get("/cities")
    assert response.status_code == 200
    payload = response.json()
    ids = {entry["id"] for entry in payload["cities"]}
    assert {"berlin", "zurich"}.issubset(ids)


def test_unknown_city_signals_returns_404() -> None:
    response = client.get("/signals/atlantis")
    assert response.status_code == 404


def test_unknown_merchant_via_opportunity_endpoint_returns_404() -> None:
    response = client.post(
        "/opportunity/generate",
        json={"city": "berlin", "merchant_id": "ghost"},
    )
    assert response.status_code == 404


def test_opportunity_with_empty_body_uses_default_berlin_canonical() -> None:
    response = client.post("/opportunity/generate", json={})
    assert response.status_code == 200
    payload = response.json()
    assert payload["persisted_offer"]["merchant_id"] == "berlin-mitte-cafe-bondi"


def test_repeated_signal_calls_are_stable_under_lru_cache() -> None:
    # Exercise the lru_cache on fixture loaders. If anything mutates a cached
    # dict in place, later requests will diverge.
    payloads = [client.get("/signals/berlin").json() for _ in range(8)]
    first = payloads[0]
    for later in payloads[1:]:
        assert later == first


def test_opportunity_for_each_berlin_merchant_renders() -> None:
    for merchant_id in (
        "berlin-mitte-cafe-bondi",
        "berlin-mitte-baeckerei-rosenthal",
        "berlin-mitte-kiezbuchhandlung-august",
        "berlin-mitte-eisgarten-weinmeister",
    ):
        response = client.post(
            "/opportunity/generate",
            json={"city": "berlin", "merchant_id": merchant_id},
        )
        assert response.status_code == 200, merchant_id
        payload = response.json()
        assert payload["widget_valid"] is True, merchant_id
        assert payload["persisted_offer"]["merchant_id"] == merchant_id


def test_zurich_opportunity_renders_with_chf_signal() -> None:
    response = client.post("/opportunity/generate", json={"city": "zurich"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["widget_valid"] is True
    assert payload["signal_context"]["currency"] == "CHF"
