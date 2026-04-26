"""Offer-alternatives generator for the swipe-to-pick mechanic (issue #132).

Three-card LLM-generated offer stack: variants escalate from cheapest discount
toward most generous so the on-device dwell + swipe ML signal can probe upward
until the user swipes right. The "learning" for the demo is pre-baked — the
function linearly interpolates ``base_discount_pct → max_discount_pct`` over
``n`` steps. Real on-device preference model is post-hackathon roadmap.

The shipped variants reuse the existing rainHero widget shape from
``apps/mobile/src/demo/widgetSpecs.ts`` so the mobile ``WidgetRenderer`` +
``widgetSchema`` validator render them with zero new pipeline. Each variant
gets a fresh discount label, headline, and copy that escalates in
generosity tone (conservative → balanced → aggressive).
"""

from __future__ import annotations

from typing import Any

from .genui import validate_widget_node
from .merchants import get_merchants


# ---------------------------------------------------------------------------
# Static copy ladder
# ---------------------------------------------------------------------------
#
# Three ladders by position (cheapest → most generous). When ``n`` differs
# from 3 we still draw from these by clamping to the known-good range so the
# headline tone reads correctly.

_HEADLINE_LADDER: tuple[str, ...] = (
    "Quick coffee, small saving",
    "Warm cocoa, fair deal",
    "Treat yourself — best price today",
)

_KICKER_LADDER: tuple[str, ...] = (
    "Conservative",
    "Balanced",
    "Generous",
)

_BODY_LADDER: tuple[str, ...] = (
    "Pop in, save a little — perfect if you're already passing.",
    "A friendlier nudge: rain incoming, the cocoa is hot.",
    "Best offer on screen — make a moment of it before the rain hits.",
)

_CTA_LADDER: tuple[str, ...] = (
    "Take the small saving",
    "Yes — claim it",
    "Lock in the best deal",
)


def _ladder_pick(ladder: tuple[str, ...], position: int, total: int) -> str:
    """Map a 0..total-1 position onto a 0..len(ladder)-1 index.

    For ``total <= len(ladder)`` we space across the ladder (e.g. n=3 uses
    indices 0, 1, 2). For larger ``total`` we squeeze: position 0 → 0,
    last → last entry, mids interpolate. This keeps the conservative /
    balanced / generous tone aligned with the discount escalation.
    """
    if total <= 1:
        return ladder[len(ladder) - 1]
    ratio = position / (total - 1)
    idx = round(ratio * (len(ladder) - 1))
    return ladder[max(0, min(len(ladder) - 1, idx))]


def _interpolate_discounts(
    base: float, ceiling: float, n: int
) -> list[float]:
    """Linearly interpolate ``n`` discounts from ``base`` to ``ceiling``.

    Both endpoints are inclusive: n=1 returns ``[ceiling]`` (most generous —
    the user only sees one card, give them the best deal). n>=2 spans the
    full range so the first card is the floor and the last is the ceiling.
    """
    if n <= 0:
        return []
    if n == 1:
        return [round(ceiling, 2)]
    step = (ceiling - base) / (n - 1)
    return [round(base + step * i, 2) for i in range(n)]


def _format_label(pct: float) -> str:
    """Render a percent like 12.5 → ``−12.5%``; clean ints stay clean.

    Uses the en-dash + percent convention the rest of the catalog already
    uses (see ``_BONDI_OFFER`` in merchants.py).
    """
    if pct == int(pct):
        return f"−{int(pct)}%"
    return f"−{pct:.1f}%"


def _build_widget_spec(
    *,
    merchant_name: str,
    headline: str,
    discount_label: str,
    body: str,
    cta: str,
) -> dict[str, Any]:
    """Build a rainHero-shaped widget spec for one variant.

    Mirrors ``apps/mobile/src/demo/widgetSpecs.ts::rainHeroWidgetSpec`` so
    the mobile ``WidgetRenderer`` renders it with zero new code path. Schema
    is locked to View/ScrollView/Text/Image/Pressable per ``widgetSchema.ts``.
    """
    return {
        "type": "ScrollView",
        "className": "rounded-[34px] bg-ink",
        "children": [
            {
                "type": "Image",
                "source": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
                "accessibilityLabel": "Steaming hot cocoa on a cafe table beside a rain-streaked window",
                "className": "h-72 w-full rounded-t-[34px]",
            },
            {
                "type": "View",
                "className": "p-6",
                "children": [
                    {
                        "type": "View",
                        "className": "rounded-full bg-cream/10 px-3 py-2",
                        "children": [
                            {
                                "type": "Text",
                                "className": "text-xs font-bold uppercase tracking-[3px] text-cream/80 text-center",
                                "text": discount_label,
                            },
                        ],
                    },
                    {
                        "type": "Text",
                        "className": "mt-4 text-4xl font-black leading-[44px] text-cream",
                        "text": headline,
                    },
                    {
                        "type": "Text",
                        "className": "mt-3 text-base leading-6 text-cream/70",
                        "text": f"{merchant_name} · {body}",
                    },
                    {
                        "type": "Pressable",
                        "className": "mt-6 rounded-2xl bg-cream px-5 py-4",
                        "action": "redeem",
                        "text": cta,
                    },
                ],
            },
        ],
    }


def _lookup_merchant(merchant_id: str) -> dict[str, Any] | None:
    """Search every city catalog for ``merchant_id``.

    Returns the merchant dict (with ``display_name``) or ``None`` if no city
    knows the id. We don't take a city slug here because the wallet drawer
    already has the merchant id in hand.
    """
    for city_slug in ("berlin", "zurich"):
        merchants = get_merchants(city_slug) or []
        for entry in merchants:
            if entry["id"] == merchant_id:
                return entry
    return None


def build_alternatives(
    *,
    merchant_id: str,
    base_discount_pct: float = 5.0,
    max_discount_pct: float = 25.0,
    n: int = 3,
) -> list[dict[str, Any]] | None:
    """Build the variant ladder for a merchant.

    Returns ``None`` if the merchant id is unknown so the API layer can 404.
    Otherwise returns a list of variant dicts ordered cheapest → most
    generous. Each variant has a valid ``widget_spec`` (asserted via
    ``validate_widget_node``); if the build path ever produces an invalid
    spec it's a bug, not a runtime fallback.
    """
    merchant = _lookup_merchant(merchant_id)
    if merchant is None:
        return None

    safe_n = max(1, int(n))
    base = float(base_discount_pct)
    ceiling = float(max_discount_pct)
    if ceiling < base:
        ceiling = base

    discounts = _interpolate_discounts(base, ceiling, safe_n)
    merchant_name = merchant["display_name"]

    variants: list[dict[str, Any]] = []
    for position, pct in enumerate(discounts):
        label = _format_label(pct)
        headline = _ladder_pick(_HEADLINE_LADDER, position, safe_n)
        kicker = _ladder_pick(_KICKER_LADDER, position, safe_n)
        body = _ladder_pick(_BODY_LADDER, position, safe_n)
        cta = _ladder_pick(_CTA_LADDER, position, safe_n)
        widget_spec = _build_widget_spec(
            merchant_name=merchant_name,
            headline=headline,
            discount_label=label,
            body=f"{kicker} · {body}",
            cta=cta,
        )
        # Belt-and-braces: never ship a spec the mobile schema would reject.
        assert validate_widget_node(widget_spec), "alternatives widget_spec must validate"
        variants.append(
            {
                "variant_id": f"{merchant_id}-alt-{position + 1}",
                "headline": headline,
                "discount_pct": pct,
                "discount_label": label,
                "widget_spec": widget_spec,
            }
        )
    return variants


async def maybe_rewrite_with_llm(
    variants: list[dict[str, Any]],
    *,
    merchant: dict[str, Any],
) -> list[dict[str, Any]]:
    """Optionally rewrite headlines via Pydantic AI; falls through on failure.

    Reuses the existing ``run_headline_rewrite_agent`` so we don't introduce
    a fourth LLM surface. Tones the prompt by variant position (conservative
    / balanced / aggressive). Any exception falls back to the fixture
    headline silently — same demo-safety contract as opportunity_agent.py.
    """
    try:
        from .llm_agents import run_headline_rewrite_agent
    except Exception:  # pragma: no cover - import-time failure
        return variants

    rewritten: list[dict[str, Any]] = []
    for position, variant in enumerate(variants):
        aggressive = position == len(variants) - 1
        try:
            offer_stub = {
                "copy_seed": {
                    "headline_de": variant["headline"],
                    "headline_en": variant["headline"],
                    "body_de": variant.get("discount_label", ""),
                    "body_en": variant.get("discount_label", ""),
                }
            }
            wrapped = {
                "intent_token": "browsing_coffee",
                "high_intent": aggressive,
                "merchant_name": merchant.get("display_name"),
            }
            new_headline = await run_headline_rewrite_agent(
                offer=offer_stub,
                wrapped_user_context=wrapped,
                aggressive=aggressive,
            )
            patched = dict(variant)
            patched["headline"] = new_headline
            # Patch the headline node in the widget spec so the rendered
            # card matches the variant headline (the rainHero shape places
            # it at children[1].children[1]).
            spec = patched["widget_spec"]
            try:
                spec["children"][1]["children"][1]["text"] = new_headline
            except (KeyError, IndexError, TypeError):
                pass
            rewritten.append(patched)
        except Exception:  # pragma: no cover - provider/network dependent
            rewritten.append(variant)
    return rewritten
