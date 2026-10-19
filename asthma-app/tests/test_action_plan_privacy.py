"""The saved action plan, medicines and contacts never reach an AI provider.

Saves a profile whose action plan, asthma support and emergency contacts carry a
sentinel string, then drives every endpoint that calls an LLM (forecast advice,
regenerated advice, Copilot chat, companion chat and opening, day plan) with the
providers replaced by a recorder. Fails if the sentinel shows up in any prompt or
system prompt.

What this does not prove: text a user types themselves (a chat message, a saved
summary, calendar notes) can still contain anything, including their plan.
"""

from __future__ import annotations

import json
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from copilot.llm import LLMRegistry

SENTINEL = "SENTINEL-PLAN-7F3A"

PROFILE = {
    "action_plan": {
        "green": {"daily_medicines": f"{SENTINEL} green"},
        "yellow": {
            "quick_relief_medicine": f"{SENTINEL} yellow",
            "dose_device": f"{SENTINEL} dose",
            "repeat_every_minutes": 20,
            "max_doses": 3,
            "if_not_improving": f"{SENTINEL} not improving",
        },
        "red": {
            "quick_relief": f"{SENTINEL} red",
            "oral_steroid": f"{SENTINEL} steroid",
            "call_clinician": f"{SENTINEL} call",
            "emergency": f"{SENTINEL} emergency",
        },
        "other_instructions": f"{SENTINEL} other",
    },
    "asthma_support": {
        "rescue_inhaler": f"{SENTINEL} rescue",
        "controller_medicines": f"{SENTINEL} controller",
        "nebulizer": f"{SENTINEL} nebulizer",
        "peak_flow": {"personal_best": 450, "yellow_below": 360, "red_below": 225},
        "clinician": {"name": f"{SENTINEL} Dr", "phone": "555-0101"},
        "urgent_care": {"name": f"{SENTINEL} UC", "phone": "555-0102", "address": f"{SENTINEL} St"},
    },
    "emergency_contacts": [{"firstName": f"{SENTINEL}", "lastName": "Contact", "phone": "555-0100"}],
}

# The first output each validator accepts is returned, so every path gets a valid reply.
CANDIDATE_OUTPUTS = [
    {"message": "Thanks for sharing."},
    {"summary": "Pollen is up today.", "tips": []},
    {"summary": "Pollen is up today.", "sections": [], "disclaimer": "Educational only."},
]


@pytest.fixture
def recorded_prompts(monkeypatch):
    prompts: list[str] = []

    async def fake_generate(self, *, system_prompt, prompt, requested_provider=None, validator=None):
        prompts.append(system_prompt + "\n" + prompt)
        for output in CANDIDATE_OUTPUTS:
            try:
                return (validator(output) if validator else output), "fake", []
            except Exception:
                continue
        raise AssertionError("no candidate output passed the validator")

    async def fake_direct(prompt):
        prompts.append(prompt)
        return {"summary": "ok", "sections": []}

    monkeypatch.setattr(LLMRegistry, "generate", fake_generate)
    monkeypatch.setattr("services.advice_service._call_gemini", fake_direct)
    monkeypatch.setattr("services.advice_service._call_claude", fake_direct)
    return prompts


def test_saved_plan_medicines_and_contacts_never_reach_the_llm(
    client: TestClient, auth_headers: dict, db_session, mock_env_fetch, recorded_prompts, monkeypatch
):
    # The companion ends its read transaction with rollback(); in this fixture that
    # would undo the whole test transaction (including the user), so make it a no-op.
    monkeypatch.setattr(db_session, "rollback", lambda: None)
    saved = client.patch("/v1/users/me", json=PROFILE, headers=auth_headers)
    assert saved.status_code == 200, saved.text
    assert SENTINEL in json.dumps(saved.json())  # the plan really is stored

    assert client.post("/v1/check-ins", json={"calendar_event": "Soccer practice"}, headers=auth_headers).status_code == 201
    # a timed event, so the day plan asks the LLM (it stays silent with no events and nothing flagged)
    today = date.today().isoformat()
    event = {"title": "Soccer practice", "start": f"{today}T18:00", "end": f"{today}T19:30", "all_day": False}
    assert client.post("/v1/calendar/manual-events", json={"events": [event]}, headers=auth_headers).status_code == 201

    with patch("services.forecast_service.fetch_env_daily") as forecast_env, patch(
        "services.env_fetcher.fetch_env_daily"
    ) as day_plan_env:
        forecast_env.side_effect = mock_env_fetch.side_effect
        day_plan_env.side_effect = mock_env_fetch.side_effect

        calls = [
            ("/v1/forecast", {"lat": 42.36, "lon": -71.06}),
            ("/v1/advice", {}),
            ("/v1/chat", {"message": "Should I run outside today?"}),
            ("/v1/companion/opening", {"persona": "warm"}),
            ("/v1/companion/chat", {"message": "What does my plan say to do?"}),
            ("/v1/day-plan", {"lat": 42.36, "lon": -71.06}),
        ]
        for path, body in calls:
            response = client.post(path, json=body, headers=auth_headers)
            assert response.status_code == 200, f"{path}: {response.text}"

    assert len(recorded_prompts) >= len(calls), "every endpoint should have asked the LLM"
    leaked = [prompt for prompt in recorded_prompts if SENTINEL in prompt]
    assert not leaked, f"saved plan/medicines/contacts reached an LLM prompt: {leaked[0][:500]}"
