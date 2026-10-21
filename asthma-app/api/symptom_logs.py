"""Quick log routes: "right now" symptoms, and the Day check-in pre-fill built from them."""

from __future__ import annotations

import uuid
from datetime import date as Date
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.errors import api_error
from db.database import get_db
from db.models import CheckIn, User
from services.quick_log_rollup import prefill_from_logs
from services.symptom_log_service import (
    create_symptom_log,
    delete_symptom_log,
    get_symptom_log,
    logs_between,
    symptom_log_to_dict,
    update_symptom_log,
)

router = APIRouter(prefix="/symptom-logs", tags=["symptom-logs"])

Breathing = Dict[Literal["shortness_of_breath", "chest_tightness", "wheezing", "coughing"], int]


def _scores_in_range(value):
    if value is not None and any(score < 0 or score > 10 for score in value.values()):
        raise ValueError("Breathing scores must be 0-10")
    return value


class SymptomLogCreate(BaseModel):
    model_config = {"extra": "forbid"}

    logged_at: Optional[datetime] = None
    local_date: Optional[Date] = None
    breathing: Optional[Breathing] = None
    limiting_activity: Optional[bool] = None
    reliever_puffs: int = Field(0, ge=0, le=50)
    triggers: Optional[List[str]] = None
    note: Optional[str] = Field(None, max_length=2000)

    @field_validator("breathing")
    @classmethod
    def scores_in_range(cls, value):
        return _scores_in_range(value)


class SymptomLogUpdate(BaseModel):
    model_config = {"extra": "forbid"}

    breathing: Optional[Breathing] = None
    limiting_activity: Optional[bool] = None
    reliever_puffs: Optional[int] = Field(None, ge=0, le=50)
    triggers: Optional[List[str]] = None
    note: Optional[str] = Field(None, max_length=2000)

    @field_validator("breathing")
    @classmethod
    def scores_in_range(cls, value):
        return _scores_in_range(value)


@router.post("", status_code=201)
def create_log(
    body: SymptomLogCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    logged_at = body.logged_at or datetime.now(timezone.utc)
    if logged_at.tzinfo is None:
        logged_at = logged_at.replace(tzinfo=timezone.utc)
    log = create_symptom_log(
        db,
        user.id,
        logged_at=logged_at,
        local_date=body.local_date or logged_at.date(),
        breathing=body.breathing,
        limiting_activity=body.limiting_activity,
        reliever_puffs=body.reliever_puffs,
        triggers=body.triggers,
        note=body.note,
    )
    return symptom_log_to_dict(log)


@router.get("")
def list_logs(
    from_date: Date = Query(..., alias="from"),
    to_date: Optional[Date] = Query(None, alias="to"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    logs = logs_between(db, user.id, from_date, to_date or from_date)
    return {"items": [symptom_log_to_dict(log) for log in logs]}


@router.get("/prefill")
def day_prefill(
    date: Date = Query(...),
    tz_offset: int = Query(0, ge=-900, le=900, description="JS getTimezoneOffset(): minutes UTC minus local"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Suggested Day check-in answers from that day's quick logs (the person confirms them)."""
    logs = [symptom_log_to_dict(log) for log in logs_between(db, user.id, date, date)]
    check_in = db.scalar(select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == date))
    return {"date": date.isoformat(), **prefill_from_logs(logs, check_in.puffs_today if check_in else 0, tz_offset)}


def _own_log(db: Session, user: User, log_id: uuid.UUID):
    log = get_symptom_log(db, user.id, log_id)
    if log is None:
        raise api_error(404, "Quick log not found", "NOT_FOUND")
    return log


@router.patch("/{log_id}")
def edit_log(
    log_id: uuid.UUID,
    body: SymptomLogUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    log = _own_log(db, user, log_id)
    return symptom_log_to_dict(update_symptom_log(db, log, body.model_dump(exclude_unset=True)))


@router.delete("/{log_id}", status_code=204)
def remove_log(
    log_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    delete_symptom_log(db, _own_log(db, user, log_id))
    return Response(status_code=204)
