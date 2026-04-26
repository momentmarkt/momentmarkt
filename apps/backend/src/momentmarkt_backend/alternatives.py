"""Cross-merchant alternatives generator for the swipe-to-pick mechanic
(issues #132 → #136 → #137).

The mechanic shifted from "3 price points of the same merchant" (the
original #132 ladder) to "3 cards, each from a DIFFERENT merchant in the
same (or close) category." With #137 the swipe stack becomes the wallet's
PRIMARY surface and the user picks one of four lenses to switch curation
strategy: ``for_you`` (LLM personalization), ``best_deals`` (deterministic
discount sort), ``right_now`` (weather × category rule-based), ``nearby``
(pure distance — strict deterministic fallback per
``DESIGN_PRINCIPLES.md`` #4).

Selection algorithm by lens
---------------------------
- **for_you**, anchored: existing cross-merchant-from-category logic.
  Anchor merchant pinned at position 0; the rest sorted by distance with
  optional preference-agent re-rank in the API layer.
- **for_you**, no anchor: every city merchant with an ``active_offer``
  sorted by distance, ready for the preference agent to re-rank.
- **best_deals**: every city merchant with ``active_offer`` sorted by
  parsed ``discount_pct`` descending. No LLM call. No anchor.
- **right_now**: filter by current weather trigger from
  ``signals.build_signal_context`` then sort by distance. Lookup table
  documents the mapping (rain_incoming → cafe/bakery/bookstore/kiosk;
  clear → ice_cream/restaurant/cafe). No LLM call.
- **nearby**: every city merchant with ``active_offer`` sorted by
  distance ascending. **No LLM. No preference signal applied. Pure
  determinism — this is the "Nearby" lens called out in
  DESIGN_PRINCIPLES.md #4 as the user's escape hatch.**

Each picked merchant produces an `AlternativeOffer` carrying that
merchant's own name, discount, and a rainHero-shaped widget_spec. The
mobile renderer handles the visual differentiation per merchant — same
template, different copy + photo.

Optional re-ranking through `preference_agent.py` happens at the API
layer (see `main.py::post_offers_alternatives`); this module is the
pure deterministic candidate-pool builder.
"""

from __future__ import annotations

from typing import Any, Literal

from .genui import validate_widget_node
from .merchants import get_merchants

# Public lens enum — kept here so Pydantic in `main.py` can `Literal[...]`
# off the same constant set without a circular import. Order matches the
# UX (default first).
LensKey = Literal["for_you", "best_deals", "right_now", "nearby"]
LENS_KEYS: tuple[str, ...] = ("for_you", "best_deals", "right_now", "nearby")


# ---------------------------------------------------------------------------
# Category neighbourhoods for the "fewer than N" fallback
# ---------------------------------------------------------------------------
#
# When the same-category candidate pool is too thin, we widen by one
# semantic step. The pairings below were chosen so the resulting card
# still feels relevant to the original tap (a cafe-tapper accepts a
# bakery card; not a florist card).

_CATEGORY_NEIGHBOURS: dict[str, tuple[str, ...]] = {
    "cafe": ("bakery",),
    "bakery": ("cafe",),
    "bar": ("restaurant",),
    "restaurant": ("bar",),
    "bookstore": ("kiosk",),
    "kiosk": ("bookstore",),
    "ice_cream": ("bakery", "cafe"),
    "boutique": (),
    "florist": (),
}


# ---------------------------------------------------------------------------
# Per-category copy hints
# ---------------------------------------------------------------------------
#
# Each card is framed slightly differently so the swipe stack reads as
# "three real options" rather than three identical templates. The hints
# below are short — the merchant's own headline carries the actual offer.

_CATEGORY_BODY: dict[str, str] = {
    "cafe": "warm pour-over, work-from-here vibe",
    "bakery": "fresh bake, perfect mid-walk pause",
    "bar": "easy first round, evening just starting",
    "restaurant": "proper sit-down, neighbourhood favourite",
    "bookstore": "browse a shelf, stay out of the rain",
    "kiosk": "quick grab, no detour required",
    "ice_cream": "cold scoop, two minutes max",
    "boutique": "small shop, owner-on-floor",
    "florist": "fresh stems, lift the room",
}

# Photo per category. The stack already reads as a stack visually; this
# completes the differentiation so each card feels like a different place.
_CATEGORY_IMAGE: dict[str, tuple[str, str]] = {
    "cafe": (
        "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
        "Cafe table with a steaming pour-over",
    ),
    "bakery": (
        "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
        "Fresh bread cooling on a wooden counter",
    ),
    "bar": (
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80",
        "Dim-lit bar with cocktail glasses on the counter",
    ),
    "restaurant": (
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
        "Neighbourhood restaurant table set for dinner",
    ),
    "bookstore": (
        "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80",
        "Bookstore shelves stacked with new releases",
    ),
    "kiosk": (
        "https://images.unsplash.com/photo-1553531384-cc64ac80f931?auto=format&fit=crop&w=1200&q=80",
        "Late-night kiosk window glowing under a streetlight",
    ),
    "ice_cream": (
        "https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=1200&q=80",
        "Two scoops of ice cream in a waffle cone",
    ),
    "boutique": (
        "https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&w=1200&q=80",
        "Small boutique window with curated outfits",
    ),
    "florist": (
        "https://images.unsplash.com/photo-1524598171353-ce84a52cf923?auto=format&fit=crop&w=1200&q=80",
        "Florist counter with fresh tulips and peonies",
    ),
}

# Default fallback image for any unrecognised category.
_DEFAULT_IMAGE = (
    "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
    "Local merchant scene",
)


_KNOWN_CITIES: tuple[str, ...] = ("berlin", "zurich")


# Right-now lens: weather trigger → category whitelist. Rule-based by
# explicit choice (DESIGN_PRINCIPLES.md #6) — the LLM stays out of this
# lens so the mapping is verifiable by hand.
#
# - rain_incoming: covered places to wait it out (cafes, bookstores) +
#   quick grabs that don't require a long detour (bakery, kiosk).
# - clear: warm-weather treats + sit-down spots that benefit from foot
#   traffic when the streets are pleasant.
# - other / unknown trigger: empty whitelist → caller falls back to the
#   full catalog (lens still works, but the filter is a no-op).
_RIGHT_NOW_BY_TRIGGER: dict[str, tuple[str, ...]] = {
    "rain_incoming": ("cafe", "bookstore", "kiosk", "bakery"),
    "clear": ("ice_cream", "restaurant", "cafe"),
}


def _city_for_merchant(merchant_id: str) -> str | None:
    """Reverse-lookup the city slug owning ``merchant_id``."""
    for city_slug in _KNOWN_CITIES:
        merchants = get_merchants(city_slug) or []
        if any(m["id"] == merchant_id for m in merchants):
            return city_slug
    return None


def _lookup_merchant(merchant_id: str) -> dict[str, Any] | None:
    """Search every city catalog for ``merchant_id``.

    Returns the merchant dict (with ``display_name``, ``category``,
    ``active_offer``) or ``None`` if no city knows the id.
    """
    for city_slug in _KNOWN_CITIES:
        merchants = get_merchants(city_slug) or []
        for entry in merchants:
            if entry["id"] == merchant_id:
                return entry
    return None


def _candidate_merchants(
    *,
    anchor: dict[str, Any],
    city_slug: str,
    n: int,
) -> list[dict[str, Any]]:
    """Build the ordered candidate pool for ``anchor``.

    Order: anchor first (always — the safety card), then the rest sorted
    by distance ascending. Same-category first; if fewer than ``n``
    total, widen to neighbour categories (cafe ↔ bakery, etc.) until we
    hit ``n`` or run out of catalog.
    """
    catalog = get_merchants(city_slug) or []
    anchor_id = anchor["id"]
    anchor_category = anchor["category"]

    def _has_offer(m: dict[str, Any]) -> bool:
        return m.get("active_offer") is not None

    def _sorted_pool(category: str) -> list[dict[str, Any]]:
        return sorted(
            (
                m
                for m in catalog
                if m["category"] == category
                and m["id"] != anchor_id
                and _has_offer(m)
            ),
            key=lambda m: m.get("distance_m", 10_000),
        )

    # Anchor always card 1, even if it has no active_offer (then we still
    # surface it so the user can fall back to what they tapped). The
    # widget_spec builder will handle the missing-offer case.
    picks: list[dict[str, Any]] = [anchor]

    # Same-category first.
    same = _sorted_pool(anchor_category)
    for m in same:
        if len(picks) >= n:
            break
        picks.append(m)

    # Widen to neighbour categories if still short.
    if len(picks) < n:
        for neighbour in _CATEGORY_NEIGHBOURS.get(anchor_category, ()):
            for m in _sorted_pool(neighbour):
                if len(picks) >= n:
                    break
                picks.append(m)
            if len(picks) >= n:
                break

    # Still short → widen further to ANY category with an offer in the
    # same city (last-resort, keeps the demo always-3 cards).
    if len(picks) < n:
        already = {p["id"] for p in picks}
        rest = sorted(
            (m for m in catalog if m["id"] not in already and _has_offer(m)),
            key=lambda m: m.get("distance_m", 10_000),
        )
        for m in rest:
            if len(picks) >= n:
                break
            picks.append(m)

    return picks[:n]


def _format_label_from_offer(active_offer: dict[str, Any] | None) -> str:
    """Pull the merchant's own discount label, or a neutral fallback."""
    if not active_offer:
        return "Local pick"
    discount = active_offer.get("discount")
    if isinstance(discount, str) and discount.strip():
        return discount.strip()
    return "Today's deal"


def _discount_pct_from_offer(active_offer: dict[str, Any] | None) -> float:
    """Best-effort percent extraction from the merchant's own discount label.

    The catalog stores discount as free-form strings ("−20%", "−10%",
    "Bundle €5", "CHF 3 off", "50% 2nd"). For the demo's swipe-stack
    chip we want a single number. We parse leading digits from a "%"
    string, otherwise fall back to ``0.0`` (the chip then renders the
    label string instead of the percent).
    """
    if not active_offer:
        return 0.0
    discount = active_offer.get("discount", "")
    if not isinstance(discount, str):
        return 0.0
    cleaned = discount.replace("−", "-").replace("–", "-").strip()
    # find first numeric run
    digits = ""
    seen_digit = False
    for ch in cleaned:
        if ch.isdigit() or (ch == "." and seen_digit):
            digits += ch
            seen_digit = True
        elif seen_digit:
            break
    if not digits:
        return 0.0
    try:
        return float(digits)
    except ValueError:
        return 0.0


def _build_widget_spec(
    *,
    merchant: dict[str, Any],
) -> dict[str, Any]:
    """Build a rainHero-shaped widget spec for one merchant card.

    Mirrors ``apps/mobile/src/demo/widgetSpecs.ts::rainHeroWidgetSpec`` so
    the mobile WidgetRenderer renders it with zero new code path. The
    merchant's own display name, category-styled photo, and offer copy
    fill the slots — the visual variety comes from category, not from
    the template.
    """
    name = merchant["display_name"]
    category = merchant.get("category", "")
    active = merchant.get("active_offer") or {}
    headline = active.get("headline") or f"{name} — local pick"
    label = _format_label_from_offer(active)
    body = _CATEGORY_BODY.get(category, "well-timed local offer")
    image_url, image_alt = _CATEGORY_IMAGE.get(category, _DEFAULT_IMAGE)

    return {
        "type": "ScrollView",
        "className": "rounded-[34px] bg-ink",
        "children": [
            {
                "type": "Image",
                "source": image_url,
                "accessibilityLabel": image_alt,
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
                                "text": label,
                            },
                        ],
                    },
                    {
                        "type": "Text",
                        "className": "mt-3 text-base font-bold uppercase tracking-[2px] text-cream/70",
                        "text": name,
                    },
                    {
                        "type": "Text",
                        "className": "mt-2 text-3xl font-black leading-[40px] text-cream",
                        "text": headline,
                    },
                    {
                        "type": "Text",
                        "className": "mt-3 text-base leading-6 text-cream/70",
                        "text": body,
                    },
                    {
                        "type": "Pressable",
                        "className": "mt-6 rounded-2xl bg-cream px-5 py-4",
                        "action": "redeem",
                        "text": f"Go to {name}",
                    },
                ],
            },
        ],
    }


def build_alternatives(
    *,
    merchant_id: str,
    n: int = 3,
    # Kept for backwards-compat with old callers; no longer drives
    # discount values (each card uses its own merchant's offer).
    base_discount_pct: float = 5.0,  # noqa: ARG001 - back-compat
    max_discount_pct: float = 25.0,  # noqa: ARG001 - back-compat
) -> list[dict[str, Any]] | None:
    """Build the cross-merchant variant list for an anchor merchant.

    Returns ``None`` if the merchant id is unknown so the API layer can
    404. Otherwise returns up to ``n`` variant dicts. Each variant
    represents a different merchant (anchor first) and carries that
    merchant's own offer — not a synthesised price point.
    """
    anchor = _lookup_merchant(merchant_id)
    if anchor is None:
        return None

    city_slug = _city_for_merchant(merchant_id) or "berlin"
    safe_n = max(1, int(n))
    picks = _candidate_merchants(anchor=anchor, city_slug=city_slug, n=safe_n)

    variants: list[dict[str, Any]] = []
    for position, merchant in enumerate(picks):
        active = merchant.get("active_offer") or {}
        label = _format_label_from_offer(active)
        pct = _discount_pct_from_offer(active)
        headline = active.get("headline") or f"{merchant['display_name']} — local pick"
        widget_spec = _build_widget_spec(merchant=merchant)
        # Belt-and-braces: never ship a spec the mobile schema would reject.
        assert validate_widget_node(widget_spec), "alternatives widget_spec must validate"
        variants.append(
            {
                # variant_id is now genuinely the merchant id (not a
                # synthesised slug) so the mobile knows which merchant
                # the user picked once they swipe right.
                "variant_id": merchant["id"],
                "merchant_id": merchant["id"],
                "merchant_display_name": merchant["display_name"],
                "merchant_category": merchant.get("category", ""),
                "distance_m": int(merchant.get("distance_m", 0)),
                "is_anchor": position == 0,
                "headline": headline,
                "discount_pct": pct,
                "discount_label": label,
                "widget_spec": widget_spec,
            }
        )
    return variants


def _build_variant_dict(
    *,
    merchant: dict[str, Any],
    is_anchor: bool,
) -> dict[str, Any]:
    """Build one cross-merchant variant dict from a catalog entry.

    Shared by every lens so the wire shape stays identical regardless of
    which curation strategy chose the merchant. The mobile renderer treats
    each variant as a swipeable card; the lens just decides ordering.
    """
    active = merchant.get("active_offer") or {}
    label = _format_label_from_offer(active)
    pct = _discount_pct_from_offer(active)
    headline = active.get("headline") or f"{merchant['display_name']} — local pick"
    widget_spec = _build_widget_spec(merchant=merchant)
    assert validate_widget_node(widget_spec), "alternatives widget_spec must validate"
    return {
        "variant_id": merchant["id"],
        "merchant_id": merchant["id"],
        "merchant_display_name": merchant["display_name"],
        "merchant_category": merchant.get("category", ""),
        "distance_m": int(merchant.get("distance_m", 0)),
        "is_anchor": is_anchor,
        "headline": headline,
        "discount_pct": pct,
        "discount_label": label,
        "widget_spec": widget_spec,
    }


def _city_with_offers(city_slug: str) -> list[dict[str, Any]]:
    """Catalog entries with an ``active_offer`` for ``city_slug``.

    Empty list when the city is unknown — callers either 404 (anchored
    paths) or return a degenerate response (lens paths). The list is a
    fresh copy so callers can sort it without mutating the cached
    catalog.
    """
    catalog = get_merchants(city_slug) or []
    return [m for m in catalog if m.get("active_offer") is not None]


def _resolve_weather_trigger(city_slug: str) -> str:
    """Best-effort weather trigger for the right-now lens.

    Wraps `signals.build_signal_context` so the lens reads the same
    deterministic fixture the rest of the demo uses. Any failure
    (unknown city, missing fixture) collapses to ``"clear"`` so the
    right-now lens remains usable even when the signals stack hiccups.
    """
    try:
        from .signals import build_signal_context
        ctx = build_signal_context(city=city_slug)
        trigger = ctx.get("weather", {}).get("trigger")
        if isinstance(trigger, str) and trigger:
            return trigger
    except (FileNotFoundError, KeyError, ValueError):
        # Per the demo-safety contract, never raise from the lens path
        # — just fall back to "clear" and let the lens degrade
        # gracefully to the full city catalog.
        pass
    return "clear"


def build_alternatives_for_lens(
    *,
    lens: str,
    city: str | None = None,
    merchant_id: str | None = None,
    n: int = 3,
) -> list[dict[str, Any]] | None:
    """Build the per-lens variant list for the swipe stack (issue #137).

    Returns ``None`` when the lens needs an anchor merchant that isn't
    in any catalog (`for_you` with an unknown ``merchant_id``). Returns
    an empty list when the candidate pool is genuinely empty (e.g. a
    weather-filtered set with no matching merchants — the caller can
    still respond 200 with no variants).

    Lens behaviour
    --------------
    - ``for_you``: when ``merchant_id`` is provided, defer to
      `build_alternatives` (anchor card 1 + cross-merchant tail). Without
      an anchor: every city merchant with an offer, distance-sorted,
      ready for the preference agent in the API layer.
    - ``best_deals``: every city merchant with an offer, sorted by parsed
      discount percent descending. Anchor pinned only when the explicit
      ``merchant_id`` matches one of the picks (we don't pin a
      merchant the user didn't tap — that would defeat the lens).
    - ``right_now``: weather-trigger × category whitelist applied to the
      city catalog, then distance-sorted. Whitelist falls back to "no
      filter" for unknown triggers.
    - ``nearby``: every city merchant with an offer, distance-sorted.
      Strict deterministic fallback per `DESIGN_PRINCIPLES.md` #4.
    """
    safe_n = max(1, int(n))
    # Resolve city: explicit > derived from merchant_id > "berlin".
    city_slug = (city or "").lower() or (
        _city_for_merchant(merchant_id) if merchant_id else None
    ) or "berlin"

    if lens == "for_you" and merchant_id:
        # Anchored personalised path — keep the existing contract intact.
        return build_alternatives(merchant_id=merchant_id, n=safe_n)

    if lens == "for_you":
        pool = _city_with_offers(city_slug)
        pool.sort(key=lambda m: m.get("distance_m", 10_000))
        return [
            _build_variant_dict(merchant=m, is_anchor=False)
            for m in pool[:safe_n]
        ]

    if lens == "best_deals":
        pool = _city_with_offers(city_slug)
        # Sort by parsed discount percent descending. Stable sort keeps
        # a distance tiebreak — when two merchants advertise the same
        # percent the closer one wins.
        pool.sort(key=lambda m: m.get("distance_m", 10_000))
        pool.sort(
            key=lambda m: _discount_pct_from_offer(m.get("active_offer")),
            reverse=True,
        )
        return [
            _build_variant_dict(merchant=m, is_anchor=False)
            for m in pool[:safe_n]
        ]

    if lens == "right_now":
        trigger = _resolve_weather_trigger(city_slug)
        whitelist = _RIGHT_NOW_BY_TRIGGER.get(trigger, ())
        pool = _city_with_offers(city_slug)
        if whitelist:
            filtered = [m for m in pool if m.get("category") in whitelist]
            # Only narrow when the filter actually keeps something — an
            # empty filter result would surface no cards at all.
            if filtered:
                pool = filtered
        pool.sort(key=lambda m: m.get("distance_m", 10_000))
        return [
            _build_variant_dict(merchant=m, is_anchor=False)
            for m in pool[:safe_n]
        ]

    if lens == "nearby":
        # DESIGN_PRINCIPLES.md #4 — strict deterministic fallback.
        # No LLM, no preference signal, no category filter. Pure
        # distance sort over every merchant with an offer.
        pool = _city_with_offers(city_slug)
        pool.sort(key=lambda m: m.get("distance_m", 10_000))
        return [
            _build_variant_dict(merchant=m, is_anchor=False)
            for m in pool[:safe_n]
        ]

    # Unknown lens — Pydantic should already block this, but be defensive.
    return None


async def maybe_rewrite_with_llm(
    variants: list[dict[str, Any]],
    *,
    merchant: dict[str, Any],
) -> list[dict[str, Any]]:
    """Optionally rewrite per-variant headlines via Pydantic AI.

    Each variant now represents a different merchant, so we tone the
    rewrite by position-in-stack (anchor → gentle, later cards → more
    direct). Failures fall back to the merchant's own headline silently
    — same demo-safety contract as opportunity_agent.py.
    """
    try:
        from .llm_agents import run_headline_rewrite_agent
    except Exception:  # pragma: no cover - import-time failure
        return variants

    rewritten: list[dict[str, Any]] = []
    for position, variant in enumerate(variants):
        aggressive = position > 0  # anchor stays gentle; later cards lean in
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
                "intent_token": "browsing_local",
                "high_intent": aggressive,
                "merchant_name": variant.get("merchant_display_name"),
                "anchor_name": merchant.get("display_name"),
            }
            new_headline = await run_headline_rewrite_agent(
                offer=offer_stub,
                wrapped_user_context=wrapped,
                aggressive=aggressive,
            )
            patched = dict(variant)
            patched["headline"] = new_headline
            spec = patched["widget_spec"]
            try:
                # rainHero-shaped tree: children[1].children[2] is the
                # headline Text node (kicker, name, headline order).
                spec["children"][1]["children"][2]["text"] = new_headline
            except (KeyError, IndexError, TypeError):
                pass
            rewritten.append(patched)
        except Exception:  # pragma: no cover - provider/network dependent
            rewritten.append(variant)
    return rewritten
