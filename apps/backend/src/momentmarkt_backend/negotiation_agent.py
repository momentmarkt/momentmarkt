"""Negotiation Agent — discount adjustment within merchant-set bounds.

Multi-agent context (issue #138)
--------------------------------
The MomentMarkt v2 vision splits the offer pipeline across cooperating
agents. The Negotiation Agent is the piece that turns swipe + dwell
signals into an *evolving* offer rather than a re-rank of pre-authored
ones. Given the user's reaction to previous rounds (right/left swipes,
dwell time, repeated rejects) the agent decides how aggressively to
move the next offer's discount within the merchant's pre-declared
bounds — never below `discount_floor_pct`, never above
`discount_ceiling_pct`.

In production, the merchant authors **no offer copy at all**: they set
bounds (floor, ceiling, allowed categories, optional brand tone) in the
v2 merchant portal (#138 + Agent 14). The Negotiation Agent generates
the actual headline + discount tier per round, biased by the user's
reaction history. The merchant's bounds are the only contract; the LLM
is free to vary the discount and the copy inside them.

Demo Truth Boundary
-------------------
On-device SLM (Phi-3-mini / Gemma-2B) is the production swap per
`CLAUDE.md`'s Demo Truth Boundary; this backend Pydantic AI agent is
the demo's stand-in. Dwell + swipe data leaves the device only
because the LLM lives there for the demo. The architecture-slide
arrow stays the same — the on-device model in production reads the
same `NegotiationContext` and emits the same `NegotiatedOffer`, so
this backend module is the seam, not the contract.

DESIGN_PRINCIPLES invariants enforced
-------------------------------------
* Principle 2 (no paid placement): the prompt has no "boost merchant X"
  instruction; the agent only optimizes the discount/copy inside the
  merchant's own declared bounds.
* Principle 3 (preferences stay on-device): production swap is the
  on-device SLM (see Demo Truth Boundary above).
* Principle 5 (reasoning is inspectable): every `NegotiatedOffer`
  carries a non-empty `reasoning` string for the audit log surface
  the merchant portal will eventually expose.
* Bounds-honoring contract: `discount_pct` is **always** inside
  `[discount_floor_pct, discount_ceiling_pct]`. This is enforced both
  by the heuristic AND by a final clamp in `negotiate_offer` so any
  LLM hallucination cannot regress the invariant. A dedicated test
  in `tests/test_negotiation_agent.py` is the durable contract.

Failure-mode contract
---------------------
LLM failure → fall back to the deterministic heuristic below. The
output `discount_pct` is clamped to the merchant's bounds in either
path; the test suite enforces this for the heuristic AND the LLM
fallback path.

Wiring note
-----------
Per #138's honest-scope decision, this module is **not yet wired into
`main.py` or `alternatives.py`** — the v2 lens-swipe in flight (#141)
keeps full ownership of those files. This module ships the agent's
logic + Pydantic AI scaffolding + tests so the wiring step is purely
mechanical when v2 lands.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# Where in the [floor, ceiling] band a cold-start offer sits.
# 0.20 = "lean toward floor; we want to find the smallest discount the
# user will accept" (#138's wedge: minimise margin given away).
_COLD_START_BAND_FRACTION = 0.20

# Dwell threshold (ms) above which a left-swipe is "almost interested"
# rather than "not for me". 1.2s mirrors the empirical "stopped to read"
# floor used in the preference agent.
_DWELL_INTEREST_MS = 1200

# Step sizes in *percentage points* per round, expressed as a fraction
# of the (ceiling - floor) range so the agent's aggressiveness scales
# to the merchant's tolerance.
_RIGHT_SWIPE_STEP_DOWN = 0.10   # user said yes — give back 10% of the band
_LEFT_SWIPE_GENTLE_UP = 0.10    # long dwell — escalate gently
_LEFT_SWIPE_HARD_UP = 0.20      # short dwell — escalate harder

# Maximum we will move per round, in percentage points. Keeps any single
# round from teleporting from floor to ceiling on a noisy signal.
_MAX_STEP_PCT = 10.0


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


class MerchantBounds(BaseModel):
    """The contract the merchant sets in the (future) merchant portal.

    For the hackathon, derived from the merchant's existing
    `active_offer` in the catalog plus sensible defaults (floor = the
    base discount the merchant already advertises; ceiling = floor +
    20pp, capped at 50%). The v2 merchant portal (#138 + Agent 14)
    replaces this stand-in with merchant-authored values stored against
    the merchant's account.

    `allowed_categories` mirrors the catalog's `category` field; the
    Negotiation Agent itself does not filter on it (the surfacing
    pipeline already restricts to in-bounds merchants), but it is
    carried on the bounds object so the prompt can reason about
    cross-category bundles when the merchant authorises them.

    `brand_tone` is an optional copy-constraint the LLM honours when
    drafting the headline (e.g. "polite, no urgency"). Heuristic mode
    ignores it; the LLM prompt threads it through verbatim.
    """

    merchant_id: str
    discount_floor_pct: float = Field(ge=0.0, le=100.0)
    discount_ceiling_pct: float = Field(ge=0.0, le=100.0)
    allowed_categories: list[str]
    brand_tone: str | None = None

    @model_validator(mode="after")
    def _check_band(self) -> MerchantBounds:
        if self.discount_ceiling_pct < self.discount_floor_pct:
            raise ValueError(
                "discount_ceiling_pct must be >= discount_floor_pct "
                "(merchant bounds are inclusive on both ends)."
            )
        return self


class SwipeReaction(BaseModel):
    """One round of user reaction the Negotiation Agent reads.

    `discount_pct_offered` is the discount the *previous* round
    presented to the user. `dwell_ms` is the time the card was on
    screen before the user committed a direction. `swiped_right` is the
    binary commit (True = accepted, False = rejected).
    """

    discount_pct_offered: float = Field(ge=0.0, le=100.0)
    dwell_ms: int = Field(ge=0)
    swiped_right: bool


class NegotiationContext(BaseModel):
    """Inputs to one negotiation round.

    `history` is ordered chronologically (oldest first) so the most
    recent reaction has the strongest pull. Empty history means cold
    start; the agent drops to the cold-start position inside the band.
    `current_round_count` is informational — used by the LLM prompt to
    avoid infinite haggling but not relied on by the heuristic.
    """

    bounds: MerchantBounds
    history: list[SwipeReaction] = Field(default_factory=list)
    current_round_count: int = Field(default=0, ge=0)


class NegotiatedOffer(BaseModel):
    """The Negotiation Agent's output for one round.

    `discount_pct` is **always** within `[bounds.discount_floor_pct,
    bounds.discount_ceiling_pct]` — see `negotiate_offer` for the final
    clamp that enforces this invariant in every code path.
    `headline` is the short pitch the LLM (or fallback) generated.
    `reasoning` is a one-line audit-log explanation; non-empty by
    construction so the merchant portal's audit surface always has
    something to display.
    """

    discount_pct: float = Field(ge=0.0, le=100.0)
    headline: str = Field(min_length=1)
    reasoning: str = Field(min_length=1)


# Pydantic AI structured-output type. Kept private — the public return
# type is `NegotiatedOffer` so the wiring step never sees the LLM-only
# shape.
class _LLMNegotiationOutput(BaseModel):
    discount_pct: float = Field(ge=0.0, le=100.0)
    headline: str = Field(min_length=1)
    reasoning: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Heuristic
# ---------------------------------------------------------------------------


def _cold_start_discount(bounds: MerchantBounds) -> float:
    """Where to start a brand-new negotiation inside the merchant's band.

    Lean toward the floor — the wedge in #138 is "find the smallest
    discount this user will accept." We start `_COLD_START_BAND_FRACTION`
    of the way up from the floor so the heuristic always has room to
    escalate on a left-swipe AND room to retreat on a right-swipe.
    """
    band = bounds.discount_ceiling_pct - bounds.discount_floor_pct
    return bounds.discount_floor_pct + band * _COLD_START_BAND_FRACTION


def _bounded_step(bounds: MerchantBounds, fraction: float) -> float:
    """Convert a band-fraction into an absolute pp step, capped."""
    band = bounds.discount_ceiling_pct - bounds.discount_floor_pct
    raw = band * fraction
    return min(raw, _MAX_STEP_PCT)


def _heuristic_negotiate(ctx: NegotiationContext) -> NegotiatedOffer:
    """Deterministic fallback / `use_llm=False` path.

    Reads the most recent swipe (history[-1]) as the primary signal; a
    right-swipe biases downward toward floor (give back margin), a
    left-swipe biases upward toward ceiling (try harder). Long dwell on
    a left-swipe = gentle escalation; short dwell = hard escalation.
    """
    bounds = ctx.bounds
    floor = bounds.discount_floor_pct
    ceiling = bounds.discount_ceiling_pct

    if not ctx.history:
        raw_discount = _cold_start_discount(bounds)
        clamped, clamp_note = _clamp_value(raw_discount, bounds)
        reasoning = (
            f"Cold start: opening at {clamped:.1f}% — "
            f"{int(_COLD_START_BAND_FRACTION * 100)}% of the way up the "
            f"merchant's [{floor:.0f}%, {ceiling:.0f}%] band, leaving room "
            "to escalate or retreat."
        ) + clamp_note
        headline = _heuristic_headline(clamped, bounds, escalation="cold_start")
        return NegotiatedOffer(
            discount_pct=clamped, headline=headline, reasoning=reasoning
        )

    last = ctx.history[-1]
    base = last.discount_pct_offered

    if last.swiped_right:
        step = _bounded_step(bounds, _RIGHT_SWIPE_STEP_DOWN)
        raw_discount = base - step
        reasoning = (
            f"User accepted {base:.1f}% last round — biasing DOWN by "
            f"{step:.1f}pp toward the merchant's {floor:.0f}% floor "
            "(merchant retains more margin on the next offer)."
        )
        escalation = "retreat"
    else:
        if last.dwell_ms >= _DWELL_INTEREST_MS:
            step = _bounded_step(bounds, _LEFT_SWIPE_GENTLE_UP)
            escalation = "gentle"
            reasoning = (
                f"User rejected {base:.1f}% but dwelled {last.dwell_ms}ms "
                f"(>= {_DWELL_INTEREST_MS}ms) — almost interested. "
                f"Escalating gently by {step:.1f}pp."
            )
        else:
            step = _bounded_step(bounds, _LEFT_SWIPE_HARD_UP)
            escalation = "hard"
            reasoning = (
                f"User rejected {base:.1f}% with only {last.dwell_ms}ms "
                f"dwell (< {_DWELL_INTEREST_MS}ms) — not for them. "
                f"Escalating harder by {step:.1f}pp."
            )
        raw_discount = base + step

    clamped, clamp_note = _clamp_value(raw_discount, bounds)
    headline = _heuristic_headline(clamped, bounds, escalation=escalation)
    return NegotiatedOffer(
        discount_pct=clamped,
        headline=headline,
        reasoning=reasoning + clamp_note,
    )


def _heuristic_headline(
    discount: float, bounds: MerchantBounds, *, escalation: str
) -> str:
    """Cheap, deterministic copy for the fallback path.

    Lives in code rather than a fixture so the test suite can exercise
    the headline-generation contract without depending on an LLM call.
    Honors `brand_tone` only as a polite/urgent toggle when present.
    """
    rounded = max(0.0, round(discount))
    polite = bool(bounds.brand_tone and "polite" in bounds.brand_tone.lower())
    urgent_ok = not (bounds.brand_tone and "no urgency" in bounds.brand_tone.lower())

    if escalation == "cold_start":
        if polite:
            return f"A small {rounded:.0f}% to start — whenever suits."
        return f"Try us today — {rounded:.0f}% off."
    if escalation == "retreat":
        return f"Same favourite, fresh {rounded:.0f}% off."
    if escalation == "gentle":
        return f"Sweetened: {rounded:.0f}% off, just for now."
    # hard
    if urgent_ok:
        return f"Last call: {rounded:.0f}% off — closes soon."
    return f"Now {rounded:.0f}% off when you're ready."


def _clamp_value(raw: float, bounds: MerchantBounds) -> tuple[float, str]:
    """Clamp a raw discount value into the merchant's band.

    Returns ``(clamped_value, audit_note)`` where ``audit_note`` is an
    empty string when no clamping was needed and a short " (Clamped …)"
    suffix otherwise. Used by the heuristic so the resulting
    ``NegotiatedOffer`` can be constructed without tripping the
    Pydantic field validators (``ge=0`` / ``le=100``).
    """
    clamped = max(
        bounds.discount_floor_pct,
        min(bounds.discount_ceiling_pct, raw),
    )
    if clamped == raw:
        return clamped, ""
    note = (
        f" (Clamped to merchant bounds [{bounds.discount_floor_pct:.1f}%,"
        f" {bounds.discount_ceiling_pct:.1f}%].)"
    )
    return clamped, note


def _clamp_offer(offer: NegotiatedOffer, bounds: MerchantBounds) -> NegotiatedOffer:
    """Final guard so no code path can leak an out-of-bounds discount.

    This is the durable contract enforced by the test suite — even if
    the LLM returns a within-its-own-validators discount that still
    exceeds the merchant's tolerance (e.g. 99% off when the merchant's
    ceiling is 25%), the discount we return is always inside the
    merchant's band. ``NegotiatedOffer`` itself only enforces the global
    [0, 100] sanity range; the merchant-specific clamp lives here.
    """
    clamped, note = _clamp_value(offer.discount_pct, bounds)
    if not note:
        return offer
    return offer.model_copy(
        update={"discount_pct": clamped, "reasoning": offer.reasoning + note}
    )


# ---------------------------------------------------------------------------
# LLM mode
# ---------------------------------------------------------------------------


_LLM_INSTRUCTIONS = (
    "You are an on-device preference model deciding how aggressively to "
    "escalate offers given the user's swipe history. Goal: find the "
    "SMALLEST discount the user will accept — that is the merchant's "
    "wedge. Honor the merchant floor and ceiling ABSOLUTELY — NEVER go "
    "below floor or above ceiling under any circumstances. Generate the "
    "headline in the merchant's brand tone if specified.\n"
    "\n"
    "Rules (strict):\n"
    "- discount_pct MUST be within [bounds.discount_floor_pct, "
    "bounds.discount_ceiling_pct]. The host code clamps anyway, but a "
    "violation will be logged as a model error.\n"
    "- A right-swipe last round means the user accepted that discount — "
    "bias DOWN toward floor on the next round (give back margin).\n"
    "- A left-swipe with long dwell (>= 1200ms) means 'almost "
    "interested' — escalate gently.\n"
    "- A left-swipe with short dwell (< 1200ms) means 'not for me' — "
    "escalate harder.\n"
    "- Cold start (no history): start near the floor, leaving room to "
    "escalate.\n"
    "- The reasoning field is for the merchant's audit log; keep it to "
    "one short sentence and reference the swipe signals you used."
)


async def _negotiate_via_llm(ctx: NegotiationContext) -> NegotiatedOffer:
    """Pydantic AI dispatch. Caller is responsible for try/except —
    `negotiate_offer` wraps this and falls back to the heuristic on any
    failure (network, provider, parse error, etc.)."""
    from .llm_agents import _model_name, _run_structured_agent

    model = _model_name()
    prompt: dict[str, Any] = {
        "task": "Decide the next offer's discount_pct + headline given the user's swipe history within the merchant's bounds.",
        "bounds": ctx.bounds.model_dump(mode="json"),
        "history": [r.model_dump(mode="json") for r in ctx.history],
        "current_round_count": ctx.current_round_count,
        "required_contract": "{ discount_pct, headline, reasoning }",
    }
    output = await _run_structured_agent(
        model=model,
        output_type=_LLMNegotiationOutput,
        instructions=_LLM_INSTRUCTIONS,
        prompt=prompt,
    )
    return NegotiatedOffer(
        discount_pct=output.discount_pct,
        headline=output.headline,
        reasoning=output.reasoning,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def negotiate_offer(
    ctx: NegotiationContext, *, use_llm: bool = False
) -> NegotiatedOffer:
    """Decide the next offer's discount + headline given the user's
    swipe history within the merchant's bounds.

    Heuristic (used as fallback + when ``use_llm=False``):
      - Cold start (no history): start at floor + 20% of the
        (ceiling - floor) range.
      - User swiped right on a discount D: bias next offer DOWNWARD
        toward floor (the merchant got a yes — give them a smaller
        discount next time).
      - User swiped left repeatedly: bias next offer UPWARD toward
        ceiling, but never exceed it.
      - Long dwell on a swipe-left card means "almost interested" —
        escalate gently. Short dwell on swipe-left means "not for me" —
        escalate harder.

    LLM mode (``use_llm=True``): same context goes to a Pydantic AI
    agent following the system prompt above. Falls back to the
    heuristic on any LLM failure (network, provider, parse error).

    Production swap: this agent runs ON-DEVICE in the production
    roadmap (Phi-3-mini / Gemma-2B). The backend implementation is the
    demo's stand-in; dwell + swipe data leaves the device only because
    the LLM lives there for the demo (see `CLAUDE.md`'s Demo Truth
    Boundary).

    Bounds-honoring guarantee: the returned ``discount_pct`` is
    **always** within ``[bounds.discount_floor_pct,
    bounds.discount_ceiling_pct]``. This is the durable contract
    protected by the test suite. Both code paths run through
    `_clamp_offer` before returning.
    """
    if use_llm:
        try:
            import asyncio

            offer = asyncio.run(_negotiate_via_llm(ctx))
            return _clamp_offer(offer, ctx.bounds)
        except Exception:  # pragma: no cover - provider/network dependent
            return _heuristic_negotiate(ctx)
    return _heuristic_negotiate(ctx)


# Re-export for tests; keeps the `json` import live for ad-hoc debug.
__all__ = [
    "MerchantBounds",
    "SwipeReaction",
    "NegotiationContext",
    "NegotiatedOffer",
    "negotiate_offer",
    "_heuristic_negotiate",
    "_clamp_offer",
    "_negotiate_via_llm",
    "_LLM_INSTRUCTIONS",
]
_ = json  # keep import live for ad-hoc debugging of the prompt payload
