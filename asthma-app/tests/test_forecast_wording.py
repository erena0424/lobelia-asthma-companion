from datetime import date
from types import SimpleNamespace

from services.forecast_service import _dated_factors, _humanize_top_features
from services.providers.openmeteo import _pollen


def test_factors_name_the_check_in_day_not_today():
    check_in = SimpleNamespace(
        date=date(2026, 10, 16), daily_night_symp=True, daily_day_symp=True, puffs_today=4
    )
    factors = _humanize_top_features([], {}, check_in)
    assert "Night symptoms on Fri, Oct 16" in factors
    assert "Daytime symptoms on Fri, Oct 16" in factors
    assert "Rescue inhaler used 4 times on Fri, Oct 16" in factors
    assert not any("today" in factor for factor in factors)


def test_legacy_stored_factors_are_reworded_on_read():
    stored = ["Night symptoms today", "Rescue inhaler used once", "High grass pollen"]
    assert _dated_factors(stored, date(2026, 10, 16)) == [
        "Night symptoms on Fri, Oct 16",
        "Rescue inhaler used once on Fri, Oct 16",
        "High grass pollen",
    ]


def test_missing_pollen_is_none_not_low():
    assert _pollen([None, None]) is None
    assert _pollen(None) is None
    assert _pollen([150.0, None]) == "High"
