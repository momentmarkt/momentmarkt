from fastapi.testclient import TestClient
import pytest

from momentmarkt_backend.main import app, store


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_store() -> None:
    store.reset()


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_signals_returns_canonical_bondi_context() -> None:
    response = client.get("/signals/berlin")
    assert response.status_code == 200
    payload = response.json()
    assert payload["merchant"]["id"] == "berlin-mitte-cafe-bondi"
    assert payload["weather"]["trigger"] == "rain_incoming"
    assert payload["privacy"]["h3_cell_r8"] == "881f1d489dfffff"
    assert payload["wrapped_user_context"]["intent_token"] == "lunch_break.cold"
    assert payload["wrapped_user_context"]["high_intent"] == {
        "active_screen_time_recent_s": 0,
        "map_app_foreground_recent": False,
        "coupon_browse_recent": False,
    }


def test_zurich_config_swap_exposes_chf_and_clear_weather() -> None:
    response = client.get("/signals/zurich")
    assert response.status_code == 200
    payload = response.json()
    assert payload["currency"] == "CHF"
    assert payload["weather"]["trigger"] == "clear"
    assert payload["privacy"]["h3_cell_r8"] == "881f8d4b29fffff"
    assert payload["wrapped_user_context"]["intent_token"] == "weekend_wander"


def test_opportunity_fallback_returns_valid_widget() -> None:
    response = client.post("/opportunity/generate", json={"city": "berlin"})
    assert response.status_code == 200
    payload = response.json()
    offer = payload["offer"]
    persisted_offer = payload["persisted_offer"]
    assert payload["generated_by"] == "fixture"
    assert payload["widget_valid"] is True
    assert offer["discount_type"] == "percent"
    assert offer["discount_value"] == 15
    assert offer["copy_seed"]["headline_de"] == "Es regnet bald. 80 m bis zum heissen Kakao."
    assert payload["widget_spec"]["type"] == "ScrollView"
    assert persisted_offer["city_id"] == "berlin"
    assert persisted_offer["merchant_id"] == "berlin-mitte-cafe-bondi"
    assert persisted_offer["status"] == "auto_approved"
    assert persisted_offer["redemptions"] == 0
    assert persisted_offer["budget_spent"] == 0


def test_high_intent_does_not_change_opportunity_draft() -> None:
    response = client.post(
        "/opportunity/generate",
        json={"city": "berlin", "high_intent": True},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["offer"]["discount_value"] == 15
    assert "high_intent_ignored_by_opportunity_agent" in payload["generation_log"]


def test_unknown_merchant_is_404() -> None:
    response = client.get("/signals/berlin?merchant_id=missing")
    assert response.status_code == 404


def test_surfacing_seeds_offer_and_fires_for_mia_context() -> None:
    response = client.post("/surfacing/evaluate", json={"city": "berlin"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["fired"] is True
    assert payload["candidate_count"] == 1
    assert payload["headline_final"] == "Es regnet bald. 80 m bis zum heissen Kakao."
    assert payload["offer"]["id"] == "offer-berlin-mitte-cafe-bondi-1330"
    assert payload["widget_spec"]["type"] == "ScrollView"


def test_surfacing_headline_cache_hits_on_second_fire() -> None:
    first = client.post(
        "/surfacing/evaluate",
        json={
            "city": "berlin",
            "high_intent": {
                "active_screen_time_recent_s": 120,
                "map_app_foreground_recent": True,
                "coupon_browse_recent": True,
            },
        },
    )
    second = client.post(
        "/surfacing/evaluate",
        json={
            "city": "berlin",
            "high_intent": {
                "active_screen_time_recent_s": 120,
                "map_app_foreground_recent": True,
                "coupon_browse_recent": True,
            },
        },
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["cache_hit"] is False
    assert second.json()["cache_hit"] is True
    assert second.json()["intent_state"] == "active"
    assert second.json()["headline_final"].startswith("Jetzt passt es:")


def test_surfacing_can_stay_silent_for_low_relevance_context() -> None:
    response = client.post("/surfacing/evaluate", json={"city": "zurich"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["fired"] is False
    assert payload["offer"] is None
    assert payload["threshold"] == 0.72


def test_redeem_records_checkout_and_updates_budget() -> None:
    generated = client.post("/opportunity/generate", json={"city": "berlin"}).json()
    offer_id = generated["persisted_offer"]["id"]

    response = client.post("/redeem", json={"offer_id": offer_id, "user_id": "mia"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "cashback_confirmed"
    assert payload["merchant_counter"] == 1
    assert payload["cashback_amount"] == 3.0
    assert payload["budget_remaining"] == 57.0

    stored_offer = store.get_offer(offer_id)
    assert stored_offer["redemptions"] == 1
    assert stored_offer["budget_spent"] == 3.0

    summary = client.get("/merchants/berlin-mitte-cafe-bondi/summary")
    assert summary.status_code == 200
    assert summary.json()["redeemed"] == 1
    assert summary.json()["budget_spent"] == 3.0
