"""Check-in and inhaler logging business logic."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import CheckIn, InhalerEvent, InhalerEventType


def is_flare_up_threshold(puffs_today: int) -> bool:
    return puffs_today >= 3


def compute_symptom_burden_score(check_in: CheckIn) -> int:
    """Return a 0-5 trend score; this is not a clinical severity measure."""
    symptom_points = sum(
        (
            bool(check_in.daily_day_symp),
            bool(check_in.daily_night_symp),
            bool(check_in.daily_limit_activity),
        )
    )
    inhaler_points = 0 if check_in.puffs_today == 0 else 1 if check_in.puffs_today < 3 else 2
    return symptom_points + inhaler_points


def compute_is_flare_up_from_check_in(check_in: CheckIn) -> int:
    symptomatic = (
        bool(check_in.daily_day_symp)
        and bool(check_in.daily_night_symp)
        and bool(check_in.daily_limit_activity)
    )
    return int(is_flare_up_threshold(check_in.puffs_today) or symptomatic)


def check_in_complete(check_in: Optional[CheckIn]) -> bool:
    """True when user logged symptoms (even all false) or at least one rescue puff."""
    if check_in is None:
        return False
    return check_in.puffs_today > 0 or bool(check_in.symptoms_logged)


def get_or_create_check_in(db: Session, user_id: uuid.UUID, day: date) -> CheckIn:
    check_in = db.scalar(
        select(CheckIn).where(CheckIn.user_id == user_id, CheckIn.date == day)
    )
    if check_in:
        return check_in
    check_in = CheckIn(
        user_id=user_id,
        date=day,
        puffs_today=0,
        daily_day_symp=False,
        daily_night_symp=False,
        daily_limit_activity=False,
        symptoms_logged=False,
    )
    db.add(check_in)
    db.flush()
    return check_in


def upsert_check_in(
    db: Session,
    user_id: uuid.UUID,
    *,
    day: date,
    daily_day_symp: bool = False,
    daily_night_symp: bool = False,
    daily_limit_activity: bool = False,
    notes: Optional[str] = None,
    triggers: Optional[List[str]] = None,
    calendar_event: Optional[str] = None,
    details: Optional[dict] = None,
) -> CheckIn:
    check_in = get_or_create_check_in(db, user_id, day)
    check_in.daily_day_symp = daily_day_symp
    check_in.daily_night_symp = daily_night_symp
    check_in.daily_limit_activity = daily_limit_activity
    check_in.symptoms_logged = True
    if notes is not None:
        check_in.notes = notes
    if triggers is not None:
        check_in.triggers = triggers
    if calendar_event is not None:
        check_in.calendar_event = calendar_event
    if details is not None:
        check_in.details = details
    db.commit()
    db.refresh(check_in)
    return check_in


def log_inhaler_puff(
    db: Session,
    user_id: uuid.UUID,
    *,
    day: date,
    recorded_at: Optional[datetime] = None,
) -> tuple[CheckIn, InhalerEvent]:
    check_in = get_or_create_check_in(db, user_id, day)
    check_in.puffs_today += 1
    event = InhalerEvent(
        user_id=user_id,
        check_in_id=check_in.id,
        event_type=InhalerEventType.puff,
        puffs_delta=1,
        puffs_total_after=check_in.puffs_today,
        recorded_at=recorded_at or datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    db.refresh(check_in)
    db.refresh(event)
    return check_in, event


def set_inhaler_total(
    db: Session,
    user_id: uuid.UUID,
    *,
    day: date,
    puffs_today: int,
) -> CheckIn:
    check_in = get_or_create_check_in(db, user_id, day)
    check_in.puffs_today = puffs_today
    event = InhalerEvent(
        user_id=user_id,
        check_in_id=check_in.id,
        event_type=InhalerEventType.manual_override,
        puffs_delta=0,
        puffs_total_after=puffs_today,
    )
    db.add(event)
    db.commit()
    db.refresh(check_in)
    return check_in


def check_in_to_dict(check_in: CheckIn) -> dict:
    return {
        "id": str(check_in.id),
        "date": check_in.date.isoformat(),
        "daily_day_symp": bool(check_in.daily_day_symp),
        "daily_night_symp": bool(check_in.daily_night_symp),
        "daily_limit_activity": bool(check_in.daily_limit_activity),
        "symptoms_logged": bool(check_in.symptoms_logged),
        "puffs_today": check_in.puffs_today,
        "symptom_burden_score": compute_symptom_burden_score(check_in),
        "notes": check_in.notes,
        "triggers": check_in.triggers or [],
        "calendar_event": check_in.calendar_event,
        "details": check_in.details,
        "is_flare_up": compute_is_flare_up_from_check_in(check_in),
        "is_flare_up_threshold": is_flare_up_threshold(check_in.puffs_today),
    }
