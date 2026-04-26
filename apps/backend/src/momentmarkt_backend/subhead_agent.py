"""Per-card subhead generator (issue #151).

The swipe-stack subhead is the tone+emotion layer of the card — the
brief explicitly calls out "appropriate imagery, **tone, and emotional
framing**". Before this module the subhead was a single hard-coded
phrase per category ("small shop, owner-on-floor"), which read as
obvious LLM filler on every card.

This module exposes:

  * ``generate_subhead`` — async, runs Pydantic AI when ``use_llm=True``
    and falls back to the per-category deterministic pool (from
    ``alternatives.pick_fallback_subhead``) when the LLM call is
    disabled or fails. Cached briefly per
    ``(merchant_id, weather_trigger, time_bucket)`` so a list refresh
    inside the same minute bucket doesn't burn a second LLM call.

The LLM prompt is intentionally rich — merchant identity + offer +
weather signal + time-of-day + day-of-week — so the model has enough
context to produce per-offer per-moment copy instead of templated
filler. The output is constrained to a single line ≤ 8 words.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .alternatives import (
    cached_llm_subhead,
    pick_fallback_subhead,
    store_llm_subhead,
)


class SubheadOutput(BaseModel):
    """Structured output for the subhead agent."""

    subhead: str = Field(
        description=(
            "One-line card subhead, max 8 words. Emotional + sensory, "
            "not factual. No salesy language, no exclamation marks."
        )
    )


# Prompt instructions kept top-of-module so they're easy to grep + tune.
_SUBHEAD_INSTRUCTIONS = (
    "You are the MomentMarkt swipe-stack subhead writer. Write a single "
    "line (max 8 words) that makes one merchant's offer feel timely and "
    "specific to the user's current moment. Lean on tone and emotion, "
    "not on facts the headline already carries (no repeating discount "
    "percent, no repeating merchant name). Use sensory detail: weather, "
    "smell, sound, light, the room's emptiness. Never use exclamation "
    "marks, ALL CAPS, salesy verbs, or generic words like 'amazing' / "
    "'great' / 'perfect'.\n"
    "\n"
    "Examples (tone target):\n"
    "  rainy + cafe       -> 'Cocoa weather. Eight stools, three taken.'\n"
    "  lunch + bakery     -> 'Just out of the oven, lunchbreak window.'\n"
    "  afternoon + bookstore -> 'Quiet hour. New arrivals shelf restocked.'\n"
    "  evening + bar      -> 'Lights low, first round on the counter.'"
)


async def generate_subhead(
    *,
    merchant_id: str,
    merchant_name: str,
    category: str,
    neighborhood: str,
    headline: str,
    discount_label: str,
    weather_trigger: str,
    time_bucket: str,
    day_of_week: str,
    use_llm: bool,
) -> str:
    """Return one subhead string for a card.

    The deterministic fallback (from ``pick_fallback_subhead``) is
    always available — when ``use_llm=False`` (the default for demo
    safety per ``CLAUDE.md`` Demo Truth Boundary) we skip the LLM call
    entirely and return the deterministic pick. When ``use_llm=True``
    we consult the process-local cache first, then fire one Pydantic
    AI call, and fall back to the deterministic pick on any failure.
    """
    if not use_llm:
        return pick_fallback_subhead(
            merchant_id=merchant_id,
            category=category,
            time_bucket=time_bucket,
        )

    cached = cached_llm_subhead(
        merchant_id=merchant_id,
        weather_trigger=weather_trigger,
        time_bucket=time_bucket,
    )
    if cached:
        return cached

    try:
        # Lazy import — keeps this module testable without a live
        # Pydantic AI install when the LLM path stays disabled.
        from .llm_agents import _model_name, _run_structured_agent

        prompt: dict[str, Any] = {
            "task": "Write one single-line card subhead for the user's current moment.",
            "merchant_name": merchant_name,
            "merchant_category": category,
            "neighborhood": neighborhood,
            "active_offer": {
                "headline": headline,
                "discount_label": discount_label,
            },
            "context": {
                "weather_trigger": weather_trigger,
                "time_of_day": time_bucket,
                "day_of_week": day_of_week,
            },
            "rules": [
                "Max 8 words.",
                "One line. No newline characters.",
                "Sensory + emotional, not factual.",
                "Do not repeat the headline or the discount.",
                "Do not start with the merchant name.",
                "No exclamation marks. No emojis.",
            ],
        }
        output = await _run_structured_agent(
            model=_model_name(),
            output_type=SubheadOutput,
            instructions=_SUBHEAD_INSTRUCTIONS,
            prompt=prompt,
        )
        subhead = (output.subhead or "").strip()
        if not subhead:
            raise ValueError("empty subhead from LLM")
        # Strip stray newlines just in case the model misbehaves.
        subhead = " ".join(subhead.split())
        store_llm_subhead(
            merchant_id=merchant_id,
            weather_trigger=weather_trigger,
            time_bucket=time_bucket,
            subhead=subhead,
        )
        return subhead
    except Exception:  # pragma: no cover - provider/network dependent
        return pick_fallback_subhead(
            merchant_id=merchant_id,
            category=category,
            time_bucket=time_bucket,
        )
