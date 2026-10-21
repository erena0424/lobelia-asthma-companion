"""Quick logs ("right now" symptoms) and how they roll up into the Day check-in.

A quick log records one moment. Code (never the LLM) turns a day's logs into
suggested Day check-in answers; the person confirms them before anything is
saved to ``check_ins``. Missing logs mean "unknown", never "no symptoms", and
logs never suggest "no" for night waking or limited activity.
Rules: plan doc "Two check-ins: plan" (Elena approved 2026-10-21).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import CheckIn, InhalerEvent, InhalerEventType, SymptomLog
from services.check_in_service import (
    BREATHING_LABELS,
    check_in_complete,
    check_in_context,
    get_or_create_check_in,
)

BREATHING_KEYS = tuple(BREATHING_LABELS)
# A log with a symptom between midnight and 6 am local time suggests "woke at night".
NIGHT_END_HOUR = 6


def _adjust_puffs(db: Session, user_id: uuid.UUID, day: date, delta: int, recorded_at: datetime) -> None:
    """Keep the day's reliever total in ``check_ins.puffs_today`` (one place for puff totals)."""
    if delta == 0:
        return
    check_in = get_or_create_check_in(db, user_id, day)
    check_in.puffs_today = max(0, (check_in.puffs_today or 0) + delta)
    db.add(
        InhalerEvent(
            user_id=user_id,
            check_in_id=check_in.id,
            event_type=InhalerEventType.puff if delta > 0 else InhalerEventType.manual_override,
            puffs_delta=delta,
            puffs_total_after=check_in.puffs_today,
            recorded_at=recorded_at,
        )
    )


def _clean_breathing(breathing: Optional[dict]) -> dict:
    return {key: int(breathing.get(key) or 0) for key in BREATHING_KEYS} if breathing else {key: 0 for key in BREATHING_KEYS}


def create_symptom_log(
    db: Session,
    user_id: uuid.UUID,
    *,
    logged_at: datetime,
    local_date: date,
    breathing: Optional[dict] = None,
    limiting_activity: Optional[bool] = None,
    reliever_puffs: int = 0,
    triggers: Optional[list[str]] = None,
    note: Optional[str] = None,
) -> SymptomLog:
    log = SymptomLog(
        user_id=user_id,
        logged_at=logged_at,
        local_date=local_date,
        breathing=_clean_breathing(breathing),
        limiting_activity=limiting_activity,
        reliever_puffs=reliever_puffs,
        triggers=triggers or [],
        note=(note or "").strip() or None,
    )
    db.add(log)
    _adjust_puffs(db, user_id, local_date, reliever_puffs, logged_at)
    db.commit()
    db.refresh(log)
    return log


def get_symptom_log(db: Session, user_id: uuid.UUID, log_id: uuid.UUID) -> Optional[SymptomLog]:
    return db.scalar(select(SymptomLog).where(SymptomLog.id == log_id, SymptomLog.user_id == user_id))


def update_symptom_log(db: Session, log: SymptomLog, changes: dict[str, Any]) -> SymptomLog:
    if "reliever_puffs" in changes:
        _adjust_puffs(db, log.user_id, log.local_date, changes["reliever_puffs"] - (log.reliever_puffs or 0), datetime.now(timezone.utc))
        log.reliever_puffs = changes["reliever_puffs"]
    if "breathing" in changes:
        log.breathing = _clean_breathing(changes["breathing"])
    if "limiting_activity" in changes:
        log.limiting_activity = changes["limiting_activity"]
    if "triggers" in changes:
        log.triggers = changes["triggers"] or []
    if "note" in changes:
        log.note = (changes["note"] or "").strip() or None
    db.commit()
    db.refresh(log)
    return log


def delete_symptom_log(db: Session, log: SymptomLog) -> None:
    _adjust_puffs(db, log.user_id, log.local_date, -(log.reliever_puffs or 0), datetime.now(timezone.utc))
    db.delete(log)
    db.commit()


def logs_between(db: Session, user_id: uuid.UUID, start: date, end: date) -> list[SymptomLog]:
    return list(
        db.scalars(
            select(SymptomLog)
            .where(SymptomLog.user_id == user_id, SymptomLog.local_date >= start, SymptomLog.local_date <= end)
            .order_by(SymptomLog.logged_at)
        ).all()
    )


def symptom_log_to_dict(log: SymptomLog) -> dict:
    return {
        "id": str(log.id),
        "logged_at": log.logged_at.isoformat(),
        "local_date": log.local_date.isoformat(),
        "breathing": _clean_breathing(log.breathing),
        "limiting_activity": log.limiting_activity,
        "reliever_puffs": log.reliever_puffs or 0,
        "triggers": list(log.triggers or []),
        "note": log.note,
    }


# ---------- roll-up (pure functions over log dicts) ----------


def _has_symptom(entry: dict) -> bool:
    return any(score >= 1 for score in (entry.get("breathing") or {}).values())


def _local_hour(entry: dict, tz_offset_minutes: int) -> int:
    """Hour of day where the person is. ``tz_offset_minutes`` uses JS getTimezoneOffset (UTC minus local)."""
    moment = datetime.fromisoformat(entry["logged_at"])
    return (moment.astimezone(timezone.utc) - timedelta(minutes=tz_offset_minutes)).hour


def prefill_from_logs(logs: Iterable[dict], puffs_today: int, tz_offset_minutes: int = 0) -> dict[str, Any]:
    """Suggested Day check-in answers from one day's quick logs, with the log each came from.

    Each answer is a value or None (= leave it for the person). ``*_from`` hold the
    ``logged_at`` of the log behind a suggestion, so the screen can say "From your 2:10 pm log".
    """
    logs = sorted(logs, key=lambda entry: entry["logged_at"])
    result: dict[str, Any] = {
        "log_count": len(logs),
        "logs": [{"logged_at": entry["logged_at"], "note": entry.get("note")} for entry in logs if entry.get("note")],
        "breathing": None,
        "breathing_from": {},
        "no_symptoms": None,
        "night_symptoms": None,
        "night_from": None,
        "activity_limited": None,
        "activity_from": None,
        "puffs": int(puffs_today or 0),
        "triggers": [],
    }
    if not logs:
        return result

    breathing = {key: 0 for key in BREATHING_KEYS}
    for entry in logs:
        for key in BREATHING_KEYS:
            score = int((entry.get("breathing") or {}).get(key) or 0)
            if score > breathing[key]:
                breathing[key] = score
                result["breathing_from"][key] = entry["logged_at"]
    result["breathing"] = breathing
    # every log said 0: offer "No symptoms today" (the person still confirms)
    result["no_symptoms"] = not any(breathing.values())

    night = next((entry for entry in logs if _has_symptom(entry) and _local_hour(entry, tz_offset_minutes) < NIGHT_END_HOUR), None)
    if night:
        result["night_symptoms"] = True
        result["night_from"] = night["logged_at"]

    limited = next((entry for entry in logs if entry.get("limiting_activity")), None)
    if limited:
        result["activity_limited"] = True
        result["activity_from"] = limited["logged_at"]

    seen: set[str] = set()
    for entry in logs:
        for trigger in entry.get("triggers") or []:
            if trigger.lower() not in seen:
                seen.add(trigger.lower())
                result["triggers"].append(trigger)
    return result


def context_from_logs(logs: list[dict], day: date, puffs_today: int) -> dict[str, Any]:
    """A day's quick logs in the same shape as ``check_in_context``, for the Today card.

    Used only for days without a confirmed Day check-in. Night waking is never inferred.
    """
    rolled = prefill_from_logs(logs, puffs_today)
    breathing = rolled["breathing"] or {}
    return {
        "date": day.isoformat(),
        "source": "quick_log",
        "mood": None,
        "breathing_0_to_10": {BREATHING_LABELS[key]: score for key, score in breathing.items() if score > 0},
        "night_waking": False,
        "activity_limitation": bool(rolled["activity_limited"]),
        "reliever_puffs": rolled["puffs"],
        "possible_triggers_noted": rolled["triggers"],
    }


def recent_days_for_card(db: Session, user_id: uuid.UUID, today: date, days: int = 7) -> list[dict]:
    """Each recent day as the Today card sees it: the confirmed Day check-in, else that day's quick logs.

    A check-in row holding only reliever puffs (no confirmed answers) gives way to the day's logs.
    """
    start = today - timedelta(days=days - 1)
    rows = {
        row.date: row
        for row in db.scalars(
            select(CheckIn).where(CheckIn.user_id == user_id, CheckIn.date >= start, CheckIn.date <= today)
        ).all()
    }
    logs_by_day: dict[date, list[dict]] = {}
    for log in logs_between(db, user_id, start, today):
        logs_by_day.setdefault(log.local_date, []).append(symptom_log_to_dict(log))

    entries = []
    for offset in range(days):
        day = today - timedelta(days=offset)
        row = rows.get(day)
        if row is not None and row.symptoms_logged:
            entries.append(check_in_context(row))
        elif logs_by_day.get(day):
            entries.append(context_from_logs(logs_by_day[day], day, row.puffs_today if row is not None else 0))
        elif check_in_complete(row):
            entries.append(check_in_context(row))
    return entries
