from __future__ import annotations

from datetime import datetime
from typing import Any

from .llm_agents import run_headline_rewrite_agent
from .semantic_novelty import NoveltyResult, semantic_novelty
from .storage import DemoStore


THETA_SILENT = 0.72
THETA_ACTIVE = 0.58
BETA = 0.5
ALPHA = 0.35
WALK_RING_DISTANCE_M = 1_000


async def evaluate_surface(
    store: DemoStore,
    wrapped_user_context: dict[str, Any],
    user_id: str = "mia",
    city_id: str | None = None,
    use_llm: bool = False,
) -> dict[str, Any]:
    candidates, exclusions = _filter_candidates(
        store.approved_offers(city_id=city_id),
        wrapped_user_context,
    )
    recent_surfaces = store.recent_surface_offer_texts(user_id=user_id, city_id=city_id)
    novelty = await _semantic_novelty_scores(candidates, recent_surfaces)
    scored = [
        _score_candidate(
            offer,
            wrapped_user_context,
            novelty.get(offer["id"], NoveltyResult(novelty=1.0, source="not_evaluated")),
        )
        for offer in candidates
    ]
    scored.sort(key=lambda item: item["score"], reverse=True)

    boost = _intent_boost(wrapped_user_context.get("high_intent", {}))
    intent_state = "active" if boost >= BETA else "silent"
    threshold = THETA_ACTIVE if boost >= BETA else THETA_SILENT
    top = scored[0] if scored else None
    fired = bool(top and top["score"] >= threshold)
    headline_final = None
    headline_generated_by = None
    cache_hit = False
    generation_log: list[str] = []

    if fired and top:
        offer = top["offer"]
        weather_state = wrapped_user_context["weather_state"]
        cached = store.cached_headline(offer["id"], weather_state, intent_state)
        if cached:
            headline_final = cached
            headline_generated_by = "cache"
            cache_hit = True
        else:
            if use_llm:
                try:
                    headline_final = await run_headline_rewrite_agent(
                        offer=offer,
                        wrapped_user_context=wrapped_user_context,
                        aggressive=intent_state == "active",
                    )
                    headline_generated_by = "pydantic_ai"
                    generation_log.append("pydantic_ai_headline_succeeded")
                except Exception as exc:  # pragma: no cover - provider/network dependent
                    generation_log.append(
                        f"pydantic_ai_headline_failed: {type(exc).__name__}: {exc}"
                    )
            if headline_final is None:
                headline_final = _rewrite_headline(offer, intent_state)
                headline_generated_by = "fixture"
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
        "headline_generated_by": headline_generated_by,
        "headline_final": headline_final,
        "generation_log": generation_log,
        "offer": top["offer"] if top and fired else None,
        "widget_spec": top["offer"]["widget_spec"] if top and fired else None,
        "candidate_count": len(candidates),
        "excluded_candidates": exclusions,
        "scores": [
            {
                "offer_id": item["offer"]["id"],
                "score": item["score"],
                "parts": item["parts"],
            }
            for item in scored
        ],
    }


def _filter_candidates(
    offers: list[dict[str, Any]],
    context: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    now = datetime.fromisoformat(context["t"])
    eligible: list[dict[str, Any]] = []
    exclusions: list[dict[str, Any]] = []
    for offer in offers:
        valid_window = offer["valid_window"]
        start = datetime.fromisoformat(valid_window["start"])
        end = datetime.fromisoformat(valid_window["end"])
        if now < start:
            exclusions.append({"offer_id": offer["id"], "reason": "valid_window_not_started"})
            continue
        if now > end:
            exclusions.append({"offer_id": offer["id"], "reason": "valid_window_expired"})
            continue
        if int(offer["distance_m"]) > WALK_RING_DISTANCE_M:
            exclusions.append({"offer_id": offer["id"], "reason": "outside_walk_ring"})
            continue
        eligible.append(offer)
    return eligible, exclusions


def _score_candidate(
    offer: dict[str, Any],
    context: dict[str, Any],
    novelty_result: NoveltyResult,
) -> dict[str, Any]:
    relevance = _relevance(offer["category"], context["intent_token"])
    proximity = max(0.35, 1 - (offer["distance_m"] / 1000))
    trigger_strength = _trigger_strength(offer["trigger_reason"], context["weather_state"])
    novelty = novelty_result.novelty
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
            "novelty_source": novelty_result.source,
            "semantic_similarity": novelty_result.max_similarity,
            "matched_recent_offer_id": novelty_result.matched_offer_id,
            "boost": boost,
        },
    }


async def _semantic_novelty_scores(
    candidates: list[dict[str, Any]],
    recent_surfaces: list[dict[str, Any]],
) -> dict[str, NoveltyResult]:
    if not candidates:
        return {}
    return {
        offer["id"]: await semantic_novelty(offer, recent_surfaces)
        for offer in candidates
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
    # Accept canonical AGENT_IO.md keys plus the looser aliases the spec / mobile
    # toggle / partner repros tend to use. Without this, callers that send
    # `active_screen_time_min` / `map_app_foreground` / `in_app_coupon_browsing`
    # get boost=0.0 silently and the high-intent toggle has no effect on the
    # threshold or score (see issue #72).
    screen_time_s = float(
        high_intent.get(
            "active_screen_time_recent_s",
            high_intent.get("active_screen_time_min", 0) * 60
            if "active_screen_time_min" in high_intent
            else 0,
        )
    )
    screen_time = min(screen_time_s / 120, 1)
    map_foreground = 1.0 if (
        high_intent.get("map_app_foreground_recent")
        or high_intent.get("map_app_foreground")
    ) else 0.0
    coupon_browse = 1.0 if (
        high_intent.get("coupon_browse_recent")
        or high_intent.get("in_app_coupon_browsing")
    ) else 0.0
    return round((screen_time + map_foreground + coupon_browse) / 3, 3)


def _rewrite_headline(offer: dict[str, Any], intent_state: str) -> str:
    seed = offer["copy_seed"]
    if intent_state == "active":
        return f"Jetzt passt es: {seed['headline_de']}"
    return seed["headline_de"]
