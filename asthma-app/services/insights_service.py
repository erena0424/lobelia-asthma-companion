"""Insights from a user's own check-ins: weekly trend, a 4-week comparison, and possible patterns.

Plain counting over at most a year of daily rows, so it runs on request in milliseconds.
Patterns are associations in the user's own log, never causes. A pattern is only reported
after the factor has shown up on enough days (MIN_DAYS_WITH) to avoid one-off coincidences.
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
MIN_DAYS_WITH = 5
MIN_DAYS_WITHOUT = 3
MIN_RATE_WITH = 0.5
MIN_RATE_GAP = 0.25
HARDER_SCORE = 4  # a 0-10 score at or above this makes a "harder" day
COLD_LOW_C = 10.0  # overnight low at or below 10°C (50°F)
HIGH_POLLEN = {"High", "Very High"}


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


def is_harder_day(row: dict) -> bool:
    score = row.get("score")
    return bool(
        row["day_symp"] or row["night_symp"] or row["limit_activity"] or row["puffs"] > 0
        or (score is not None and score >= HARDER_SCORE)
    )


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


def _env_factors(features: dict | None) -> list[tuple[str, str]]:
    if not features:
        return []
    factors = []
    low = features.get("temperature_min")
    if isinstance(low, (int, float)) and low <= COLD_LOW_C:
        factors.append(("env:cold", "Cold evenings (below 50°F)"))
    if any(features.get(key) in HIGH_POLLEN for key in ("grass_pollen", "tree_pollen", "weed_pollen")):
        factors.append(("env:pollen", "High pollen days"))
    aqi = features.get("aqi")
    if isinstance(aqi, (int, float)) and aqi >= 3:
        factors.append(("env:air", "Poorer air quality days"))
    return factors


def day_factors(row: dict, features: dict | None) -> dict[str, str]:
    """Factor key -> label for one day (triggers the user noted, their plans, conditions)."""
    factors: dict[str, str] = {}
    for trigger in row["triggers"]:
        factors.setdefault(f"trigger:{trigger.lower()}", trigger)
    for title in row["plans"]:
        factors.setdefault(f"plan:{title.lower()}", title)
    for key, label in _env_factors(features):
        factors[key] = label
    return factors


# ---------- summaries ----------
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


def _trend_tag(entries: list[tuple[date, bool]], start: date, end: date) -> Optional[str]:
    """Compare the harder-day rate in the first and second half of the window."""
    middle = start + (end - start) / 2
    first = [harder for day, harder in entries if day < middle]
    second = [harder for day, harder in entries if day >= middle]
    if len(second) >= 2 and len(first) == 0:
        return "newer"
    if len(first) < 2 or len(second) < 2:
        return None
    gap = sum(second) / len(second) - sum(first) / len(first)
    if gap >= 0.3:
        return "newer"
    if gap <= -0.3:
        return "fading"
    return "steady"


def find_patterns(rows: list[dict], env_by_day: dict[date, dict], start: date, end: date) -> list[dict]:
    logged = [row for row in rows if row["logged"] and start <= row["date"] <= end]
    per_factor: dict[str, dict] = {}
    day_keys: dict[date, set[str]] = {}
    for row in logged:
        factors = day_factors(row, env_by_day.get(row["date"]))
        day_keys[row["date"]] = set(factors)
        for key, label in factors.items():
            per_factor.setdefault(key, {"label": label, "kind": key.split(":", 1)[0]})

    patterns = []
    for key, info in per_factor.items():
        with_rows = [row for row in logged if key in day_keys[row["date"]]]
        without_rows = [row for row in logged if key not in day_keys[row["date"]]]
        if len(with_rows) < MIN_DAYS_WITH or len(without_rows) < MIN_DAYS_WITHOUT:
            continue
        harder_with = sum(1 for row in with_rows if is_harder_day(row))
        harder_without = sum(1 for row in without_rows if is_harder_day(row))
        rate_with = harder_with / len(with_rows)
        rate_without = harder_without / len(without_rows)
        if rate_with < MIN_RATE_WITH or rate_with - rate_without < MIN_RATE_GAP:
            continue

        months: dict[str, list[bool]] = defaultdict(list)
        for row in with_rows:
            months[row["date"].strftime("%Y-%m")].append(is_harder_day(row))
        month_keys = []
        cursor = date(start.year, start.month, 1)
        while cursor <= end:
            month_keys.append(cursor.strftime("%Y-%m"))
            cursor = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)

        patterns.append({
            "key": key,
            "label": info["label"],
            "kind": info["kind"],
            "days_with": len(with_rows),
            "harder_with": harder_with,
            "days_without": len(without_rows),
            "harder_without": harder_without,
            "avg_score_with": _mean([row["score"] for row in with_rows if row["score"] is not None]),
            "avg_score_without": _mean([row["score"] for row in without_rows if row["score"] is not None]),
            "trend": _trend_tag([(row["date"], is_harder_day(row)) for row in with_rows], start, end),
            "monthly": [
                {
                    "month": month,
                    "days": len(months.get(month, [])),
                    "harder": sum(months.get(month, [])),
                }
                for month in month_keys[-6:]
            ],
        })
    patterns.sort(key=lambda p: p["harder_with"] / p["days_with"] - p["harder_without"] / p["days_without"], reverse=True)
    return patterns[:5]


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
    for snapshot in snapshots:  # latest snapshot per day wins
        env_by_day[snapshot.date] = dict(snapshot.features or {})

    pattern_start = today - timedelta(days=PATTERN_WINDOW_DAYS - 1)
    logged_for_patterns = [row for row in rows if row["logged"] and row["date"] >= pattern_start]
    return {
        "as_of": today.isoformat(),
        "range_days": range_days,
        "weeks": weekly_trend(rows, today - timedelta(days=range_days - 1), today),
        "comparison": comparison(rows, today),
        "patterns": find_patterns(rows, env_by_day, pattern_start, today),
        "patterns_basis": {
            "check_ins": len(logged_for_patterns),
            "since": min((row["date"] for row in logged_for_patterns), default=today).isoformat(),
            "min_days": MIN_DAYS_WITH,
        },
    }
