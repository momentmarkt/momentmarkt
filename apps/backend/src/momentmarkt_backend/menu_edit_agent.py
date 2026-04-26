"""Pydantic AI agent that edits an ExtractedMenu via structured diff ops.

Approach: the LLM reads the current menu + user instruction, returns a short
reply plus a list of typed diffs. The server applies the diffs deterministically
and returns the new menu. The agent never mutates state directly.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from .llm_agents import _model_name, _run_structured_agent
from .menu_ocr import ExtractedMenu, MenuCategory, MenuItem


class DiffOp(BaseModel):
    op: Literal[
        "rename_item",
        "set_price",
        "set_category",
        "add_item",
        "remove_item",
        "add_photo_placeholder",
        "rename_category",
    ]
    item_name: str | None = Field(
        default=None,
        description="Existing item name (case-insensitive) for rename/set_price/set_category/remove/add_photo",
    )
    new_name: str | None = Field(
        default=None, description="New item name for rename_item / new category label for rename_category"
    )
    price_eur: float | None = Field(default=None, description="New price for set_price / add_item")
    category_id: str | None = Field(
        default=None,
        description="Target category id for set_category / add_item; existing id for rename_category / add_photo (when targeting a category)",
    )
    item_target_all: bool = Field(
        default=False,
        description="If true, item_name is treated as a substring match applied to ALL matching items (e.g., 'all croissants').",
    )


class MenuAgentOutput(BaseModel):
    reply: str = Field(description="Short conversational reply summarizing what was changed.")
    diffs: list[DiffOp] = Field(default_factory=list)


def _slugify(s: str) -> str:
    out: list[str] = []
    for ch in s.lower().strip():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("_")
    slug = "".join(out).strip("_")
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug or "item"


def _find_category(menu: ExtractedMenu, category_id: str | None) -> MenuCategory | None:
    if not category_id:
        return None
    cid = category_id.lower()
    for c in menu.categories:
        if c.id == cid or c.label.lower() == cid:
            return c
    return None


def _matches(item: MenuItem, target: str, all_match: bool) -> bool:
    needle = target.lower()
    name = item.name.lower()
    iid = item.id.lower()
    if all_match:
        return needle in name or needle in iid
    return name == needle or iid == needle


def _ensure_unique_id(menu: ExtractedMenu, base: str) -> str:
    existing = {item.id for c in menu.categories for item in c.items}
    candidate = base
    n = 2
    while candidate in existing:
        candidate = f"{base}_{n}"
        n += 1
    return candidate


def apply_diffs(menu: ExtractedMenu, diffs: list[DiffOp]) -> ExtractedMenu:
    """Apply ops in order, returning a new ExtractedMenu (immutable update)."""
    cats = [c.model_copy(update={"items": [i.model_copy() for i in c.items]}) for c in menu.categories]
    new_menu = menu.model_copy(update={"categories": cats})

    def each_match(target: str, all_match: bool):
        for c in new_menu.categories:
            for item in c.items:
                if _matches(item, target, all_match):
                    yield c, item

    for d in diffs:
        if d.op == "rename_item" and d.item_name and d.new_name:
            for _c, item in each_match(d.item_name, d.item_target_all):
                item.name = d.new_name
        elif d.op == "set_price" and d.item_name and d.price_eur is not None:
            for _c, item in each_match(d.item_name, d.item_target_all):
                item.price_eur = float(d.price_eur)
        elif d.op == "set_category" and d.item_name and d.category_id:
            target = _find_category(new_menu, d.category_id)
            if target is None:
                continue
            moved: list[MenuItem] = []
            for c in new_menu.categories:
                keep: list[MenuItem] = []
                for item in c.items:
                    if _matches(item, d.item_name, d.item_target_all) and c.id != target.id:
                        moved.append(item)
                    else:
                        keep.append(item)
                c.items = keep
            target.items.extend(moved)
        elif d.op == "remove_item" and d.item_name:
            for c in new_menu.categories:
                c.items = [
                    item for item in c.items if not _matches(item, d.item_name, d.item_target_all)
                ]
        elif d.op == "add_item" and d.new_name and d.category_id and d.price_eur is not None:
            target = _find_category(new_menu, d.category_id)
            if target is None:
                target = MenuCategory(id=_slugify(d.category_id), label=d.category_id, items=[])
                new_menu.categories.append(target)
            new_id = _ensure_unique_id(new_menu, _slugify(d.new_name))
            target.items.append(
                MenuItem(id=new_id, name=d.new_name, price_eur=float(d.price_eur))
            )
        elif d.op == "add_photo_placeholder":
            if d.category_id:
                target = _find_category(new_menu, d.category_id)
                if target is not None:
                    for item in target.items:
                        if not item.photo_url:
                            item.photo_url = "placeholder"
            elif d.item_name:
                for _c, item in each_match(d.item_name, d.item_target_all):
                    item.photo_url = "placeholder"
        elif d.op == "rename_category" and d.category_id and d.new_name:
            target = _find_category(new_menu, d.category_id)
            if target is not None:
                target.label = d.new_name
    return new_menu


async def run_menu_edit_agent(
    menu: ExtractedMenu,
    user_message: str,
    history: list[dict[str, str]] | None = None,
) -> MenuAgentOutput:
    instructions = (
        "You are the MomentMarkt Menu Edit Agent. Translate the merchant's "
        "natural-language request into a list of structured diff operations "
        "to apply to their menu. Respond with a short conversational reply "
        "(<=200 chars) and the diff list.\n\n"
        "Available operations:\n"
        "- rename_item: requires item_name, new_name. Set item_target_all=true "
        "  for bulk renames like 'rename all espressos'.\n"
        "- set_price: requires item_name, price_eur (float). item_target_all=true "
        "  for 'set all croissants to €3.50'.\n"
        "- set_category: requires item_name, category_id (existing or new label).\n"
        "- add_item: requires new_name, category_id, price_eur.\n"
        "- remove_item: requires item_name. item_target_all=true for bulk removal.\n"
        "- add_photo_placeholder: provide either item_name OR category_id.\n"
        "- rename_category: requires category_id, new_name.\n\n"
        "Rules: Match item_name case-insensitively against existing names. Do NOT "
        "invent items. If the request is ambiguous, ask in the reply and emit no "
        "diffs. Currency is EUR; convert numbers from common formats (e.g., "
        "'€3,50' → 3.5)."
    )
    prompt: dict[str, Any] = {
        "task": "Edit this menu per the user's instruction.",
        "current_menu": menu.model_dump(mode="json"),
        "history": history[-6:] if history else [],
        "user_message": user_message,
    }
    model = _model_name()
    return await _run_structured_agent(
        model=model,
        output_type=MenuAgentOutput,
        instructions=instructions,
        prompt=prompt,
    )
