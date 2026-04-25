"""Stress tests for signal-context construction.

This is the layer the consumer app and merchant inbox both read from. If a
field goes missing, the demo silently misses the rain trigger or shows the
wrong merchant. Every test below asserts a fact a downstream consumer will
rely on during the recorded demo.
"""

from __future__ import annotations

import pytest

from momentmarkt_backend.fixtures import (
    available_cities,
    load_density,
    load_weather,
)
from momentmarkt_backend.signals import (
    build_signal_context,
    distance_m,
    parse_demo_time,
)


REQUIRED_TOP_LEVEL_KEYS = {
    "city",
    "city_id",
    "currency",
    "timezone",
    "demo_time_local",
    "weather",
    "event",
    "merchant",
    "privacy",
    "wrapped_user_context",
    "surface",
}


class TestBerlinCanonicalContext:
    @pytest.fixture
    def ctx(self) -> dict:
        return build_signal_context(city="berlin")

    def test_top_level_shape(self, ctx: dict) -> None:
        missing = REQUIRED_TOP_LEVEL_KEYS - set(ctx)
        assert missing == set(), f"signal context missing keys: {missing}"

    def test_canonical_demo_merchant_selected(self, ctx: dict) -> None:
        assert ctx["merchant"]["id"] == "berlin-mitte-cafe-bondi"
        assert ctx["merchant"]["distance_m"] == 82
        assert ctx["merchant"]["demand_gap_ratio"] == 0.54

    def test_weather_trigger_forced_by_city_config(self, ctx: dict) -> None:
        # The hourly precipitation_probability is all zeros in the fixture, so
        # the trigger is only "rain_incoming" because cities/berlin.json
        # forces it. If that override stops working, the demo loses its spine.
        assert ctx["weather"]["trigger"] == "rain_incoming"

    def test_event_trigger_active_for_demo_window(self, ctx: dict) -> None:
        assert ctx["event"]["ending_soon"] is True
        assert ctx["event"]["event"]["id"] == "bln-005"

    def test_privacy_envelope_present_in_three_places(self, ctx: dict) -> None:
        # The on-screen dev-panel privacy log + wrapped_user_context +
        # surface input all need to agree so judges can read the boundary.
        wanted = {
            "intent_token": "lunch_break.cold",
            "h3_cell_r8": "881f1d489dfffff",
        }
        assert ctx["privacy"] == wanted
        assert ctx["wrapped_user_context"]["intent_token"] == wanted["intent_token"]
        assert ctx["wrapped_user_context"]["h3_cell_r8"] == wanted["h3_cell_r8"]
        assert ctx["surface"]["intent_token"] == wanted["intent_token"]
        assert ctx["surface"]["h3_cell_r8"] == wanted["h3_cell_r8"]

    def test_merchant_signal_summary_for_below_typical(self, ctx: dict) -> None:
        # Bondi triggers demand-gap → summary should say "% below baseline".
        assert "below" in ctx["merchant"]["summary"].lower()

    def test_high_intent_defaults_to_off(self, ctx: dict) -> None:
        hi = ctx["wrapped_user_context"]["high_intent"]
        assert hi == {
            "active_screen_time_recent_s": 0,
            "map_app_foreground_recent": False,
            "coupon_browse_recent": False,
        }


class TestMerchantSelection:
    @pytest.mark.parametrize(
        "merchant_id",
        [
            "berlin-mitte-cafe-bondi",
            "berlin-mitte-baeckerei-rosenthal",
            "berlin-mitte-kiezbuchhandlung-august",
            "berlin-mitte-eisgarten-weinmeister",
        ],
    )
    def test_explicit_merchant_id_is_honoured(self, merchant_id: str) -> None:
        ctx = build_signal_context(city="berlin", merchant_id=merchant_id)
        assert ctx["merchant"]["id"] == merchant_id

    def test_unknown_merchant_raises(self) -> None:
        with pytest.raises(KeyError):
            build_signal_context(city="berlin", merchant_id="ghost-merchant")

    def test_default_falls_back_to_canonical(self) -> None:
        ctx = build_signal_context(city="berlin")
        assert ctx["merchant"]["id"] == "berlin-mitte-cafe-bondi"

    def test_non_triggering_merchant_summary_is_reason_text(self) -> None:
        ctx = build_signal_context(
            city="berlin", merchant_id="berlin-mitte-baeckerei-rosenthal"
        )
        # Bakery does not trigger demand-gap → summary uses the fixture reason.
        assert "below" in ctx["merchant"]["summary"].lower() or (
            "baseline" in ctx["merchant"]["summary"].lower()
        )


class TestZurichConfigSwap:
    @pytest.fixture
    def ctx(self) -> dict:
        return build_signal_context(city="zurich")

    def test_currency_swaps_to_chf(self, ctx: dict) -> None:
        assert ctx["currency"] == "CHF"

    def test_weather_trigger_clear(self, ctx: dict) -> None:
        assert ctx["weather"]["trigger"] == "clear"

    def test_privacy_envelope_diverges_from_berlin(self, ctx: dict) -> None:
        # Privacy envelope differs per city → swap is observable.
        assert ctx["privacy"]["intent_token"] == "weekend_wander"
        assert ctx["privacy"]["h3_cell_r8"] == "881f8d4b29fffff"

    def test_surface_input_carries_clear_trigger(self, ctx: dict) -> None:
        assert ctx["surface"]["weatherTrigger"] == "clear"


class TestUnknownCity:
    def test_unknown_city_raises_filenotfound(self) -> None:
        with pytest.raises(FileNotFoundError):
            build_signal_context(city="atlantis")

    def test_available_cities_lists_only_real_configs(self) -> None:
        cities = available_cities()
        assert "berlin" in cities
        assert "zurich" in cities


class TestWeatherTriggerLogic:
    def test_dynamic_inference_picks_rain_when_probability_high(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Drop the city-config override and verify the dynamic detector fires
        # when probability >= 40 in the first 8 hours.
        from momentmarkt_backend import signals as signals_mod

        weather = {
            "hourly": {"precipitation_probability": [10, 60, 0, 0, 0, 0, 0, 0]},
        }
        config = {
            "demo": {"weather_trigger": None},
        }
        assert signals_mod._weather_trigger(config, weather) == "rain_incoming"

    def test_dynamic_inference_returns_clear_when_probability_low(
        self,
    ) -> None:
        from momentmarkt_backend import signals as signals_mod

        weather = {
            "hourly": {"precipitation_probability": [10, 20, 30, 0, 0, 0, 0, 0]},
        }
        config = {"demo": {}}  # no forced override key
        assert signals_mod._weather_trigger(config, weather) == "clear"

    def test_forced_value_overrides_dynamic_inference(self) -> None:
        from momentmarkt_backend import signals as signals_mod

        weather = {
            "hourly": {"precipitation_probability": [99] * 12},
        }
        config = {"demo": {"weather_trigger": "clear"}}
        assert signals_mod._weather_trigger(config, weather) == "clear"


class TestEventSelection:
    def test_unknown_event_id_falls_through_to_first_event(self) -> None:
        # Documented behaviour: when configured event_id has no match,
        # _select_event still returns the first event so the demo never goes
        # silent on the event dimension. If this changes, the merchant
        # inbox event-rule toggle stops being visible.
        from momentmarkt_backend import signals as signals_mod

        events = [{"id": "a"}, {"id": "b"}]
        assert signals_mod._select_event(events, "missing") == {"id": "a"}

    def test_no_events_returns_none(self) -> None:
        from momentmarkt_backend import signals as signals_mod

        assert signals_mod._select_event([], "anything") is None


class TestGeometryHelpers:
    def test_distance_zero_for_identical_point(self) -> None:
        assert distance_m(52.5, 13.4, 52.5, 13.4) == 0

    def test_distance_is_symmetric(self) -> None:
        a = distance_m(52.5301, 13.4012, 52.5306, 13.4021)
        b = distance_m(52.5306, 13.4021, 52.5301, 13.4012)
        assert a == b

    def test_distance_for_known_pair_within_tolerance(self) -> None:
        # Mia (52.5301, 13.4012) ↔ Bondi (52.5306, 13.4021): fixture says 82 m.
        d = distance_m(52.5301, 13.4012, 52.5306, 13.4021)
        assert 60 <= d <= 110

    def test_parse_demo_time_handles_iso_with_tz(self) -> None:
        dt = parse_demo_time("2026-04-25T13:30:00+02:00")
        assert dt.year == 2026 and dt.hour == 13 and dt.minute == 30
        assert dt.utcoffset() is not None


class TestFixtureReuseAcrossCities:
    def test_zurich_reuses_berlin_density_fixture(self) -> None:
        # cities/zurich.json points density_fixture → "berlin". This is by
        # design (no Swiss density fixture authored), but the demo relies on
        # it: if it changes, Zurich loses its merchant data entirely.
        z_density = load_density("berlin")
        assert z_density["fixture_id"] == "berlin-mitte-payone-density-v1"
        assert any(
            m["id"] == "berlin-mitte-cafe-bondi" for m in z_density["merchants"]
        )

    def test_zurich_weather_fixture_distinct_from_berlin(self) -> None:
        b = load_weather("berlin")
        z = load_weather("zurich")
        assert b["timezone"] != z["timezone"] or b["latitude"] != z["latitude"]
