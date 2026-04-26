"""Static merchant catalog for the wallet drawer search surface.

This module powers `GET /merchants/{city}` (issue #115). The catalog is a
hand-curated, hackathon-safe expansion of the 4 canonical merchants in
``data/transactions/berlin-density.json`` so the mobile drawer can render
"search + Offers for you" without depending on a real geo backend.

Distances are pre-computed from Mia's demo position (Berlin: lat 52.5301,
lon 13.4012; near Rosenthaler Platz). Zurich distances are from the HB
demo center (lat 47.3780, lon 8.5403). The 4 canonical Berlin merchants
keep their existing ids so the rest of the demo (signals, surfacing,
density chart) keeps working.

Active offers are intentionally sparse (~12 of ~34 in Berlin, ~3 of 8 in
Zurich). Cafe Bondi's offer is locked to the rain-trigger demo copy.
"""

from __future__ import annotations

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
    "expires_at_iso": "2026-04-26T15:00:00+02:00",
}


def _offer(headline: str, discount: str, expires: str = "2026-04-26T18:00:00+02:00") -> dict[str, str]:
    return {"headline": headline, "discount": discount, "expires_at_iso": expires}


# ---------------------------------------------------------------------------
# Berlin catalog (~34 merchants)
# ---------------------------------------------------------------------------
#
# The first four entries are the canonical density-fixture merchants. Their
# ``id`` values MUST match data/transactions/berlin-density.json. Cafe Bondi
# additionally carries the rain-trigger demo offer.
#
# Remaining entries are synthetic but use realistic Berlin Mitte names and
# plausible distances/neighborhoods. Distances were eyeballed against
# OpenStreetMap from Rosenthaler Platz; they are demo-grade only.

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
    # --- Cafes --------------------------------------------------------------
    {
        "id": "berlin-mitte-cafe-cinema",
        "display_name": "Cafe Cinema",
        "category": "cafe",
        "distance_m": 410,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-the-barn-roastery",
        "display_name": "The Barn Roastery",
        "category": "cafe",
        "distance_m": 720,
        "neighborhood": "Mitte",
        "active_offer": _offer("€2 off any pour-over", "€2 off"),
    },
    {
        "id": "berlin-prenzlauerberg-bonanza-coffee",
        "display_name": "Bonanza Coffee Roasters",
        "category": "cafe",
        "distance_m": 1180,
        "neighborhood": "Prenzlauer Berg",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-cafe-nullpunkt",
        "display_name": "Cafe Nullpunkt",
        "category": "cafe",
        "distance_m": 230,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    # --- Bakeries -----------------------------------------------------------
    {
        "id": "berlin-mitte-baeckerei-siebert",
        "display_name": "Bäckerei Siebert",
        "category": "bakery",
        "distance_m": 290,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-zeit-fuer-brot",
        "display_name": "Zeit für Brot",
        "category": "bakery",
        "distance_m": 95,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Cinnamon roll + filter coffee €5",
            "Bundle €5",
            "2026-04-26T11:30:00+02:00",
        ),
    },
    {
        "id": "berlin-prenzlauerberg-baeckerei-domberger",
        "display_name": "Bäckerei Domberger",
        "category": "bakery",
        "distance_m": 1320,
        "neighborhood": "Prenzlauer Berg",
        "active_offer": None,
    },
    # --- Bookstores ---------------------------------------------------------
    {
        "id": "berlin-mitte-buchhandlung-walther-koenig",
        "display_name": "Buchhandlung Walther König",
        "category": "bookstore",
        "distance_m": 640,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "15% off art books this weekend", "−15%", "2026-04-26T20:00:00+02:00"
        ),
    },
    {
        "id": "berlin-mitte-do-you-read-me",
        "display_name": "do you read me?!",
        "category": "bookstore",
        "distance_m": 320,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-friedrichshain-shakespeare-und-soehne",
        "display_name": "Shakespeare und Söhne",
        "category": "bookstore",
        "distance_m": 1450,
        "neighborhood": "Friedrichshain",
        "active_offer": None,
    },
    # --- Kiosks / Spätis ----------------------------------------------------
    {
        "id": "berlin-mitte-spaeti-am-hackeschen-markt",
        "display_name": "Späti am Hackeschen Markt",
        "category": "kiosk",
        "distance_m": 470,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-kiosk-rosenthaler-platz",
        "display_name": "Kiosk Rosenthaler Platz",
        "category": "kiosk",
        "distance_m": 60,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "2 Club-Mate for €4", "€1 off", "2026-04-26T22:00:00+02:00"
        ),
    },
    {
        "id": "berlin-prenzlauerberg-spaeti-kastanienallee",
        "display_name": "Späti Kastanienallee",
        "category": "kiosk",
        "distance_m": 980,
        "neighborhood": "Prenzlauer Berg",
        "active_offer": None,
    },
    # --- Restaurants --------------------------------------------------------
    {
        "id": "berlin-mitte-restaurant-zur-letzten-instanz",
        "display_name": "Zur letzten Instanz",
        "category": "restaurant",
        "distance_m": 1100,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-monsieur-vuong",
        "display_name": "Monsieur Vuong",
        "category": "restaurant",
        "distance_m": 380,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Pho + iced tea €12 lunch deal", "Lunch €12", "2026-04-26T16:00:00+02:00"
        ),
    },
    {
        "id": "berlin-mitte-mogg-deli",
        "display_name": "Mogg Deli",
        "category": "restaurant",
        "distance_m": 510,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-friedrichshain-burgermeister",
        "display_name": "Burgermeister Schlesisches Tor",
        "category": "restaurant",
        "distance_m": 1480,
        "neighborhood": "Friedrichshain",
        "active_offer": None,
    },
    # --- Bars ---------------------------------------------------------------
    {
        "id": "berlin-mitte-buck-and-breck",
        "display_name": "Buck and Breck",
        "category": "bar",
        "distance_m": 760,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-clarchens-ballhaus",
        "display_name": "Clärchens Ballhaus",
        "category": "bar",
        "distance_m": 480,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Happy hour spritz €6 until 19:00",
            "−30%",
            "2026-04-26T19:00:00+02:00",
        ),
    },
    {
        "id": "berlin-prenzlauerberg-prater-garten",
        "display_name": "Prater Garten",
        "category": "bar",
        "distance_m": 1240,
        "neighborhood": "Prenzlauer Berg",
        "active_offer": None,
    },
    # --- Boutiques ----------------------------------------------------------
    {
        "id": "berlin-mitte-voo-store",
        "display_name": "Voo Store",
        "category": "boutique",
        "distance_m": 690,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-andreas-murkudis",
        "display_name": "Andreas Murkudis",
        "category": "boutique",
        "distance_m": 1390,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-soto-store",
        "display_name": "Soto Store",
        "category": "boutique",
        "distance_m": 540,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "10% off raincoats today only", "−10%", "2026-04-26T20:00:00+02:00"
        ),
    },
    # --- Ice cream ----------------------------------------------------------
    {
        "id": "berlin-mitte-rosa-canina",
        "display_name": "Rosa Canina Eis",
        "category": "ice_cream",
        "distance_m": 350,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-prenzlauerberg-jones-ice-cream",
        "display_name": "Jones Ice Cream",
        "category": "ice_cream",
        "distance_m": 1080,
        "neighborhood": "Prenzlauer Berg",
        "active_offer": None,
    },
    # --- Florists -----------------------------------------------------------
    {
        "id": "berlin-mitte-marsano-blumen",
        "display_name": "Marsano Blumen",
        "category": "florist",
        "distance_m": 220,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Tulip bunch €7 (was €10)",
            "€3 off",
            "2026-04-26T18:00:00+02:00",
        ),
    },
    {
        "id": "berlin-mitte-blumen-koenig",
        "display_name": "Blumen König",
        "category": "florist",
        "distance_m": 410,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-prenzlauerberg-marsano-kollwitz",
        "display_name": "Marsano Kollwitzplatz",
        "category": "florist",
        "distance_m": 1260,
        "neighborhood": "Prenzlauer Berg",
        "active_offer": None,
    },
    # --- Extras to round out the count --------------------------------------
    {
        "id": "berlin-mitte-spaeti-torstrasse",
        "display_name": "Späti Torstraße",
        "category": "kiosk",
        "distance_m": 140,
        "neighborhood": "Mitte",
        "active_offer": None,
    },
    {
        "id": "berlin-mitte-cafe-fes",
        "display_name": "Cafe Fes",
        "category": "cafe",
        "distance_m": 880,
        "neighborhood": "Mitte",
        "active_offer": _offer(
            "Free baklava with any tea",
            "Free side",
            "2026-04-26T17:00:00+02:00",
        ),
    },
]


# ---------------------------------------------------------------------------
# Zurich catalog (~8 merchants, neighborhood "HB")
# ---------------------------------------------------------------------------

_ZURICH_MERCHANTS: list[dict[str, Any]] = [
    {
        "id": "zurich-hb-kafi-viadukt",
        "display_name": "Kafi Viadukt",
        "category": "cafe",
        "distance_m": 115,
        "neighborhood": "HB",
        "active_offer": _offer(
            "12% cashback on filter coffee",
            "−12%",
            "2026-04-26T18:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-baeckerei-kleiner",
        "display_name": "Bäckerei Kleiner",
        "category": "bakery",
        "distance_m": 240,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-buchhandlung-orell-fuessli",
        "display_name": "Buchhandlung Orell Füssli",
        "category": "bookstore",
        "distance_m": 320,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-kiosk-bahnhof",
        "display_name": "Kiosk Bahnhof",
        "category": "kiosk",
        "distance_m": 60,
        "neighborhood": "HB",
        "active_offer": _offer(
            "CHF 2 off Rivella six-pack",
            "CHF 2 off",
            "2026-04-26T22:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-restaurant-zeughauskeller",
        "display_name": "Zeughauskeller",
        "category": "restaurant",
        "distance_m": 780,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-bar-old-crow",
        "display_name": "Old Crow",
        "category": "bar",
        "distance_m": 540,
        "neighborhood": "HB",
        "active_offer": None,
    },
    {
        "id": "zurich-hb-eisdiele-gelati-am-see",
        "display_name": "Gelati am See",
        "category": "ice_cream",
        "distance_m": 1190,
        "neighborhood": "HB",
        "active_offer": _offer(
            "Two scoops for CHF 5",
            "CHF 1 off",
            "2026-04-26T20:00:00+02:00",
        ),
    },
    {
        "id": "zurich-hb-blumenladen-bahnhof",
        "display_name": "Blumenladen Bahnhof",
        "category": "florist",
        "distance_m": 90,
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
    return filtered


def emoji_for(category: str) -> str:
    return CATEGORY_EMOJI.get(category, "📍")
