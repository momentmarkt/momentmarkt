from __future__ import annotations

from typing import Any

from .genui import coerce_widget_node
from .llm_agents import default_use_llm, run_opportunity_agent
from .merchant_enrichment import get_enrichment
from .signals import SignalContext


def fallback_draft(context: SignalContext) -> dict[str, Any]:
    merchant = context["merchant"]
    max_discount = merchant["offer_budget"].get("max_discount_percent", 15)
    discount = min(max_discount, 15)
    headline = _surface_hint(merchant)
    cashback = f"{discount}% cashback"

    return {
        "offer": {
            "discount_type": "percent",
            "discount_value": discount,
            "valid_window": {
                "start": context["demo_time_local"],
                "end": merchant.get("inventory_goal", {}).get(
                    "expires_local", "2026-04-25T15:00:00+02:00"
                ),
            },
            "copy_seed": {
                "headline_de": headline,
                "headline_en": f"Warm up at {merchant['name']} before the rain hits.",
                "body_de": _body_copy(context),
                "body_en": _body_copy(context),
            },
            "mood_image_key": _mood_image_key(context),
            "cta": "Redeem with girocard",
        },
        "widget_spec": _rain_widget(context, headline, cashback),
    }


async def generate_offer(
    context: SignalContext,
    high_intent: bool = False,
    use_llm: bool | None = None,
) -> dict[str, Any]:
    # Issue #163: LLM is the chosen-by-default behaviour. Callers that
    # need deterministic output (tests, demo-safety smoke runs) MUST pass
    # `use_llm=False` explicitly. Pass-through `None` resolves via the
    # process-wide `MOMENTMARKT_USE_LLM` env var (defaults to True).
    if use_llm is None:
        use_llm = default_use_llm()

    generation_log: list[str] = []
    fallback = fallback_draft(context)

    if high_intent:
        generation_log.append("high_intent_ignored_by_opportunity_agent")

    if use_llm:
        try:
            llm_context = _attach_merchant_enrichment(context)
            generated = _normalize_draft(await run_opportunity_agent(llm_context))
            widget_spec, widget_valid = coerce_widget_node(generated.get("widget_spec"))
            generated["widget_spec"] = widget_spec
            generation_log.append("pydantic_ai_generation_succeeded")
            if not widget_valid:
                generation_log.append("generated_widget_invalid_used_fallback_widget")
            return _response(context, generated, "pydantic_ai", widget_valid, False, generation_log)
        except Exception as exc:  # pragma: no cover - provider/network dependent
            generation_log.append(f"pydantic_ai_generation_failed: {type(exc).__name__}: {exc}")

    generation_log.append("deterministic_fixture_offer")
    widget_spec, widget_valid = coerce_widget_node(fallback["widget_spec"])
    fallback["widget_spec"] = widget_spec

    return _response(context, fallback, "fixture", widget_valid, not use_llm, generation_log)


def _response(
    context: SignalContext,
    draft: dict[str, Any],
    generated_by: str,
    widget_valid: bool,
    used_fallback: bool,
    generation_log: list[str],
) -> dict[str, Any]:
    return {
        "draft": draft,
        "offer": draft["offer"],
        "widget_spec": draft["widget_spec"],
        "persisted_offer": _persisted_offer_preview(context, draft),
        "generated_by": generated_by,
        "widget_valid": widget_valid,
        "used_fallback": used_fallback,
        "generation_log": generation_log,
    }


def _normalize_draft(value: dict[str, Any]) -> dict[str, Any]:
    if "offer" in value and "widget_spec" in value:
        return value
    if "offer" in value and "widgetSpec" in value:
        return {"offer": value["offer"], "widget_spec": value["widgetSpec"]}
    raise ValueError("LLM response must contain offer and widget_spec")


def _persisted_offer_preview(context: SignalContext, draft: dict[str, Any]) -> dict[str, Any]:
    merchant = context["merchant"]
    triggers = context["trigger_evaluation"]
    return {
        "id": f"offer-{merchant['id']}-1330",
        "city_id": context["city_id"],
        "merchant_id": merchant["id"],
        "merchant_name": merchant["name"],
        "category": merchant["category"],
        "status": "auto_approved"
        if merchant.get("autopilot_rule_hints", {}).get("approved")
        else "pending_approval",
        "trigger_reason": {
            "weather_trigger": context["weather"]["trigger"]
            if triggers["weather"]["fired"]
            else None,
            "event_trigger": triggers["event"]["fired"],
            "demand_trigger": triggers["demand"]["fired"],
        },
        "copy_seed": draft["offer"]["copy_seed"],
        "widget_spec": draft["widget_spec"],
        "valid_window": draft["offer"]["valid_window"],
        "created_at": context["demo_time_local"],
        "distance_m": merchant["distance_m"],
        "currency": context["currency"],
        "budget_total": merchant.get("offer_budget", {}).get("total_budget_eur", 0),
        "cashback_eur": merchant.get("offer_budget", {}).get("max_cashback_eur", 0),
    }


def _attach_merchant_enrichment(context: SignalContext) -> SignalContext:
    """Return a shallow copy of ``context`` with ``merchant_enrichment`` if known.

    Looks up the merchant by id in the cached
    ``data/merchants/enriched/{city}.json`` file. If no entry exists we
    return the original context unchanged so the prompt size stays the
    same and the LLM falls back to category-level copy.
    """

    merchant = context.get("merchant", {})
    merchant_id = merchant.get("id")
    city = context.get("city_id")
    if not merchant_id or not city:
        return context
    enrichment = get_enrichment(city, merchant_id)
    if enrichment is None:
        return context
    enriched = dict(context)
    enriched["merchant_enrichment"] = enrichment
    return enriched


def _surface_hint(merchant: dict[str, Any]) -> str:
    hint = merchant.get("autopilot_rule_hints", {}).get("surface_copy_hint")
    return hint or f"{merchant['name']} has a timely offer nearby."


def _body_copy(context: SignalContext) -> str:
    merchant = context["merchant"]
    return (
        f"{merchant['name']} is nearby, the merchant goal is '{merchant['merchant_goal']}', "
        f"and the offer stays inside the approved budget."
    )


def _mood_image_key(context: SignalContext) -> str:
    merchant = context["merchant"]
    weather = context["weather"]["trigger"].replace("_incoming", "")
    return f"{weather}.{merchant['category']}.cold"


def _expires_at(merchant: dict[str, Any]) -> str:
    expires = merchant.get("inventory_goal", {}).get("expires_local", "")
    return expires[11:16] if len(expires) >= 16 else "15:00"


def _rain_widget(context: SignalContext, headline: str, discount: str) -> dict[str, Any]:
    merchant = context["merchant"]
    return {
        "type": "ScrollView",
        "className": "rounded-[34px] bg-cocoa",
        "children": [
            {
                "type": "Image",
                "source": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
                "accessibilityLabel": "A warm cafe table with coffee on a rainy day",
                "className": "h-44 w-full rounded-t-[34px]",
            },
            {
                "type": "View",
                "className": "p-5",
                "children": [
                    {
                        "type": "Text",
                        "className": "text-xs font-bold uppercase tracking-[3px] text-cream/70",
                        "text": "Opportunity Agent",
                    },
                    {
                        "type": "Text",
                        "className": "mt-3 text-3xl font-black leading-9 text-cream",
                        "text": headline,
                    },
                    {
                        "type": "Text",
                        "className": "mt-3 text-base leading-6 text-cream/80",
                        "text": f"{discount} at {merchant['name']}. {merchant['distance_m']} m away. Valid until {_expires_at(merchant)}.",
                    },
                    {
                        "type": "Pressable",
                        "className": "mt-5 rounded-2xl bg-cream px-5 py-4",
                        "action": "redeem",
                        "text": "Redeem with girocard",
                    },
                ],
            },
        ],
    }
