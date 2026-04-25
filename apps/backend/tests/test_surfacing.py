"""Surfacing agent unit tests.

Regression coverage for issue #72: high_intent signals must lower the
threshold and apply a boost regardless of which schema variant the caller
uses (canonical AGENT_IO.md keys vs the looser names in the spec/mobile
toggle / partner repros).
"""

from fastapi.testclient import TestClient

from momentmarkt_backend.main import app, store
from momentmarkt_backend.surfacing_agent import _intent_boost


client = TestClient(app)


def test_intent_boost_canonical_keys() -> None:
    boost = _intent_boost(
        {
            "active_screen_time_recent_s": 120,
            "map_app_foreground_recent": True,
            "coupon_browse_recent": True,
        }
    )
    assert boost == 1.0


def test_intent_boost_alias_keys_match_canonical() -> None:
    """Aliases used in the issue #72 repro must produce the same boost."""

    canonical = _intent_boost(
        {
            "active_screen_time_recent_s": 900,
            "map_app_foreground_recent": True,
            "coupon_browse_recent": True,
        }
    )
    alias = _intent_boost(
        {
            "active_screen_time_min": 15,
            "map_app_foreground": True,
            "in_app_coupon_browsing": True,
        }
    )
    assert canonical == alias == 1.0


def test_intent_boost_empty_dict_is_zero() -> None:
    assert _intent_boost({}) == 0.0


def test_surfacing_high_intent_changes_score_threshold_and_boost() -> None:
    """End-to-end: the live repro from issue #72 must now produce a different
    boost / score / threshold than the no-high-intent baseline."""

    store.reset()

    baseline = client.post("/surfacing/evaluate", json={"city": "berlin"})
    assert baseline.status_code == 200
    base_payload = baseline.json()

    high = client.post(
        "/surfacing/evaluate",
        json={
            "city": "berlin",
            "seed_offer": False,
            "high_intent": {
                "active_screen_time_min": 15,
                "map_app_foreground": True,
                "in_app_coupon_browsing": True,
            },
        },
    )
    assert high.status_code == 200
    high_payload = high.json()

    assert high_payload["boost"] > base_payload["boost"]
    assert high_payload["score"] > base_payload["score"]
    assert high_payload["threshold"] < base_payload["threshold"]
    assert high_payload["intent_state"] == "active"
