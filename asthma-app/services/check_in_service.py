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
        # structured plans for that day (Calendar views read these)
        "calendar_events": check_in.calendar_events or [],
        "details": check_in.details,
        "is_flare_up": compute_is_flare_up_from_check_in(check_in),
        "is_flare_up_threshold": is_flare_up_threshold(check_in.puffs_today),
    }


# ---------- check-in context for AI tips and chat ----------
# Structured fields only. The free-text note is never sent; the forecast model is unchanged.
MOOD_LABELS = {1: "very low", 2: "low", 3: "okay", 4: "good", 5: "great"}
from services.quick_log_rollup import BREATHING_LABELS  # noqa: E402 (shared with quick logs)


def check_in_context(check_in: Optional[CheckIn]) -> Optional[dict]:
    """What the user reported that day, for AI context (None when nothing was logged)."""
    if not check_in_complete(check_in):
        return None
    details = check_in.details if isinstance(check_in.details, dict) else {}
    breathing = details.get("breathing") if isinstance(details.get("breathing"), dict) else {}
    context = details.get("context") if isinstance(details.get("context"), list) else []
    return {
        "date": check_in.date.isoformat(),
        "mood": MOOD_LABELS.get(details.get("mood")),
        "breathing_0_to_10": {
            BREATHING_LABELS[key]: int(score)
            for key, score in breathing.items()
            if key in BREATHING_LABELS and isinstance(score, (int, float)) and score > 0
        },
        "night_waking": bool(check_in.daily_night_symp) or "night_waking" in context,
        "activity_limitation": bool(check_in.daily_limit_activity) or "activity_limitation" in context,
        "reliever_puffs": int(check_in.puffs_today or 0),
        "possible_triggers_noted": list(check_in.triggers or []),
    }


def recent_check_ins(db: Session, user_id: uuid.UUID, today: date, days: int = 7) -> List[dict]:
    """The user's logged check-ins for the last `days` days, newest first."""
    from datetime import timedelta

    rows = db.scalars(
        select(CheckIn)
        .where(CheckIn.user_id == user_id, CheckIn.date > today - timedelta(days=days), CheckIn.date <= today)
        .order_by(CheckIn.date.desc())
    ).all()
    return [entry for entry in (check_in_context(row) for row in rows) if entry is not None]


def describe_check_in(entry: Optional[dict]) -> Optional[str]:
    """One plain line for prompts that take text, e.g. 'mood okay; wheezing 6/10; ...'."""
    if not entry:
        return None
    parts = []
    if entry["mood"]:
        parts.append(f"mood {entry['mood']}")
    parts.extend(f"{name} {score}/10" for name, score in entry["breathing_0_to_10"].items())
    if entry["night_waking"]:
        parts.append("woke at night")
    if entry["activity_limitation"]:
        parts.append("activity limited")
    if entry["reliever_puffs"]:
        parts.append(f"reliever used ({entry['reliever_puffs']} puffs)")
    if entry["possible_triggers_noted"]:
        parts.append("possible triggers they noted: " + ", ".join(entry["possible_triggers_noted"]))
    return "; ".join(parts) or "no symptoms reported"
