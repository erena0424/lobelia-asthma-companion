"""Insights: weekly trend, 4-week comparison and possible patterns from the user's own log."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from services.insights_service import comparison, day_score, find_patterns, is_harder_day, weekly_trend

TODAY = date(2026, 10, 15)


def row(day, *, day_symp=False, night=False, limit=False, puffs=0, score=None, triggers=(), plans=()):
    return {
        "date": day, "logged": True, "day_symp": day_symp, "night_symp": night, "limit_activity": limit,
        "puffs": puffs, "score": score, "triggers": list(triggers), "plans": list(plans),
    }


def test_day_score_and_harder_day():
    assert day_score({"breathing": {"wheezing": 6, "coughing": 2}}) == 6
    assert day_score({"mood": 3}) is None
    assert is_harder_day(row(TODAY, score=4)) is True
    assert is_harder_day(row(TODAY, score=3)) is False
    assert is_harder_day(row(TODAY, puffs=1)) is True


def test_weekly_trend_includes_empty_weeks():
    rows = [row(TODAY, score=6, puffs=2, day_symp=True), row(TODAY - timedelta(days=1), score=2)]
    weeks = weekly_trend(rows, TODAY - timedelta(days=27), TODAY)
    assert len(weeks) == 5
    assert weeks[-1] == {
        "week_start": "2026-10-12", "days_logged": 2, "avg_score": 4.0, "avg_by_symptom": {},
        "puffs": 2, "symptom_days": 1,
    }
    assert weeks[0]["days_logged"] == 0 and weeks[0]["avg_score"] is None


def test_comparison_splits_the_two_periods():
    rows = [row(TODAY, night=True, puffs=3), row(TODAY - timedelta(days=30), day_symp=True)]
    result = comparison(rows, TODAY)
    assert result["current"]["nights_woken"] == 1 and result["current"]["rescue_puffs"] == 3
    assert result["previous"]["symptom_days"] == 1 and result["current"]["symptom_days"] == 0


def test_pattern_needs_enough_days_and_a_real_gap():
    start = TODAY - timedelta(days=179)
    rows = []
    # 6 skating days, 5 of them harder; 20 other days, 2 harder
    for index in range(6):
        rows.append(row(TODAY - timedelta(days=index * 3), plans=["Skating practice"], score=6 if index else 1))
    for index in range(20):
        rows.append(row(TODAY - timedelta(days=index * 3 + 1), score=5 if index < 2 else 1))
    patterns = find_patterns(rows, {}, start, TODAY)
    assert [p["label"] for p in patterns] == ["Skating practice"]
    skating = patterns[0]
    assert (skating["days_with"], skating["harder_with"]) == (6, 5)
    assert (skating["days_without"], skating["harder_without"]) == (20, 2)

    # only 4 days with the factor: not enough to call it a pattern
    assert find_patterns(rows[1:4] + rows[6:], {}, start, TODAY) == []


def test_conditions_from_the_environment_count_as_factors():
    start = TODAY - timedelta(days=179)
    rows, env = [], {}
    for index in range(10):
        day = TODAY - timedelta(days=index)
        cold = index < 5
        rows.append(row(day, score=6 if cold else 1))
        env[day] = {"temperature_min": 4.0 if cold else 15.0}
    patterns = find_patterns(rows, env, start, TODAY)
    assert patterns[0]["label"] == "Cold evenings (below 50°F)"


def test_insights_endpoint(client: TestClient, auth_headers: dict):
    saved = client.post(
        "/v1/check-ins",
        json={"date": TODAY.isoformat(), "daily_day_symp": True, "details": {"breathing": {"wheezing": 7}}},
        headers=auth_headers,
    )
    assert saved.status_code == 201, saved.text
    response = client.get(f"/v1/insights?days=28&today={TODAY.isoformat()}", headers=auth_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["range_days"] == 28
    assert body["weeks"][-1]["avg_score"] == 7.0
    assert body["weeks"][-1]["avg_by_symptom"] == {"wheezing": 7.0}
    assert body["comparison"]["current"]["symptom_days"] == 1
    assert body["patterns"] == []

    assert client.get("/v1/insights?days=30", headers=auth_headers).status_code in (400, 422)
