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

import hashlib
from datetime import datetime
from typing import Any, Literal

from .genui import validate_widget_node
from .merchants import current_active_offer, get_merchants
from .negotiation_agent import (
    MerchantBounds,
    NegotiationContext,
    SwipeReaction,
    negotiate_offer,
)

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
# Per-category subhead pools (deterministic fallback when use_llm=False)
# ---------------------------------------------------------------------------
#
# The brief calls out "appropriate imagery, **tone, and emotional framing**"
# for the swipe stack — the subhead is the tone+emotion layer. The previous
# implementation hard-coded a single string per category ("small shop,
# owner-on-floor") which read as obvious LLM filler on every card.
#
# Each category now exposes a list of short, sensory phrases. We pick one
# deterministically per (merchant_id, time_bucket) using a hash so:
#   * the same merchant + time-of-day always yields the same subhead
#     (recordable demo, idempotent across refreshes), and
#   * different merchants in the same category surface different copy
#     across the swipe stack so the cards don't feel templated.
#
# When the LLM path is enabled (`use_llm=True`), `subhead_agent.py` takes
# the same context (merchant + offer + weather + time bucket) and produces
# a one-line subhead via Pydantic AI; the deterministic pool is the
# always-on fallback when the LLM call fails or is disabled (the demo
# default per `CLAUDE.md` Demo Truth Boundary).

_CATEGORY_SUBHEADS: dict[str, tuple[str, ...]] = {
    "cafe": (
        "Cocoa weather. Three stools open.",
        "Just brewed. Quietest hour.",
        "Steam on the window, last quiet table.",
        "Pour-over warm, the rain hasn't started.",
        "Owner at the bar, no queue.",
    ),
    "bakery": (
        "Just out of the oven, lunchbreak window.",
        "Crust still warm. Smell hits the street.",
        "Loaves cooling, last batch of the morning.",
        "Mid-walk pause. Two minutes inside.",
    ),
    "bar": (
        "Lights low, first round on the counter.",
        "Pre-rush. Stool by the window open.",
        "Evening just starting. Bartender unhurried.",
        "Quiet hour. Kitchen still calm.",
    ),
    "restaurant": (
        "Window seat free. Kitchen at its best now.",
        "Sit-down hour. Locals already in.",
        "Neighbourhood pick. Tonight's special on.",
        "Proper meal, no wait at the door.",
    ),
    "bookstore": (
        "Quiet hour. New arrivals shelf restocked.",
        "Browse a shelf, stay out of the rain.",
        "Reading chair empty. Coffee next door.",
        "Recommendations table just refreshed.",
    ),
    "kiosk": (
        "Quick grab, no detour required.",
        "Window glow. Cigarette + magazine run.",
        "Late opener. Cold drinks on the rack.",
        "Two-minute stop on the way home.",
    ),
    "ice_cream": (
        "Sun's out. Two scoops, three minutes max.",
        "Cold scoop, warm pavement.",
        "Window is open. Cone weather.",
        "Afternoon dip. No queue yet.",
    ),
    "boutique": (
        "Owner on the floor. New rack just out.",
        "Single rail of finds. No crowd.",
        "Quiet shop. Try-on room is free.",
        "Curated window, fresh stock today.",
    ),
    "florist": (
        "Stems just in. Lift the room tonight.",
        "Cut bunches by the door. Five minutes max.",
        "Fresh tulips. Owner wrapping at the bench.",
        "End-of-day stems, half the price.",
    ),
}


# Time-of-day buckets used by the subhead picker + the LLM prompt.
# Tightly chosen so the demo's 13:30 local time deterministically maps
# to "lunch" (the rain-trigger demo cut depends on that bucket label).
_TIME_BUCKETS: tuple[tuple[int, int, str], ...] = (
    (0, 5, "late_night"),
    (5, 11, "morning"),
    (11, 14, "lunch"),
    (14, 17, "afternoon"),
    (17, 21, "evening"),
    (21, 24, "late_night"),
)


def _time_bucket_for_hour(hour: int) -> str:
    """Return the human time-bucket label for a 24h hour.

    Buckets are intentionally coarse (lunch / afternoon / evening / …) so
    the LLM prompt and the deterministic fallback agree on the same
    discrete moment label even when the server clock drifts by minutes.
    """
    safe_hour = max(0, min(23, int(hour)))
    for start, end, label in _TIME_BUCKETS:
        if start <= safe_hour < end:
            return label
    return "afternoon"


def _current_time_bucket() -> str:
    """Server-clock time-bucket. Used when no demo time is available."""
    # Keep tz-naive so tests don't depend on a specific timezone offset —
    # the demo runs against the server's wall clock which is fine for the
    # 60-second recording.
    return _time_bucket_for_hour(datetime.now().hour)


def _current_day_of_week() -> str:
    """Lowercase three-letter day-of-week label for the LLM prompt."""
    return datetime.now().strftime("%a").lower()


def pick_fallback_subhead(
    *,
    merchant_id: str,
    category: str,
    time_bucket: str,
) -> str:
    """Pick a per-category subhead deterministically from the pool.

    Hash key is ``(merchant_id, time_bucket)`` so the same card at the
    same moment always shows the same subhead (idempotent demo state)
    while two different merchants in the same category get different
    copy (no templated swipe stack).

    Pool fallback chain: requested category → ``cafe`` (safe default) →
    a single neutral phrase. The chain guarantees we never return the
    empty string even for an unrecognised category id.
    """
    pool = _CATEGORY_SUBHEADS.get(category) or _CATEGORY_SUBHEADS.get("cafe", ())
    if not pool:
        return "A timely local pick."
    key = f"{merchant_id}|{time_bucket}".encode("utf-8")
    digest = hashlib.sha256(key).digest()
    # First 4 bytes give us 32 bits of entropy — plenty to pick from a
    # pool of <= 8 phrases without bias.
    index = int.from_bytes(digest[:4], "big") % len(pool)
    return pool[index]


# Process-local cache for the LLM-generated subhead. Keyed by the same
# tuple as the deterministic picker so a refresh inside the same minute
# bucket doesn't burn a second LLM call. Bounded loosely — the wallet
# only ships ~10 merchants per city per call, so the cache stays small.
_SUBHEAD_LLM_CACHE: dict[tuple[str, str, str], str] = {}


def _subhead_cache_key(
    *, merchant_id: str, weather_trigger: str, time_bucket: str
) -> tuple[str, str, str]:
    return (merchant_id, weather_trigger, time_bucket)


def cached_llm_subhead(
    *, merchant_id: str, weather_trigger: str, time_bucket: str
) -> str | None:
    """Return the cached LLM subhead for the (merchant, weather, time) key."""
    return _SUBHEAD_LLM_CACHE.get(
        _subhead_cache_key(
            merchant_id=merchant_id,
            weather_trigger=weather_trigger,
            time_bucket=time_bucket,
        )
    )


def store_llm_subhead(
    *,
    merchant_id: str,
    weather_trigger: str,
    time_bucket: str,
    subhead: str,
) -> None:
    """Cache the LLM subhead for the (merchant, weather, time) key."""
    _SUBHEAD_LLM_CACHE[
        _subhead_cache_key(
            merchant_id=merchant_id,
            weather_trigger=weather_trigger,
            time_bucket=time_bucket,
        )
    ] = subhead


def reset_subhead_cache() -> None:
    """Clear the LLM subhead cache. Used by tests."""
    _SUBHEAD_LLM_CACHE.clear()

# Photo per category. The stack already reads as a stack visually; this
# completes the differentiation so each card feels like a different place.
_CATEGORY_IMAGES: dict[str, tuple[tuple[str, str], ...]] = {
    "cafe": (
        ("https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80", "Cafe table with a steaming pour-over"),
        ("https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80", "Warm cafe bar with coffee cups"),
        ("https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1200&q=80", "Coffee being poured beside a cafe window"),
        ("https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1200&q=80", "Small cafe storefront with warm lights"),
        ("https://images.unsplash.com/photo-1459755486867-b55449bb39ff?auto=format&fit=crop&w=1200&q=80", "Cafe counter with cups and pastry plates"),
        ("https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1200&q=80", "Cozy cafe interior with tables"),
    ),
    "bakery": (
        ("https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80", "Fresh bread cooling on a wooden counter"),
        ("https://images.unsplash.com/photo-1568254183919-78a4f43a2877?auto=format&fit=crop&w=1200&q=80", "Pastries in a bakery display"),
        ("https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=1200&q=80", "Loaves stacked in a small bakery"),
    ),
    "bar": (
        ("https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80", "Dim-lit bar with cocktail glasses on the counter"),
        ("https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1200&q=80", "Cocktail bar with warm lights"),
        ("https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=80", "Back bar shelves with bottles and low light"),
        ("https://images.unsplash.com/photo-1575444758702-4a6b9222336e?auto=format&fit=crop&w=1200&q=80", "Cocktails lined up on a bar counter"),
    ),
    "restaurant": (
        ("https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80", "Neighbourhood restaurant table set for dinner"),
        ("https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80", "Restaurant counter with plates ready"),
        ("https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=1200&q=80", "Small restaurant table with plates and glasses"),
        ("https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=80", "Fresh meal on a restaurant table"),
    ),
    "bookstore": (
        ("https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80", "Bookstore shelves stacked with new releases"),
        ("https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1200&q=80", "Tall bookshelves in a quiet shop"),
        ("https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=80", "Bookstore wall with tightly packed shelves"),
    ),
    "kiosk": (
        ("https://images.unsplash.com/photo-1553531384-cc64ac80f931?auto=format&fit=crop&w=1200&q=80", "Late-night kiosk window glowing under a streetlight"),
        ("https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=1200&q=80", "Small local shop counter"),
        ("https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=1200&q=80", "Corner shop aisle with shelves"),
        ("https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1200&q=80", "Grocery shelves with colorful packaged goods"),
    ),
    "ice_cream": (
        ("https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=1200&q=80", "Two scoops of ice cream in a waffle cone"),
        ("https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=1200&q=80", "Ice cream cones in a shop window"),
        ("https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=1200&q=80", "Ice cream cones with bright scoops"),
        ("https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?auto=format&fit=crop&w=1200&q=80", "Colorful scoops in an ice cream case"),
    ),
    "boutique": (
        ("https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&w=1200&q=80", "Small boutique window with curated outfits"),
        ("https://images.unsplash.com/photo-1521334884684-d80222895322?auto=format&fit=crop&w=1200&q=80", "Clothing rack in a boutique"),
        ("https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80", "Boutique retail floor with clothing racks"),
        ("https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=80", "Minimal clothing display in a small shop"),
    ),
    "florist": (
        ("https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=1200&q=80", "Fresh flower bouquets on a florist table"),
        ("https://images.unsplash.com/photo-1455659817273-f96807779a8a?auto=format&fit=crop&w=1200&q=80", "Fresh flowers gathered in market buckets"),
        ("https://images.unsplash.com/photo-1487070183336-b863922373d4?auto=format&fit=crop&w=1200&q=80", "Florist wrapping flowers at a counter"),
        ("https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80", "Bright flower bouquets in a shop"),
        ("https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&w=1200&q=80", "Florist display with colorful stems"),
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
        return current_active_offer(m) is not None

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
    subhead: str | None = None,
) -> dict[str, Any]:
    """Build a rainHero-shaped widget spec for one merchant card.

    Mirrors ``apps/mobile/src/demo/widgetSpecs.ts::rainHeroWidgetSpec`` so
    the mobile WidgetRenderer renders it with zero new code path. The
    merchant's own display name, category-styled photo, and offer copy
    fill the slots — the visual variety comes from category, not from
    the template.

    ``subhead`` is the per-card tone+emotion line (issue #151). When
    omitted we pick deterministically from the per-category pool using
    the server-clock time bucket — the demo-safe default.
    """
    name = merchant["display_name"]
    category = merchant.get("category", "")
    active = current_active_offer(merchant) or {}
    headline = active.get("headline") or f"{name} — local pick"
    label = _format_label_from_offer(active)
    body = subhead or pick_fallback_subhead(
        merchant_id=merchant["id"],
        category=category,
        time_bucket=_current_time_bucket(),
    )
    image_url, image_alt = _image_for_merchant(
        category=category,
        merchant_id=merchant["id"],
    )

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


def _image_for_merchant(*, category: str, merchant_id: str) -> tuple[str, str]:
    pool = _CATEGORY_IMAGES.get(category)
    if not pool:
        return _DEFAULT_IMAGE
    digest = hashlib.sha256(merchant_id.encode("utf-8")).digest()
    return pool[int.from_bytes(digest[:2], "big") % len(pool)]


def build_alternatives(
    *,
    merchant_id: str,
    n: int = 3,
    seen_variant_ids: list[str] | None = None,
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

    Backwards-compat thin wrapper. Callers that need the rotation
    contract (`total_candidates` / `exhausted`) use
    `build_alternatives_with_meta` directly.
    """
    result = build_alternatives_with_meta(
        merchant_id=merchant_id,
        n=n,
        seen_variant_ids=seen_variant_ids or [],
    )
    if result is None:
        return None
    return result["variants"]


def build_alternatives_with_meta(
    *,
    merchant_id: str,
    n: int = 3,
    seen_variant_ids: list[str] | None = None,
) -> dict[str, Any] | None:
    """Build the anchored variant list + rotation metadata (issue #151).

    Returns ``None`` if the merchant id is unknown. Otherwise:

      {
        "variants": [...],          # up to n cards (anchor pinned first)
        "total_candidates": int,    # full pool size for this anchor
        "exhausted": bool,          # True when seen-set covers tail
      }

    The seen-set filter applies to NON-anchor candidates only. The
    anchor (card 1) is the safety card the user just tapped, so even
    when its id appears in `seen_variant_ids` we keep it pinned at
    position 0 — otherwise the swipe stack feels broken ("I tapped
    this and it disappeared"). `exhausted` flips True when every
    non-anchor candidate is in the seen-set; the mobile renders the
    "switch lens" end state when that happens.
    """
    anchor = _lookup_merchant(merchant_id)
    if anchor is None:
        return None

    city_slug = _city_for_merchant(merchant_id) or "berlin"
    safe_n = max(1, int(n))
    seen_set = set(seen_variant_ids or [])

    # Full anchored pool (anchor + every cross-merchant candidate the
    # widening logic would consider). The pool size is what
    # `total_candidates` reports.
    full_pool = _candidate_merchants(
        anchor=anchor,
        city_slug=city_slug,
        n=10_000,  # effectively "all candidates"
    )

    anchor_picks = full_pool[:1]
    tail_pool = [m for m in full_pool[1:] if m["id"] not in seen_set]
    picks = (anchor_picks + tail_pool)[:safe_n]

    total_candidates = len(full_pool)
    non_anchor_pool = full_pool[1:]
    exhausted = bool(non_anchor_pool) and all(
        m["id"] in seen_set for m in non_anchor_pool
    )

    variants: list[dict[str, Any]] = []
    for position, merchant in enumerate(picks):
        active = current_active_offer(merchant) or {}
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
                "expires_at_iso": active.get("expires_at_iso"),
                "widget_spec": widget_spec,
                # Issue #156: the first card of every fresh fetch is the
                # "special surface" — the mobile overlays a "⚡ Just for
                # you" pill on it and pulses a dot on the Discover tab
                # if the user isn't already there. On the anchored
                # (merchant-tap) path the anchor IS that card.
                "is_special_surface": position == 0,
            }
        )
    return {
        "variants": variants,
        "total_candidates": total_candidates,
        "exhausted": exhausted,
    }


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
    active = current_active_offer(merchant) or {}
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
        "expires_at_iso": active.get("expires_at_iso"),
        "widget_spec": widget_spec,
        # Issue #156: default False — caller (the lens builder) flips
        # the top-of-pool card's flag to True after the list is sorted.
        # Anchored builds set the flag inline because the anchor is
        # known at construction time.
        "is_special_surface": False,
    }


def _city_with_offers(city_slug: str) -> list[dict[str, Any]]:
    """Catalog entries with an ``active_offer`` for ``city_slug``.

    Empty list when the city is unknown — callers either 404 (anchored
    paths) or return a degenerate response (lens paths). The list is a
    fresh copy so callers can sort it without mutating the cached
    catalog.
    """
    catalog = get_merchants(city_slug) or []
    return [m for m in catalog if current_active_offer(m) is not None]


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
    seen_variant_ids: list[str] | None = None,
) -> list[dict[str, Any]] | None:
    """Build the per-lens variant list (back-compat thin wrapper).

    Callers that need the rotation contract (`total_candidates` /
    `exhausted`) should call `build_alternatives_for_lens_with_meta`
    directly. This wrapper preserves the pre-#151 signature so older
    test paths and tools keep working.
    """
    result = build_alternatives_for_lens_with_meta(
        lens=lens,
        city=city,
        merchant_id=merchant_id,
        n=n,
        seen_variant_ids=seen_variant_ids or [],
    )
    if result is None:
        return None
    return result["variants"]


def build_alternatives_for_lens_with_meta(
    *,
    lens: str,
    city: str | None = None,
    merchant_id: str | None = None,
    n: int = 3,
    seen_variant_ids: list[str] | None = None,
) -> dict[str, Any] | None:
    """Build the per-lens variant list + rotation metadata (issues #137 + #151).

    Returns ``None`` when the lens needs an anchor merchant that isn't
    in any catalog (`for_you` with an unknown ``merchant_id``). Otherwise:

      {
        "variants": [...],          # up to n cards from the lens pool
        "total_candidates": int,    # full pool size for this lens (today)
        "exhausted": bool,          # True when seen-set covers the pool
      }

    `seen_variant_ids` is filtered out of the candidate pool BEFORE
    picking the top-N. When the filter empties the pool the response
    sets `exhausted=True` and `variants=[]` — the mobile renders the
    "you've seen all today's offers — switch lens or refresh" end state.

    Lens behaviour
    --------------
    - ``for_you``: when ``merchant_id`` is provided, defer to the
      anchored builder (anchor pinned at position 0, tail filtered by
      seen-set). Without an anchor: every city merchant with an offer,
      distance-sorted, ready for the preference agent in the API layer.
    - ``best_deals``: every city merchant with an offer, sorted by
      parsed discount percent descending.
    - ``right_now``: weather-trigger × category whitelist applied to the
      city catalog, then distance-sorted.
    - ``nearby``: every city merchant with an offer, distance-sorted.
      Strict deterministic fallback per `DESIGN_PRINCIPLES.md` #4.
    """
    safe_n = max(1, int(n))
    seen_set = set(seen_variant_ids or [])
    # Resolve city: explicit > derived from merchant_id > "berlin".
    city_slug = (city or "").lower() or (
        _city_for_merchant(merchant_id) if merchant_id else None
    ) or "berlin"

    if lens == "for_you" and merchant_id:
        # Anchored personalised path — pinning + seen filter handled by
        # the anchored builder.
        return build_alternatives_with_meta(
            merchant_id=merchant_id,
            n=safe_n,
            seen_variant_ids=list(seen_set),
        )

    # ---- Non-anchored lens path: pure pool → filter → sort → top-N ----
    pool = _city_with_offers(city_slug)

    if lens == "right_now":
        trigger = _resolve_weather_trigger(city_slug)
        whitelist = _RIGHT_NOW_BY_TRIGGER.get(trigger, ())
        if whitelist:
            filtered = [m for m in pool if m.get("category") in whitelist]
            # Only narrow when the filter actually keeps something — an
            # empty filter result would surface no cards at all.
            if filtered:
                pool = filtered

    elif lens not in ("for_you", "best_deals", "nearby"):
        # Unknown lens — Pydantic should already block this, but be defensive.
        return None

    total_candidates = len(pool)

    # Apply the seen-set filter BEFORE sorting + slicing. The pool size
    # we report (total_candidates) is the lens's full pool today, not
    # the post-filter remainder, so the mobile can show "X / N seen"
    # progress instead of a shrinking number.
    filtered_pool = [m for m in pool if m["id"] not in seen_set]
    exhausted = bool(pool) and not filtered_pool

    # Per-lens ordering on the filtered pool.
    if lens == "best_deals":
        # Stable sort: distance tiebreaker first, then discount desc.
        filtered_pool.sort(key=lambda m: m.get("distance_m", 10_000))
        filtered_pool.sort(
            key=lambda m: _discount_pct_from_offer(current_active_offer(m)),
            reverse=True,
        )
    else:
        # for_you (no anchor) / right_now / nearby — distance ascending.
        filtered_pool.sort(key=lambda m: m.get("distance_m", 10_000))

    variants = [
        _build_variant_dict(merchant=m, is_anchor=False)
        for m in filtered_pool[:safe_n]
    ]
    # Issue #156: the first variant of every fresh fetch is the
    # "special surface". On the lens paths there's no anchor, so
    # the top-of-pool card claims the flag. Empty `variants` (the
    # exhausted end-state) gets no flag at all.
    if variants:
        variants[0]["is_special_surface"] = True
    return {
        "variants": variants,
        "total_candidates": total_candidates,
        "exhausted": exhausted,
    }


async def maybe_rewrite_subheads(
    variants: list[dict[str, Any]],
    *,
    weather_trigger: str,
    time_bucket: str,
    day_of_week: str,
    use_llm: bool,
) -> list[dict[str, Any]]:
    """Generate per-card subheads (issue #151).

    Replaces the per-card body Text node (`children[1].children[3].text`
    in the rainHero-shaped tree) with either an LLM-generated subhead
    (when ``use_llm=True``) or the deterministic per-category +
    time-bucket pick. Idempotent — safe to call multiple times on the
    same variant list.

    The subhead is the tone+emotion layer of the card; the headline
    keeps the offer copy. See `subhead_agent.py` for the LLM prompt
    contract.
    """
    # Lazy import to avoid the circular dependency at module load.
    from .subhead_agent import generate_subhead

    rewritten: list[dict[str, Any]] = []
    for variant in variants:
        try:
            subhead = await generate_subhead(
                merchant_id=variant["merchant_id"],
                merchant_name=variant.get("merchant_display_name", ""),
                category=variant.get("merchant_category", ""),
                neighborhood=variant.get("neighborhood", ""),
                headline=variant.get("headline", ""),
                discount_label=variant.get("discount_label", ""),
                weather_trigger=weather_trigger,
                time_bucket=time_bucket,
                day_of_week=day_of_week,
                use_llm=use_llm,
            )
        except Exception:  # pragma: no cover - defensive: never break the stack
            subhead = pick_fallback_subhead(
                merchant_id=variant["merchant_id"],
                category=variant.get("merchant_category", ""),
                time_bucket=time_bucket,
            )
        patched = dict(variant)
        spec = patched.get("widget_spec")
        if isinstance(spec, dict):
            try:
                # rainHero-shaped tree: children[1].children[3] is the
                # body subhead Text node (kicker, name, headline, body).
                spec["children"][1]["children"][3]["text"] = subhead
            except (KeyError, IndexError, TypeError):
                pass
        rewritten.append(patched)
    return rewritten


# ---------------------------------------------------------------------------
# Negotiation wiring (issue #164)
# ---------------------------------------------------------------------------
#
# `negotiation_agent.py` ships fully implemented + tested but, prior to
# #164, was not wired into the live offer flow — variants surfaced at
# the merchant's nominal discount with no per-user adjustment. The
# helper below is the seam: each variant gains a ``negotiation_meta``
# block + a ``nominal_discount_pct`` field carrying the merchant's
# original number, while ``discount_pct`` becomes the negotiated value.
#
# Bounds derivation (until the v2 merchant portal lands per #138):
# floor = the merchant's own advertised pct (the number they already
# committed to publicly), ceiling = floor + 20pp capped at 50%.
# Defaults to (5, 25) when the catalog discount string can't be
# parsed — keeps the band non-degenerate so the negotiation has room
# to move on noisy inputs.

# Conservative ceiling extension above the merchant's nominal discount.
# Floor pad: how far BELOW the merchant's nominal we let the agent
# retreat. The wedge per #138 is "find the smallest discount the user
# will accept" — the floor should sit below the published number so the
# cold-start can open below nominal and right-swipes can retreat
# further toward the merchant's preferred minimum.
_BOUNDS_FLOOR_PAD_PCT = 10.0
# Hard cap on the ceiling regardless of merchant nominal — prevents a
# weirdly-formatted catalog string ("90% off" parsed literally) from
# letting the agent escalate to absurd numbers AND prevents the served
# discount from ever exceeding the merchant's published number on the
# demo path (ceiling = nominal in our derivation).
_BOUNDS_CEILING_HARD_CAP_PCT = 50.0
# Default floor / ceiling when the catalog discount string yields 0pct
# (e.g. free-form "Bundle €5" labels). Matches the negotiation tests'
# "_bounds" defaults so behaviour is uniform across the suite.
_DEFAULT_FLOOR_PCT = 5.0
_DEFAULT_CEILING_PCT = 25.0


def _merchant_bounds_from_variant(variant: dict[str, Any]) -> MerchantBounds:
    """Derive ``MerchantBounds`` from the variant's parsed discount.

    Stand-in for the v2 merchant portal that will eventually persist
    floor/ceiling/allowed_categories/brand_tone per merchant. For the
    hackathon demo we treat the catalog's published ``discount_pct``
    as the **ceiling** (the merchant has already publicly committed to
    that number — they will not exceed it) and pad the floor downward
    by ``_BOUNDS_FLOOR_PAD_PCT`` so the agent has room to retreat
    toward the merchant's wedge ("smallest discount the user will
    accept"). Free-form labels (no parseable %) collapse to the
    default band so the negotiation still has room to move.
    """
    nominal = float(variant.get("discount_pct") or 0.0)
    if nominal <= 0.0:
        floor = _DEFAULT_FLOOR_PCT
        ceiling = _DEFAULT_CEILING_PCT
    else:
        ceiling = min(_BOUNDS_CEILING_HARD_CAP_PCT, max(0.0, nominal))
        floor = max(0.0, ceiling - _BOUNDS_FLOOR_PAD_PCT)
        if ceiling < floor:
            ceiling = floor
    category = variant.get("merchant_category", "")
    return MerchantBounds(
        merchant_id=variant.get("merchant_id", "unknown"),
        discount_floor_pct=floor,
        discount_ceiling_pct=ceiling,
        allowed_categories=[category] if category else [],
        brand_tone=None,
    )


def _swipe_history_for_merchant(
    *,
    merchant_id: str,
    nominal_pct: float,
    preference_context: list[Any] | None,
) -> list[SwipeReaction]:
    """Translate the round's PriorSwipe log into per-variant
    ``SwipeReaction`` entries the negotiation agent understands.

    The PriorSwipe shape (merchant_id, dwell_ms, swiped_right) is the
    cross-merchant preference signal carried through the API; the
    negotiation agent's SwipeReaction expects the per-card discount the
    user reacted to. We feed back the *nominal* discount the variant
    would have shown so the agent's heuristic reasons against the
    merchant's own published number — the most defensible reference
    point for the demo.
    """
    if not preference_context:
        return []
    history: list[SwipeReaction] = []
    for entry in preference_context:
        # PriorSwipe is a Pydantic model in the API request flow but we
        # stay duck-typed here so callers can pass either the model or
        # plain dicts (the integration test takes the dict path).
        if hasattr(entry, "model_dump"):
            data = entry.model_dump()
        elif isinstance(entry, dict):
            data = entry
        else:
            continue
        if data.get("merchant_id") != merchant_id:
            continue
        try:
            history.append(
                SwipeReaction(
                    discount_pct_offered=float(nominal_pct),
                    dwell_ms=int(data.get("dwell_ms", 0)),
                    swiped_right=bool(data.get("swiped_right", False)),
                )
            )
        except (TypeError, ValueError):
            continue
    return history


def apply_negotiation(
    variants: list[dict[str, Any]],
    *,
    preference_context: list[Any] | None = None,
    use_llm: bool = False,
) -> list[dict[str, Any]]:
    """Run the negotiation agent on each variant and patch the result.

    For each variant:
      * derive merchant bounds from the catalog's own discount label,
      * build a per-merchant swipe history from the round's
        ``preference_context`` (PriorSwipe entries that reference this
        merchant),
      * call ``negotiate_offer`` to get the bounds-honouring discount,
      * preserve the original number in ``nominal_discount_pct``,
      * attach a ``negotiation_meta`` block carrying the floor, ceiling,
        applied pct, and one-line reasoning so downstream surfaces
        (merchant audit log, demo dev panel) can inspect the decision.

    Additive — never drops or reorders variants and never raises (any
    negotiation failure falls back to the variant's nominal pct so the
    swipe stack stays renderable).
    """
    patched: list[dict[str, Any]] = []
    for variant in variants:
        nominal = float(variant.get("discount_pct") or 0.0)
        bounds = _merchant_bounds_from_variant(variant)
        history = _swipe_history_for_merchant(
            merchant_id=variant.get("merchant_id", ""),
            nominal_pct=nominal,
            preference_context=preference_context,
        )
        try:
            offer = negotiate_offer(
                NegotiationContext(
                    bounds=bounds,
                    history=history,
                    current_round_count=len(history),
                ),
                use_llm=use_llm,
            )
            applied_pct = float(offer.discount_pct)
            reason = offer.reasoning
        except Exception:  # pragma: no cover - defensive: never break the stack
            applied_pct = max(
                bounds.discount_floor_pct,
                min(bounds.discount_ceiling_pct, nominal),
            )
            reason = "Negotiation skipped — fell back to merchant nominal."
        # Final clamp — belt-and-braces against any LLM hallucination
        # bypassing the agent's own clamp.
        applied_pct = max(
            bounds.discount_floor_pct,
            min(bounds.discount_ceiling_pct, applied_pct),
        )
        new_variant = dict(variant)
        new_variant["nominal_discount_pct"] = nominal
        new_variant["discount_pct"] = applied_pct
        new_variant["negotiation_meta"] = {
            "floor_pct": float(bounds.discount_floor_pct),
            "ceiling_pct": float(bounds.discount_ceiling_pct),
            "applied_pct": float(applied_pct),
            "reason": reason,
        }
        patched.append(new_variant)
    return patched


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
