"""One-shot merchant enrichment CLI (issue #165).

Iterates the static merchant catalog (``merchants.search_merchants``) for
a given city and produces ``data/merchants/enriched/{city}.json`` with
per-merchant ground truth that the Opportunity Agent can splice into
its LLM prompt context: typical hours, signature items, price tier,
vibe descriptors, top review quotes.

Run::

    python -m momentmarkt_backend.scripts.enrich_merchants berlin
    python -m momentmarkt_backend.scripts.enrich_merchants zurich

Behaviour:
- Pulls a small "context hint" per merchant from OpenStreetMap Nominatim
  over plain HTTPS (no API key needed). This gives us website, cuisine,
  opening_hours when OSM has them — which it does for many real Berlin
  Mitte / Zurich HB POIs.
- Feeds the catalog row + Nominatim hint into a Pydantic AI agent built
  with the same Azure-or-OpenRouter dispatch pattern as
  ``llm_agents.py``. The agent emits a ``MerchantEnrichment`` model.
- If the LLM call fails (no provider configured, rate limit, network),
  falls back to a deterministic per-category enrichment so the demo
  still has a populated JSON file. The ``source`` field on each entry
  records which path produced it.
- Concurrency is capped at 6 to stay under provider rate limits.
- Per-merchant failures never tank the whole run.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from ..merchant_enrichment import ENRICHED_DIR
from ..merchants import emoji_for, search_merchants

logger = logging.getLogger("momentmarkt.enrich")


# ---------------------------------------------------------------------------
# Output schema
# ---------------------------------------------------------------------------

PriceTier = Literal["€", "€€", "€€€", "€€€€"]


class SignatureItem(BaseModel):
    name: str = Field(description="Short menu/product name, no marketing fluff.")
    price_eur: float | None = Field(
        default=None,
        description="Local-currency price as a number (Berlin EUR, Zurich CHF). Null if unknown.",
    )
    popularity_note: str | None = Field(
        default=None,
        description="One short clause about why locals order it (e.g. 'bestseller', 'comes warm').",
    )


class MerchantEnrichment(BaseModel):
    id: str
    display_name: str
    category: str
    hours_typical: dict[str, str] = Field(
        description="Compact hours map, e.g. {'mon-fri': '08:00-18:00', 'sat': '09:00-19:00'}.",
        default_factory=dict,
    )
    signature_items: list[SignatureItem] = Field(default_factory=list)
    price_tier: PriceTier = "€€"
    vibe_descriptors: list[str] = Field(
        description="3-5 short adjectives/noun-phrases capturing the vibe.",
        default_factory=list,
    )
    top_review_quotes: list[str] = Field(
        description="0-2 short paraphrased quotes (under 100 chars each). Empty if unsure.",
        default_factory=list,
    )
    updated_at: str = Field(description="ISO-8601 UTC timestamp.")
    source: Literal["llm", "offline_heuristic", "llm_partial"] = "llm"


# ---------------------------------------------------------------------------
# OSM Nominatim hint fetch
# ---------------------------------------------------------------------------

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "MomentMarkt-Enricher/1.0 (https://github.com/mmtftr/momentmarkt)"

# Nominatim usage policy: max 1 request/sec. We serialise OSM lookups
# behind a dedicated lock + sleep so we never trip 429s, while leaving
# the LLM concurrency limit free to parallelise the (slower) LLM calls.
_NOMINATIM_LOCK = asyncio.Lock()
_NOMINATIM_INTERVAL_S = 1.1


async def fetch_osm_hint(
    client: httpx.AsyncClient, display_name: str, city: str
) -> dict[str, Any]:
    """Best-effort Nominatim lookup. Always returns a dict (possibly empty)."""

    params = {
        "q": f"{display_name}, {city}",
        "format": "json",
        "addressdetails": "0",
        "extratags": "1",
        "limit": "1",
    }
    async with _NOMINATIM_LOCK:
        try:
            response = await client.get(
                NOMINATIM_URL,
                params=params,
                headers={"User-Agent": USER_AGENT, "Accept-Language": "en,de"},
                timeout=8.0,
            )
            response.raise_for_status()
            results = response.json()
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            logger.debug("nominatim lookup failed for %s: %s", display_name, exc)
            await asyncio.sleep(_NOMINATIM_INTERVAL_S)
            return {}
        await asyncio.sleep(_NOMINATIM_INTERVAL_S)
    if not isinstance(results, list) or not results:
        return {}
    hit = results[0]
    extratags = hit.get("extratags") or {}
    return {
        "osm_display_name": hit.get("display_name"),
        "osm_class": hit.get("class"),
        "osm_type": hit.get("type"),
        "website": extratags.get("website") or extratags.get("contact:website"),
        "opening_hours": extratags.get("opening_hours"),
        "cuisine": extratags.get("cuisine"),
        "phone": extratags.get("phone") or extratags.get("contact:phone"),
        "wheelchair": extratags.get("wheelchair"),
        "outdoor_seating": extratags.get("outdoor_seating"),
    }


# ---------------------------------------------------------------------------
# LLM enrichment (Pydantic AI, same dispatch as llm_agents.py)
# ---------------------------------------------------------------------------


def _llm_available() -> bool:
    provider = os.environ.get("MOMENTMARKT_LLM_PROVIDER", "").strip().lower()
    model = os.environ.get("MOMENTMARKT_LLM_MODEL")
    if not model:
        return False
    if provider == "azure":
        return bool(
            os.environ.get("AZURE_OPENAI_ENDPOINT")
            and os.environ.get("AZURE_OPENAI_API_KEY")
        )
    if provider == "openrouter":
        return bool(os.environ.get("OPENROUTER_API_KEY"))
    return ":" in model


async def enrich_via_llm(
    merchant: dict[str, Any], osm_hint: dict[str, Any], city: str
) -> MerchantEnrichment:
    """Run a Pydantic AI agent to extract a MerchantEnrichment.

    Reuses the same model-dispatch logic as ``llm_agents._model_name``
    (Azure / OpenRouter / fallback prefix) so this script picks up the
    same ``MOMENTMARKT_LLM_PROVIDER`` env the rest of the backend uses.
    """

    from pydantic_ai import Agent

    from ..llm_agents import _model_name

    model = _model_name()
    currency = "EUR" if city == "berlin" else "CHF"
    instructions = (
        "You are the MomentMarkt Merchant Enricher. Given a merchant catalog row "
        "(name, category, neighborhood, distance) and an optional OpenStreetMap hint "
        "(website, opening_hours, cuisine), return a grounded MerchantEnrichment.\n"
        "\n"
        "Rules:\n"
        "- Use OSM opening_hours when present; otherwise infer plausible hours_typical "
        "for that category in that city's central neighborhood (Berlin Mitte or Zurich HB).\n"
        "- signature_items must be 2-5 entries, each a real item that this category of "
        "merchant in this city would credibly sell. Prices in local currency "
        f"({currency}). If OSM cuisine tag is set, ground items in that cuisine.\n"
        "- vibe_descriptors must be 3-5 short adjectives or noun-phrases (e.g. "
        "'third-wave coffee', 'laptop-friendly', 'late-night spritz').\n"
        "- top_review_quotes: 0-2 short paraphrased lines under 100 chars. Leave empty "
        "rather than invent a fake quote.\n"
        "- price_tier: € (cheap), €€ (mid), €€€ (premium), €€€€ (luxury).\n"
        "- Never invent a merchant website or phone — those come from OSM only.\n"
        "- Output only the structured MerchantEnrichment."
    )
    prompt = {
        "task": "Extract MerchantEnrichment for one merchant.",
        "city": city,
        "currency": currency,
        "merchant": {
            "id": merchant["id"],
            "display_name": merchant["display_name"],
            "category": merchant["category"],
            "neighborhood": merchant.get("neighborhood"),
            "distance_m": merchant.get("distance_m"),
            "active_offer_headline": (merchant.get("active_offer") or {}).get("headline"),
        },
        "osm_hint": osm_hint or {"note": "no OSM match"},
    }
    agent = Agent(model, output_type=MerchantEnrichment, instructions=instructions)
    result = await agent.run(json.dumps(prompt, ensure_ascii=False))
    enrichment = result.output
    # Force the id/category back to the catalog values so the LLM can't drift.
    enrichment.id = merchant["id"]
    enrichment.display_name = merchant["display_name"]
    enrichment.category = merchant["category"]
    enrichment.updated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    enrichment.source = "llm"
    return enrichment


# ---------------------------------------------------------------------------
# Offline heuristic fallback (per category)
# ---------------------------------------------------------------------------

# Generic but plausible per-category enrichment. Used when no LLM provider
# is configured or the LLM call fails for a single merchant. Prices stay in
# the city's local currency. These read as "real-feeling defaults" rather
# than truly LLM-grounded ground truth — the source field flags that.
_CATEGORY_DEFAULTS: dict[str, dict[str, Any]] = {
    "cafe": {
        "hours_typical": {"mon-fri": "08:00-18:00", "sat-sun": "09:00-18:00"},
        "items": [
            {"name": "Flat white", "popularity_note": "go-to morning order"},
            {"name": "Filter coffee", "popularity_note": "house brew, refilled often"},
            {"name": "Cinnamon roll", "popularity_note": "warm out of the oven"},
        ],
        "vibe": ["third-wave coffee", "laptop-friendly", "warm wood + ceramics"],
        "price_tier": "€€",
    },
    "bakery": {
        "hours_typical": {"mon-fri": "06:30-18:00", "sat": "07:00-16:00", "sun": "07:30-14:00"},
        "items": [
            {"name": "Sourdough loaf", "popularity_note": "sells out by midday"},
            {"name": "Butter pretzel", "popularity_note": "afternoon snack staple"},
            {"name": "Cinnamon snail", "popularity_note": "weekend favourite"},
        ],
        "vibe": ["traditional German bakery", "early-morning crowd", "warm bread smell"],
        "price_tier": "€",
    },
    "bookstore": {
        "hours_typical": {"mon-sat": "10:00-19:00", "sun": "closed"},
        "items": [
            {"name": "Hand-picked staff recommendation", "popularity_note": "rotated weekly"},
            {"name": "Berlin/Zurich photo book", "popularity_note": "tourist-friendly gift"},
            {"name": "German contemporary fiction", "popularity_note": "front-table feature"},
        ],
        "vibe": ["independent bookstore", "curated shelves", "neighbourhood institution"],
        "price_tier": "€€",
    },
    "kiosk": {
        "hours_typical": {"daily": "07:00-23:00"},
        "items": [
            {"name": "Club-Mate", "price_eur": 2.5, "popularity_note": "Berlin staple"},
            {"name": "Berliner Pilsner", "price_eur": 1.8, "popularity_note": "evening grab-and-go"},
            {"name": "Newspaper + lottery ticket", "popularity_note": "morning regulars"},
        ],
        "vibe": ["late-night Späti", "cash-friendly", "neighbourhood corner stop"],
        "price_tier": "€",
    },
    "restaurant": {
        "hours_typical": {"mon-sat": "12:00-23:00", "sun": "12:00-22:00"},
        "items": [
            {"name": "Daily lunch special", "popularity_note": "12-15 EUR midday deal"},
            {"name": "House dinner plate", "popularity_note": "shareable mains"},
            {"name": "Local craft beer", "popularity_note": "rotating tap"},
        ],
        "vibe": ["neighbourhood dining", "casual sit-down", "lively dinner crowd"],
        "price_tier": "€€",
    },
    "bar": {
        "hours_typical": {"mon-thu": "18:00-01:00", "fri-sat": "18:00-03:00", "sun": "18:00-00:00"},
        "items": [
            {"name": "Aperol spritz", "price_eur": 7.5, "popularity_note": "happy-hour staple"},
            {"name": "Natural wine pour", "popularity_note": "rotating list"},
            {"name": "Negroni", "popularity_note": "house classic"},
        ],
        "vibe": ["late-night spritz", "low lighting", "after-work locals"],
        "price_tier": "€€€",
    },
    "boutique": {
        "hours_typical": {"mon-sat": "11:00-19:00", "sun": "closed"},
        "items": [
            {"name": "Capsule-collection raincoat", "popularity_note": "rainy-day pickup"},
            {"name": "Independent label tee", "popularity_note": "limited drops"},
            {"name": "Leather tote", "popularity_note": "everyday staple"},
        ],
        "vibe": ["independent label", "curated rack", "soft minimal interior"],
        "price_tier": "€€€",
    },
    "ice_cream": {
        "hours_typical": {"mon-sun": "12:00-22:00"},
        "items": [
            {"name": "Pistachio scoop", "price_eur": 2.0, "popularity_note": "house favourite"},
            {"name": "Stracciatella", "price_eur": 2.0, "popularity_note": "classic order"},
            {"name": "Sorbet of the day", "price_eur": 2.0, "popularity_note": "rotating fruit"},
        ],
        "vibe": ["artisan gelato", "queue out the door on warm days", "kid-friendly"],
        "price_tier": "€",
    },
    "florist": {
        "hours_typical": {"mon-fri": "09:00-19:00", "sat": "09:00-17:00", "sun": "closed"},
        "items": [
            {"name": "Tulip bouquet", "price_eur": 10.0, "popularity_note": "weekly classic"},
            {"name": "Seasonal hand-tied bunch", "popularity_note": "florist's pick"},
            {"name": "Single-stem rose", "price_eur": 3.5, "popularity_note": "last-minute gift"},
        ],
        "vibe": ["seasonal stems", "gift-friendly", "neighbourhood florist"],
        "price_tier": "€€",
    },
}


def offline_enrichment(merchant: dict[str, Any], osm_hint: dict[str, Any]) -> MerchantEnrichment:
    """Deterministic per-category enrichment for the no-LLM fallback path."""

    defaults = _CATEGORY_DEFAULTS.get(
        merchant["category"], _CATEGORY_DEFAULTS["cafe"]
    )
    hours = dict(defaults["hours_typical"])
    if osm_hint.get("opening_hours"):
        # Preserve the raw OSM string under a special key so consumers can see
        # the ground-truth source even if it's not parsed into day buckets.
        hours = {"osm_raw": osm_hint["opening_hours"]}
    items = [SignatureItem(**item) for item in defaults["items"]]
    vibe = list(defaults["vibe"])
    if osm_hint.get("cuisine"):
        vibe.insert(0, f"{osm_hint['cuisine']} cuisine")
    if osm_hint.get("outdoor_seating") in ("yes", "true"):
        vibe.append("outdoor seating")
    return MerchantEnrichment(
        id=merchant["id"],
        display_name=merchant["display_name"],
        category=merchant["category"],
        hours_typical=hours,
        signature_items=items,
        price_tier=defaults["price_tier"],
        vibe_descriptors=vibe[:5],
        top_review_quotes=[],
        updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        source="offline_heuristic",
    )


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


async def enrich_one(
    merchant: dict[str, Any],
    city: str,
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    use_llm: bool,
) -> MerchantEnrichment:
    async with semaphore:
        # Only burn Nominatim's strict 1 req/sec quota when we'll actually feed
        # the hint into an LLM. The offline heuristic does not need it.
        osm_hint: dict[str, Any] = (
            await fetch_osm_hint(client, merchant["display_name"], city)
            if use_llm
            else {}
        )
        if use_llm:
            try:
                return await enrich_via_llm(merchant, osm_hint, city)
            except Exception as exc:  # pragma: no cover - provider/network dependent
                logger.warning(
                    "LLM enrichment failed for %s (%s): %s — using offline heuristic",
                    merchant["id"],
                    type(exc).__name__,
                    exc,
                )
        return offline_enrichment(merchant, osm_hint)


async def enrich_city(
    city: str, limit: int = 200, concurrency: int = 6, force_offline: bool = False
) -> dict[str, Any]:
    merchants = search_merchants(city=city, limit=limit)
    if merchants is None:
        raise SystemExit(f"Unknown city: {city}")
    if not merchants:
        raise SystemExit(f"No merchants found for city: {city}")

    use_llm = (not force_offline) and _llm_available()
    if not use_llm:
        logger.info(
            "LLM provider not configured (or --offline). Falling back to "
            "deterministic per-category enrichment for %s.",
            city,
        )

    semaphore = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient() as client:
        tasks = [
            enrich_one(merchant, city, client, semaphore, use_llm) for merchant in merchants
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    entries: list[dict[str, Any]] = []
    failures = 0
    for merchant, result in zip(merchants, results):
        if isinstance(result, Exception):
            failures += 1
            logger.warning("Skipping %s — unrecoverable: %s", merchant["id"], result)
            continue
        # Add a tiny convenience field so the JSON is human-skimmable.
        entry = result.model_dump(mode="json")
        entry["category_emoji"] = emoji_for(merchant["category"])
        entries.append(entry)

    return {
        "city": city,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "llm" if use_llm else "offline_heuristic",
        "merchant_count": len(entries),
        "failures": failures,
        "entries": entries,
    }


def write_output(city: str, payload: dict[str, Any]) -> str:
    ENRICHED_DIR.mkdir(parents=True, exist_ok=True)
    out = ENRICHED_DIR / f"{city}.json"
    with out.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")
    return str(out)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enrich the merchant catalog for one city via LLM + OSM."
    )
    parser.add_argument("city", help="City slug, e.g. berlin or zurich.")
    parser.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Max merchants to enrich (default 200 = full catalog).",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=6,
        help="Parallel in-flight enrichments (default 6).",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip the LLM and use the deterministic per-category fallback.",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Verbose logging."
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    payload = asyncio.run(
        enrich_city(
            args.city,
            limit=args.limit,
            concurrency=args.concurrency,
            force_offline=args.offline,
        )
    )
    out = write_output(args.city, payload)
    logger.info(
        "Wrote %d entries (%d failures, source=%s) → %s",
        payload["merchant_count"],
        payload["failures"],
        payload["source"],
        out,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
