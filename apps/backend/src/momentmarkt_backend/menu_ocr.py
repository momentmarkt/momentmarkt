"""Menu OCR via Pydantic AI.

Real-LLM extraction from an uploaded menu file (PDF / image / plain text)
into the menu schema consumed by the merchant onboarding flow.

Demo truth boundary: OCR is real (Pydantic AI / Azure GPT-5.5). GMaps fetch
elsewhere is fixture-driven. If extraction fails, the caller falls back to
the merchant's fixture menu under data/menus/.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from .llm_agents import _model_name, _run_structured_agent
from .paths import DATA_DIR

MENUS_DIR = DATA_DIR / "menus"


class MenuItem(BaseModel):
    id: str = Field(description="Stable slug, lower-snake-case")
    name: str
    price_eur: float
    description: str | None = None
    photo_url: str | None = None


class MenuCategory(BaseModel):
    id: str = Field(description="Stable slug, lower-snake-case")
    label: str
    items: list[MenuItem]


class ExtractedMenu(BaseModel):
    merchant_id: str | None = None
    display_name: str | None = None
    currency: str = "EUR"
    categories: list[MenuCategory]


async def extract_menu_from_text(
    text: str,
    merchant_hint: str | None = None,
) -> ExtractedMenu:
    """Run the menu-extraction agent over plain text content.

    PDFs and images should be turned into text by the caller (PDF: pypdfium2 /
    pdfplumber upstream of this; image: Pydantic AI vision in a future iteration).
    For the hackathon demo we accept text/markdown and treat OCR'd PDFs as text.
    """
    instructions = (
        "You are the MomentMarkt Menu Extractor. Convert a raw cafe/restaurant menu "
        "into a structured ExtractedMenu. Group items into 3-6 sensible categories "
        "(Hot Drinks, Cold Drinks, Pastries, Sandwiches, Desserts, Mains, etc.). "
        "Generate stable slug ids in lower-snake-case for both categories and items. "
        "Prices must be parsed into EUR floats; if a menu lists '3,50 €' or '€3.50' "
        "or '3.50' return 3.5. If price is missing, set 0.0 and continue. Keep "
        "descriptions short (≤80 chars) — drop them entirely if absent. "
        "Do NOT invent items. Do NOT translate item names; keep original spelling. "
        "Do NOT set photo_url (left null). Output the structured ExtractedMenu only."
    )
    prompt: dict[str, Any] = {
        "task": "Extract structured menu from raw text",
        "merchant_name_hint": merchant_hint,
        "raw_menu_text": text,
    }
    model = _model_name()
    output = await _run_structured_agent(
        model=model,
        output_type=ExtractedMenu,
        instructions=instructions,
        prompt=prompt,
    )
    return output


def load_fixture_menu(merchant_id: str) -> ExtractedMenu | None:
    path = MENUS_DIR / f"{merchant_id}.json"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)
    return ExtractedMenu(**data)


def fixture_text_for(merchant_id: str) -> str:
    """Render the fixture menu as plain text for OCR ground-truth tests."""
    menu = load_fixture_menu(merchant_id)
    if menu is None:
        return ""
    lines: list[str] = [f"{menu.display_name or merchant_id}", ""]
    for cat in menu.categories:
        lines.append(cat.label.upper())
        for item in cat.items:
            desc = f" — {item.description}" if item.description else ""
            lines.append(f"  {item.name}  €{item.price_eur:.2f}{desc}")
        lines.append("")
    return "\n".join(lines)


def decode_uploaded_text(file_bytes: bytes, filename: str) -> str:
    """Best-effort: decode utf-8 text from upload.

    Real PDF/image pipelines plug in here. For the hackathon we accept .txt /
    markdown directly; PDFs are read as latin-1 fallback so binary headers
    don't blow up — the LLM tolerates noise.
    """
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return file_bytes.decode("latin-1", errors="ignore")
