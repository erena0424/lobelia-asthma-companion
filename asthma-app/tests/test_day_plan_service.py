"""Day plan (advice through the day) without a database: fake session, fake LLM."""

from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from services import day_plan_service as svc

DAY = date(2026, 10, 15)
EVENTS = [
    {"id": "skate", "title": "Skating", "start": "2026-10-15T17:00", "context": "cold air", "intensity": "moderate"},
    {"id": "lab", "title": "Chemistry Lab", "start": "2026-10-15T14:30", "context": "chemical smells"},
    {"title": "Laundry", "start": "2026-10-15", "all_day": True},
]


class FakeSession:
    """Returns a check-in with events for the first scalar() call, no forecast for the second."""

    def __init__(self):
        self.calls = 0

    def scalar(self, _query):
        self.calls += 1
        if self.calls == 1:
            return SimpleNamespace(calendar_events=EVENTS)
        return None

    def scalars(self, _query):
        # recent check-ins for the AI context: none logged in these tests
        return SimpleNamespace(all=lambda: [])

    def commit(self):
        raise AssertionError("nothing should be persisted without a forecast row")


class FakeRegistry:
    def __init__(self, output=None, error=None):
        self.output, self.error, self.calls = output, error, 0

    async def generate(self, *, system_prompt, prompt, validator=None, requested_provider=None):
        self.calls += 1
        if self.error:
            raise self.error
        return validator(self.output), "fake", []


def _user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        google_calendar_refresh_token=None,
        trigger_preferences=["Cold air"],
        trigger_sensitivities={},
    )


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    async def fake_env(lat, lon, day=None, provider=None):
        return {"features": {"grass_pollen": "Moderate", "tree_pollen": "Low", "aqi": 1, "temperature": 20.0}}

    monkeypatch.setattr("services.env_fetcher.fetch_env_daily", fake_env)
    svc._memory_cache.clear()


def test_environment_summary_picks_highest_pollen_and_converts_temperature():
    summary = svc.environment_summary(
        {"grass_pollen": "Low", "weed_pollen": "High", "aqi": 2, "temperature": 0, "temperature_max": 10, "temperature_min": -5}
    )
    assert summary == {
        "pollen": "High",
        "aqi_band": 2,
        "aqi_label": "Moderate",
        "temperature_f": 32,
        "temperature_high_f": 50,
        "temperature_low_f": 23,
    }


def test_events_are_sorted_timed_first():
    titles = [event["title"] for event in svc.normalize_events(EVENTS)]
    assert titles == ["Chemistry Lab", "Skating", "Laundry"]


async def test_ai_tips_are_used_and_cached():
    registry = FakeRegistry(
        output={
            "summary": "Pollen is moderate; your evening skate is in cold air.",
            "tips": [{"id": "lab", "tip": "Be mindful of strong scents."}],
        }
    )
    user = _user()

    plan = await svc.build_day_plan(FakeSession(), user, lat=43.0, lon=-89.4, day=DAY, registry=registry)
    await svc.build_day_plan(FakeSession(), user, lat=43.0, lon=-89.4, day=DAY, registry=registry)

    assert registry.calls == 1
    assert plan["source"] == "ai"
    assert plan["environment"]["temperature_f"] == 68
    tips = {event["id"]: event["tip"] for event in plan["events"]}
    assert tips["lab"] == "Be mindful of strong scents."
    # an event the model skipped still gets a rule-based tip
    assert tips["skate"].startswith("Cold air can be a trigger")


async def test_llm_failure_falls_back_to_rules():
    plan = await svc.build_day_plan(
        FakeSession(), _user(), lat=43.0, lon=-89.4, day=DAY, registry=FakeRegistry(error=RuntimeError("down"))
    )

    assert plan["source"] == "rules"
    assert "Pollen is moderate" in plan["summary"]
    assert plan["events"][0]["tip"].startswith("Strong scents or fumes")


async def test_medication_instructions_from_the_model_are_rejected():
    registry = FakeRegistry(output={"summary": "Take 2 puffs before skating.", "tips": []})

    plan = await svc.build_day_plan(FakeSession(), _user(), lat=43.0, lon=-89.4, day=DAY, registry=registry)

    assert plan["source"] == "rules"
    assert "puffs" not in plan["summary"]


async def test_rule_fallback_is_retried_after_it_goes_stale(monkeypatch):
    user = _user()
    failing = FakeRegistry(error=RuntimeError("down"))
    await svc.build_day_plan(FakeSession(), user, lat=43.0, lon=-89.4, day=DAY, registry=failing)
    await svc.build_day_plan(FakeSession(), user, lat=43.0, lon=-89.4, day=DAY, registry=failing)
    assert failing.calls == 1

    monkeypatch.setattr(svc, "RULES_RETRY_SECONDS", 0)
    working = FakeRegistry(output={"summary": "All good today.", "tips": []})
    plan = await svc.build_day_plan(FakeSession(), user, lat=43.0, lon=-89.4, day=DAY, registry=working)
    assert working.calls == 1
    assert plan["source"] == "ai"


@pytest.mark.parametrize(
    "summary",
    [
        "Take your controller this morning and keep your rescue inhaler with you.",
        "Use your rescue inhaler before skating.",
        "Remember your preventer inhaler tonight.",
    ],
)
async def test_medication_use_instructions_are_rejected(summary):
    plan = await svc.build_day_plan(
        FakeSession(), _user(), lat=43.0, lon=-89.4, day=DAY, registry=FakeRegistry(output={"summary": summary, "tips": []})
    )
    assert plan["source"] == "rules"


async def test_keeping_the_inhaler_nearby_is_allowed():
    registry = FakeRegistry(output={"summary": "Keep your rescue inhaler with you today.", "tips": []})
    plan = await svc.build_day_plan(FakeSession(), _user(), lat=43.0, lon=-89.4, day=DAY, registry=registry)
    assert plan["source"] == "ai"
