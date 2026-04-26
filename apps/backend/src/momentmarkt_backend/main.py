from __future__ import annotations

from typing import Any

import logfire
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .alternatives import build_alternatives, maybe_rewrite_with_llm, _lookup_merchant
from .fixtures import available_cities, load_city_config, load_density
from .merchants import emoji_for, search_merchants
from .opportunity_agent import generate_offer
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


class OpportunityRequest(BaseModel):
    city: str = Field(default="berlin", examples=["berlin"])
    merchant_id: str | None = Field(default=None, examples=["berlin-mitte-cafe-bondi"])
    high_intent: bool = False
    use_llm: bool = False
    require_trigger: bool = False
    suppress_rejected: bool = True


class OpportunityBatchRequest(BaseModel):
    city: str = Field(default="berlin", examples=["berlin"])
    use_llm: bool = False
    suppress_rejected: bool = True


class SurfacingRequest(BaseModel):
    city: str = Field(default="berlin", examples=["berlin"])
    user_id: str = "mia"
    merchant_id: str | None = Field(default=None, examples=["berlin-mitte-cafe-bondi"])
    seed_offer: bool = True
    use_llm: bool = False
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
    use_llm: bool = False


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


# Demo seed for `GET /history` when the redemption store is empty.
#
# Mirrors apps/mobile/src/screens/HistoryScreen.tsx::REDEMPTIONS verbatim so the
# mobile screen can swap to API data without changing the demo recording cut.
# Sorted newest-first; ISO timestamps anchored around the demo time
# (2026-04-25T13:30+02:00) so the "Today" / "Yesterday" / weekday labels render
# the same way the hardcoded fixture does.
_HISTORY_SEED: list[dict[str, Any]] = [
    {
        "id": "seed-1",
        "merchant_id": "berlin-mitte-cafe-bondi",
        "merchant_display_name": "Café Bondi",
        "cashback_eur": 1.85,
        "redeemed_at_iso": "2026-04-25T13:31:00+02:00",
        "context": "Rain trigger",
        "photo_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200",
    },
    {
        "id": "seed-2",
        "merchant_id": "berlin-mitte-baeckerei-rosenthal",
        "merchant_display_name": "Backstube Mitte",
        "cashback_eur": 0.62,
        "redeemed_at_iso": "2026-04-24T16:48:00+02:00",
        "context": "Quiet period",
        "photo_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200",
    },
    {
        "id": "seed-3",
        "merchant_id": "berlin-friedrichshain-volksbar-08",
        "merchant_display_name": "Volksbar 8",
        "cashback_eur": 2.40,
        "redeemed_at_iso": "2026-04-22T19:02:00+02:00",
        "context": "Pre-event crowd",
        "photo_url": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=200",
    },
    {
        "id": "seed-4",
        "merchant_id": "zurich-hb-spruengli",
        "merchant_display_name": "Sprüngli HB",
        "cashback_eur": 0.80,
        "redeemed_at_iso": "2026-04-20T12:14:00+02:00",
        "context": "Lunch break",
        "photo_url": "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=200",
    },
    {
        "id": "seed-5",
        "merchant_id": "berlin-mitte-madami",
        "merchant_display_name": "Madami",
        "cashback_eur": 1.20,
        "redeemed_at_iso": "2026-04-19T18:30:00+02:00",
        "context": "Weekend wander",
        "photo_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200",
    },
    {
        "id": "seed-6",
        "merchant_id": "berlin-mitte-kiosk-24",
        "merchant_display_name": "Kiosk 24",
        "cashback_eur": 0.45,
        "redeemed_at_iso": "2026-04-18T22:11:00+02:00",
        "context": "Late night",
        "photo_url": "https://images.unsplash.com/photo-1553531384-cc64ac80f931?w=200",
    },
    {
        "id": "seed-7",
        "merchant_id": "berlin-mitte-brasserie-mitte",
        "merchant_display_name": "Brasserie Mitte",
        "cashback_eur": 3.10,
        "redeemed_at_iso": "2026-04-17T20:44:00+02:00",
        "context": "Date night",
        "photo_url": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200",
    },
    {
        "id": "seed-8",
        "merchant_id": "berlin-mitte-eisdiele-cremoso",
        "merchant_display_name": "Eisdiele Cremoso",
        "cashback_eur": 0.55,
        "redeemed_at_iso": "2026-04-16T15:20:00+02:00",
        "context": "Hot day",
        "photo_url": "https://images.unsplash.com/photo-1488900128323-21503983a07e?w=200",
    },
]


def _trigger_reason_to_context(trigger_reason: dict[str, Any]) -> str:
    """One-line surfacing chip text for a redemption row.

    Mirrors the short labels used by the mobile fixture (`Rain trigger`,
    `Quiet period`, …) so seeded + real entries read the same on screen.
    """
    if trigger_reason.get("weather_trigger") == "rain_incoming":
        return "Rain trigger"
    if trigger_reason.get("event_trigger"):
        return "Pre-event crowd"
    if trigger_reason.get("demand_trigger"):
        return "Quiet period"
    return "Wallet pulse"


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
            result = await _draft_and_maybe_persist(
                context=context,
                high_intent=False,
                use_llm=request.use_llm,
                suppress_rejected=request.suppress_rejected,
            )
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
    density = load_density(load_city_config(city)["density_fixture"])
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

    Reads from `DemoStore.recent_redemptions()`. When the redemption store is
    empty (cold demo, fresh container), returns the deterministic 8-entry seed
    so the wallet's history surface is never empty on first launch — matches
    the mobile `REDEMPTIONS` fixture so the demo recording stays stable.
    """
    capped = max(1, min(limit, 200))
    rows = store.recent_redemptions(limit=capped)
    if rows:
        items = [
            HistoryItem(
                id=row["id"],
                merchant_id=row["merchant_id"],
                merchant_display_name=row["merchant_name"],
                cashback_eur=round(float(row["amount"]), 2),
                redeemed_at_iso=row["t"],
                context=_trigger_reason_to_context(row["trigger_reason"]),
                photo_url=None,
            )
            for row in rows
        ]
    else:
        items = [HistoryItem(**entry) for entry in _HISTORY_SEED[:capped]]
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
# /offers/alternatives — swipe-to-pick on-device price discovery (issue #132)
# ---------------------------------------------------------------------------
#
# Section is additive: nothing above touches these models or the endpoint.
# Mechanic: the wallet drawer renders a 3-card swipeable stack of LLM-generated
# offer variants escalating cheapest → most generous. Swipe right settles on a
# variant; swipe left advances to the next. Dwell-time + swipe direction stay
# on-device — backend just generates the ladder.


class AlternativesRequest(BaseModel):
    """Body for `POST /offers/alternatives`.

    Defaults match the canonical demo: 5%-25% range over 3 variants, fixtures
    (no LLM call) for demo safety. Setting ``use_llm=True`` routes through the
    existing Pydantic AI ``run_headline_rewrite_agent`` to rewrite each
    variant headline by tone (conservative / balanced / aggressive); failures
    fall back to the fixture headline silently.
    """

    merchant_id: str = Field(examples=["berlin-mitte-cafe-bondi"])
    base_discount_pct: float = 5.0
    max_discount_pct: float = 25.0
    n: int = 3
    use_llm: bool = False


class AlternativeOffer(BaseModel):
    variant_id: str
    headline: str
    discount_pct: float
    discount_label: str
    widget_spec: dict[str, Any]


class AlternativesResponse(BaseModel):
    merchant_id: str
    variants: list[AlternativeOffer]


@app.post("/offers/alternatives", response_model=AlternativesResponse)
async def post_offers_alternatives(req: AlternativesRequest) -> AlternativesResponse:
    """Generate the swipe-stack variant ladder for one merchant.

    Returns 404 when ``merchant_id`` isn't in any city catalog. Variants are
    ordered cheapest → most generous so the mobile ``SwipeOfferStack`` can
    display them top-of-stack-first and let the user swipe upward in price.
    """
    variants = build_alternatives(
        merchant_id=req.merchant_id,
        base_discount_pct=req.base_discount_pct,
        max_discount_pct=req.max_discount_pct,
        n=req.n,
    )
    if variants is None:
        raise HTTPException(status_code=404, detail=f"Unknown merchant_id: {req.merchant_id}")

    if req.use_llm:
        merchant = _lookup_merchant(req.merchant_id) or {"display_name": req.merchant_id}
        variants = await maybe_rewrite_with_llm(variants, merchant=merchant)

    return AlternativesResponse(
        merchant_id=req.merchant_id,
        variants=[AlternativeOffer(**v) for v in variants],
    )
