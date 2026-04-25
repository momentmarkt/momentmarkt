from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .fixtures import available_cities, load_city_config, load_density
from .opportunity_agent import generate_offer
from .signals import build_all_signal_contexts, build_signal_context
from .storage import DemoStore
from .surfacing_agent import evaluate_surface


app = FastAPI(
    title="MomentMarkt Backend",
    version="0.1.0",
    description="Fixture-backed signal and Opportunity Agent API for the CITY WALLET demo.",
)

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


@app.get("/merchants/{merchant_id}/summary")
def merchant_summary(merchant_id: str) -> dict[str, Any]:
    return store.merchant_summary(merchant_id)


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
