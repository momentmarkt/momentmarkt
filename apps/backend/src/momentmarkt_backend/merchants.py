"""Static merchant catalog for the wallet drawer search surface.

This module powers ``GET /merchants/{city}`` (issue #115). Both the
Berlin and Zurich catalogs are hydrated from real OpenStreetMap
(Overpass API) places, captured 2026-04-26. The 4 canonical
density-fixture merchants for Berlin are preserved verbatim so signals,
density curves, and surfacing keep working. The remaining ~31 Berlin
entries are real Berlin Mitte POIs (cafes, bakeries, bars, bookstores,
etc.) so the wallet drawer renders recognisable names like
"St. Oberholz", "Zeit für Brot", "ocelot", "Mein Haus am See".

The Zurich catalog (issue #129) was scraped from Overpass around
Zurich HB (lat 47.3779, lon 8.5403; r=1500m) — 30 real POIs spread
across all 9 supported categories with names like "Orell Füssli",
"Mövenpick Ice Cream", "Bäckerei Conditorei Stocker", "Brezelkönig",
"Brasserie Federal". Distances are haversine metres from Zurich HB.

Active offers are attached to ~9 Berlin and ~9 Zurich merchants so
the wallet drawer's "Offers for you" pill shows a credible mix.
Cafe Bondi's offer is locked to the rain-trigger demo copy.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

# Allowed categories. Keep in sync with the API contract documented in
# main.py / agreed with the mobile agent.
CATEGORIES = (
    "cafe",
    "bakery",
    "bookstore",
    "kiosk",
    "restaurant",
    "bar",
    "boutique",
    "ice_cream",
    "florist",
)

CATALOG_NOW_ISO = "2026-04-26T12:00:00+02:00"
CATALOG_WALLET_EXPIRES_DATE = "2026-04-29"

# Single-glyph avatars by category. The mobile card uses these as a fallback
# when no merchant photo is available (which is always, for this demo).
CATEGORY_EMOJI: dict[str, str] = {
    "cafe": "☕",
    "bakery": "🥨",
    "bookstore": "📚",
    "kiosk": "📰",
    "restaurant": "🍴",
    "bar": "🍷",
    "boutique": "👗",
    "ice_cream": "🍦",
    "florist": "💐",
}


# Cafe Bondi's offer is the canonical rain-trigger demo offer. Do not edit
# without coordinating with the mobile + surfacing agents.
_BONDI_OFFER = {
    "headline": "20% off rainy-day filter coffee",
    "discount": "−20%",
    "expires_at_iso": "2026-04-29T15:00:00+02:00",
}


def _offer(headline: str, discount: str, expires: str = "2026-04-26T18:00:00+02:00") -> dict[str, str]:
    return {"headline": headline, "discount": discount, "expires_at_iso": _wallet_expiry(expires)}


def _wallet_expiry(expires: str) -> str:
    if expires.startswith("2026-04-26T"):
        return f"{CATALOG_WALLET_EXPIRES_DATE}{expires[10:]}"
    return expires


def active_offer_is_current(
    active_offer: dict[str, Any] | None,
    now_iso: str = CATALOG_NOW_ISO,
) -> bool:
    if not active_offer:
        return False
    expires = active_offer.get("expires_at_iso")
    if not isinstance(expires, str) or not expires:
        return False
    try:
        return datetime.fromisoformat(expires) > datetime.fromisoformat(now_iso)
    except ValueError:
        return False


def current_active_offer(
    merchant: dict[str, Any],
    now_iso: str = CATALOG_NOW_ISO,
) -> dict[str, Any] | None:
    offer = merchant.get("active_offer")
    return offer if active_offer_is_current(offer, now_iso=now_iso) else None


def _with_current_active_offer(merchant: dict[str, Any]) -> dict[str, Any]:
    item = dict(merchant)
    offer = current_active_offer(merchant)
    item["active_offer"] = dict(offer) if offer else None
    return item


# ---------------------------------------------------------------------------
# Berlin catalog (~35 merchants)
# ---------------------------------------------------------------------------
#
# Layout:
#   1) The 4 canonical density-fixture merchants (frozen ids; Cafe Bondi
#      first because the rain-trigger demo cut depends on it).
#   2) Real OpenStreetMap POIs around Mia's center, sorted by distance.
#      Names preserve the OSM ``name`` tag verbatim (umlauts intact).
#      Distances are haversine metres from (52.5301, 13.4012). Slug ids
#      embed a short lat-derived suffix to avoid collisions across
#      future scrapes.
#
# 12 entries carry an ``active_offer``; the rest are ``None`` so the
# wallet drawer's "Offers for you" pill shows a credible mix.

_BERLIN_MERCHANTS: list[dict[str, Any]] = [
    # --- Canonical (must stay in catalog, ids frozen) -----------------------
    {
        "id": "berlin-mitte-cafe-bondi",
        "display_name": "Cafe Bondi",
        "category": "cafe",
        "distance_m": 82,
        "neighborhood": "Mitte",
        "active_offer": _BONDI_OFFER,
    },
    {
        "id": "berlin-mitte-baeckerei-rosenthal",
        "display_name": "Backerei Rosenthal",
        "category": "bakery",
        "distance_m": 128,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "10% off pretzels after 14:00", "−10%", "2026-04-26T16:00:00+02:00"
        ),
    },
    {
        "id": "berlin-mitte-kiezbuchhandlung-august",
        "display_name": "Kiezbuchhandlung August",
        "category": "bookstore",
        "distance_m": 356,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-eisgarten-weinmeister",
        "display_name": "Eisgarten Weinmeister",
        "category": "ice_cream",
        "distance_m": 545,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Buy one scoop, get one half-price", "50% 2nd", "2026-04-26T19:00:00+02:00"
        ),
    },
    # --- Real OSM merchants near Rosenthaler Platz --------------------------
    {
        "id": "berlin-mitte-mein-haus-am-see-02998",
        "display_name": "Mein Haus am See",
        "category": "bar",
        "distance_m": 29,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Happy hour spritz €6 until 19:00",
            "−30%",
            "2026-04-26T19:00:00+02:00",
        ),
    },
    {
        "id": "berlin-mitte-sharlie-cheen-bar-03019",
        "display_name": "Sharlie Cheen Bar",
        "category": "bar",
        "distance_m": 37,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-the-barn-03005",
        "display_name": "The Barn",
        "category": "cafe",
        "distance_m": 39,
        "neighborhood": "Mitte",
        "active_offer": _offer("€2 off any pour-over", "€2 off"),
    },
    {
        "id": "berlin-mitte-huong-que-03039",
        "display_name": "Huong Quê",
        "category": "restaurant",
        "distance_m": 40,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Pho + iced tea €12 lunch deal", "Lunch €12", "2026-04-26T16:00:00+02:00"
        ),
    },
    {
        "id": "berlin-mitte-rosies-03015",
        "display_name": "Rosie's",
        "category": "bar",
        "distance_m": 45,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-crosta-03046",
        "display_name": "Crosta",
        "category": "restaurant",
        "distance_m": 49,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-100-gramm-lounge-03052",
        "display_name": "100 Gramm Lounge",
        "category": "bar",
        "distance_m": 57,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-fam-dang-02977",
        "display_name": "Fam. Dang",
        "category": "restaurant",
        "distance_m": 61,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-zeit-fur-brot-03038",
        "display_name": "Zeit für Brot",
        "category": "bakery",
        "distance_m": 66,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Cinnamon roll + filter coffee €5",
            "Bundle €5",
            "2026-04-26T11:30:00+02:00",
        ),
    },
    {
        "id": "berlin-mitte-late-night-shop-02949",
        "display_name": "Late Night Shop",
        "category": "kiosk",
        "distance_m": 68,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "2 Club-Mate for €4", "€1 off", "2026-04-26T22:00:00+02:00"
        ),
    },
    {
        "id": "berlin-mitte-aiko-03053",
        "display_name": "Aiko",
        "category": "restaurant",
        "distance_m": 73,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-st-oberholz-02953",
        "display_name": "St. Oberholz",
        "category": "cafe",
        "distance_m": 75,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Free pastry with any pour-over",
            "Free side",
            "2026-04-26T17:00:00+02:00",
        ),
    },
    {
        "id": "berlin-mitte-rotation-boutique-03047",
        "display_name": "Rotation Boutique",
        "category": "boutique",
        "distance_m": 75,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "10% off raincoats today only", "−10%", "2026-04-26T20:00:00+02:00"
        ),
    },
    {
        "id": "berlin-mitte-the-eatery-berlin-03070",
        "display_name": "The Eatery Berlin",
        "category": "restaurant",
        "distance_m": 78,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-mod-coffee-03063",
        "display_name": "Mod Coffee",
        "category": "cafe",
        "distance_m": 84,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-supercoff-03078",
        "display_name": "Supercoff",
        "category": "cafe",
        "distance_m": 88,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-aera-02940",
        "display_name": "AERA",
        "category": "bakery",
        "distance_m": 90,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-croissant-couture-03062",
        "display_name": "Croissant Couture",
        "category": "cafe",
        "distance_m": 92,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-flat-white-03084",
        "display_name": "flat white",
        "category": "cafe",
        "distance_m": 96,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-blumen-vanessa-02995",
        "display_name": "Blumen Vanessa",
        "category": "florist",
        "distance_m": 96,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Tulip bunch €7 (was €10)",
            "€3 off",
            "2026-04-26T18:00:00+02:00",
        ),
    },
    {
        "id": "berlin-mitte-vertere-03094",
        "display_name": "Vertere",
        "category": "boutique",
        "distance_m": 108,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-linerie-02903",
        "display_name": "Linerie",
        "category": "boutique",
        "distance_m": 119,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-asthetik-movement-03105",
        "display_name": "ästhetik movement",
        "category": "boutique",
        "distance_m": 121,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-suesse-suende-03109",
        "display_name": "Süße Sünde",
        "category": "ice_cream",
        "distance_m": 126,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-the-market-02965",
        "display_name": "The Market",
        "category": "kiosk",
        "distance_m": 144,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-hokey-pokey-02964",
        "display_name": "Hokey Pokey",
        "category": "ice_cream",
        "distance_m": 171,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-ocelot-03172",
        "display_name": "ocelot",
        "category": "bookstore",
        "distance_m": 220,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "15% off art books this weekend", "−15%", "2026-04-26T20:00:00+02:00"
        ),
    },
    {
        "id": "berlin-mitte-getraenkekiosk-03185",
        "display_name": "Getränkekiosk",
        "category": "kiosk",
        "distance_m": 235,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-acid-mitte-02798",
        "display_name": "Acid Mitte",
        "category": "bakery",
        "distance_m": 253,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-rosa-canina-02890",
        "display_name": "Rosa Canina",
        "category": "ice_cream",
        "distance_m": 286,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-buchhandlung-a-livraria-02933",
        "display_name": "Buchhandlung a Livraria",
        "category": "bookstore",
        "distance_m": 329,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-antiquariat-wiederhold-03139",
        "display_name": "Antiquariat Wiederhold",
        "category": "bookstore",
        "distance_m": 338,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-bio-konditorei-tillmann-02729",
        "display_name": "Bio-Konditorei Tillmann",
        "category": "bakery",
        "distance_m": 385,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-floristik-live-03346",
        "display_name": "Floristik live",
        "category": "florist",
        "distance_m": 423,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-blumen-jaeger-03399",
        "display_name": "Blumen Jäger",
        "category": "florist",
        "distance_m": 476,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
]


# ---------------------------------------------------------------------------
# Zurich catalog (~30 merchants, neighborhood "HB")
# ---------------------------------------------------------------------------
#
# Real OpenStreetMap POIs scraped from the Overpass API around Zurich HB
# (lat 47.3779, lon 8.5403; r=1500m) on 2026-04-26 (issue #129). 30 named
# nodes were chosen: ≥2 per available category (cafe, bakery, bookstore,
# kiosk, restaurant, bar, boutique, ice_cream, florist), then filled with
# the next-closest overall up to 30 entries. Names preserve OSM ``name``
# tag verbatim (umlauts + diacritics intact). Distances are haversine
# metres from Zurich HB.
#
# 9 entries carry an ``active_offer`` (one per category, biased to the
# closest in each) so "Offers for you" shows a credible mix without
# overwhelming the drawer. shop=clothes folds into the boutique category
# (same convention as the Berlin recipe).

_ZURICH_MERCHANTS: list[dict[str, Any]] = [
    {
        "id": "zurich-hb-collectif-mon-amour-94360",
        "display_name": "Collectif mon Amour",
        "category": "boutique",
        "distance_m": 8,
        "neighborhood": "HB",
        "active_offer": _offer(
            "10% off raincoats today only",
            "−10%",
            "2026-04-26T20:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-backerei-conditorei-stocker-61535",
        "display_name": "Bäckerei Conditorei Stocker",
        "category": "bakery",
        "distance_m": 22,
        "neighborhood": "HB",
        "active_offer": _offer(
            "Fresh Birchermüesli, −20%",
            "−20%",
            "2026-04-26T11:30:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-le-cafe-61594",
        "display_name": "Le Café",
        "category": "cafe",
        "distance_m": 29,
        "neighborhood": "HB",
        "active_offer": _offer(
            "Morning espresso flight, −15%",
            "−15%",
            "2026-04-26T18:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-brasserie-federal-00898",
        "display_name": "Brasserie Federal",
        "category": "restaurant",
        "distance_m": 34,
        "neighborhood": "HB",
        "active_offer": _offer(
            "Lunch special CHF 3 off",
            "CHF 3 off",
            "2026-04-26T16:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-il-baretto-61526",
        "display_name": "Il Baretto",
        "category": "cafe",
        "distance_m": 37,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-san-gennaro-00893",
        "display_name": "San Gennaro",
        "category": "restaurant",
        "distance_m": 39,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-chicoree-61542",
        "display_name": "Chicorée",
        "category": "boutique",
        "distance_m": 41,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-amari-94359",
        "display_name": "Amari",
        "category": "boutique",
        "distance_m": 44,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-cafe-oscar-00900",
        "display_name": "Cafe Oscar",
        "category": "cafe",
        "distance_m": 53,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-restaurant-oase-33439",
        "display_name": "Restaurant Oase",
        "category": "restaurant",
        "distance_m": 54,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-miro-06421",
        "display_name": "Miró",
        "category": "cafe",
        "distance_m": 57,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-sud-00904",
        "display_name": "Süd",
        "category": "restaurant",
        "distance_m": 65,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-time-lounge-61595",
        "display_name": "Time... Lounge",
        "category": "restaurant",
        "distance_m": 70,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-sora-sushi-00919",
        "display_name": "Sora Sushi",
        "category": "restaurant",
        "distance_m": 72,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-bayard-co-ltd-61562",
        "display_name": "Bayard Co Ltd",
        "category": "boutique",
        "distance_m": 73,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-the-counter-00897",
        "display_name": "The Counter",
        "category": "restaurant",
        "distance_m": 82,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-calida-94364",
        "display_name": "Calida",
        "category": "boutique",
        "distance_m": 82,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-starbucks-61544",
        "display_name": "Starbucks",
        "category": "cafe",
        "distance_m": 84,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-da-capo-bar-00903",
        "display_name": "Da Capo Bar",
        "category": "cafe",
        "distance_m": 85,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-brezelkonig-61545",
        "display_name": "Brezelkönig",
        "category": "bakery",
        "distance_m": 87,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-orell-fussli-54364",
        "display_name": "Orell Füssli",
        "category": "bookstore",
        "distance_m": 95,
        "neighborhood": "HB",
        "active_offer": _offer(
            "15% off art books this weekend",
            "−15%",
            "2026-04-26T20:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-blume-3000-54348",
        "display_name": "Blume 3000",
        "category": "florist",
        "distance_m": 110,
        "neighborhood": "HB",
        "active_offer": _offer(
            "Tulip bunch CHF 7 (was CHF 10)",
            "CHF 3 off",
            "2026-04-26T18:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-barth-bucher-61553",
        "display_name": "Barth Bücher",
        "category": "bookstore",
        "distance_m": 126,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-movenpick-ice-cream-79505",
        "display_name": "Mövenpick Ice Cream",
        "category": "ice_cream",
        "distance_m": 132,
        "neighborhood": "HB",
        "active_offer": _offer(
            "Two scoops for CHF 5",
            "CHF 1 off",
            "2026-04-26T20:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-blumen-kramer-61554",
        "display_name": "Blumen Krämer",
        "category": "florist",
        "distance_m": 133,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-kiosk-zhb-39139",
        "display_name": "Kiosk ZHB",
        "category": "kiosk",
        "distance_m": 151,
        "neighborhood": "HB",
        "active_offer": _offer(
            "CHF 2 off Rivella six-pack",
            "CHF 2 off",
            "2026-04-26T22:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-konrad-kaffee-cocktailbar-ex-0815-79187",
        "display_name": "Konrad Kaffee- & Cocktailbar (ex 0815)",
        "category": "bar",
        "distance_m": 161,
        "neighborhood": "HB",
        "active_offer": _offer(
            "Apéro hour: house wine CHF 6",
            "−25%",
            "2026-04-26T20:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-d-vino-18631",
        "display_name": "D-Vino",
        "category": "bar",
        "distance_m": 169,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-leonardo-62389",
        "display_name": "Leonardo",
        "category": "ice_cream",
        "distance_m": 273,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-k-snack-central-22313",
        "display_name": "k snack Central",
        "category": "kiosk",
        "distance_m": 329,
        "neighborhood": "HB",
        "active_offer": None,
    },
]


# Public registry. ``main.py`` looks up by lowercase city slug.
CATALOG: dict[str, list[dict[str, Any]]] = {
    "berlin": _BERLIN_MERCHANTS,
    "zurich": _ZURICH_MERCHANTS,
}


def list_cities() -> list[str]:
    return sorted(CATALOG.keys())


def get_merchants(city: str) -> list[dict[str, Any]] | None:
    """Return the catalog list for ``city`` (lowercased) or ``None``.

    Returning ``None`` lets the API layer translate a missing city into a
    404 without raising from this pure-data module.
    """

    return CATALOG.get(city.lower())


def search_merchants(
    city: str,
    query: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]] | None:
    """Substring search over display_name / category / neighborhood.

    - ``query`` is case-insensitive; an empty/None query returns all entries.
    - ``limit`` is applied after filtering, before returning.
    - Returns ``None`` if the city is unknown so callers can 404.
    """

    merchants = get_merchants(city)
    if merchants is None:
        return None
    if not query:
        filtered = list(merchants)
    else:
        needle = query.strip().lower()
        if not needle:
            filtered = list(merchants)
        else:
            filtered = [
                m
                for m in merchants
                if needle in m["display_name"].lower()
                or needle in m["category"].lower()
                or needle in m["neighborhood"].lower()
            ]
    if limit > 0:
        filtered = filtered[:limit]
    return [_with_current_active_offer(m) for m in filtered]


def emoji_for(category: str) -> str:
    return CATEGORY_EMOJI.get(category, "📍")
