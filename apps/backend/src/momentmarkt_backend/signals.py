from __future__ import annotations

from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any

from .fixtures import load_city_config, load_density, load_events, load_weather


SignalContext = dict[str, Any]
THETA_DEMAND = 0.2
MAX_EVENT_ENDING_MINUTES = 30
MAX_EVENT_WALK_MINUTES = 10
WALK_SPEED_M_PER_MIN = 75

INTENT_TOKENS = {
    "lunch_break.cold",
    "commute.evening_rushed",
    "tourist.midday_browsing",
    "weekend_wander",
    "late_night.solo",
}


def build_signal_context(city: str, merchant_id: str | None = None) -> SignalContext:
    config = load_city_config(city)
    weather = load_weather(city)
    events = load_events(city)
    density = load_density(config["density_fixture"])
    merchant = _select_merchant(density["merchants"], merchant_id)
    weather_trigger = _weather_trigger(config, weather)
    privacy = config["demo"]["privacy_envelope"]
    intent = extract_intent_token(_raw_user_signals(config, weather_trigger, privacy))
    wrapped_user_context = _wrapped_user_context(
        config,
        weather_trigger,
        privacy,
        intent["intent_token"],
    )
    trigger_evaluation = evaluate_triggers(
        config=config,
        merchant=merchant,
        weather_trigger=weather_trigger,
        events=events.get("events", []),
    )
    event = trigger_evaluation["event"]["event"]

    return {
        "city": config["city"],
        "city_id": city,
        "currency": config["currency"],
        "timezone": config["timezone"],
        "demo_time_local": config["demo"]["time_local"],
        "weather": {
            "source": "Open-Meteo fixture",
            "trigger": weather_trigger,
            "summary": _weather_summary(config, weather_trigger),
            "current": weather.get("current", {}),
        },
        "event": {
            "source": "events fixture",
            "ending_soon": trigger_evaluation["event"]["fired"],
            "summary": _event_summary(event),
            "event": event,
            "reason": trigger_evaluation["event"]["reason"],
        },
        "merchant": _merchant_signal(merchant),
        "trigger_evaluation": trigger_evaluation,
        "privacy": privacy,
        "intent_extractor": intent,
        "wrapped_user_context": wrapped_user_context,
        "surface": _surface_input(config, merchant, weather_trigger, trigger_evaluation),
    }


def build_all_signal_contexts(city: str) -> list[SignalContext]:
    config = load_city_config(city)
    density = load_density(config["density_fixture"])
    return [
        build_signal_context(city=city, merchant_id=merchant["id"])
        for merchant in density["merchants"]
    ]


def extract_intent_token(raw_signals: dict[str, Any]) -> dict[str, str]:
    configured = raw_signals.get("configured_intent_token")
    if configured in INTENT_TOKENS:
        token = configured
    elif raw_signals.get("weather_state") == "rain_incoming":
        token = "lunch_break.cold"
    elif raw_signals.get("is_weekend"):
        token = "weekend_wander"
    else:
        token = "tourist.midday_browsing"

    return {
        "intent_token": token,
        "mode": "demo stub / prod on-device SLM",
    }


def evaluate_triggers(
    config: dict[str, Any],
    merchant: dict[str, Any],
    weather_trigger: str,
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    weather = _evaluate_weather_trigger(weather_trigger, merchant)
    event = _evaluate_event_trigger(config, merchant, events)
    demand = _evaluate_demand_trigger(merchant)
    return {
        "fired": weather["fired"] or event["fired"] or demand["fired"],
        "weather": weather,
        "event": event,
        "demand": demand,
        "summary": _trigger_summary(weather, event, demand),
    }


def _select_merchant(merchants: list[dict[str, Any]], merchant_id: str | None) -> dict[str, Any]:
    if merchant_id:
        for merchant in merchants:
            if merchant["id"] == merchant_id:
                return merchant
        raise KeyError(f"Unknown merchant_id: {merchant_id}")

    for merchant in merchants:
        if merchant.get("canonical_demo_merchant"):
            return merchant
    return merchants[0]


def _select_event(events: list[dict[str, Any]], event_id: str | None) -> dict[str, Any] | None:
    if not events:
        return None
    if event_id:
        for event in events:
            if event["id"] == event_id:
                return event
    return events[0]


def _weather_trigger(config: dict[str, Any], weather: dict[str, Any]) -> str:
    forced = config["demo"].get("weather_trigger")
    if forced:
        return forced

    hourly = weather.get("hourly", {})
    probabilities = hourly.get("precipitation_probability", [])
    return "rain_incoming" if any(value >= 40 for value in probabilities[:8]) else "clear"


def _weather_summary(config: dict[str, Any], trigger: str) -> str:
    if trigger == "rain_incoming":
        return f"Rain incoming in {config['display_area']}"
    return f"Clear weather in {config['display_area']}"


def _event_summary(event: dict[str, Any] | None) -> str:
    if not event:
        return "No event wave near the demo window"
    return f"{event['name']} crowd moves after {event['end']}"


def _evaluate_weather_trigger(weather_trigger: str, merchant: dict[str, Any]) -> dict[str, Any]:
    merchant_matches = weather_trigger in merchant.get("trigger_tags", [])
    fired = weather_trigger != "clear" and merchant_matches
    if fired:
        reason = f"{weather_trigger} matches merchant trigger tags"
    elif weather_trigger == "clear":
        reason = "Weather is clear"
    else:
        reason = f"{merchant['display_name']} has no {weather_trigger} weather rule"
    return {"fired": fired, "state": weather_trigger, "reason": reason}


def _evaluate_event_trigger(
    config: dict[str, Any],
    merchant: dict[str, Any],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    now = parse_demo_time(config["demo"]["time_local"])
    merchant_location = merchant.get("location", {})
    eligible: list[dict[str, Any]] = []
    for event in events:
        end = parse_demo_time(event["end"])
        minutes_until_end = (end - now).total_seconds() / 60
        walk_m = distance_m(
            float(merchant_location.get("lat", 0)),
            float(merchant_location.get("lon", 0)),
            float(event.get("lat", 0)),
            float(event.get("lng", 0)),
        )
        walk_minutes = round(walk_m / WALK_SPEED_M_PER_MIN, 1)
        if (
            0 <= minutes_until_end <= MAX_EVENT_ENDING_MINUTES
            and walk_minutes <= MAX_EVENT_WALK_MINUTES
        ):
            eligible.append(
                {
                    **event,
                    "ends_in_minutes": round(minutes_until_end, 1),
                    "walk_minutes": walk_minutes,
                    "walk_distance_m": walk_m,
                }
            )

    event = eligible[0] if eligible else None
    return {
        "fired": event is not None,
        "event": event,
        "reason": "No event ending within 30 min and 10 min walk"
        if event is None
        else (
            f"{event['name']} ends in {event['ends_in_minutes']} min, "
            f"{event['walk_minutes']} min walk"
        ),
    }


def _evaluate_demand_trigger(merchant: dict[str, Any]) -> dict[str, Any]:
    gap = merchant["demand_gap"]
    ratio = float(gap.get("gap_ratio", 0))
    threshold = float(gap.get("threshold_ratio", THETA_DEMAND))
    fired = gap.get("status") == "below_typical" and ratio >= threshold
    return {
        "fired": fired,
        "gap_ratio": ratio,
        "threshold_ratio": threshold,
        "reason": gap.get("reason", "No demand-gap reason provided"),
    }


def _trigger_summary(
    weather: dict[str, Any],
    event: dict[str, Any],
    demand: dict[str, Any],
) -> list[str]:
    reasons = []
    for name, trigger in (("weather", weather), ("event", event), ("demand", demand)):
        if trigger["fired"]:
            reasons.append(f"{name}: {trigger['reason']}")
    return reasons or ["No Opportunity trigger fired"]


def _merchant_signal(merchant: dict[str, Any]) -> dict[str, Any]:
    gap = merchant["demand_gap"]
    return {
        "source": "OSM + Payone-style density fixture",
        "id": merchant["id"],
        "name": merchant["display_name"],
        "category": merchant["category"],
        "distance_m": merchant["distance_m"],
        "merchant_goal": merchant["merchant_goal"],
        "inventory_goal": merchant.get("inventory_goal", {}),
        "offer_budget": merchant.get("offer_budget", {}),
        "autopilot_rule_hints": merchant.get("autopilot_rule_hints", {}),
        "demand_gap_ratio": gap["gap_ratio"],
        "demand_gap": gap,
        "summary": f"{round(gap['gap_ratio'] * 100)}% below Saturday 13:30 baseline"
        if gap.get("triggers_demand_gap")
        else gap["reason"],
    }


def _surface_input(
    config: dict[str, Any],
    merchant: dict[str, Any],
    weather_trigger: str,
    trigger_evaluation: dict[str, Any],
) -> dict[str, Any]:
    privacy = config["demo"]["privacy_envelope"]
    return {
        "weatherTrigger": weather_trigger,
        "eventEndingSoon": trigger_evaluation["event"]["fired"],
        "demandGapRatio": merchant["demand_gap"]["gap_ratio"],
        "distanceM": merchant["distance_m"],
        "intent_token": privacy["intent_token"],
        "h3_cell_r8": privacy["h3_cell_r8"],
    }


def _wrapped_user_context(
    config: dict[str, Any],
    weather_trigger: str,
    privacy: dict[str, Any],
    intent_token: str,
) -> dict[str, Any]:
    return {
        "intent_token": intent_token,
        "h3_cell_r8": privacy["h3_cell_r8"],
        "weather_state": weather_trigger,
        "t": config["demo"]["time_local"],
        "high_intent": {
            "active_screen_time_recent_s": 0,
            "map_app_foreground_recent": False,
            "coupon_browse_recent": False,
        },
    }


def _raw_user_signals(
    config: dict[str, Any],
    weather_trigger: str,
    privacy: dict[str, Any],
) -> dict[str, Any]:
    now = parse_demo_time(config["demo"]["time_local"])
    return {
        "configured_intent_token": privacy.get("intent_token"),
        "weather_state": weather_trigger,
        "hour": now.hour,
        "is_weekend": now.weekday() >= 5,
    }


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    earth_radius_m = 6_371_000
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    d_phi = radians(lat2 - lat1)
    d_lambda = radians(lon2 - lon1)
    a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return round(2 * earth_radius_m * asin(sqrt(a)))


def parse_demo_time(value: str) -> datetime:
    return datetime.fromisoformat(value)
