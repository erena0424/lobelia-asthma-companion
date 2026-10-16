"""Insights from a user's own check-ins: weekly trend, a 4-week comparison, and possible patterns.

Plain averaging over at most a year of daily rows, so it runs on request in milliseconds.
Patterns: average symptom level at each level of a condition (pollen, air quality, overnight
low), using the conditions stored for the day (currently the day's forecast, see LOB-48), and
for triggers/plans the user logged, days with vs without. Associations, never causes.
Thresholds and wording need clinical-advisor / regulatory-claims review.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import CheckIn, EnvSnapshot

PATTERN_WINDOW_DAYS = 180


# ---------- per-day facts ----------
def day_score(details: Any) -> Optional[int]:
    """Highest 0-10 symptom score logged that day, or None when no scores were given."""
    breathing = details.get("breathing") if isinstance(details, dict) else None
    if not isinstance(breathing, dict):
        return None
    scores = [int(value) for value in breathing.values() if isinstance(value, (int, float))]
    return max(scores) if scores else None


def _scores(details: Any) -> dict[str, int]:
    breathing = details.get("breathing") if isinstance(details, dict) else None
    if not isinstance(breathing, dict):
        return {}
    return {str(key): int(value) for key, value in breathing.items() if isinstance(value, (int, float))}


def _row(check_in: CheckIn) -> dict:
    return {
        "date": check_in.date,
        "logged": bool(check_in.symptoms_logged) or (check_in.puffs_today or 0) > 0,
        "day_symp": bool(check_in.daily_day_symp),
        "night_symp": bool(check_in.daily_night_symp),
        "limit_activity": bool(check_in.daily_limit_activity),
        "puffs": int(check_in.puffs_today or 0),
        "score": day_score(check_in.details),
        "scores": _scores(check_in.details),
        "triggers": [str(t).strip() for t in (check_in.triggers or []) if str(t).strip()],
        "plans": _plan_titles(check_in),
    }


def _plan_titles(check_in: CheckIn) -> list[str]:
    titles = []
    for event in check_in.calendar_events if isinstance(check_in.calendar_events, list) else []:
        title = event.get("title") if isinstance(event, dict) else None
        if isinstance(title, str) and title.strip():
            titles.append(title.strip()[:80])
    if isinstance(check_in.calendar_event, str) and check_in.calendar_event.strip():
        titles.append(check_in.calendar_event.strip()[:80])
    return titles


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def weekly_trend(rows: list[dict], start: date, end: date) -> list[dict]:
    """One entry per week (Monday start) from start to end, including empty weeks."""
    buckets: dict[date, list[dict]] = defaultdict(list)
    for row in rows:
        if start <= row["date"] <= end and row["logged"]:
            buckets[_week_start(row["date"])].append(row)
    weeks = []
    week = _week_start(start)
    while week <= end:
        days = buckets.get(week, [])
        scores = [row["score"] for row in days if row["score"] is not None]
        by_symptom: dict[str, list[int]] = defaultdict(list)
        for row in days:
            for name, value in row.get("scores", {}).items():
                by_symptom[name].append(value)
        weeks.append({
            "week_start": week.isoformat(),
            "days_logged": len(days),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "avg_by_symptom": {name: _mean(values) for name, values in by_symptom.items()},
            "puffs": sum(row["puffs"] for row in days),
            "symptom_days": sum(1 for row in days if row["day_symp"]),
        })
        week += timedelta(days=7)
    return weeks


def period_counts(rows: Iterable[dict]) -> dict:
    logged = [row for row in rows if row["logged"]]
    return {
        "days_checked_in": len(logged),
        "symptom_days": sum(1 for row in logged if row["day_symp"]),
        "nights_woken": sum(1 for row in logged if row["night_symp"]),
        "activity_limited_days": sum(1 for row in logged if row["limit_activity"]),
        "rescue_puffs": sum(row["puffs"] for row in logged),
    }


def comparison(rows: list[dict], today: date, days: int = 28) -> dict:
    current_start = today - timedelta(days=days - 1)
    previous_start = current_start - timedelta(days=days)
    return {
        "days": days,
        "current": period_counts(row for row in rows if current_start <= row["date"] <= today),
        "previous": period_counts(row for row in rows if previous_start <= row["date"] < current_start),
    }


def _mean(values: list[int]) -> Optional[float]:
    return round(sum(values) / len(values), 1) if values else None


# ---------- conditions vs symptom level (line charts) ----------
POLLEN_LEVELS = ["Low", "Moderate", "High", "Very High"]
AQI_LEVELS = {1: "Good", 2: "Moderate", 3: "Unhealthy for sensitive groups", 4: "Unhealthy", 5: "Very unhealthy"}
LOW_TEMP_LEVELS = ["60°F+", "50s", "40s", "Below 40°F"]
MIN_POINT_DAYS = 3   # fewer days than this: the point is drawn faded
MIN_RISE = 2.0       # a plain-language summary needs at least this rise on the 0-10 scale
MIN_NOTED_DAYS = 5


def symptom_level(row: dict) -> float:
    """0-10 for the y-axis: the day's highest score, or an estimate from the four basics when no scores."""
    if row.get("score") is not None:
        return float(row["score"])
    basics = sum((row["day_symp"], row["night_symp"], row["limit_activity"], row["puffs"] > 0))
    return 2.5 * basics


def _pollen_level(features: dict) -> Optional[str]:
    levels = [features.get(key) for key in ("grass_pollen", "tree_pollen", "weed_pollen")]
    levels = [level for level in levels if level in POLLEN_LEVELS]
    return max(levels, key=POLLEN_LEVELS.index) if levels else None


def _aqi_level(features: dict) -> Optional[str]:
    aqi = features.get("aqi")
    return AQI_LEVELS.get(int(aqi)) if isinstance(aqi, (int, float)) and int(aqi) in AQI_LEVELS else None


def _low_temp_level(features: dict) -> Optional[str]:
    low = features.get("temperature_min")
    if not isinstance(low, (int, float)):
        return None
    fahrenheit = low * 9 / 5 + 32
    if fahrenheit >= 60:
        return "60°F+"
    if fahrenheit >= 50:
        return "50s"
    if fahrenheit >= 40:
        return "40s"
    return "Below 40°F"


CONDITIONS = [
    {"key": "pollen", "label": "Pollen", "noun": "pollen", "levels": POLLEN_LEVELS, "level_of": _pollen_level},
    {"key": "air", "label": "Air quality", "noun": "air quality", "levels": list(AQI_LEVELS.values()), "level_of": _aqi_level},
    {"key": "low_temp", "label": "Overnight low", "noun": "overnight low", "levels": LOW_TEMP_LEVELS, "level_of": _low_temp_level},
]


def condition_curves(rows: list[dict], env_by_day: dict[date, dict], start: date, end: date) -> list[dict]:
    """Average symptom level at each level of a condition, from days with both a check-in and conditions."""
    logged = [row for row in rows if row["logged"] and start <= row["date"] <= end]
    curves = []
    for condition in CONDITIONS:
        by_level: dict[str, list[float]] = defaultdict(list)
        for row in logged:
            features = env_by_day.get(row["date"])
            level = condition["level_of"](features) if features else None
            if level is not None:
                by_level[level].append(symptom_level(row))
        points = [
            {"level": level, "days": len(by_level[level]), "avg": _mean_f(by_level[level])}
            for level in condition["levels"]
        ]
        solid = [point for point in points if point["days"] >= MIN_POINT_DAYS]
        summary = None
        if len(solid) >= 2 and solid[-1]["avg"] - solid[0]["avg"] >= MIN_RISE:
            summary = {"from": solid[0], "to": solid[-1]}
        curves.append({
            "key": condition["key"],
            "label": condition["label"],
            "noun": condition["noun"],
            "points": points,
            "days": sum(point["days"] for point in points),
            "summary": summary,
        })
    return curves


def noted_factors(rows: list[dict], start: date, end: date) -> list[dict]:
    """Triggers and plans the user logged: average symptom level on days with vs without."""
    logged = [row for row in rows if row["logged"] and start <= row["date"] <= end]
    labels: dict[str, tuple[str, str]] = {}
    keys_by_day: dict[date, set[str]] = {}
    for row in logged:
        keys = set()
        for trigger in row["triggers"]:
            labels.setdefault(f"trigger:{trigger.lower()}", (trigger, "trigger"))
            keys.add(f"trigger:{trigger.lower()}")
        for title in row["plans"]:
            labels.setdefault(f"plan:{title.lower()}", (title, "plan"))
            keys.add(f"plan:{title.lower()}")
        keys_by_day[row["date"]] = keys
    factors = []
    for key, (label, kind) in labels.items():
        with_levels = [symptom_level(row) for row in logged if key in keys_by_day[row["date"]]]
        without_levels = [symptom_level(row) for row in logged if key not in keys_by_day[row["date"]]]
        if len(with_levels) < MIN_NOTED_DAYS or len(without_levels) < MIN_POINT_DAYS:
            continue
        factors.append({
            "key": key, "label": label, "kind": kind,
            "days_with": len(with_levels), "avg_with": _mean_f(with_levels),
            "days_without": len(without_levels), "avg_without": _mean_f(without_levels),
        })
    factors.sort(key=lambda f: f["avg_with"] - f["avg_without"], reverse=True)
    return factors[:6]


def _mean_f(values: list[float]) -> Optional[float]:
    return round(sum(values) / len(values), 1) if values else None


# ---------- database entry point ----------
def build_insights(db: Session, user_id: uuid.UUID, today: date, range_days: int) -> dict:
    earliest = today - timedelta(days=max(range_days, PATTERN_WINDOW_DAYS, 56) - 1)
    check_ins = db.scalars(
        select(CheckIn).where(CheckIn.user_id == user_id, CheckIn.date >= earliest, CheckIn.date <= today)
    ).all()
    rows = [_row(check_in) for check_in in check_ins]

    env_by_day: dict[date, dict] = {}
    snapshots = db.scalars(
        select(EnvSnapshot)
        .where(EnvSnapshot.user_id == user_id, EnvSnapshot.date >= earliest, EnvSnapshot.date <= today)
        .order_by(EnvSnapshot.created_at)
    ).all()
    for snapshot in snapshots:  # latest snapshot per day wins; values filled in for gaps are dropped
        missing = set(snapshot.missing or [])
        env_by_day[snapshot.date] = {k: v for k, v in (snapshot.features or {}).items() if k not in missing}

    pattern_start = today - timedelta(days=PATTERN_WINDOW_DAYS - 1)
    logged_for_patterns = [row for row in rows if row["logged"] and row["date"] >= pattern_start]
    return {
        "as_of": today.isoformat(),
        "range_days": range_days,
        "weeks": weekly_trend(rows, today - timedelta(days=range_days - 1), today),
        "comparison": comparison(rows, today),
        "conditions": condition_curves(rows, env_by_day, pattern_start, today),
        "noted": noted_factors(rows, pattern_start, today),
        "patterns_basis": {
            "check_ins": len(logged_for_patterns),
            "since": min((row["date"] for row in logged_for_patterns), default=today).isoformat(),
            "min_point_days": MIN_POINT_DAYS,
            "min_noted_days": MIN_NOTED_DAYS,
        },
    }
