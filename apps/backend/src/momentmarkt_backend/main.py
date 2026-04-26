from __future__ import annotations

from typing import Any

import logfire
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .alternatives import (
    LensKey,
    apply_negotiation,
    build_alternatives,
    build_alternatives_for_lens,
    build_alternatives_for_lens_with_meta,
    build_alternatives_with_meta,
    maybe_rewrite_subheads,
    maybe_rewrite_with_llm,
    _current_day_of_week,
    _current_time_bucket,
    _lookup_merchant,
)
from .fixtures import (
    available_cities,
    load_city_config,
    load_density,
    load_density_merged,
)
from .llm_agents import default_use_llm
from .merchants import emoji_for, search_merchants
from .onboarding import router as onboarding_router
from .opportunity_agent import generate_offer
from .preference_agent import (
    PriorSwipe,
    build_catalog_lookup,
    rerank_candidates,
)
from .signals import build_all_signal_contexts, build_signal_context
from .storage import DemoStore
from .surfacing_agent import evaluate_surface


# `if-token-present` makes Logfire a no-op when LOGFIRE_TOKEN is missing,
# so local dev, tests, and CI don't try to ship spans. HF Spaces sets the
# token as a secret to enable production tracing.
logfire.configure(
    service_name="momentmarkt-backend",
    service_version="0.1.0",
    send_to_logfire="if-token-present",
)
try:
    logfire.instrument_pydantic_ai()
except ModuleNotFoundError as exc:
    if exc.name != "pydantic_ai":
        raise


app = FastAPI(
    title="MomentMarkt Backend",
    version="0.1.0",
    description="Fixture-backed signal and Opportunity Agent API for the CITY WALLET demo.",
)

logfire.instrument_fastapi(app, capture_headers=False)

# Demo backend serves fixture data only; permissive CORS lets the merchant
# inbox and any teammate's local client hit the hosted URL without friction.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = DemoStore()

app.include_router(onboarding_router)


class OpportunityRequest(BaseModel):
    city: str = Field(default="berlin", examples=["berlin"])
    merchant_id: str | None = Field(default=None, examples=["berlin-mitte-cafe-bondi"])
    high_intent: bool = False
    # Issue #163: LLM is the chosen-by-default behaviour. Fixture stays
    # as fallback-on-failure inside `generate_offer`. Override per-process
    # with `MOMENTMARKT_USE_LLM=false` for deterministic local runs.
    use_llm: bool = Field(default_factory=default_use_llm)
    require_trigger: bool = False
    suppress_rejected: bool = True


class OpportunityBatchRequest(BaseModel):
    city: str = Field(default="berlin", examples=["berlin"])
    # Issue #163: LLM-default for the batched seed pass too.
    use_llm: bool = Field(default_factory=default_use_llm)
    suppress_rejected: bool = True


class SurfacingRequest(BaseModel):
    city: str = Field(default="berlin", examples=["berlin"])
    user_id: str = "mia"
    merchant_id: str | None = Field(default=None, examples=["berlin-mitte-cafe-bondi"])
    seed_offer: bool = True
    # Issue #163: LLM-default. Surfacing rewrites the headline through
    # Pydantic AI by default; falls back to the deterministic rewriter on
    # any failure inside `evaluate_surface`.
    use_llm: bool = Field(default_factory=default_use_llm)
    high_intent: dict[str, Any] | None = None


class RedeemRequest(BaseModel):
    offer_id: str
    user_id: str = "mia"
    t: str = "2026-04-25T13:34:00+02:00"


class OfferStatusRequest(BaseModel):
    t: str = "2026-04-25T13:35:00+02:00"


class DemoSeedRequest(BaseModel):
    city: str = Field(default="berlin", examples=["berlin"])
    reset: bool = True
    # Default ON so the demo seed boots with real LLM-drafted offers (one per
    # eligible merchant) instead of the deterministic `_rain_widget` template.
    # Per-merchant LLM failures fall through to the fixture inside
    # `generate_offer` so a flaky provider can't tank the whole seed (#161).
    use_llm: bool = True


class ActiveOffer(BaseModel):
    headline: str
    discount: str
    expires_at_iso: str


class MerchantListItem(BaseModel):
    id: str
    display_name: str
    category: str
    emoji: str
    distance_m: int
    neighborhood: str
    active_offer: ActiveOffer | None = None


class MerchantListResponse(BaseModel):
    city: str
    query: str | None
    count: int
    merchants: list[MerchantListItem]


class HistoryItem(BaseModel):
    """Single past-cashback row for the wallet history screen (issue #128).

    Mirrors the shape the mobile `HistoryScreen` already uses, with two
    backend-derived fields (`merchant_display_name`, `context`) so the client
    doesn't need to know how to format trigger reasons.
    """

    id: str
    merchant_id: str
    merchant_display_name: str
    cashback_eur: float
    redeemed_at_iso: str
    context: str
    photo_url: str | None = None


class HistoryResponse(BaseModel):
    count: int
    items: list[HistoryItem]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/cities")
def cities() -> dict[str, Any]:
    city_ids = available_cities()
    return {
        "cities": [
            {"id": city_id, **load_city_config(city_id)}
            for city_id in city_ids
        ]
    }


@app.get("/signals/{city}")
def signals(city: str, merchant_id: str | None = None) -> dict[str, Any]:
    try:
        return build_signal_context(city=city, merchant_id=merchant_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown city: {city}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/opportunity/generate")
async def opportunity_generate(request: OpportunityRequest) -> dict[str, Any]:
    try:
        context = build_signal_context(
            city=request.city,
            merchant_id=request.merchant_id,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown city: {request.city}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if request.require_trigger and not context["trigger_evaluation"]["fired"]:
        return {
            "signal_context": context,
            "skipped": True,
            "skip_reason": "no_opportunity_trigger_fired",
        }

    result = await _draft_and_maybe_persist(
        context=context,
        high_intent=request.high_intent,
        use_llm=request.use_llm,
        suppress_rejected=request.suppress_rejected,
    )
    return {"signal_context": context, **result}


@app.post("/opportunity/batch")
async def opportunity_batch(request: OpportunityBatchRequest) -> dict[str, Any]:
    with logfire.span(
        "opportunity_batch {city}",
        city=request.city,
        use_llm=request.use_llm,
    ) as span:
        try:
            contexts = build_all_signal_contexts(city=request.city)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Unknown city: {request.city}") from exc

        drafted: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        for context in contexts:
            merchant_id = context["merchant"]["id"]
            trigger_evaluation = context["trigger_evaluation"]
            if not trigger_evaluation["fired"]:
                skipped.append(
                    {
                        "merchant_id": merchant_id,
                        "reason": "no_opportunity_trigger_fired",
                        "trigger_evaluation": trigger_evaluation,
                    }
                )
                continue
            # Per-merchant try/except so a single broken draft (provider hiccup,
            # widget coercion edge case, transient storage error, …) cannot tank
            # the whole seed. The LLM-call path inside `generate_offer` already
            # falls through to the fixture on its own; this outer guard catches
            # anything that escapes that net (#161).
            try:
                result = await _draft_and_maybe_persist(
                    context=context,
                    high_intent=False,
                    use_llm=request.use_llm,
                    suppress_rejected=request.suppress_rejected,
                )
            except Exception as exc:  # pragma: no cover - defensive
                logfire.warn(
                    "opportunity_batch merchant draft failed",
                    merchant_id=merchant_id,
                    error_type=type(exc).__name__,
                    error=str(exc),
                )
                skipped.append(
                    {
                        "merchant_id": merchant_id,
                        "reason": "draft_failed",
                        "error": f"{type(exc).__name__}: {exc}",
                        "trigger_evaluation": trigger_evaluation,
                    }
                )
                continue
            if result.get("suppressed"):
                skipped.append(
                    {
                        "merchant_id": merchant_id,
                        "reason": result["suppression_reason"],
                        "trigger_evaluation": trigger_evaluation,
                    }
                )
                continue
            drafted.append(result["persisted_offer"])

        span.set_attribute("drafted_count", len(drafted))
        span.set_attribute("skipped_count", len(skipped))
        return {
            "city": request.city,
            "drafted_count": len(drafted),
            "skipped_count": len(skipped),
            "drafted": drafted,
            "skipped": skipped,
        }


@app.post("/surfacing/evaluate")
async def surfacing_evaluate(request: SurfacingRequest) -> dict[str, Any]:
    try:
        context = build_signal_context(
            city=request.city,
            merchant_id=request.merchant_id,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown city: {request.city}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if request.seed_offer and not store.approved_offers(city_id=request.city):
        generated = await generate_offer(context=context)
        store.upsert_offer(generated["persisted_offer"])

    wrapped_context = dict(context["wrapped_user_context"])
    if request.high_intent is not None:
        wrapped_context["high_intent"] = request.high_intent

    return {
        "wrapped_user_context": wrapped_context,
        **await evaluate_surface(
            store=store,
            wrapped_user_context=wrapped_context,
            user_id=request.user_id,
            city_id=request.city,
            use_llm=request.use_llm,
        ),
    }


@app.post("/redeem")
def redeem(request: RedeemRequest) -> dict[str, Any]:
    try:
        return store.redeem(offer_id=request.offer_id, user_id=request.user_id, t=request.t)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/offers/{offer_id}/approve")
def approve_offer(offer_id: str, request: OfferStatusRequest) -> dict[str, Any]:
    try:
        return {"offer": store.set_offer_status(offer_id, "approved", request.t)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/offers/{offer_id}/reject")
def reject_offer(offer_id: str, request: OfferStatusRequest) -> dict[str, Any]:
    try:
        return {"offer": store.set_offer_status(offer_id, "rejected", request.t)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/merchants/{city}", response_model=MerchantListResponse)
def list_merchants(
    city: str,
    q: str | None = None,
    limit: int = 50,
) -> MerchantListResponse:
    """Catalog search for the wallet-drawer "Offers for you" surface.

    City is a lowercase slug ("berlin", "zurich"). ``q`` is a case-insensitive
    substring matched against display_name / category / neighborhood. Empty
    or missing ``q`` returns the full catalog (capped at ``limit``).
    """

    results = search_merchants(city=city.lower(), query=q, limit=limit)
    if results is None:
        raise HTTPException(status_code=404, detail=f"Unknown city: {city}")
    items = [
        MerchantListItem(
            id=m["id"],
            display_name=m["display_name"],
            category=m["category"],
            emoji=emoji_for(m["category"]),
            distance_m=m["distance_m"],
            neighborhood=m["neighborhood"],
            active_offer=m.get("active_offer"),
        )
        for m in results
    ]
    return MerchantListResponse(
        city=city.lower(),
        query=q,
        count=len(items),
        merchants=items,
    )


@app.get("/merchants/{merchant_id}/summary")
def merchant_summary(merchant_id: str) -> dict[str, Any]:
    return store.merchant_summary(merchant_id)


@app.get("/merchants/{merchant_id}/events")
def merchant_events(merchant_id: str, limit: int = 20) -> dict[str, Any]:
    """Activity feed for the merchant dashboard (issue #126).

    Unified stream of inbox + redemption events ordered newest-first, used by
    the operator's "recent activity" panel so they can see "redeemed 2 min
    ago" without a separate redemptions query.
    """
    return {
        "merchant_id": merchant_id,
        "events": store.recent_events(merchant_id=merchant_id, limit=limit),
    }


@app.get("/merchants/{merchant_id}/demand-chart")
def merchant_demand_chart(merchant_id: str, city: str = "berlin") -> dict[str, Any]:
    try:
        context = build_signal_context(city=city, merchant_id=merchant_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown city: {city}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    gap = context["merchant"]["demand_gap"]
    merchant = context["merchant"]
    density = load_density_merged(city, load_city_config(city)["density_fixture"])
    fixture_merchant = next(m for m in density["merchants"] if m["id"] == merchant_id)
    return {
        "merchant_id": merchant_id,
        "merchant_name": merchant["name"],
        "currency": context["currency"],
        "typical_curve": fixture_merchant["typical_density_curve"]["points"],
        "live_curve": fixture_merchant["live_samples"],
        "highlight": {
            "time_local": gap["evaluated_at_local"],
            "typical_density": gap["typical_density"],
            "live_density": gap["live_density"],
            "gap_ratio": gap["gap_ratio"],
            "triggers_demand_gap": gap["triggers_demand_gap"],
            "reason": gap["reason"],
        },
        "trigger_evaluation": context["trigger_evaluation"]["demand"],
    }


@app.get("/history", response_model=HistoryResponse)
def history(limit: int = 50) -> HistoryResponse:
    """Cross-merchant cashback history for the wallet `HistoryScreen` (issue #128).

    Returns real persisted redemptions only. Empty store -> empty list (no
    synthetic seed per the team's "no fake mock data" directive — the mobile
    renders its own clean empty state).
    """
    capped = max(1, min(limit, 200))
    rows = store.recent_redemptions(limit=capped)
    items: list[HistoryItem] = []
    for row in rows:
        trigger_reason = row["trigger_reason"]
        if trigger_reason.get("weather_trigger") == "rain_incoming":
            context_label = "Rain trigger"
        elif trigger_reason.get("event_trigger"):
            context_label = "Pre-event crowd"
        elif trigger_reason.get("demand_trigger"):
            context_label = "Quiet period"
        else:
            context_label = "Wallet pulse"
        items.append(
            HistoryItem(
                id=row["id"],
                merchant_id=row["merchant_id"],
                merchant_display_name=row["merchant_name"],
                cashback_eur=round(float(row["amount"]), 2),
                redeemed_at_iso=row["t"],
                context=context_label,
                photo_url=None,
            )
        )
    return HistoryResponse(count=len(items), items=items)


@app.post("/demo/reset")
def demo_reset() -> dict[str, str]:
    store.reset()
    return {"status": "reset"}


@app.post("/demo/seed")
async def demo_seed(request: DemoSeedRequest) -> dict[str, Any]:
    if request.reset:
        store.reset()
    return await opportunity_batch(
        OpportunityBatchRequest(
            city=request.city,
            use_llm=request.use_llm,
            suppress_rejected=False,
        )
    )


async def _draft_and_maybe_persist(
    context: dict[str, Any],
    high_intent: bool,
    use_llm: bool,
    suppress_rejected: bool,
) -> dict[str, Any]:
    result = await generate_offer(
        context=context,
        high_intent=high_intent,
        use_llm=use_llm,
    )
    if suppress_rejected and store.has_recent_rejection(result["persisted_offer"]):
        result["suppressed"] = True
        result["suppression_reason"] = "similar_recent_rejection"
        result["generation_log"].append("suppressed_by_recent_rejection")
        return result
    result["suppressed"] = False
    result["persisted_offer"] = store.upsert_offer(result["persisted_offer"])
    return result


# ---------------------------------------------------------------------------
# /offers/alternatives — cross-merchant swipe stack + LLM re-ranking
# (issues #132 → #136)
# ---------------------------------------------------------------------------
#
# Section is additive: nothing above touches these models or the endpoint.
# Mechanic: the wallet drawer renders a 3-card swipeable stack where each
# card is a DIFFERENT merchant in the same (or close) category. Swipe right
# settles on a merchant; swipe left advances to the next. Dwell-time +
# swipe direction stay on-device EXCEPT when the next round opts into the
# LLM re-ranker by passing `preference_context` — backend reorders the
# candidate list by inferred preference (production swap: on-device SLM
# per CLAUDE.md Demo Truth Boundary).


class AlternativesRequest(BaseModel):
    """Body for `POST /offers/alternatives`.

    Defaults match the canonical demo: 3 cross-merchant variants, fixtures
    (no LLM call) for demo safety. Setting ``use_llm=True`` routes through
    the existing Pydantic AI ``run_headline_rewrite_agent`` for per-card
    headline rewrite. Setting ``preference_context`` triggers the
    cross-merchant preference re-ranker (`preference_agent.py``).

    Issue #137: ``lens`` selects the curation strategy (For you / Best
    deals / Right now / Nearby). When ``lens != "for_you"``, ``merchant_id``
    is optional and the candidate pool comes from the active city catalog
    rather than a single anchor's neighbourhood. The deterministic lenses
    (``best_deals``, ``right_now``, ``nearby``) bypass the preference
    re-ranker even when ``preference_context`` is supplied — those lenses
    are deliberately verifiable by hand.

    ``base_discount_pct`` / ``max_discount_pct`` are kept on the wire for
    backwards compatibility with the original price-escalation contract
    (issue #132); the cross-merchant build path ignores them — each card
    now carries its own merchant's offer.
    """

    merchant_id: str | None = Field(default=None, examples=["berlin-mitte-cafe-bondi"])
    city: str | None = Field(
        default=None,
        examples=["berlin"],
        description="City slug for non-anchored lens calls. Defaults to "
        "the city of merchant_id when present, otherwise 'berlin'.",
    )
    lens: LensKey = Field(
        default="for_you",
        description="Curation lens: for_you (LLM personalisation), "
        "best_deals (discount sort), right_now (weather × category), "
        "nearby (distance only — strict deterministic fallback).",
    )
    base_discount_pct: float = 5.0
    max_discount_pct: float = 25.0
    n: int = 3
    # Issue #163: LLM-default for the swipe stack too — drives the
    # per-card subhead generator + headline rewriter + preference re-rank.
    # Each downstream agent keeps its own deterministic fallback for
    # provider failure; override globally with `MOMENTMARKT_USE_LLM=false`.
    use_llm: bool = Field(default_factory=default_use_llm)
    preference_context: list[PriorSwipe] | None = None
    # Issue #151: session-scoped seen-set so tapping the same lens
    # repeatedly rotates through the city's offers instead of looping
    # the same top-3. The mobile accumulates ids from left + right
    # swipes and replays them on each call. Defaulted so old clients
    # still work.
    seen_variant_ids: list[str] = Field(
        default_factory=list,
        description="Variant ids the client has already seen this session. "
        "Filtered from the candidate pool before picking top-N.",
    )


class NegotiationMeta(BaseModel):
    """Per-variant negotiation transparency block (issue #164).

    The Negotiation Agent operates within merchant-set bounds and emits
    an applied discount + reasoning. We surface the bounds + applied
    value + reason on the wire so the merchant audit log (production)
    and the demo dev panel can inspect every decision per
    DESIGN_PRINCIPLES.md #5 (reasoning is inspectable). The ranges are
    inclusive on both ends and ``applied_pct`` is **always** within
    ``[floor_pct, ceiling_pct]`` — see
    ``alternatives.apply_negotiation`` for the durable clamp.
    """

    floor_pct: float
    ceiling_pct: float
    applied_pct: float
    reason: str


class AlternativeOffer(BaseModel):
    """One merchant card in the swipe stack.

    Cross-merchant fields (`merchant_id`, `merchant_display_name`,
    `merchant_category`, `distance_m`, `is_anchor`) carry the per-card
    merchant identity so the mobile knows WHICH merchant the user picked
    once they swipe right (and so the round's `PriorSwipe` log can be
    fed back as `preference_context` next round).

    Issue #156: ``is_special_surface`` is the per-card flag the mobile
    reads to decide whether to overlay a "⚡ Just for you" pill on the
    photo. Set ``True`` on the first variant of every fresh fetch
    (anchor on the merchant-tap path, top-of-pool on the lens paths)
    and ``False`` on the rest. Optional on the wire — defaults to
    ``False`` so older clients that don't read it still parse cleanly.

    Issue #164: ``nominal_discount_pct`` carries the merchant's
    catalog-published number; ``discount_pct`` is the bounds-honouring
    negotiated value. ``negotiation_meta`` exposes the floor/ceiling
    the agent operated within plus a one-line reasoning so production
    (merchant audit) and demo (dev panel) surfaces can inspect every
    negotiation decision.
    """

    variant_id: str
    merchant_id: str
    merchant_display_name: str
    merchant_category: str = ""
    distance_m: int = 0
    is_anchor: bool = False
    headline: str
    discount_pct: float
    discount_label: str
    widget_spec: dict[str, Any]
    is_special_surface: bool = False
    nominal_discount_pct: float | None = None
    negotiation_meta: NegotiationMeta | None = None


class AlternativesResponse(BaseModel):
    """Wire shape for `/offers/alternatives`.

    Issue #137: ``merchant_id`` is now optional because non-anchored lens
    calls (best_deals / right_now / nearby without a tap) don't have a
    single merchant origin. When the caller did pass an anchor, the
    backend echoes it back so the mobile can correlate.

    Issue #151: ``total_candidates`` reports the lens's full pool size
    today (NOT the post-seen-filter remainder) so the mobile can render
    "X / N seen" progress. ``exhausted=true`` means the seen-set covers
    the whole pool — the mobile shows the "you've seen all today's
    offers — switch lens or refresh" end state in that case.
    """

    merchant_id: str | None = None
    lens: LensKey = "for_you"
    variants: list[AlternativeOffer]
    total_candidates: int = 0
    exhausted: bool = False


@app.post("/offers/alternatives", response_model=AlternativesResponse)
async def post_offers_alternatives(req: AlternativesRequest) -> AlternativesResponse:
    """Generate the cross-merchant swipe stack for the active lens.

    Issue #137: the endpoint now branches on ``lens``. The "for_you" lens
    keeps the original anchored behaviour (404 on unknown merchant_id,
    cross-merchant tail, optional preference re-rank). The deterministic
    lenses (``best_deals``, ``right_now``, ``nearby``) build their pool
    from the active city catalog and skip the preference re-ranker —
    they MUST stay verifiable by hand per `DESIGN_PRINCIPLES.md` #4 + #6.

    ``preference_context`` only affects the ``for_you`` lens. The other
    lenses ignore it deliberately (no quiet personalisation seeping into
    a "deterministic" surface).
    """
    # for_you with anchor → 404 on unknown merchant_id (legacy contract).
    if req.lens == "for_you" and req.merchant_id is not None:
        meta = build_alternatives_with_meta(
            merchant_id=req.merchant_id,
            n=req.n,
            seen_variant_ids=req.seen_variant_ids,
        )
        if meta is None:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown merchant_id: {req.merchant_id}",
            )
    else:
        meta = build_alternatives_for_lens_with_meta(
            lens=req.lens,
            city=req.city,
            merchant_id=req.merchant_id,
            n=req.n,
            seen_variant_ids=req.seen_variant_ids,
        )
        if meta is None:
            # Defensive — Pydantic should already block invalid lenses.
            raise HTTPException(status_code=400, detail=f"Unknown lens: {req.lens}")

    variants: list[dict[str, Any]] = meta["variants"]
    total_candidates: int = meta["total_candidates"]
    exhausted: bool = meta["exhausted"]

    # Preference re-rank only fires for the personalised lens. The other
    # lenses bypass it on purpose so the user can verify ranking by hand.
    if req.lens == "for_you" and req.preference_context and variants:
        catalog_lookup = build_catalog_lookup()
        ranked_ids = await rerank_candidates(
            candidates=variants,
            history=req.preference_context,
            catalog_lookup=catalog_lookup,
            use_llm=req.use_llm,
        )
        by_id = {v["merchant_id"]: v for v in variants}
        reordered: list[dict[str, Any]] = []
        for mid in ranked_ids:
            entry = by_id.pop(mid, None)
            if entry is not None:
                reordered.append(entry)
        # Append any leftovers (shouldn't happen post-validation, but
        # never drop a card we already built).
        reordered.extend(by_id.values())
        variants = reordered

    # Negotiation pass (issue #164): adjust each variant's discount
    # within the merchant's bounds based on the round's swipe history.
    # Runs AFTER preference re-rank (so order is final) and BEFORE the
    # subhead/headline LLM rewrites (they only touch widget_spec text,
    # not discount values). `apply_negotiation` is non-async + never
    # raises — it preserves variant order and falls back to nominal on
    # any agent failure, so this call is safe even when the negotiation
    # subtree is offline.
    if variants:
        variants = apply_negotiation(
            variants,
            preference_context=req.preference_context,
            use_llm=False,  # negotiation stays deterministic on the demo path
        )

    # Subhead pass: always rewrite per-card body copy with the
    # contextual subhead (issue #151). Deterministic per-category fallback
    # by default; LLM-driven copy when use_llm=True.
    if variants:
        weather_trigger = _resolve_weather_trigger_safe(req.city, req.merchant_id)
        time_bucket = _current_time_bucket()
        day_of_week = _current_day_of_week()
        variants = await maybe_rewrite_subheads(
            variants,
            weather_trigger=weather_trigger,
            time_bucket=time_bucket,
            day_of_week=day_of_week,
            use_llm=req.use_llm,
        )

    # LLM headline rewrite stays opt-in across every lens (caller asks for
    # it explicitly via use_llm). The deterministic lenses still skip the
    # re-rank above; this is just per-card copy polish.
    if req.use_llm and variants:
        anchor_meta = (
            _lookup_merchant(req.merchant_id)
            if req.merchant_id
            else None
        ) or {"display_name": req.merchant_id or req.lens}
        variants = await maybe_rewrite_with_llm(variants, merchant=anchor_meta)

    return AlternativesResponse(
        merchant_id=req.merchant_id,
        lens=req.lens,
        variants=[AlternativeOffer(**v) for v in variants],
        total_candidates=total_candidates,
        exhausted=exhausted,
    )


def _resolve_weather_trigger_safe(
    city: str | None, merchant_id: str | None
) -> str:
    """Best-effort weather trigger lookup for the subhead context.

    Mirrors `alternatives._resolve_weather_trigger` but stays at the
    API layer so the alternatives module doesn't need to know about
    request shapes. Falls back to ``"clear"`` on any failure so the
    subhead generator always has a valid context.
    """
    city_slug = (city or "").lower()
    if not city_slug and merchant_id:
        # Reuse the alternatives helper rather than re-walking the
        # catalogs ourselves.
        from .alternatives import _city_for_merchant
        city_slug = _city_for_merchant(merchant_id) or "berlin"
    if not city_slug:
        city_slug = "berlin"
    try:
        return build_signal_context(city=city_slug).get("weather", {}).get(
            "trigger", "clear"
        ) or "clear"
    except (FileNotFoundError, KeyError, ValueError):
        return "clear"
