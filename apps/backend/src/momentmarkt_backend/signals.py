from __future__ import annotations

from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any

from .fixtures import load_city_config, load_density, load_events, load_weather


SignalContext = dict[str, Any]


def build_signal_context(city: str, merchant_id: str | None = None) -> SignalContext:
    config = load_city_config(city)
    weather = load_weather(city)
    events = load_events(city)
    density = load_density(config["density_fixture"])
    merchant = _select_merchant(density["merchants"], merchant_id)
    event = _select_event(events.get("events", []), config["demo"].get("event_id"))
    weather_trigger = _weather_trigger(config, weather)
    demand_gap = merchant["demand_gap"]
    privacy = config["demo"]["privacy_envelope"]
    wrapped_user_context = _wrapped_user_context(config, weather_trigger, privacy)

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
            "ending_soon": bool(event),
            "summary": _event_summary(event),
            "event": event,
        },
        "merchant": _merchant_signal(merchant),
        "privacy": privacy,
        "wrapped_user_context": wrapped_user_context,
        "surface": _surface_input(config, merchant, weather_trigger),
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


def _surface_input(config: dict[str, Any], merchant: dict[str, Any], weather_trigger: str) -> dict[str, Any]:
    privacy = config["demo"]["privacy_envelope"]
    return {
        "weatherTrigger": weather_trigger,
        "eventEndingSoon": True,
        "demandGapRatio": merchant["demand_gap"]["gap_ratio"],
        "distanceM": merchant["distance_m"],
        "intent_token": privacy["intent_token"],
        "h3_cell_r8": privacy["h3_cell_r8"],
    }


def _wrapped_user_context(
    config: dict[str, Any],
    weather_trigger: str,
    privacy: dict[str, Any],
) -> dict[str, Any]:
    return {
        "intent_token": privacy["intent_token"],
        "h3_cell_r8": privacy["h3_cell_r8"],
        "weather_state": weather_trigger,
        "t": config["demo"]["time_local"],
        "high_intent": {
            "active_screen_time_recent_s": 0,
            "map_app_foreground_recent": False,
            "coupon_browse_recent": False,
        },
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
