"""Demo history seed: made-up days land in the real tables, skip real entries, and undo removes only them."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select

from db.models import CheckIn, SymptomLog, User
from scripts.seed_demo_account import apply_history, build_history, find_user, undo_history

TODAY = date(2026, 10, 26)  # a Monday
TZ = ZoneInfo("America/Chicago")


def _user(db_session) -> User:
    return db_session.scalar(select(User).where(User.email == "testuser@example.com"))


def test_history_shape_and_pattern(client: TestClient, auth_headers, db_session):
    user = _user(db_session)
    history = build_history(user.id, TODAY, 90)
    assert history == build_history(user.id, TODAY, 90)  # repeatable
    assert TODAY not in {entry["date"] for entry in history}
    assert 70 <= len(history) < 90  # a few missed days
    for entry in history:
        assert set(entry["breathing"]) == {"shortness_of_breath", "chest_tightness", "wheezing", "coughing"}
        assert isinstance(entry["night"], bool) and isinstance(entry["limited"], bool)
    gym = [entry for entry in history if entry["date"].weekday() in (0, 3) and (TODAY - entry["date"]).days > 4]
    other = [entry for entry in history if entry["date"].weekday() not in (0, 3) and (TODAY - entry["date"]).days > 4]
    peak = lambda rows: sum(max(entry["breathing"].values()) for entry in rows) / len(rows)  # noqa: E731
    assert peak(gym) > peak(other) + 1.5
    # last few days stay calm so Today opens quiet
    assert all(max(entry["breathing"].values()) <= 1 and not entry["night"] for entry in history[-4:])


def test_apply_skips_real_days_and_undo_removes_only_seeded(client: TestClient, auth_headers, db_session):
    real_day = TODAY - timedelta(days=10)
    saved = client.post("/v1/check-ins", json={"date": real_day.isoformat(), "daily_day_symp": False}, headers=auth_headers)
    assert saved.status_code == 201, saved.text
    real_log = client.post(
        "/v1/symptom-logs",
        json={"logged_at": datetime.combine(TODAY - timedelta(days=11), time(9), tzinfo=TZ).isoformat(),
              "local_date": (TODAY - timedelta(days=11)).isoformat(), "breathing": {"coughing": 2}},
        headers=auth_headers,
    )
    assert real_log.status_code == 201, real_log.text

    user = find_user(db_session, "TestUser@example.com")
    history = build_history(user.id, TODAY, 90)
    counts = apply_history(db_session, user, history, TZ, with_plans=True)
    db_session.flush()
    assert counts["skipped_days"] >= 1 and counts["check_ins"] >= 60 and counts["quick_logs"] > 20
    # rerun adds nothing
    assert apply_history(db_session, user, history, TZ, with_plans=True)["check_ins"] == 0

    real = db_session.scalar(select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == real_day))
    assert not (real.details or {}).get("seed")

    insights = client.get(f"/v1/insights?days=90&today={TODAY.isoformat()}", headers=auth_headers).json()
    assert sum(week["days_logged"] for week in insights["weeks"]) >= 60
    noted = {factor["label"] for factor in insights["noted"]}
    assert "Exercise" in noted or "Gym — cardio + weights" in noted

    gym_day = next(entry["date"] for entry in history if entry["date"].weekday() == 3 and (TODAY - entry["date"]).days > 7)
    prefill = client.get(f"/v1/symptom-logs/prefill?date={gym_day.isoformat()}&tz_offset=300", headers=auth_headers).json()
    assert prefill["log_count"] >= 1 and "Exercise" in prefill["triggers"]
    day = client.get(f"/v1/check-ins?from={gym_day.isoformat()}&to={gym_day.isoformat()}", headers=auth_headers).json()["items"][0]
    assert day["symptoms_logged"] and day["details"]["breathing"] and any(e["title"].startswith("Gym") for e in day["calendar_events"])

    removed = undo_history(db_session, user, TODAY + timedelta(days=5))  # works on a later day too
    db_session.flush()
    assert removed["check_ins"] == counts["check_ins"] and removed["quick_logs"] == counts["quick_logs"]
    left = db_session.scalars(select(CheckIn.date).where(CheckIn.user_id == user.id)).all()
    assert left == [real_day]
    assert len(db_session.scalars(select(SymptomLog).where(SymptomLog.user_id == user.id)).all()) == 1
