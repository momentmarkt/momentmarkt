from fastapi.testclient import TestClient

from momentmarkt_backend.main import app


client = TestClient(app)


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
    assert persisted_offer["merchant_id"] == "berlin-mitte-cafe-bondi"
    assert persisted_offer["status"] == "auto_approved"


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
