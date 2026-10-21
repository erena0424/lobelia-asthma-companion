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
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import CheckIn, InhalerEvent, InhalerEventType, SymptomLog
from services.check_in_service import check_in_complete, check_in_context, get_or_create_check_in
from services.quick_log_rollup import BREATHING_KEYS, context_from_logs


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
