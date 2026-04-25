"""Stress tests for the GenUI widget validator and coercion helper.

The demo lives or dies on this validator: the LLM emits JSON layout specs at
runtime and `coerce_widget_node` is the only thing standing between a bad
generation and a broken render. These tests exercise every primitive type,
boundary cases, and a few hostile-shape inputs the LLM might plausibly emit.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest

from momentmarkt_backend.genui import (
    coerce_widget_node,
    fallback_widget_spec,
    validate_widget_node,
)


def _text(text: str = "hi") -> dict[str, Any]:
    return {"type": "Text", "text": text}


def _image() -> dict[str, Any]:
    return {
        "type": "Image",
        "source": "https://example.com/x.jpg",
        "accessibilityLabel": "alt",
    }


def _pressable(action: str = "redeem") -> dict[str, Any]:
    return {"type": "Pressable", "action": action, "text": "Redeem"}


def _view(children: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {"type": "View", "children": children or []}


class TestValidatorAcceptsValidPrimitives:
    def test_text_minimal(self) -> None:
        assert validate_widget_node(_text()) is True

    def test_image_minimal(self) -> None:
        assert validate_widget_node(_image()) is True

    def test_pressable_minimal(self) -> None:
        assert validate_widget_node(_pressable()) is True

    def test_view_empty_children(self) -> None:
        assert validate_widget_node(_view([])) is True

    def test_scrollview_with_mixed_children(self) -> None:
        node = {
            "type": "ScrollView",
            "className": "p-5",
            "children": [_text(), _image(), _pressable()],
        }
        assert validate_widget_node(node) is True

    def test_view_with_optional_classname(self) -> None:
        node = _view([_text()])
        node["className"] = "rounded-2xl bg-cocoa"
        assert validate_widget_node(node) is True

    def test_built_in_fallback_validates(self) -> None:
        # The fallback render must always validate or the demo dies silently.
        assert validate_widget_node(fallback_widget_spec) is True


class TestValidatorRejectsHostileInputs:
    @pytest.mark.parametrize(
        "value",
        [
            None,
            "string",
            42,
            [],
            ["type", "Text"],
            True,
        ],
    )
    def test_non_dict_inputs_rejected(self, value: Any) -> None:
        assert validate_widget_node(value) is False

    def test_empty_dict_rejected(self) -> None:
        assert validate_widget_node({}) is False

    def test_unknown_type_rejected(self) -> None:
        assert validate_widget_node({"type": "WebView", "src": "x"}) is False

    def test_text_without_text_rejected(self) -> None:
        assert validate_widget_node({"type": "Text"}) is False

    def test_text_with_non_string_text_rejected(self) -> None:
        assert validate_widget_node({"type": "Text", "text": 123}) is False

    def test_image_missing_source_rejected(self) -> None:
        assert (
            validate_widget_node(
                {"type": "Image", "accessibilityLabel": "x"}
            )
            is False
        )

    def test_image_missing_alt_rejected(self) -> None:
        assert (
            validate_widget_node({"type": "Image", "source": "x"}) is False
        )

    def test_pressable_must_use_redeem_action(self) -> None:
        assert validate_widget_node(_pressable("dismiss")) is False
        assert validate_widget_node(_pressable("submit")) is False

    def test_pressable_without_text_rejected(self) -> None:
        assert (
            validate_widget_node({"type": "Pressable", "action": "redeem"})
            is False
        )

    def test_view_with_non_list_children_rejected(self) -> None:
        assert (
            validate_widget_node({"type": "View", "children": "kids"}) is False
        )

    def test_view_with_invalid_child_rejected(self) -> None:
        assert (
            validate_widget_node(
                {
                    "type": "View",
                    "children": [_text(), {"type": "WebView"}],
                }
            )
            is False
        )

    def test_classname_must_be_string_when_present(self) -> None:
        node = _text()
        node["className"] = 123
        assert validate_widget_node(node) is False


class TestValidatorDepthBound:
    def _nest(self, depth: int) -> dict[str, Any]:
        node: dict[str, Any] = _text()
        for _ in range(depth):
            node = {"type": "View", "children": [node]}
        return node

    def test_depth_under_limit_accepted(self) -> None:
        # 12 is the bound. 11 nested Views containing a Text leaf = depth 11.
        assert validate_widget_node(self._nest(11)) is True

    def test_depth_over_limit_rejected(self) -> None:
        # 14 levels of View → walks past depth 12 and bottoms out as False.
        assert validate_widget_node(self._nest(14)) is False

    def test_pathologically_deep_does_not_recurse_forever(self) -> None:
        # Defends against the LLM emitting absurd nesting; must terminate fast.
        assert validate_widget_node(self._nest(500)) is False


class TestCoerceWidgetNode:
    def test_valid_input_round_trips(self) -> None:
        node = _view([_text("hello")])
        coerced, valid = coerce_widget_node(node)
        assert valid is True
        assert coerced is node  # passed through unchanged

    def test_invalid_input_falls_back(self) -> None:
        coerced, valid = coerce_widget_node({"type": "Garbage"})
        assert valid is False
        assert coerced is fallback_widget_spec

    def test_none_falls_back(self) -> None:
        coerced, valid = coerce_widget_node(None)
        assert valid is False
        assert coerced is fallback_widget_spec

    def test_fallback_is_not_mutated_by_caller(self) -> None:
        # The fallback object is shared. If anyone mutates it, every later
        # demo render is corrupted. Lock the reference identity + shape.
        snapshot = deepcopy(fallback_widget_spec)
        coerce_widget_node({"type": "Garbage"})
        assert fallback_widget_spec == snapshot
