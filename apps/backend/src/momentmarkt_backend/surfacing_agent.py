from __future__ import annotations

from typing import Any

from .storage import DemoStore


THETA_SILENT = 0.72
THETA_ACTIVE = 0.58
BETA = 0.5
ALPHA = 0.35


def evaluate_surface(
    store: DemoStore,
    wrapped_user_context: dict[str, Any],
    user_id: str = "mia",
    city_id: str | None = None,
) -> dict[str, Any]:
    candidates = store.approved_offers(city_id=city_id)
    scored = [_score_candidate(offer, wrapped_user_context) for offer in candidates]
    scored.sort(key=lambda item: item["score"], reverse=True)

    boost = _intent_boost(wrapped_user_context.get("high_intent", {}))
    intent_state = "active" if boost >= BETA else "silent"
    threshold = THETA_ACTIVE if boost >= BETA else THETA_SILENT
    top = scored[0] if scored else None
    fired = bool(top and top["score"] >= threshold)
    headline_final = None
    cache_hit = False

    if fired and top:
        offer = top["offer"]
        weather_state = wrapped_user_context["weather_state"]
        cached = store.cached_headline(offer["id"], weather_state, intent_state)
        if cached:
            headline_final = cached
            cache_hit = True
        else:
            headline_final = _rewrite_headline(offer, intent_state)
            store.set_cached_headline(offer["id"], weather_state, intent_state, headline_final)

    store.record_surface(
        user_id=user_id,
        offer_id=top["offer"]["id"] if top else None,
        score=top["score"] if top else 0,
        threshold=threshold,
        intent_state=intent_state,
        fired=fired,
        t=wrapped_user_context["t"],
        headline_final=headline_final,
    )

    return {
        "fired": fired,
        "score": top["score"] if top else 0,
        "threshold": threshold,
        "intent_state": intent_state,
        "boost": boost,
        "cache_hit": cache_hit,
        "headline_final": headline_final,
        "offer": top["offer"] if top and fired else None,
        "widget_spec": top["offer"]["widget_spec"] if top and fired else None,
        "candidate_count": len(candidates),
        "scores": [
            {
                "offer_id": item["offer"]["id"],
                "score": item["score"],
                "parts": item["parts"],
            }
            for item in scored
        ],
    }


def _score_candidate(offer: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    relevance = _relevance(offer["category"], context["intent_token"])
    proximity = max(0.35, 1 - (offer["distance_m"] / 1000))
    trigger_strength = _trigger_strength(offer["trigger_reason"], context["weather_state"])
    novelty = 1.0
    boost = _intent_boost(context.get("high_intent", {}))
    base = relevance * proximity * trigger_strength * novelty
    score = round(base * (1 + ALPHA * boost), 3)
    return {
        "offer": offer,
        "score": score,
        "parts": {
            "relevance": round(relevance, 3),
            "proximity": round(proximity, 3),
            "trigger_strength": round(trigger_strength, 3),
            "novelty": novelty,
            "boost": boost,
        },
    }


def _relevance(category: str, intent_token: str) -> float:
    table = {
        "cafe": {
            "lunch_break.cold": 0.92,
            "weekend_wander": 0.6,
            "tourist.midday_browsing": 0.72,
        },
        "bakery": {
            "lunch_break.cold": 0.78,
            "commute.evening_rushed": 0.64,
        },
        "bookstore": {
            "weekend_wander": 0.82,
            "tourist.midday_browsing": 0.78,
        },
    }
    return table.get(category, {}).get(intent_token, 0.5)


def _trigger_strength(trigger_reason: dict[str, Any], weather_state: str) -> float:
    weather_match = bool(trigger_reason.get("weather_trigger")) and weather_state == "rain_incoming"
    demand = bool(trigger_reason.get("demand_trigger"))
    event = bool(trigger_reason.get("event_trigger"))
    if weather_match and demand:
        return 1.0
    if demand and event:
        return 0.72
    if weather_match or demand or event:
        return 0.62
    return 0.4


def _intent_boost(high_intent: dict[str, Any]) -> float:
    screen_time = min(float(high_intent.get("active_screen_time_recent_s", 0)) / 120, 1)
    map_foreground = 1.0 if high_intent.get("map_app_foreground_recent") else 0.0
    coupon_browse = 1.0 if high_intent.get("coupon_browse_recent") else 0.0
    return round((screen_time + map_foreground + coupon_browse) / 3, 3)


def _rewrite_headline(offer: dict[str, Any], intent_state: str) -> str:
    seed = offer["copy_seed"]
    if intent_state == "active":
        return f"Jetzt passt es: {seed['headline_de']}"
    return seed["headline_de"]
