"""LangGraph workflow, guardrail, and LLM fallback tests."""

from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace

from sqlalchemy.orm import Session

from copilot.llm import LLMRegistry
from copilot.providers import MockCalendarProvider
from copilot.state import CalendarEvent
from copilot.workflow import _knowledge_query_terms, generate_copilot_advice
from db.models import User


VALID_ADVICE = (
    '{"summary":"Your forecast has relevant environmental signals.",'
    '"sections":[{"title":"Today","body":"Monitor symptoms and follow your action plan."}],'
    '"disclaimer":"Educational only; follow your clinician-authored action plan."}'
)


def test_knowledge_query_uses_forecast_and_elevated_environment_triggers():
    terms = _knowledge_query_terms(
        {
            "forecast": {
                "contributing_factors": ["Elevated particulate pollution"],
                "top_features": [{"feature": "tree_pollen"}],
            },
            "environment": {
                "aqi": 4,
                "pm2_5": 42,
                "tree_pollen": "High",
                "grass_pollen": "Low",
            },
            "profile": {"known_triggers": ["exercise"]},
            "question": None,
            "advice_type": "daily",
        }
    )

    assert "AQI air quality pollution" in terms
    assert "PM2.5 air pollution wildfire smoke" in terms
    assert "tree pollen" in terms
    assert "grass pollen" not in terms
    assert "exercise" in terms


class FakeModel:
    def __init__(self, *, content: str | None = None, error: Exception | None = None, calls=None):
        self.content = content
        self.error = error
        self.calls = calls

    async def ainvoke(self, messages):
        if self.calls is not None:
            self.calls.append(messages)
        if self.error is not None:
            raise self.error
        return SimpleNamespace(content=self.content)


def _user(db_session: Session, email: str) -> User:
    user = User(email=email, password_hash="test", trigger_preferences=["pollen"])
    db_session.add(user)
    db_session.flush()
    return user


async def test_workflow_uses_mock_calendar_and_falls_back_to_claude(db_session: Session):
    user = _user(db_session, "workflow@example.com")
    # Calendar node loads tomorrow (forecast day) by default.
    calendar = MockCalendarProvider(
        [CalendarEvent(title="Friday Meeting", start=datetime(2026, 1, 31, 9))]
    )
    calls: list = []
    registry = LLMRegistry(
        factories={
            "gemini": lambda: FakeModel(error=RuntimeError("down")),
            "claude": lambda: FakeModel(content=VALID_ADVICE, calls=calls),
        },
        retries_per_provider=2,
    )

    advice, warnings, _debug = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 1, 30),
        forecast={
            "risk_level": "High",
            "flare_probability": 0.82,
            "contributing_factors": ["High pollen"],
        },
        environment={"aqi": 4, "tree_pollen": "High"},
        symptoms_summary="nighttime symptoms",
        puffs_today=1,
        calendar_provider=calendar,
        llm_registry=registry,
    )

    assert advice is not None
    assert advice["llm_provider"] == "claude"
    assert advice["summary"].startswith("Your forecast")
    assert any("gemini attempt 2 failed" in warning for warning in warnings)
    assert calls
    system_text = calls[0][0].content
    user_text = calls[0][1].content
    assert "Never recalculate" in system_text
    assert "Never recommend starting, stopping, switching" in system_text
    assert "Friday Meeting" in user_text
    assert "<CONTEXT_DATA>" in user_text
    assert "planned activities" in user_text
    assert "Next Step" in user_text


async def test_copilot_debug_includes_retrieved_episodes(db_session: Session, monkeypatch):
    monkeypatch.setenv("COPILOT_DEBUG", "1")
    user = _user(db_session, "debug-episodes@example.com")
    registry = LLMRegistry(
        factories={
            "gemini": lambda: FakeModel(content=VALID_ADVICE),
            "claude": lambda: FakeModel(content=VALID_ADVICE),
        },
        retries_per_provider=1,
    )

    advice, _warnings, debug = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 1, 30),
        forecast={"risk_level": "Medium", "contributing_factors": []},
        environment={},
        symptoms_summary="no significant symptoms reported",
        puffs_today=0,
        llm_registry=registry,
    )

    assert advice is not None
    assert debug is not None
    assert "retrieved_episodes" in debug
    assert "insights" in debug
    assert "calendar" in debug

    monkeypatch.delenv("COPILOT_DEBUG", raising=False)
    _advice2, _w2, debug_off = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 1, 30),
        forecast={"risk_level": "Medium", "contributing_factors": []},
        environment={},
        symptoms_summary="no significant symptoms reported",
        puffs_today=0,
        llm_registry=registry,
    )
    assert debug_off is None


async def test_workflow_uses_structured_google_calendar_events(db_session: Session):
    """Resolved Google/manual events reach the LangGraph prompt with location."""
    from copilot.providers import StructuredCalendarProvider

    user = _user(db_session, "structured-cal@example.com")
    calendar = StructuredCalendarProvider(
        [
            {
                "title": "Outdoor soccer",
                "start": "2026-07-18T09:00:00-05:00",
                "end": "2026-07-18T10:30:00-05:00",
                "all_day": False,
                "location": "Madison park",
                "description": "Scrimmage",
                "source": "google_calendar",
            }
        ],
        pre_scoped=True,
    )
    calls: list = []
    registry = LLMRegistry(
        factories={
            "gemini": lambda: FakeModel(content=VALID_ADVICE, calls=calls),
            "claude": lambda: FakeModel(error=RuntimeError("unused")),
        },
        retries_per_provider=1,
    )

    advice, _warnings, _debug = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 7, 17),
        forecast={"risk_level": "High", "contributing_factors": ["High tree pollen"]},
        environment={"aqi": 4, "tree_pollen": "High"},
        symptoms_summary="no significant symptoms reported",
        puffs_today=0,
        calendar_provider=calendar,
        llm_registry=registry,
    )

    assert advice is not None
    user_text = calls[0][1].content
    assert "Outdoor soccer" in user_text
    assert "Madison park" in user_text
    assert "google_calendar" in user_text


async def test_workflow_returns_forecast_warning_when_all_models_fail(db_session: Session):
    user = _user(db_session, "outage@example.com")
    registry = LLMRegistry(
        factories={
            "gemini": lambda: FakeModel(error=RuntimeError("down")),
            "claude": lambda: FakeModel(error=RuntimeError("down")),
        },
        retries_per_provider=1,
    )

    advice, warnings, _debug = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 1, 30),
        forecast={"risk_level": "Medium", "contributing_factors": []},
        environment={},
        symptoms_summary="no significant symptoms reported",
        puffs_today=0,
        llm_registry=registry,
    )

    assert advice is None
    assert warnings[-1] == "Advice is temporarily unavailable; the ML forecast is still valid."


async def test_invalid_gemini_output_retries_and_uses_claude(db_session: Session):
    user = _user(db_session, "invalid-output@example.com")
    registry = LLMRegistry(
        factories={
            "gemini": lambda: FakeModel(content='{"summary":""}'),
            "claude": lambda: FakeModel(content=VALID_ADVICE),
        },
        retries_per_provider=1,
    )

    advice, warnings, _debug = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 1, 30),
        forecast={"risk_level": "Low", "contributing_factors": []},
        environment={},
        symptoms_summary="no significant symptoms reported",
        puffs_today=0,
        llm_registry=registry,
    )

    assert advice is not None
    assert advice["llm_provider"] == "claude"
    assert any("gemini attempt 1 failed" in warning for warning in warnings)


async def test_medication_dosage_instruction_is_rejected_and_falls_back(db_session: Session):
    user = _user(db_session, "unsafe-medication@example.com")
    unsafe_advice = (
        '{"summary":"Change your treatment.",'
        '"sections":[{"title":"Medication","body":"Increase your inhaler dose to 4 puffs."}],'
        '"disclaimer":"Educational only."}'
    )
    registry = LLMRegistry(
        factories={
            "gemini": lambda: FakeModel(content=unsafe_advice),
            "claude": lambda: FakeModel(content=VALID_ADVICE),
        },
        retries_per_provider=1,
    )

    advice, warnings, _debug = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 1, 30),
        forecast={"risk_level": "Medium", "contributing_factors": []},
        environment={},
        symptoms_summary="no significant symptoms reported",
        puffs_today=0,
        llm_registry=registry,
    )

    assert advice is not None
    assert advice["llm_provider"] == "claude"
    assert "4 puffs" not in str(advice)
    assert any("gemini attempt 1 failed" in warning for warning in warnings)


CHAT_SUMMARY_ONLY = (
    '{"summary":"Looks like a calmer day for you. Night symptoms are still worth watching.",'
    '"sections":[],'
    '"disclaimer":"Educational only; follow your clinician-authored action plan."}'
)


async def test_chat_empty_sections_accepted_without_fallback(db_session: Session):
    """Chat prompt allows sections=[]; that must not trigger a second LLM call."""
    user = _user(db_session, "chat-empty-sections@example.com")
    claude_calls: list = []
    registry = LLMRegistry(
        factories={
            "gemini": lambda: FakeModel(content=CHAT_SUMMARY_ONLY),
            "claude": lambda: FakeModel(content=VALID_ADVICE, calls=claude_calls),
        },
        retries_per_provider=1,
    )

    advice, warnings, _debug = await generate_copilot_advice(
        db=db_session,
        user=user,
        anchor_date=date(2026, 1, 30),
        forecast={"risk_level": "Low", "contributing_factors": ["Night symptoms"]},
        environment={},
        symptoms_summary="nighttime symptoms",
        puffs_today=0,
        question="Is today a good day for a walk?",
        llm_registry=registry,
    )

    assert advice is not None
    assert advice["llm_provider"] == "gemini"
    assert advice["sections"] == []
    assert claude_calls == []
    assert not any("failed" in warning for warning in warnings)


def test_strip_inline_citations_removes_source_phrases():
    from copilot.workflow import strip_inline_citations

    assert strip_inline_citations(
        "According to the CDC's \"Controlling Asthma\" guide, pollen can trigger symptoms."
    ) == "Pollen can trigger symptoms."
    assert strip_inline_citations("Keep your rescue inhaler with you (CDC, 'Living with Asthma').") == (
        "Keep your rescue inhaler with you."
    )
    assert strip_inline_citations("Per NHLBI guidelines, wear a scarf in cold air.") == "Wear a scarf in cold air."
    assert strip_inline_citations("Pollen is high, so keep windows closed.") == "Pollen is high, so keep windows closed."
