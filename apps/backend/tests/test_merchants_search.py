"""Tests for the wallet-drawer merchant catalog endpoint (issue #115).

Covers the API contract agreed with the mobile agent:
``GET /merchants/{city}?q=<query>&limit=<int>``.
"""

from fastapi.testclient import TestClient

from momentmarkt_backend.main import app
from momentmarkt_backend.merchants import active_offer_is_current


client = TestClient(app)


def test_berlin_catalog_returns_more_than_thirty_and_includes_bondi() -> None:
    response = client.get("/merchants/berlin")
    assert response.status_code == 200
    payload = response.json()
    assert payload["city"] == "berlin"
    assert payload["query"] is None
    # Catalog must comfortably exceed 30 entries; cafe-bondi must be present.
    assert payload["count"] > 30
    assert payload["count"] == len(payload["merchants"])
    ids = {m["id"] for m in payload["merchants"]}
    assert "berlin-mitte-cafe-bondi" in ids
    # All four canonical density-fixture merchants must survive.
    assert "berlin-mitte-baeckerei-rosenthal" in ids
    assert "berlin-mitte-kiezbuchhandlung-august" in ids
    assert "berlin-mitte-eisgarten-weinmeister" in ids


def test_berlin_query_cafe_filters_to_cafe_matches() -> None:
    response = client.get("/merchants/berlin", params={"q": "cafe"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "cafe"
    assert payload["count"] >= 1
    # Every result must match "cafe" in name, category, or neighborhood.
    for merchant in payload["merchants"]:
        haystack = (
            merchant["display_name"].lower()
            + "|"
            + merchant["category"].lower()
            + "|"
            + merchant["neighborhood"].lower()
        )
        assert "cafe" in haystack


def test_berlin_query_bondi_returns_cafe_bondi() -> None:
    response = client.get("/merchants/berlin", params={"q": "bondi"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["merchants"][0]["id"] == "berlin-mitte-cafe-bondi"


def test_zurich_catalog_is_real_osm_and_non_empty() -> None:
    response = client.get("/merchants/zurich")
    assert response.status_code == 200
    payload = response.json()
    assert payload["city"] == "zurich"
    # OSM-hydrated catalog should comfortably exceed 20 entries.
    assert payload["count"] >= 20
    assert payload["count"] == len(payload["merchants"])
    # All ids must use the zurich-hb- prefix that the OSM scrape emits.
    for merchant in payload["merchants"]:
        assert merchant["id"].startswith("zurich-hb-")
        assert merchant["neighborhood"] == "HB"
    # Smoke: at least one recognisable Zurich HB landmark must be present.
    names = {m["display_name"] for m in payload["merchants"]}
    assert "Orell Füssli" in names


def test_zurich_query_cafe_returns_multiple_results() -> None:
    response = client.get("/merchants/zurich", params={"q": "cafe"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "cafe"
    # OSM scrape gives us several cafes around HB.
    assert payload["count"] >= 2
    for merchant in payload["merchants"]:
        haystack = (
            merchant["display_name"].lower()
            + "|"
            + merchant["category"].lower()
            + "|"
            + merchant["neighborhood"].lower()
        )
        assert "cafe" in haystack


def test_zurich_has_at_least_one_active_offer() -> None:
    response = client.get("/merchants/zurich")
    assert response.status_code == 200
    payload = response.json()
    with_offers = [m for m in payload["merchants"] if m.get("active_offer")]
    assert len(with_offers) >= 1
    # Each attached offer must look like the canonical offer shape.
    for merchant in with_offers:
        offer = merchant["active_offer"]
        assert isinstance(offer["headline"], str) and offer["headline"]
        assert isinstance(offer["discount"], str) and offer["discount"]
        assert isinstance(offer["expires_at_iso"], str) and offer["expires_at_iso"]


def test_unknown_city_returns_404() -> None:
    response = client.get("/merchants/munich")
    assert response.status_code == 404
    assert response.json()["detail"].lower().startswith("unknown city")


def test_cafe_bondi_active_offer_matches_rain_trigger_demo() -> None:
    response = client.get("/merchants/berlin", params={"q": "bondi"})
    assert response.status_code == 200
    bondi = response.json()["merchants"][0]
    offer = bondi["active_offer"]
    assert offer is not None
    assert offer["headline"] == "20% off rainy-day filter coffee"
    assert offer["discount"] == "−20%"
    assert offer["expires_at_iso"] == "2026-04-29T15:00:00+02:00"


def test_catalog_offer_expiry_helper_respects_expires_at_iso() -> None:
    assert active_offer_is_current(
        {
            "headline": "Still live",
            "discount": "-10%",
            "expires_at_iso": "2026-04-29T12:00:01+02:00",
        },
        now_iso="2026-04-26T12:00:00+02:00",
    )
    assert not active_offer_is_current(
        {
            "headline": "Expired",
            "discount": "-10%",
            "expires_at_iso": "2026-04-26T11:59:59+02:00",
        },
        now_iso="2026-04-26T12:00:00+02:00",
    )


def test_limit_caps_returned_merchants() -> None:
    response = client.get("/merchants/berlin", params={"limit": 5})
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 5
    assert len(payload["merchants"]) == 5


def test_each_merchant_has_emoji_and_distance() -> None:
    response = client.get("/merchants/berlin")
    assert response.status_code == 200
    for merchant in response.json()["merchants"]:
        assert isinstance(merchant["emoji"], str) and len(merchant["emoji"]) >= 1
        assert isinstance(merchant["distance_m"], int)
        assert 0 < merchant["distance_m"] <= 1500
