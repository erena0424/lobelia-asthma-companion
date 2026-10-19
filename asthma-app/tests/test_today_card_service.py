"""Today card rules (LBL-020): symptom state, plan steps and weather flags, all in code."""

from __future__ import annotations

from datetime import date

import pytest

from services import today_card_service as svc

TODAY = date(2026, 10, 18)  # Sunday


def entry(day, **kw):
    base = {"date": day, "breathing_0_to_10": {}, "night_waking": False, "activity_limitation": False, "reliever_puffs": 0}
    return {**base, **kw}


PLAN = {
    "green": {"daily_medicines": "Fluticasone 2 puffs morning and evening"},
    "yellow": {
        "quick_relief_medicine": "Albuterol",
        "dose_device": "2 to 4 puffs with spacer",
        "repeat_every_minutes": 240,
        "max_doses": 6,
        "if_not_improving": "Call Dr. Rivera if not better in 24 hours",
    },
    "red": {"emergency": "Call 911"},
}


def test_no_check_in_today_or_yesterday_is_none():
    state = svc.symptom_state([entry("2026-10-16", night_waking=True)], TODAY)
    assert state["state"] == "none"
    assert svc.plan_steps(PLAN, "none")["steps"] == []


def test_no_symptoms_logged_is_green_with_daily_steps():
    state = svc.symptom_state([entry("2026-10-17")], TODAY)
    assert state["state"] == "green"
    assert state["lead"] == "You logged no symptoms on Sat, Oct 17."
    steps = svc.plan_steps(PLAN, "green")
    assert steps["steps"] == ["Fluticasone 2 puffs morning and evening"]
    assert steps["heading"] == "Your daily steps, from your action plan"
    assert steps["open"] is False


def test_symptoms_use_the_approved_labels_and_point_to_yellow_steps_verbatim():
    state = svc.symptom_state([entry("2026-10-18", breathing_0_to_10={"wheezing": 5, "coughing": 2}, night_waking=True)], TODAY)
    assert state["state"] == "yellow"
    assert state["signs"] == ["noticeable wheezing", "slight coughing", "waking at night"]
    assert state["lead"] == "You logged noticeable wheezing, slight coughing and waking at night on Sun, Oct 18."
    steps = svc.plan_steps(PLAN, "yellow")
    assert steps["steps"] == [
        "Albuterol · 2 to 4 puffs with spacer · every 240 minutes, up to 6 doses",
        "Call Dr. Rivera if not better in 24 hours",
    ]
    assert steps["open"] is True


def test_check_in_keys_read_as_words():
    state = svc.symptom_state([entry("2026-10-18", breathing_0_to_10={"chest_tightness": 6})], TODAY)  # guard only; check_in_context already sends words
    assert state["signs"] == ["noticeable chest tightness"]


def test_reliever_puffs_alone_do_not_count_as_symptoms():
    # a lone puff may have been before exercise
    assert svc.symptom_state([entry("2026-10-18", reliever_puffs=2)], TODAY)["state"] == "green"
    with_sign = svc.symptom_state([entry("2026-10-18", reliever_puffs=2, activity_limitation=True)], TODAY)
    assert with_sign["signs"] == ["limited activity", "2 reliever puffs"]


def test_latest_check_in_wins():
    check_ins = [entry("2026-10-17", night_waking=True), entry("2026-10-18")]
    assert svc.symptom_state(check_ins, TODAY)["state"] == "green"


def test_two_days_in_a_row_escalates_to_the_clinician_line():
    check_ins = [entry("2026-10-17", night_waking=True), entry("2026-10-18", breathing_0_to_10={"chest_tightness": 8})]
    state = svc.symptom_state(check_ins, TODAY)
    assert state["state"] == "escalate"
    assert state["escalation"] == "You've logged symptoms 2 days in a row. That's a good reason to contact your clinician."


def test_a_gap_day_breaks_the_streak():
    check_ins = [entry("2026-10-16", night_waking=True), entry("2026-10-18", night_waking=True)]
    assert svc.symptom_state(check_ins, TODAY)["state"] == "yellow"


def test_no_saved_plan_shows_the_general_list_only_when_symptoms_were_logged(monkeypatch):
    steps = svc.plan_steps(None, "yellow")
    assert steps["source"] == "general"
    assert steps["heading"] == "What an asthma action plan usually covers (not your plan)"
    assert steps["steps"] == svc.NO_PLAN_STEPS
    assert svc.plan_steps({}, "green")["steps"] == []

    monkeypatch.setattr(svc, "NO_PLAN_STEPS_MODE", "none")
    assert svc.plan_steps(None, "yellow")["steps"] == []


def test_empty_zone_returns_no_steps():
    assert svc.plan_steps({"green": {"daily_medicines": "x"}}, "yellow")["steps"] == []


ENV = {"aqi_band": 1, "aqi_label": "Good", "pollen": "High", "temperature_high_f": 45, "temperature_low_f": 31, "humidity_pct": 95}


@pytest.mark.parametrize(
    "triggers,expected",
    [
        ([], []),
        (["Pollen"], ["pollen"]),
        (["Cold air"], ["cold"]),
        (["Weather changes"], []),
        (["pollen", "cold air"], ["pollen", "cold"]),
    ],
)
def test_weather_flags_follow_the_users_picks(triggers, expected):
    assert [flag["key"] for flag in svc.weather_flags(ENV, triggers)] == expected


def test_poor_air_quality_is_flagged_for_everyone_and_humidity_never():
    flags = svc.weather_flags({**ENV, "aqi_band": 3, "aqi_label": "Unhealthy for sensitive groups"}, [])
    assert [flag["key"] for flag in flags] == ["air_quality"]
    assert svc.weather_flags({"aqi_band": 2, "humidity_pct": 99}, ["humidity"]) == []


def test_big_daily_swing_is_flagged_for_weather_changes():
    flags = svc.weather_flags({"temperature_high_f": 70, "temperature_low_f": 50}, ["Weather changes"])
    assert flags[0]["label"] == "temperatures swing from 70° to 50°F"


def test_because_line_names_the_condition_and_the_pick():
    flags = svc.weather_flags(ENV, ["Cold air"])
    assert svc.because_line(flags) == "Because it drops to 31°F and you picked cold air."
    assert svc.because_line([]) is None
    several = svc.weather_flags({**ENV, "aqi_band": 3, "aqi_label": "Unhealthy for sensitive groups"}, ["Pollen", "Cold air"])
    assert svc.because_line(several) == (
        "Because air quality is unhealthy for sensitive groups, pollen is high and it drops to 31°F. "
        "You picked pollen and cold air in your Profile."
    )
    assert svc.because_line(svc.weather_flags({"aqi_band": 4, "aqi_label": "Unhealthy"}, [])) == "Because air quality is unhealthy."


def test_llm_view_has_labels_only():
    card = svc.build_today_card(
        check_ins=[entry("2026-10-18", night_waking=True)], today=TODAY, action_plan=PLAN, environment=ENV, triggers=["Pollen"]
    )
    view = svc.llm_view(card)
    assert view == {"symptom_state": "yellow", "logged_signs": ["waking at night"], "weather_flags": ["pollen is high"]}
    assert "Albuterol" not in str(view)
    assert card["help"] == {"top": False, "lead": None}


@pytest.mark.parametrize(
    "kw,lead",
    [
        ({"breathing_0_to_10": {"shortness of breath": 7}}, "Your check-in had a strong symptom."),
        ({"activity_limitation": True}, "Your check-in had limited activity."),
        ({"breathing_0_to_10": {"wheezing": 9}, "activity_limitation": True}, "Your check-in had a strong symptom and limited activity."),
    ],
)
def test_strong_symptoms_or_limited_activity_move_breathing_help_to_the_top(kw, lead):
    card = svc.build_today_card(check_ins=[entry("2026-10-18", **kw)], today=TODAY, action_plan=PLAN, environment=ENV, triggers=[])
    assert card["symptoms"]["state"] == "yellow"  # never above Yellow on Today
    assert card["plan"]["steps"]  # Yellow steps still show
    assert card["help"] == {"top": True, "lead": f"{lead} {svc.HELP_TOP_FOLLOW}"}


def test_noticeable_symptoms_keep_breathing_help_at_the_bottom():
    card = svc.build_today_card(
        check_ins=[entry("2026-10-18", breathing_0_to_10={"wheezing": 6})], today=TODAY, action_plan=PLAN, environment=ENV, triggers=[]
    )
    assert card["help"]["top"] is False


def test_two_days_in_a_row_moves_breathing_help_to_the_top():
    check_ins = [entry("2026-10-17", night_waking=True), entry("2026-10-18", night_waking=True)]
    card = svc.build_today_card(check_ins=check_ins, today=TODAY, action_plan=PLAN, environment=ENV, triggers=[])
    assert card["help"] == {"top": True, "lead": None}
