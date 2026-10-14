"""Daily check-in and rescue inhaler routes."""

from __future__ import annotations

from datetime import date as Date
from datetime import datetime
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import get_current_user
from db.database import get_db
from db.models import CheckIn, User
from services.check_in_service import (
    check_in_to_dict,
    get_or_create_check_in,
    is_flare_up_threshold,
    log_inhaler_puff,
    set_inhaler_total,
    upsert_check_in,
)
from services.forecast_service import refresh_forecast_after_check_in

router = APIRouter(prefix="/check-ins", tags=["check-ins"])


class CheckInDetails(BaseModel):
    """Structured answers from the detailed check-in page (all optional)."""

    model_config = {"extra": "forbid"}

    mood: Optional[int] = Field(None, ge=1, le=5)
    breathing: Optional[Dict[Literal["shortness_of_breath", "chest_tightness", "wheezing", "coughing"], int]] = None
    context: Optional[List[Literal["night_waking", "activity_limitation", "reliever_use"]]] = None

    @field_validator("breathing")
    @classmethod
    def scores_in_range(cls, value):
        if value is not None and any(score < 0 or score > 10 for score in value.values()):
            raise ValueError("Breathing scores must be 0-10")
        return value


class CheckInCreate(BaseModel):
    date: Optional[Date] = None
    daily_day_symp: bool = False
    daily_night_symp: bool = False
    daily_limit_activity: bool = False
    notes: Optional[str] = None
    triggers: Optional[List[str]] = None
    calendar_event: Optional[str] = None
    details: Optional[CheckInDetails] = None


class PuffRequest(BaseModel):
    date: Optional[Date] = None
    recorded_at: Optional[datetime] = None


class InhalerSetRequest(BaseModel):
    date: Optional[Date] = None
    puffs_today: int = Field(..., ge=0, le=50)


def _with_forecast_refresh(payload: dict, forecast: dict | None) -> dict:
    if forecast is None:
        payload["forecast_refreshed"] = False
        return payload
    payload["forecast_refreshed"] = True
    payload["forecast"] = {
        "date": forecast.get("date"),
        "forecast_for": forecast.get("forecast_for"),
        "risk_level": forecast.get("risk_level"),
        "flare_probability": forecast.get("flare_probability"),
        "contributing_factors": forecast.get("contributing_factors") or [],
    }
    return payload


@router.post("", status_code=201)
async def create_check_in(
    body: CheckInCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    refresh_forecast: bool = Query(True),
) -> dict:
    day = body.date or Date.today()
    check_in = upsert_check_in(
        db,
        user.id,
        day=day,
        daily_day_symp=body.daily_day_symp,
        daily_night_symp=body.daily_night_symp,
        daily_limit_activity=body.daily_limit_activity,
        notes=body.notes,
        triggers=body.triggers,
        calendar_event=body.calendar_event,
        details=body.details.model_dump(exclude_none=True) if body.details is not None else None,
    )
    forecast = None
    if refresh_forecast:
        forecast = await refresh_forecast_after_check_in(
            db, user, day=day, calendar_changed=body.calendar_event is not None,
        )
    return _with_forecast_refresh(check_in_to_dict(check_in), forecast)


@router.get("")
def list_check_ins(
    from_date: Optional[Date] = Query(None, alias="from"),
    to_date: Optional[Date] = Query(None, alias="to"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    query = select(CheckIn).where(CheckIn.user_id == user.id).order_by(CheckIn.date.desc())
    if from_date:
        query = query.where(CheckIn.date >= from_date)
    if to_date:
        query = query.where(CheckIn.date <= to_date)
    rows = db.scalars(query).all()
    return {"items": [check_in_to_dict(row) for row in rows]}


@router.get("/today")
def get_today_check_in(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    day = Date.today()
    check_in = db.scalar(select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == day))
    if not check_in:
        check_in = get_or_create_check_in(db, user.id, day)
        db.commit()
        db.refresh(check_in)
    return check_in_to_dict(check_in)


@router.post("/inhaler/puff")
async def log_puff(
    body: Optional[PuffRequest] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    body = body or PuffRequest()
    day = body.date or Date.today()
    check_in, event = log_inhaler_puff(db, user.id, day=day, recorded_at=body.recorded_at)
    total = check_in.puffs_today
    forecast = await refresh_forecast_after_check_in(db, user, day=day)
    return _with_forecast_refresh(
        {
            "date": day.isoformat(),
            "puffs_today": total,
            "event_id": str(event.id),
            "is_flare_up_threshold": is_flare_up_threshold(total),
            "message": f"Logged 1 puff. Today's total: {total}.",
        },
        forecast,
    )


@router.put("/inhaler")
async def set_inhaler(
    body: InhalerSetRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    day = body.date or Date.today()
    check_in = set_inhaler_total(db, user.id, day=day, puffs_today=body.puffs_today)
    forecast = await refresh_forecast_after_check_in(db, user, day=day)
    return _with_forecast_refresh(
        {
            "date": day.isoformat(),
            "puffs_today": check_in.puffs_today,
            "source": "manual",
            "is_flare_up_threshold": is_flare_up_threshold(check_in.puffs_today),
        },
        forecast,
    )
