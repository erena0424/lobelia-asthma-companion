"""Insights: weekly trend, 4-week comparison and possible patterns from the user's own log."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from services.insights_service import comparison, condition_curves, day_score, noted_factors, symptom_level, weekly_trend

TODAY = date(2026, 10, 15)


def row(day, *, day_symp=False, night=False, limit=False, puffs=0, score=None, triggers=(), plans=()):
    return {
        "date": day, "logged": True, "day_symp": day_symp, "night_symp": night, "limit_activity": limit,
        "puffs": puffs, "score": score, "triggers": list(triggers), "plans": list(plans),
    }


def test_day_score_and_symptom_level():
    assert day_score({"breathing": {"wheezing": 6, "coughing": 2}}) == 6
    assert day_score({"mood": 3}) is None
    assert symptom_level(row(TODAY, score=6, day_symp=True)) == 6
    # no scores: estimated from the four basics, 2.5 each
    assert symptom_level(row(TODAY, day_symp=True, night=True)) == 5.0
    assert symptom_level(row(TODAY)) == 0


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


def test_condition_curve_averages_symptoms_by_pollen_level():
    start = TODAY - timedelta(days=179)
    rows, env = [], {}
    levels = ["Low"] * 4 + ["Moderate"] * 3 + ["High"] * 4 + ["Very High"] * 2
    scores = [1, 2, 1, 2, 3, 4, 3, 6, 7, 6, 5, 9, 8]
    for index, (level, score) in enumerate(zip(levels, scores)):
        day = TODAY - timedelta(days=index)
        rows.append(row(day, score=score))
        env[day] = {"grass_pollen": level, "tree_pollen": "Low"}
    # a day with a check-in but no conditions is left out
    rows.append(row(TODAY - timedelta(days=40), score=10))
    pollen = next(c for c in condition_curves(rows, env, start, TODAY) if c["key"] == "pollen")
    assert [(p["level"], p["days"], p["avg"]) for p in pollen["points"]] == [
        ("Low", 4, 1.5), ("Moderate", 3, 3.3), ("High", 4, 6.0), ("Very High", 2, 8.5),
    ]
    assert pollen["days"] == 13
    # the summary compares the lowest and highest levels with at least 3 days (Very High has only 2)
    assert pollen["summary"]["from"]["level"] == "Low" and pollen["summary"]["to"]["level"] == "High"


def test_no_summary_without_a_clear_rise():
    start = TODAY - timedelta(days=179)
    rows, env = [], {}
    for index in range(8):
        day = TODAY - timedelta(days=index)
        rows.append(row(day, score=3))
        env[day] = {"grass_pollen": "Low" if index < 4 else "High"}
    pollen = next(c for c in condition_curves(rows, env, start, TODAY) if c["key"] == "pollen")
    assert pollen["summary"] is None


def test_noted_triggers_compare_days_with_and_without():
    start = TODAY - timedelta(days=179)
    rows = [row(TODAY - timedelta(days=i), score=7, triggers=["Cold air"]) for i in range(5)]
    rows += [row(TODAY - timedelta(days=10 + i), score=2) for i in range(6)]
    noted = noted_factors(rows, start, TODAY)
    assert noted == [{
        "key": "trigger:cold air", "label": "Cold air", "kind": "trigger",
        "days_with": 5, "avg_with": 7.0, "days_without": 6, "avg_without": 2.0,
    }]
    assert noted_factors(rows[1:], start, TODAY) == []  # only 4 days with it


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
    assert [c["key"] for c in body["conditions"]] == ["pollen", "air", "low_temp"]
    assert body["noted"] == []

    assert client.get("/v1/insights?days=30", headers=auth_headers).status_code in (400, 422)
