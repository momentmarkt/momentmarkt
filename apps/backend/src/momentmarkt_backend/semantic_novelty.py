from __future__ import annotations

import asyncio
import json
import math
import os
from dataclasses import dataclass
from typing import Any
from urllib import request


SIMILARITY_FLOOR = 0.78
MIN_NOVELTY = 0.35


@dataclass(frozen=True)
class NoveltyResult:
    novelty: float
    source: str
    max_similarity: float | None = None
    matched_offer_id: str | None = None


async def semantic_novelty(
    offer: dict[str, Any],
    recent_surfaces: list[dict[str, Any]],
) -> NoveltyResult:
    if not recent_surfaces:
        return NoveltyResult(novelty=1.0, source="no_recent_surfaces")

    config = _EmbeddingConfig.from_env()
    if config is None:
        return NoveltyResult(novelty=1.0, source="semantic_novelty_unconfigured")

    candidate_text = offer_text(offer)
    recent_texts = [surface_text(item) for item in recent_surfaces]
    try:
        vectors = await asyncio.to_thread(
            _embed_texts,
            [candidate_text, *recent_texts],
            config,
        )
    except Exception as exc:  # pragma: no cover - provider/network dependent
        return NoveltyResult(
            novelty=1.0,
            source=f"semantic_novelty_failed:{type(exc).__name__}",
        )

    candidate_vector = vectors[0]
    similarities = [
        _cosine_similarity(candidate_vector, vector)
        for vector in vectors[1:]
    ]
    max_index, max_similarity = max(
        enumerate(similarities),
        key=lambda item: item[1],
    )
    novelty = _novelty_from_similarity(max_similarity)
    return NoveltyResult(
        novelty=novelty,
        source="azure_ai_foundry_embeddings",
        max_similarity=round(max_similarity, 3),
        matched_offer_id=recent_surfaces[max_index].get("offer_id"),
    )


def offer_text(offer: dict[str, Any]) -> str:
    seed = offer.get("copy_seed", {})
    triggers = offer.get("trigger_reason", {})
    parts = [
        offer.get("merchant_name", ""),
        offer.get("category", ""),
        seed.get("headline_de", ""),
        seed.get("headline_en", ""),
        seed.get("body_de", ""),
        seed.get("body_en", ""),
        json.dumps(triggers, ensure_ascii=True, sort_keys=True),
    ]
    return " | ".join(part for part in parts if part)


def surface_text(surface: dict[str, Any]) -> str:
    seed = surface.get("copy_seed", {})
    parts = [
        surface.get("merchant_name", ""),
        surface.get("category", ""),
        surface.get("headline_final") or "",
        seed.get("headline_de", ""),
        seed.get("headline_en", ""),
        seed.get("body_de", ""),
        seed.get("body_en", ""),
        json.dumps(surface.get("trigger_reason", {}), ensure_ascii=True, sort_keys=True),
    ]
    return " | ".join(part for part in parts if part)


def _novelty_from_similarity(similarity: float) -> float:
    if similarity <= SIMILARITY_FLOOR:
        return 1.0
    ratio = min(1.0, (similarity - SIMILARITY_FLOOR) / (1.0 - SIMILARITY_FLOOR))
    novelty = 1.0 - (ratio * (1.0 - MIN_NOVELTY))
    return round(max(MIN_NOVELTY, novelty), 3)


@dataclass(frozen=True)
class _EmbeddingConfig:
    endpoint: str
    api_key: str
    model: str | None
    timeout_s: float

    @classmethod
    def from_env(cls) -> "_EmbeddingConfig | None":
        mode = os.environ.get("MOMENTMARKT_SEMANTIC_NOVELTY", "").strip().lower()
        if mode not in {"1", "true", "azure", "enabled"}:
            return None

        endpoint = (
            os.environ.get("MOMENTMARKT_EMBEDDING_ENDPOINT")
            or os.environ.get("AZURE_AI_FOUNDRY_EMBEDDING_ENDPOINT")
        )
        model = (
            os.environ.get("MOMENTMARKT_EMBEDDING_MODEL")
            or os.environ.get("AZURE_AI_FOUNDRY_EMBEDDING_MODEL")
            or os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
        )
        if not endpoint:
            endpoint = _azure_openai_embedding_endpoint(model)

        api_key = (
            os.environ.get("MOMENTMARKT_EMBEDDING_API_KEY")
            or os.environ.get("AZURE_AI_FOUNDRY_API_KEY")
            or os.environ.get("AZURE_OPENAI_API_KEY")
        )
        if not endpoint or not api_key:
            return None

        timeout_s = float(os.environ.get("MOMENTMARKT_EMBEDDING_TIMEOUT_S", "2.5"))
        return cls(
            endpoint=endpoint.rstrip("/"),
            api_key=api_key,
            model=model,
            timeout_s=timeout_s,
        )


def _azure_openai_embedding_endpoint(model: str | None) -> str | None:
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    if not endpoint or not model:
        return None

    endpoint = endpoint.rstrip("/")
    if endpoint.endswith("/openai/v1"):
        return f"{endpoint}/embeddings"

    endpoint = endpoint.removesuffix("/openai")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-01")
    return f"{endpoint}/openai/deployments/{model}/embeddings?api-version={api_version}"


def _embed_texts(texts: list[str], config: _EmbeddingConfig) -> list[list[float]]:
    body: dict[str, Any] = {"input": texts}
    if config.model:
        body["model"] = config.model

    payload = json.dumps(body).encode("utf-8")
    req = request.Request(
        config.endpoint,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "api-key": config.api_key,
            "Authorization": f"Bearer {config.api_key}",
        },
    )
    with request.urlopen(req, timeout=config.timeout_s) as response:
        data = json.loads(response.read().decode("utf-8"))

    embeddings = [item["embedding"] for item in data["data"]]
    if len(embeddings) != len(texts):
        raise ValueError("Embedding response length did not match input length")
    return embeddings


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)
