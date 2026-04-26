"""Merchant onboarding orchestrator.

Drives the 5-stage processing pipeline (read menu → pull GMaps → identify
products → import transactions → analyze demand) and serves the menu/hours/
limits the merchant later confirms.

Demo truth boundary:
- Stage 1 (read menu)        : real Pydantic AI OCR over uploaded text/PDF.
- Stage 2 (pull GMaps)       : fixture lookup keyed by URL keyword match.
- Stage 3 (identify products): finalizes OCR categories (already produced in
  stage 1; gated for visible UI pacing).
- Stage 4 (import history)   : reads data/transactions/{city}-density.json.
- Stage 5 (analyze demand)   : blackout detection (issue #168 fills in real
  algorithm; #166 ships a stub returning empty windows).
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, UploadFile, Form, File
from pydantic import BaseModel, Field

from .fixtures import load_density
from .menu_ocr import (
    ExtractedMenu,
    MenuCategory,
    MenuItem,
    decode_uploaded_text,
    extract_menu_from_text,
    load_fixture_menu,
)
from .blackout_detection import detect_for_density_fixture
from .menu_edit_agent import apply_diffs, run_menu_edit_agent
from .paths import DATA_DIR

GMAPS_DIR = DATA_DIR / "google-maps"
STAGE_GATE_SECONDS = 0.7

StageId = Literal[
    "reading_menu",
    "pulling_gmaps",
    "identifying_products",
    "importing_history",
    "analyzing_demand",
]
STAGE_ORDER: list[StageId] = [
    "reading_menu",
    "pulling_gmaps",
    "identifying_products",
    "importing_history",
    "analyzing_demand",
]
STAGE_LABEL: dict[StageId, str] = {
    "reading_menu": "Reading menu",
    "pulling_gmaps": "Pulling Google Maps data",
    "identifying_products": "Identifying products",
    "importing_history": "Importing transaction history",
    "analyzing_demand": "Analyzing demand patterns",
}

StageStatus = Literal["pending", "active", "done", "error"]

# URL keyword → merchant_id, used to map a Google Maps link to one of the
# four canonical Berlin demo merchants. First match wins; default = bondi.
URL_MERCHANT_KEYWORDS: list[tuple[str, str]] = [
    ("bondi", "berlin-mitte-cafe-bondi"),
    ("rosenthal", "berlin-mitte-baeckerei-rosenthal"),
    ("baeckerei", "berlin-mitte-baeckerei-rosenthal"),
    ("kiez", "berlin-mitte-kiezbuchhandlung-august"),
    ("august", "berlin-mitte-kiezbuchhandlung-august"),
    ("buch", "berlin-mitte-kiezbuchhandlung-august"),
    ("weinmeister", "berlin-mitte-eisgarten-weinmeister"),
    ("eisgarten", "berlin-mitte-eisgarten-weinmeister"),
    ("eis", "berlin-mitte-eisgarten-weinmeister"),
]
DEFAULT_MERCHANT_ID = "berlin-mitte-cafe-bondi"


def merchant_for_url(url: str) -> str:
    needle = url.lower()
    for kw, mid in URL_MERCHANT_KEYWORDS:
        if kw in needle:
            return mid
    return DEFAULT_MERCHANT_ID


def load_gmaps(merchant_id: str) -> dict[str, Any]:
    path = GMAPS_DIR / f"{merchant_id}.json"
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


@dataclass
class OnboardingSession:
    onboarding_id: str
    merchant_id: str
    gmaps_url: str
    menu_filename: str
    menu_bytes: bytes
    started_at: float = field(default_factory=time.time)
    stages: dict[StageId, StageStatus] = field(default_factory=lambda: {s: "pending" for s in STAGE_ORDER})
    current_stage: StageId | None = None
    error: str | None = None
    menu: ExtractedMenu | None = None
    gmaps: dict[str, Any] = field(default_factory=dict)
    density: dict[str, Any] = field(default_factory=dict)
    hours: dict[str, list[dict[str, str]]] | None = None
    blackouts: dict[str, list[dict[str, str]]] | None = None
    demand_curve: dict[str, Any] | None = None
    limits: dict[str, Any] | None = None
    completed: bool = False
    chat_history: list[dict[str, str]] = field(default_factory=list)


SESSIONS: dict[str, OnboardingSession] = {}


router = APIRouter(prefix="/merchants/onboard", tags=["onboarding"])


class StageView(BaseModel):
    id: StageId
    label: str
    status: StageStatus


class OnboardStartResponse(BaseModel):
    onboarding_id: str
    merchant_id: str


class StatusResponse(BaseModel):
    onboarding_id: str
    merchant_id: str
    stages: list[StageView]
    current_stage: StageId | None
    error: str | None
    completed: bool


def _session_or_404(onboarding_id: str) -> OnboardingSession:
    session = SESSIONS.get(onboarding_id)
    if session is None:
        raise HTTPException(status_code=404, detail="onboarding session not found")
    return session


async def _gate(seconds: float) -> None:
    if seconds > 0:
        await asyncio.sleep(seconds)


async def _run_pipeline(session: OnboardingSession) -> None:
    try:
        # Stage 1: real OCR over the uploaded file.
        session.current_stage = "reading_menu"
        session.stages["reading_menu"] = "active"
        text = decode_uploaded_text(session.menu_bytes, session.menu_filename)
        menu: ExtractedMenu | None = None
        if text.strip():
            try:
                menu = await extract_menu_from_text(
                    text=text,
                    merchant_hint=load_gmaps(session.merchant_id).get("name"),
                )
            except Exception:
                menu = None
        if menu is None:
            menu = load_fixture_menu(session.merchant_id)
        if menu is None:
            session.error = "could not extract menu and no fixture available"
            session.stages["reading_menu"] = "error"
            return
        menu.merchant_id = session.merchant_id
        if not menu.display_name:
            menu.display_name = load_gmaps(session.merchant_id).get(
                "name", session.merchant_id
            )
        session.menu = menu
        session.stages["reading_menu"] = "done"

        # Stage 2: GMaps lookup, gated for visible pacing.
        session.current_stage = "pulling_gmaps"
        session.stages["pulling_gmaps"] = "active"
        await _gate(STAGE_GATE_SECONDS)
        session.gmaps = load_gmaps(session.merchant_id)
        if session.gmaps:
            session.hours = session.gmaps.get("opening_hours")
        session.stages["pulling_gmaps"] = "done"

        # Stage 3: snap categories (already produced by stage 1's OCR).
        session.current_stage = "identifying_products"
        session.stages["identifying_products"] = "active"
        await _gate(STAGE_GATE_SECONDS)
        session.stages["identifying_products"] = "done"

        # Stage 4: import demand fixture.
        session.current_stage = "importing_history"
        session.stages["importing_history"] = "active"
        await _gate(STAGE_GATE_SECONDS)
        density = load_density("berlin")
        merchant_density = next(
            (m for m in density.get("merchants", []) if m["id"] == session.merchant_id),
            None,
        )
        session.density = merchant_density or {}
        session.stages["importing_history"] = "done"

        # Stage 5: detect blackouts. Issue #168 wires the real algorithm;
        # #166 ships a placeholder returning empty windows.
        session.current_stage = "analyzing_demand"
        session.stages["analyzing_demand"] = "active"
        await _gate(STAGE_GATE_SECONDS)
        session.blackouts = _detect_blackouts(session.density)
        session.demand_curve = _shape_demand_curve(session.density)
        session.stages["analyzing_demand"] = "done"
        session.current_stage = None
    except Exception as exc:  # noqa: BLE001
        session.error = repr(exc)
        if session.current_stage:
            session.stages[session.current_stage] = "error"


DAYS_ORDER = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
WEEKEND = {"sat", "sun"}

# Day-of-week multipliers. Saturday is the anchor (1.0).
DAY_MULTIPLIERS: dict[str, float] = {
    "mon": 0.85,
    "tue": 0.85,
    "wed": 0.85,
    "thu": 0.90,
    "fri": 1.05,
    "sat": 1.00,
    "sun": 0.75,
}

# Weekday cafe pattern: morning commute peak around 08:30, midday dip, big
# lunch peak (anchors the Saturday fixture data when scaled), afternoon dip,
# small after-work bump.
WEEKDAY_TEMPLATE: list[tuple[str, float]] = [
    ("08:00", 32),
    ("08:30", 68),  # commute peak
    ("09:00", 60),
    ("09:30", 48),
    ("10:00", 38),
    ("10:30", 36),
    ("11:00", 38),
    ("11:30", 48),
    ("12:00", 58),
    ("12:30", 72),
    ("13:00", 80),
    ("13:30", 82),
    ("14:00", 74),
    ("14:30", 56),
    ("15:00", 42),
    ("15:30", 38),
    ("16:00", 36),
    ("16:30", 38),
    ("17:00", 44),
    ("17:30", 48),
    ("18:00", 40),
]

# Weekend cafe pattern: nobody's commuting, so the morning ramps slowly into
# brunch. Lunch peak still anchors 13:00-14:00 to match the Saturday fixture.
# Afternoon stays mellow; no after-work bump.
WEEKEND_TEMPLATE: list[tuple[str, float]] = [
    ("08:00", 16),
    ("08:30", 22),
    ("09:00", 30),
    ("09:30", 42),
    ("10:00", 56),  # brunch ramping
    ("10:30", 64),
    ("11:00", 68),
    ("11:30", 72),
    ("12:00", 76),
    ("12:30", 78),
    ("13:00", 80),  # lunch peak (anchor)
    ("13:30", 82),  # lunch peak (anchor)
    ("14:00", 74),
    ("14:30", 62),
    ("15:00", 52),
    ("15:30", 44),
    ("16:00", 38),
    ("16:30", 36),
    ("17:00", 36),
    ("17:30", 34),
    ("18:00", 30),
]


_NOISE_AMPLITUDE = 3.0  # ±3 density points — visible wobble without flattening peaks


def _noise(day: str, time: str) -> float:
    """Deterministic per-(day, time) jitter so curves look measured, not synthetic.
    Stable across reloads — same hash → same noise. Amplitude tuned to leave the
    blackout detection peaks intact."""
    import hashlib

    digest = hashlib.md5(f"{day}-{time}".encode()).digest()
    raw = int.from_bytes(digest[:2], "big") / 65535.0  # 0..1
    return (raw * 2 - 1) * _NOISE_AMPLITUDE


def _scaled_curve(
    day: str,
    template: list[tuple[str, float]],
    multiplier: float,
) -> list[dict[str, Any]]:
    return [
        {
            "time": t,
            "density": round(min(100.0, max(0.0, v * multiplier + _noise(day, t))), 1),
        }
        for t, v in template
    ]


def _per_day_baselines() -> dict[str, list[dict[str, Any]]]:
    return {
        day: _scaled_curve(
            day,
            WEEKEND_TEMPLATE if day in WEEKEND else WEEKDAY_TEMPLATE,
            DAY_MULTIPLIERS[day],
        )
        for day in DAYS_ORDER
    }


def _detect_blackouts(_density: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    return detect_for_density_fixture({}, day_to_points=_per_day_baselines())


def _shape_demand_curve(density: dict[str, Any]) -> dict[str, Any]:
    typical = density.get("typical_density_curve", {})
    anchor_day = (typical.get("day_of_week") or "saturday").lower()[:3]
    if anchor_day not in DAYS_ORDER:
        anchor_day = "sat"
    return {
        "day_of_week": typical.get("day_of_week", "saturday"),
        "anchor_day": anchor_day,
        "per_day": _per_day_baselines(),
        "live": [
            {"time": s["time_local"][11:16], "density": s["density"]}
            for s in density.get("live_samples", [])
        ],
        "merchant_goal": density.get("merchant_goal"),
    }


@router.post("", response_model=OnboardStartResponse)
async def start_onboarding(
    gmaps_url: str = Form(..., min_length=1),
    menu_file: UploadFile = File(...),
) -> OnboardStartResponse:
    raw = await menu_file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="menu file is empty")
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="menu file exceeds 5MB")

    onboarding_id = uuid.uuid4().hex[:12]
    merchant_id = merchant_for_url(gmaps_url)
    session = OnboardingSession(
        onboarding_id=onboarding_id,
        merchant_id=merchant_id,
        gmaps_url=gmaps_url,
        menu_filename=menu_file.filename or "menu.txt",
        menu_bytes=raw,
    )
    SESSIONS[onboarding_id] = session
    asyncio.create_task(_run_pipeline(session))
    return OnboardStartResponse(onboarding_id=onboarding_id, merchant_id=merchant_id)


@router.get("/{onboarding_id}/status", response_model=StatusResponse)
def get_status(onboarding_id: str) -> StatusResponse:
    session = _session_or_404(onboarding_id)
    return StatusResponse(
        onboarding_id=session.onboarding_id,
        merchant_id=session.merchant_id,
        stages=[
            StageView(id=s, label=STAGE_LABEL[s], status=session.stages[s])
            for s in STAGE_ORDER
        ],
        current_stage=session.current_stage,
        error=session.error,
        completed=session.completed,
    )


@router.get("/{onboarding_id}/menu")
def get_menu(onboarding_id: str) -> dict[str, Any]:
    session = _session_or_404(onboarding_id)
    if session.menu is None:
        raise HTTPException(status_code=409, detail="menu not yet extracted")
    return session.menu.model_dump(mode="json")


class MenuPostBody(BaseModel):
    menu: ExtractedMenu


@router.post("/{onboarding_id}/menu")
def post_menu(onboarding_id: str, body: MenuPostBody) -> dict[str, str]:
    session = _session_or_404(onboarding_id)
    session.menu = body.menu
    return {"status": "ok"}


class AgentChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=400)


class AgentChatResponse(BaseModel):
    reply: str
    diffs: list[dict[str, Any]] = Field(default_factory=list)
    menu: ExtractedMenu


@router.post("/{onboarding_id}/menu/agent", response_model=AgentChatResponse)
async def menu_agent(onboarding_id: str, body: AgentChatBody) -> AgentChatResponse:
    session = _session_or_404(onboarding_id)
    if session.menu is None:
        raise HTTPException(status_code=409, detail="menu not yet extracted")
    session.chat_history.append({"role": "user", "content": body.message})
    try:
        agent_out = await run_menu_edit_agent(
            menu=session.menu,
            user_message=body.message,
            history=session.chat_history,
        )
        session.menu = apply_diffs(session.menu, agent_out.diffs)
        reply = agent_out.reply
        diffs_payload = [d.model_dump(mode="json") for d in agent_out.diffs]
    except Exception:  # noqa: BLE001
        reply = (
            "Couldn't reach the menu assistant just now. You can keep editing items "
            "directly — we'll save your changes either way."
        )
        diffs_payload = []
    session.chat_history.append({"role": "assistant", "content": reply})
    return AgentChatResponse(reply=reply, diffs=diffs_payload, menu=session.menu)


class HoursResponse(BaseModel):
    hours: dict[str, list[dict[str, str]]] | None
    blackouts: dict[str, list[dict[str, str]]] | None
    demand_curve: dict[str, Any] | None


@router.get("/{onboarding_id}/hours", response_model=HoursResponse)
def get_hours(onboarding_id: str) -> HoursResponse:
    session = _session_or_404(onboarding_id)
    return HoursResponse(
        hours=session.hours,
        blackouts=session.blackouts,
        demand_curve=session.demand_curve,
    )


class HoursPostBody(BaseModel):
    hours: dict[str, list[dict[str, str]]]
    blackouts: dict[str, list[dict[str, str]]]


@router.post("/{onboarding_id}/hours")
def post_hours(onboarding_id: str, body: HoursPostBody) -> dict[str, str]:
    session = _session_or_404(onboarding_id)
    session.hours = body.hours
    session.blackouts = body.blackouts
    return {"status": "ok"}


class LimitsBody(BaseModel):
    categories: list[str]
    discount_floor: int = Field(ge=0, le=50)
    discount_ceiling: int = Field(ge=0, le=50)
    auto_approve: bool
    auto_approve_rules: list[str] = Field(default_factory=list)


@router.post("/{onboarding_id}/limits")
def post_limits(onboarding_id: str, body: LimitsBody) -> dict[str, str]:
    session = _session_or_404(onboarding_id)
    if body.discount_ceiling < body.discount_floor:
        raise HTTPException(status_code=400, detail="ceiling < floor")
    session.limits = body.model_dump()
    return {"status": "ok"}


@router.post("/{onboarding_id}/complete")
def complete(onboarding_id: str) -> dict[str, Any]:
    session = _session_or_404(onboarding_id)
    if session.error:
        raise HTTPException(status_code=409, detail=f"session in error: {session.error}")
    session.completed = True
    return {
        "status": "ok",
        "merchant_id": session.merchant_id,
        "menu_categories": [c.id for c in (session.menu.categories if session.menu else [])],
        "limits": session.limits,
    }
