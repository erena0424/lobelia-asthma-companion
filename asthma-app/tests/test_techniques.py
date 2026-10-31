"""Technique library and how the day plan uses it (LOB-57). No database, fake LLM."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from copilot.safety_patterns import _MEDICATION_CHANGE_PATTERN, _MEDICATION_INSTRUCTION_PATTERN, _NUMERIC_DOSAGE_PATTERN
from services import day_plan_service as svc
from services import techniques
from tests.test_day_plan_service import DAY, CapturingRegistry, FakeRegistry, FakeSession, NoEventsSession, _env, _user  # noqa: F401 (_env: autouse fake weather)

ALL_LINES = [item["text"] for item in techniques.TECHNIQUES.values()] + [techniques.RELIEVER_REMINDER, techniques.BEFORE_EXERCISE_LEAD]


@pytest.mark.parametrize("line", ALL_LINES)
def test_every_fixed_line_passes_the_claims_and_medicine_checks(line):
    assert not svc._BANNED_PHRASES.search(line)
    assert not _MEDICATION_CHANGE_PATTERN.search(line)
    assert not _MEDICATION_INSTRUCTION_PATTERN.search(line)
    assert not _NUMERIC_DOSAGE_PATTERN.search(line)
    assert "according to" not in line.lower()


def test_every_situation_has_a_technique():
    situations = {item["situation"] for item in techniques.TECHNIQUES.values()}
    for flags, pollutant in ((set(), None), ({"air_quality"}, "ozone"), ({"air_quality"}, "pm2_5"), ({"pollen", "cold"}, None)):
        for event in (
            {"title": "Run", "environment": "outdoor", "intensity": "hard"},
            {"title": "Walk", "environment": "outdoor"},
            {"title": "Art class", "context": "paint fumes"},
        ):
            for situation in techniques.situations_for_event(event, flags, pollutant):
                assert situation in situations


def test_each_flag_and_event_type_gets_candidates():
    assert techniques.candidates(techniques.situations_for_flags({"air_quality"}, None), DAY, "summary")
    assert techniques.candidates(techniques.situations_for_flags({"pollen"}, None), DAY, "summary")
    assert techniques.candidates(techniques.situations_for_flags({"cold"}, None), DAY, "summary")
    run = {"title": "Soccer", "environment": "outdoor", "intensity": "moderate"}
    assert techniques.candidates(techniques.situations_for_event(run, set(), None), DAY, "e1")
    meeting = {"title": "Team meeting", "environment": "indoor", "intensity": "resting"}
    assert techniques.candidates(techniques.situations_for_event(meeting, set(), None), DAY, "e2") == []


def test_ozone_and_smoke_techniques_only_on_the_matching_pollutant():
    run = {"title": "Run", "environment": "outdoor", "intensity": "hard"}
    ozone = techniques.situations_for_event(run, {"air_quality"}, "ozone")
    smoke = techniques.situations_for_event(run, {"air_quality"}, "pm2_5")
    assert "air_ozone" in ozone and "air_smoke" not in ozone
    assert "air_smoke" in smoke and "air_ozone" not in smoke
    assert techniques.main_pollutant({"pm2_5": 40.0, "o3": 60.0}) == "pm2_5"
    assert techniques.main_pollutant({"pm2_5": 10.0, "o3": 160.0}) == "ozone"  # ~82 ppb
    assert techniques.main_pollutant({"pm2_5": 10.0, "o3": 60.0}) is None


def test_candidates_rotate_across_days():
    situations = ["habit"]
    orders = {tuple(techniques.candidates(situations, DAY + timedelta(days=n), "summary")) for n in range(7)}
    assert len(orders) > 1


def test_breathing_practice_only_on_a_calm_day():
    calm_only = techniques.TECHNIQUES["HB7"]["text"]
    assert all(techniques.habit_for_day(DAY + timedelta(days=n), calm=False) != calm_only for n in range(60))


def _slots():
    return {"summary": ["SC1"], "from_flags": False, "events": {"lab": ["SC1"], "skate": ["CO1", "EX1"]}}


def test_tip_naming_an_unoffered_technique_falls_back_to_the_fixed_wording():
    output = {
        "summary": "Step out if it gets smelly.",
        "summary_technique": "SC1",
        "tips": [
            {"id": "skate", "tip": "Bring a hot drink to the rink.", "technique": "HB5"},
            {"id": "lab", "tip": "Some fresh air between experiments might be nice.", "technique": "SC1"},
        ],
    }
    result = techniques.apply_output(_slots(), output)
    assert result["summary"] == "Step out if it gets smelly."
    assert result["tips"]["lab"] == "Some fresh air between experiments might be nice."
    assert result["tips"]["skate"] == techniques.text("CO1")


def _plan_user(**plan):
    user = _user()
    user.action_plan = plan or None
    user.asthma_support = None
    return user


async def test_reliever_reminder_only_when_a_quick_relief_medicine_is_saved():
    registry = FakeRegistry(output={"summary": "x", "tips": []})
    without = await svc.build_day_plan(FakeSession(), _plan_user(), lat=43.0, lon=-89.4, day=DAY, registry=registry)
    svc._memory_cache.clear()
    with_plan = await svc.build_day_plan(
        FakeSession(), _plan_user(yellow={"quick_relief_medicine": "Albuterol"}), lat=43.0, lon=-89.4, day=DAY, registry=registry
    )
    assert without["reliever_reminder"] is None
    # the skate is exercise, so the reminder shows
    assert with_plan["reliever_reminder"] == techniques.RELIEVER_REMINDER


async def test_reliever_reminder_also_from_the_profile_rescue_inhaler_field():
    user = _plan_user()
    user.asthma_support = {"rescue_inhaler": "Ventolin"}
    plan = await svc.build_day_plan(FakeSession(), user, lat=43.0, lon=-89.4, day=DAY, registry=FakeRegistry(output={"summary": "x", "tips": []}))
    assert plan["reliever_reminder"] == techniques.RELIEVER_REMINDER


async def test_before_exercise_step_shows_on_exercise_plans_and_never_reaches_the_llm():
    registry = CapturingRegistry(output={"summary": "x", "tips": []})
    user = _plan_user(green={"before_exercise": "SENTINEL-EX-4410 2 puffs 15 min before"}, yellow={"quick_relief_medicine": "SENTINEL-QR-4410"})

    plan = await svc.build_day_plan(FakeSession(), user, lat=43.0, lon=-89.4, day=DAY, registry=registry)

    steps = {event["id"]: event["plan_step"] for event in plan["events"]}
    assert steps["skate"] == f"{techniques.BEFORE_EXERCISE_LEAD} SENTINEL-EX-4410 2 puffs 15 min before"
    assert steps["lab"] is None
    assert registry.calls == 1
    assert all("SENTINEL" not in prompt and "quick-relief" not in prompt for prompt in registry.prompts)


async def test_llm_sees_only_the_offered_techniques():
    registry = CapturingRegistry(output={"summary": "x", "tips": []})
    await svc.build_day_plan(FakeSession(), _plan_user(), lat=43.0, lon=-89.4, day=DAY, registry=registry)
    prompt = registry.prompts[0]
    assert techniques.text("SC1") in prompt
    assert all(techniques.text(tid) not in prompt for tid in ("HB1", "HB7", "AQ4"))


def _escalate(_db, _user_id, day):
    sign = {"breathing_0_to_10": {"wheezing": 5}, "night_waking": False, "activity_limitation": False, "reliever_puffs": 0}
    return [dict(sign, date=day.isoformat()), dict(sign, date=(day - timedelta(days=1)).isoformat())]


async def test_escalation_keeps_event_tips_but_never_a_warm_up(monkeypatch):
    """3 days in a row: the clinician line still leads; plans still get low-key tips (Elena, 2026-10-31)."""
    monkeypatch.setattr(svc, "recent_days_for_card", _escalate)
    registry = CapturingRegistry(output={"summary": "", "tips": []})
    plan = await svc.build_day_plan(FakeSession(), _plan_user(), lat=43.0, lon=-89.4, day=DAY, registry=registry)

    assert plan["today"]["symptoms"]["state"] == "escalate"
    assert plan["today"]["symptoms"]["escalation"]
    assert registry.calls == 1
    prompt = registry.prompts[0]
    assert all(techniques.text(tid) not in prompt for tid in techniques.NOT_WHEN_ESCALATED)
    tips = {event["id"]: event["tip"] for event in plan["events"]}
    # skating is exercise: easing off comes first
    assert tips["skate"] == techniques.text("EZ1")
    assert tips["lab"] == techniques.text("SC1")


async def test_escalation_with_no_plans_shows_only_the_calendar_nudge(monkeypatch):
    monkeypatch.setattr(svc, "recent_days_for_card", _escalate)
    registry = FakeRegistry(error=AssertionError("the LLM should not be called"))
    plan = await svc.build_day_plan(NoEventsSession(), _plan_user(), lat=43.0, lon=-89.4, day=DAY, registry=registry)
    assert registry.calls == 0
    assert plan["summary"] is None
    assert plan["nudge"] == svc.NO_TIP_SUMMARY


def test_escalated_slots_never_offer_workout_techniques():
    card = {"symptoms": {"state": "escalate"}, "flags": [{"key": "air_quality"}]}
    run = {"id": "run", "title": "Run", "environment": "outdoor", "intensity": "hard", "all_day": False}
    slots = techniques.slot_candidates(card, [run], {"main_pollutant": "ozone"}, DAY)
    offered = set(slots["summary"]) | set(slots["events"]["run"])
    assert not offered & set(techniques.NOT_WHEN_ESCALATED)
    assert slots["events"]["run"][0] == "EZ1"
    # with nothing flagged there is no extra day tip, only the event tips
    calm = techniques.slot_candidates({**card, "flags": []}, [run], {}, DAY)
    assert calm["summary"] == [] and calm["events"]["run"]


def test_quiet_day_with_symptoms_logged_shows_only_the_nudge():
    card = {"symptoms": {"state": "yellow"}, "flags": []}
    assert techniques.quiet_day(card, DAY) == {"summary": svc.NO_TIP_SUMMARY, "nudge": None}
