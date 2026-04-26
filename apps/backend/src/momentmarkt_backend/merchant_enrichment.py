"""Merchant enrichment loader (issue #165).

Reads ``data/merchants/enriched/{city}.json`` once at module load and
exposes a ``get_enrichment(city, merchant_id)`` lookup that the
Opportunity Agent uses to ground LLM-drafted copy in real signature
items + opening hours instead of category-level guesses.

The cache is built lazily on first lookup per city. If the file is
missing (e.g. the enricher script has never been run for that city),
``get_enrichment`` returns ``None`` so callers can degrade gracefully
without breaking the existing fixture/LLM path.

The enricher CLI lives at ``momentmarkt_backend.scripts.enrich_merchants``
and produces these files; this module only consumes them.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .paths import DATA_DIR


ENRICHED_DIR = DATA_DIR / "merchants" / "enriched"

# city → { merchant_id → enrichment dict }. Lazily filled per city.
_CACHE: dict[str, dict[str, dict[str, Any]] | None] = {}


def _load_city_enrichment(city: str) -> dict[str, dict[str, Any]] | None:
    """Load ``{city}.json`` and index entries by merchant id, or ``None``."""

    path = ENRICHED_DIR / f"{city}.json"
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except (json.JSONDecodeError, OSError):
        return None
    entries = payload.get("entries", []) if isinstance(payload, dict) else []
    indexed: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        merchant_id = entry.get("id")
        if isinstance(merchant_id, str) and merchant_id:
            indexed[merchant_id] = entry
    return indexed


def get_enrichment(city: str, merchant_id: str) -> dict[str, Any] | None:
    """Return the cached enrichment for ``merchant_id`` in ``city`` or ``None``.

    Misses (unknown city, missing file, no entry for that id) all return
    ``None`` so the Opportunity Agent can simply omit the context key.
    """

    if not city or not merchant_id:
        return None
    key = city.lower()
    if key not in _CACHE:
        _CACHE[key] = _load_city_enrichment(key)
    indexed = _CACHE[key]
    if indexed is None:
        return None
    return indexed.get(merchant_id)


def reset_cache() -> None:
    """Drop the in-memory cache (used by tests after writing fixture files)."""

    _CACHE.clear()
