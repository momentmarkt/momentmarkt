from __future__ import annotations

import json
import os
from typing import Any

from .genui import coerce_widget_node
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
    context: SignalContext, high_intent: bool = False, use_llm: bool = False
) -> dict[str, Any]:
    generation_log: list[str] = []
    fallback = fallback_draft(context)

    if high_intent:
        generation_log.append("high_intent_ignored_by_opportunity_agent")

    if use_llm:
        try:
            generated = _normalize_draft(await _generate_with_litellm(context))
            widget_spec, widget_valid = coerce_widget_node(generated.get("widget_spec"))
            generated["widget_spec"] = widget_spec
            generation_log.append("litellm_generation_succeeded")
            if not widget_valid:
                generation_log.append("generated_widget_invalid_used_fallback_widget")
            return _response(context, generated, "litellm", widget_valid, False, generation_log)
        except Exception as exc:  # pragma: no cover - provider/network dependent
            generation_log.append(f"litellm_generation_failed: {type(exc).__name__}: {exc}")

    generation_log.append("deterministic_fixture_offer")
    widget_spec, widget_valid = coerce_widget_node(fallback["widget_spec"])
    fallback["widget_spec"] = widget_spec

    return _response(context, fallback, "fixture", widget_valid, not use_llm, generation_log)


async def _generate_with_litellm(context: SignalContext) -> dict[str, Any]:
    model = os.environ.get("MOMENTMARKT_LLM_MODEL")
    if not model:
        raise RuntimeError("MOMENTMARKT_LLM_MODEL is not set")

    from litellm import acompletion  # type: ignore[import-not-found]

    response = await acompletion(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are the MomentMarkt Opportunity Agent. Return only valid JSON. "
                    "Generate one merchant draft as {offer, widget_spec}. "
                    "Allowed widget node types: View, ScrollView, Text, Image, Pressable. "
                    "Pressable nodes must use action='redeem'."
                ),
            },
            {"role": "user", "content": _prompt(context)},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("LLM response was not a JSON object")
    return parsed


def _prompt(context: SignalContext) -> str:
    payload = {
        "task": "Draft one Opportunity Agent output for a merchant inbox.",
        "required_shape": {
            "offer": {
                "discount_type": "percent | fixed | item",
                "discount_value": "number or item string",
                "valid_window": {"start": "iso timestamp", "end": "iso timestamp"},
                "copy_seed": {
                    "headline_de": "string",
                    "headline_en": "string",
                    "body_de": "string",
                    "body_en": "string",
                },
                "mood_image_key": "trigger.category.weather",
                "cta": "string",
            },
            "widget_spec": "JSON tree of React Native primitives",
        },
        "signal_context": context,
        "contract_notes": [
            "Opportunity drafts offers and widget specs only.",
            "Do not use high-intent signals; Surfacing handles per-user scoring and headline rewrites.",
            "Use neutral product UI language and no Sparkassen branding.",
            "Widget spec must be renderable through React Native primitives only.",
        ],
    }
    return json.dumps(payload, ensure_ascii=True)


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
    return {
        "id": f"offer-{merchant['id']}-1330",
        "merchant_id": merchant["id"],
        "status": "auto_approved"
        if merchant.get("autopilot_rule_hints", {}).get("approved")
        else "pending_approval",
        "trigger_reason": {
            "weather_trigger": context["weather"]["trigger"],
            "event_trigger": context["event"]["ending_soon"],
            "demand_trigger": merchant["demand_gap"].get("triggers_demand_gap", False),
        },
        "copy_seed": draft["offer"]["copy_seed"],
        "widget_spec": draft["widget_spec"],
        "valid_window": draft["offer"]["valid_window"],
        "created_at": context["demo_time_local"],
    }


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
