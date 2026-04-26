"""Tests for `POST /offers/alternatives` (issues #132 → #136).

Covers the cross-merchant swipe stack contract:
  * 3 variants, each from a DIFFERENT merchant in the same (or close)
    category — replaces the original price-escalation ladder.
  * Tapped merchant is the anchor (card 1) so the user keeps the safety
    of "I can take what I tapped".
  * Each variant has a valid widget_spec (View root + Text + Pressable
    redeem).
  * Custom n is honoured (the response has ≤ n variants).
  * Unknown merchant_id returns 404.
  * Unique `merchant_id` per variant — no duplicates in the stack.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from momentmarkt_backend.main import app


client = TestClient(app)


def _walk_node_types(node: dict, types_seen: set[str]) -> None:
    """Recurse a widget_spec tree collecting every node type seen."""
    if not isinstance(node, dict):
        return
    t = node.get("type")
    if isinstance(t, str):
        types_seen.add(t)
    children = node.get("children")
    if isinstance(children, list):
        for child in children:
            _walk_node_types(child, types_seen)


def _find_pressable_action(node: dict) -> str | None:
    """First Pressable node's ``action`` string in DFS order."""
    if not isinstance(node, dict):
        return None
    if node.get("type") == "Pressable":
        action = node.get("action")
        return action if isinstance(action, str) else None
    children = node.get("children")
    if isinstance(children, list):
        for child in children:
            found = _find_pressable_action(child)
            if found is not None:
                return found
    return None


def test_default_returns_three_cross_merchant_variants() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["merchant_id"] == "berlin-mitte-cafe-bondi"
    variants = payload["variants"]
    assert len(variants) == 3
    # Cross-merchant invariant: every variant is a DIFFERENT merchant_id.
    merchant_ids = [v["merchant_id"] for v in variants]
    assert len(set(merchant_ids)) == len(merchant_ids), (
        f"variants must be cross-merchant; got duplicates: {merchant_ids}"
    )


def test_anchor_merchant_is_card_one() -> None:
    """The tapped merchant must be the anchor (position 0) so the user
    keeps the safety of "I can take what I tapped"."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert variants[0]["merchant_id"] == "berlin-mitte-cafe-bondi"
    assert variants[0]["is_anchor"] is True
    # Subsequent cards are not the anchor.
    for v in variants[1:]:
        assert v["is_anchor"] is False


def test_each_variant_has_valid_widget_spec_shape() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert response.status_code == 200
    for variant in response.json()["variants"]:
        assert isinstance(variant["headline"], str) and variant["headline"]
        assert isinstance(variant["discount_label"], str) and variant["discount_label"]
        assert isinstance(variant["variant_id"], str) and variant["variant_id"]
        assert isinstance(variant["merchant_id"], str) and variant["merchant_id"]
        assert isinstance(variant["merchant_display_name"], str)
        assert variant["merchant_display_name"] != ""
        # variant_id == merchant_id under the new contract.
        assert variant["variant_id"] == variant["merchant_id"]

        spec = variant["widget_spec"]
        assert isinstance(spec, dict)
        # Root must be a container so the renderer treats it as a layout.
        assert spec["type"] in {"View", "ScrollView"}
        # At least one Text child somewhere in the tree.
        types_seen: set[str] = set()
        _walk_node_types(spec, types_seen)
        assert "Text" in types_seen, "widget_spec must contain at least one Text node"
        # At least one Pressable with action: redeem (the CTA the renderer wires).
        action = _find_pressable_action(spec)
        assert action == "redeem", "widget_spec must contain a Pressable with action=redeem"


def test_custom_n_returns_at_most_n_variants() -> None:
    """Custom n caps the response. The cross-merchant builder may return
    fewer if the candidate pool runs dry, but never more than n."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 5},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert 1 <= len(variants) <= 5
    merchant_ids = [v["merchant_id"] for v in variants]
    assert len(set(merchant_ids)) == len(merchant_ids)


def test_unknown_merchant_id_returns_404() -> None:
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "nonexistent-merchant-xyz"},
    )
    assert response.status_code == 404
    assert "nonexistent-merchant-xyz" in response.json()["detail"]


def test_zurich_merchant_returns_zurich_neighbours() -> None:
    """Catalog spans both cities; alternatives must work for any known
    id and stay within the same city (no Berlin cards in a Zurich
    stack)."""
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "zurich-hb-le-cafe-61594", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert len(variants) >= 1
    for variant in variants:
        # Every card stays in the Zurich catalog.
        assert variant["merchant_id"].startswith("zurich-"), (
            f"cross-city card leaked: {variant['merchant_id']}"
        )


def test_anchor_card_works_when_anchor_has_no_active_offer() -> None:
    """A merchant tapped from the catalog might not have an active_offer
    of its own (e.g. exploring); the anchor card must still render with a
    safe fallback."""
    # `berlin-mitte-the-eatery-berlin-03070` has active_offer = None.
    response = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-the-eatery-berlin-03070", "n": 3},
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert len(variants) >= 1
    assert variants[0]["merchant_id"] == "berlin-mitte-the-eatery-berlin-03070"
    # Subsequent cards must still be cross-merchant + have offers.
    for v in variants[1:]:
        assert v["merchant_id"] != variants[0]["merchant_id"]


def test_lens_for_you_without_anchor_returns_city_pool() -> None:
    """`lens="for_you"` without a merchant_id should return city merchants
    with active offers, ready for the preference agent to re-rank."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "for_you", "city": "berlin", "n": 3},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "for_you"
    assert payload["merchant_id"] is None
    variants = payload["variants"]
    assert len(variants) == 3
    # Every card carries a real merchant identity + an offer.
    for v in variants:
        assert v["merchant_id"].startswith("berlin-")
        assert v["discount_label"]
    # No duplicates.
    ids = [v["merchant_id"] for v in variants]
    assert len(set(ids)) == len(ids)


def test_lens_best_deals_sorted_by_discount_descending() -> None:
    """`best_deals` must order cards by parsed discount percent desc.
    Pure deterministic sort — no LLM, no preference signal applied."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "best_deals", "city": "berlin", "n": 5},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "best_deals"
    variants = payload["variants"]
    assert len(variants) >= 1
    # Discount percents are non-increasing.
    pcts = [float(v["discount_pct"]) for v in variants]
    assert pcts == sorted(pcts, reverse=True), (
        f"best_deals must sort by discount_pct desc; got {pcts}"
    )
    # Top card must have the highest discount across the city's offers.
    # Berlin's biggest offer is "Mein Haus am See" at -30%.
    assert pcts[0] >= 25.0


def test_lens_best_deals_ignores_preference_context() -> None:
    """Preference context must NOT reshuffle deterministic lenses
    (`DESIGN_PRINCIPLES.md` #4 + #6 — those lenses are verifiable by
    hand). Sending history with `best_deals` returns the same order as
    without."""
    body = {"lens": "best_deals", "city": "berlin", "n": 3}
    natural = client.post("/offers/alternatives", json=body)
    assert natural.status_code == 200
    natural_ids = [v["merchant_id"] for v in natural.json()["variants"]]

    body_with_history = dict(body)
    body_with_history["preference_context"] = [
        {
            "merchant_id": "berlin-mitte-zeit-fur-brot-03038",
            "dwell_ms": 5000,
            "swiped_right": True,
        },
        {
            "merchant_id": "berlin-mitte-rosa-canina-02890",
            "dwell_ms": 3000,
            "swiped_right": True,
        },
    ]
    influenced = client.post("/offers/alternatives", json=body_with_history)
    assert influenced.status_code == 200
    influenced_ids = [v["merchant_id"] for v in influenced.json()["variants"]]
    assert influenced_ids == natural_ids, (
        "best_deals must ignore preference_context — got reorder: "
        f"{natural_ids} -> {influenced_ids}"
    )


def test_lens_right_now_filters_by_weather_trigger() -> None:
    """`right_now` should only surface categories that fit the current
    weather. Berlin's demo time forces rain_incoming → cafe / bakery /
    bookstore / kiosk. No restaurant or bar should appear."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "right_now", "city": "berlin", "n": 5},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "right_now"
    variants = payload["variants"]
    assert len(variants) >= 1
    rain_categories = {"cafe", "bakery", "bookstore", "kiosk"}
    for v in variants:
        assert v["merchant_category"] in rain_categories, (
            f"right_now under rain must whitelist {rain_categories}; got {v['merchant_category']}"
        )


def test_lens_nearby_pure_distance_sort() -> None:
    """`nearby` MUST be the deterministic fallback per
    `DESIGN_PRINCIPLES.md` #4 — pure distance ascending, no LLM, no
    preference signal applied."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "nearby", "city": "berlin", "n": 5},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lens"] == "nearby"
    variants = payload["variants"]
    assert len(variants) >= 1
    distances = [int(v["distance_m"]) for v in variants]
    assert distances == sorted(distances), (
        f"nearby must sort by distance asc; got {distances}"
    )


def test_lens_nearby_ignores_preference_context() -> None:
    """Same invariant as best_deals — the user's escape hatch must stay
    deterministic even when prior swipes are sent in."""
    body = {"lens": "nearby", "city": "berlin", "n": 3}
    natural = client.post("/offers/alternatives", json=body)
    assert natural.status_code == 200
    natural_ids = [v["merchant_id"] for v in natural.json()["variants"]]

    body_with_history = dict(body)
    body_with_history["preference_context"] = [
        {
            "merchant_id": "berlin-mitte-rosa-canina-02890",
            "dwell_ms": 5000,
            "swiped_right": True,
        },
    ]
    influenced = client.post("/offers/alternatives", json=body_with_history)
    assert influenced.status_code == 200
    influenced_ids = [v["merchant_id"] for v in influenced.json()["variants"]]
    assert influenced_ids == natural_ids, (
        "nearby must ignore preference_context (DESIGN_PRINCIPLES.md #4); "
        f"got reorder: {natural_ids} -> {influenced_ids}"
    )


def test_lens_zurich_returns_zurich_only() -> None:
    """Lens-driven candidates must stay within the requested city —
    no Berlin cards leaking into a Zurich stack."""
    for lens in ("for_you", "best_deals", "right_now", "nearby"):
        response = client.post(
            "/offers/alternatives",
            json={"lens": lens, "city": "zurich", "n": 3},
        )
        assert response.status_code == 200, f"lens={lens} failed"
        for v in response.json()["variants"]:
            assert v["merchant_id"].startswith("zurich-"), (
                f"lens={lens}: cross-city card leaked: {v['merchant_id']}"
            )


def test_lens_invalid_value_rejected_by_pydantic() -> None:
    """Pydantic Literal[...] should reject unknown lens values with 422
    so the mobile gets a clean error instead of silently degrading."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "horoscope", "city": "berlin"},
    )
    assert response.status_code == 422


def test_lens_response_echoes_lens_field() -> None:
    """The wire shape carries `lens` so the mobile can confirm what it
    actually received (vs. what the request body asked for)."""
    for lens in ("for_you", "best_deals", "right_now", "nearby"):
        response = client.post(
            "/offers/alternatives",
            json={"lens": lens, "city": "berlin"},
        )
        assert response.status_code == 200, f"lens={lens} failed"
        assert response.json()["lens"] == lens


# ---------------------------------------------------------------------------
# Issue #151 — rotation pool (seen-set + exhausted + total_candidates)
# ---------------------------------------------------------------------------
#
# Doruk reported that tapping the same lens repeatedly returns the same
# 3 cards every time — feels like a loop. Fix: a session-scoped seen-set
# the client passes on each call. Backend filters those out of the pool
# before picking the top-N + reports `total_candidates` so the mobile can
# render "X / N seen" progress + flips `exhausted=true` when the pool is
# entirely covered.


def _ids(payload: dict) -> list[str]:
    return [v["merchant_id"] for v in payload["variants"]]


def test_total_candidates_reflects_lens_pool_size() -> None:
    """`total_candidates` must mirror the lens's full pool today (not
    just the variants returned). The wallet uses it to render
    "X / N seen" progress, so it has to stay stable across repeat
    calls regardless of how many cards we slice off the top."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "best_deals", "city": "berlin", "n": 3},
    )
    assert response.status_code == 200
    payload = response.json()
    # Berlin's catalog ships ~12 active offers; even after deduping by
    # category the pool is comfortably above the n=3 slice.
    assert payload["total_candidates"] >= 10
    assert len(payload["variants"]) == 3
    # Reducing n must not reduce total_candidates — pool size is global.
    smaller = client.post(
        "/offers/alternatives",
        json={"lens": "best_deals", "city": "berlin", "n": 1},
    )
    assert smaller.status_code == 200
    assert smaller.json()["total_candidates"] == payload["total_candidates"]


def test_seen_variant_ids_filters_pool_and_returns_different_cards() -> None:
    """Tapping `best_deals` twice while replaying the seen-set must
    surface a NEW set of cards — proves the rotation loop is broken."""
    first = client.post(
        "/offers/alternatives",
        json={"lens": "best_deals", "city": "berlin", "n": 3},
    )
    assert first.status_code == 200
    first_ids = _ids(first.json())
    assert first.json()["exhausted"] is False

    second = client.post(
        "/offers/alternatives",
        json={
            "lens": "best_deals",
            "city": "berlin",
            "n": 3,
            "seen_variant_ids": first_ids,
        },
    )
    assert second.status_code == 200
    second_ids = _ids(second.json())
    # No overlap with the first round — the seen-set was respected.
    assert not (set(second_ids) & set(first_ids)), (
        f"seen filter leaked: {first_ids} & {second_ids} overlap"
    )
    # Total pool size is still the same — the seen-set narrows what
    # we surface, not what counts as "in the pool today".
    assert second.json()["total_candidates"] == first.json()["total_candidates"]


def test_seen_variant_ids_exhaustion_returns_empty_with_exhausted_flag() -> None:
    """When the seen-set covers the entire lens pool, the response
    must set `exhausted=true` + return zero variants so the mobile
    can render the "switch lens or refresh" end state."""
    # First, learn the pool size for the lens.
    probe = client.post(
        "/offers/alternatives",
        json={"lens": "best_deals", "city": "berlin", "n": 100},
    )
    assert probe.status_code == 200
    pool_ids = _ids(probe.json())
    assert len(pool_ids) >= 1
    assert probe.json()["exhausted"] is False

    exhausted = client.post(
        "/offers/alternatives",
        json={
            "lens": "best_deals",
            "city": "berlin",
            "n": 3,
            "seen_variant_ids": pool_ids,
        },
    )
    assert exhausted.status_code == 200
    payload = exhausted.json()
    assert payload["exhausted"] is True
    assert payload["variants"] == []
    # total_candidates is unchanged — the pool didn't shrink, the user
    # just saw all of it.
    assert payload["total_candidates"] == probe.json()["total_candidates"]


def test_seen_variant_ids_anchor_pinned_even_when_seen() -> None:
    """The anchor (card 1) is the safety card the user just tapped.
    Even when its id is in the seen-set, the anchored for_you path
    must still surface it at position 0 — otherwise the swipe stack
    feels broken ("I tapped this and it disappeared")."""
    anchor_id = "berlin-mitte-cafe-bondi"
    response = client.post(
        "/offers/alternatives",
        json={
            "merchant_id": anchor_id,
            "n": 3,
            "seen_variant_ids": [anchor_id],
        },
    )
    assert response.status_code == 200
    variants = response.json()["variants"]
    assert variants[0]["merchant_id"] == anchor_id
    assert variants[0]["is_anchor"] is True


def test_seen_variant_ids_filters_anchored_tail() -> None:
    """The anchored for_you tail (cards 2..N) must respect the
    seen-set. Replaying the previous round's tail-ids should pull
    different cross-merchant candidates into the tail slots."""
    anchor_id = "berlin-mitte-cafe-bondi"
    first = client.post(
        "/offers/alternatives",
        json={"merchant_id": anchor_id, "n": 3},
    )
    assert first.status_code == 200
    first_payload = first.json()
    assert first_payload["total_candidates"] >= 3
    tail_ids = [
        v["merchant_id"]
        for v in first_payload["variants"]
        if not v["is_anchor"]
    ]
    assert len(tail_ids) >= 1

    second = client.post(
        "/offers/alternatives",
        json={
            "merchant_id": anchor_id,
            "n": 3,
            "seen_variant_ids": tail_ids,
        },
    )
    assert second.status_code == 200
    second_variants = second.json()["variants"]
    second_tail = [
        v["merchant_id"] for v in second_variants if not v["is_anchor"]
    ]
    # Anchor still pinned.
    assert second_variants[0]["merchant_id"] == anchor_id
    # The seen tail-ids must not reappear in the new tail.
    assert not (set(second_tail) & set(tail_ids))


def test_response_carries_default_rotation_fields_for_old_clients() -> None:
    """Old mobile clients that don't pass `seen_variant_ids` must
    still see the response shape — `exhausted=false` and a numeric
    `total_candidates` — so the additive contract is genuinely
    backwards-compatible."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "nearby", "city": "berlin", "n": 3},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "exhausted" in payload
    assert "total_candidates" in payload
    assert payload["exhausted"] is False
    assert isinstance(payload["total_candidates"], int)
    assert payload["total_candidates"] >= len(payload["variants"])


# ---------------------------------------------------------------------------
# Issue #151 — contextual subhead (deterministic fallback path)
# ---------------------------------------------------------------------------
#
# Default path (`use_llm=False`) must produce a non-empty, per-category
# subhead that varies across categories AND stays deterministic per
# (merchant_id, time_bucket) so the demo recording is stable.


def _subhead_text(variant: dict) -> str:
    """Pull the body subhead Text node out of the rainHero widget tree.

    Position: children[1].children[3] in the rainHero-shaped tree
    (kicker, name, headline, body).
    """
    spec = variant["widget_spec"]
    return spec["children"][1]["children"][3]["text"]


def test_fallback_subhead_is_non_empty_for_every_card() -> None:
    """No card may render with an empty subhead — that's the regression
    we're fixing. The body Text node was previously the same hard-coded
    string per category ("small shop, owner-on-floor"); now it must
    always carry a real phrase."""
    response = client.post(
        "/offers/alternatives",
        json={"lens": "best_deals", "city": "berlin", "n": 3},
    )
    assert response.status_code == 200
    for variant in response.json()["variants"]:
        text = _subhead_text(variant)
        assert isinstance(text, str)
        assert text.strip(), f"empty subhead for {variant['merchant_id']}"
        # Sanity: the fix is to drop the old templated filler. If we
        # ever regress to that exact phrase, fail loud.
        assert text != "small shop, owner-on-floor"


def test_fallback_subhead_varies_by_category() -> None:
    """Two merchants in different categories must NOT receive the same
    subhead — the per-category pools exist precisely to give each card
    its own tone+emotion line."""
    from momentmarkt_backend.alternatives import pick_fallback_subhead

    cafe_subhead = pick_fallback_subhead(
        merchant_id="some-cafe",
        category="cafe",
        time_bucket="lunch",
    )
    bakery_subhead = pick_fallback_subhead(
        merchant_id="some-bakery",
        category="bakery",
        time_bucket="lunch",
    )
    bookstore_subhead = pick_fallback_subhead(
        merchant_id="some-bookstore",
        category="bookstore",
        time_bucket="lunch",
    )
    # All non-empty.
    assert cafe_subhead and bakery_subhead and bookstore_subhead
    # At least two of the three differ — the picks come from different
    # category pools, so identical strings would only be possible by
    # an accidental shared phrase. Today the pools share zero phrases.
    distinct = {cafe_subhead, bakery_subhead, bookstore_subhead}
    assert len(distinct) >= 2, (
        f"subhead pools collapsed onto identical strings: {distinct}"
    )


def test_fallback_subhead_is_deterministic_per_merchant_and_time_bucket() -> None:
    """Same merchant + same time bucket must always produce the same
    subhead — the demo recording cut depends on idempotent state."""
    from momentmarkt_backend.alternatives import pick_fallback_subhead

    first = pick_fallback_subhead(
        merchant_id="berlin-mitte-cafe-bondi",
        category="cafe",
        time_bucket="lunch",
    )
    second = pick_fallback_subhead(
        merchant_id="berlin-mitte-cafe-bondi",
        category="cafe",
        time_bucket="lunch",
    )
    third = pick_fallback_subhead(
        merchant_id="berlin-mitte-cafe-bondi",
        category="cafe",
        time_bucket="lunch",
    )
    assert first == second == third


def test_fallback_subhead_varies_across_merchants_in_same_category() -> None:
    """Within the same category pool, different merchants should hash
    to different picks (so the swipe stack doesn't show three identical
    subheads when all three cards happen to be the same category).

    The pool is small (≤ 5 phrases per category) so collisions can
    occur in principle — but across the canonical Berlin cafe set we
    expect at least 2 distinct picks at the demo time bucket."""
    from momentmarkt_backend.alternatives import pick_fallback_subhead

    cafe_ids = (
        "berlin-mitte-cafe-bondi",
        "berlin-mitte-the-barn-03005",
        "berlin-mitte-st-oberholz-02953",
    )
    picks = {
        pick_fallback_subhead(
            merchant_id=mid, category="cafe", time_bucket="lunch"
        )
        for mid in cafe_ids
    }
    assert len(picks) >= 2, f"cafe subheads collapsed: {picks}"


def test_fallback_subhead_handles_unknown_category_gracefully() -> None:
    """Unknown categories must still produce a non-empty subhead so
    the card never renders with an empty body Text node."""
    from momentmarkt_backend.alternatives import pick_fallback_subhead

    text = pick_fallback_subhead(
        merchant_id="unknown-merchant",
        category="space-station",
        time_bucket="lunch",
    )
    assert isinstance(text, str) and text.strip()


def test_time_bucket_for_hour_maps_demo_clock() -> None:
    """The demo runs at 13:30 local — must land in the `lunch` bucket
    so the subhead picker stays aligned with the rain-trigger demo."""
    from momentmarkt_backend.alternatives import _time_bucket_for_hour

    assert _time_bucket_for_hour(13) == "lunch"
    assert _time_bucket_for_hour(7) == "morning"
    assert _time_bucket_for_hour(15) == "afternoon"
    assert _time_bucket_for_hour(19) == "evening"
    assert _time_bucket_for_hour(2) == "late_night"
    # Out-of-range inputs are clamped, not raised.
    assert _time_bucket_for_hour(99) in {
        "morning", "lunch", "afternoon", "evening", "late_night",
    }


def test_preference_context_reorders_candidates_anchor_pinned() -> None:
    """Sending prior-swipe history with `use_llm=False` exercises the
    deterministic heuristic re-rank. The anchor stays at position 0."""
    # First, get the natural cross-merchant order so we know what to
    # compare against.
    natural = client.post(
        "/offers/alternatives",
        json={"merchant_id": "berlin-mitte-cafe-bondi", "n": 3},
    )
    assert natural.status_code == 200
    natural_ids = [v["merchant_id"] for v in natural.json()["variants"]]
    assert len(natural_ids) >= 2
    # Build a preference context that fast-skipped a cafe and lingered
    # on a bakery (signal: bias toward bakery candidates if any).
    response = client.post(
        "/offers/alternatives",
        json={
            "merchant_id": "berlin-mitte-cafe-bondi",
            "n": 3,
            "use_llm": False,
            "preference_context": [
                {
                    "merchant_id": "berlin-mitte-the-barn-03005",
                    "dwell_ms": 250,
                    "swiped_right": False,
                },
                {
                    "merchant_id": "berlin-mitte-zeit-fur-brot-03038",
                    "dwell_ms": 4200,
                    "swiped_right": True,
                },
            ],
        },
    )
    assert response.status_code == 200
    reranked_ids = [v["merchant_id"] for v in response.json()["variants"]]
    # Anchor still pinned at position 0.
    assert reranked_ids[0] == "berlin-mitte-cafe-bondi"
    # Same set of candidates (no additions, no drops).
    assert set(reranked_ids) == set(natural_ids)
