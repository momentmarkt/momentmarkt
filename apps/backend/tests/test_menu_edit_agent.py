"""Unit tests for the deterministic apply_diffs path of the menu edit agent.

The LLM call (run_menu_edit_agent) is only smoke-tested here via diff payloads
constructed by hand — the real LLM is exercised in API-level tests when the
provider env is set.
"""

from __future__ import annotations

import pytest

from momentmarkt_backend.menu_edit_agent import DiffOp, apply_diffs
from momentmarkt_backend.menu_ocr import load_fixture_menu


@pytest.fixture
def bondi_menu():
    menu = load_fixture_menu("berlin-mitte-cafe-bondi")
    assert menu is not None, "bondi fixture must exist"
    return menu


def test_rename_item_single(bondi_menu):
    diffs = [DiffOp(op="rename_item", item_name="Espresso", new_name="Caffè")]
    out = apply_diffs(bondi_menu, diffs)
    names = [i.name for c in out.categories for i in c.items]
    assert "Caffè" in names
    assert "Espresso" not in names


def test_set_price_bulk(bondi_menu):
    diffs = [
        DiffOp(op="set_price", item_name="croissant", price_eur=3.50, item_target_all=True)
    ]
    out = apply_diffs(bondi_menu, diffs)
    croissants = [i for c in out.categories for i in c.items if "croissant" in i.name.lower()]
    assert len(croissants) >= 2
    assert all(i.price_eur == 3.50 for i in croissants)


def test_remove_item(bondi_menu):
    before_count = sum(len(c.items) for c in bondi_menu.categories)
    diffs = [DiffOp(op="remove_item", item_name="Lemonade")]
    out = apply_diffs(bondi_menu, diffs)
    after_count = sum(len(c.items) for c in out.categories)
    assert after_count == before_count - 1
    assert all(i.name != "Lemonade" for c in out.categories for i in c.items)


def test_add_item_creates_in_existing_category(bondi_menu):
    diffs = [
        DiffOp(op="add_item", new_name="Matcha Latte", category_id="hot_drinks", price_eur=4.20)
    ]
    out = apply_diffs(bondi_menu, diffs)
    hot = next(c for c in out.categories if c.id == "hot_drinks")
    assert any(i.name == "Matcha Latte" and i.price_eur == 4.20 for i in hot.items)


def test_set_category_moves_item(bondi_menu):
    diffs = [DiffOp(op="set_category", item_name="Iced Latte", category_id="hot_drinks")]
    out = apply_diffs(bondi_menu, diffs)
    hot = next(c for c in out.categories if c.id == "hot_drinks")
    cold = next(c for c in out.categories if c.id == "cold_drinks")
    assert any(i.name == "Iced Latte" for i in hot.items)
    assert all(i.name != "Iced Latte" for i in cold.items)


def test_immutability(bondi_menu):
    """apply_diffs must return a new menu without mutating the input."""
    snapshot_names = [i.name for c in bondi_menu.categories for i in c.items]
    apply_diffs(bondi_menu, [DiffOp(op="rename_item", item_name="Espresso", new_name="Foo")])
    after_names = [i.name for c in bondi_menu.categories for i in c.items]
    assert snapshot_names == after_names
